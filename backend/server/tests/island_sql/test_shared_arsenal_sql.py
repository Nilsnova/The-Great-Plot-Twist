"""Atomic shared arsenal tests on disposable PostgreSQL; session authority is test-only."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

# Register a module-private cluster so committed race seeds never reach legacy tests.
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    add_players,
    as_owner,
    keys,
    ready,
    reconciles,
    reserve,
    rpc,
)


@pytest.fixture
def authority(database):
    """Install only in this rolled-back test transaction, never in an application migration."""
    as_owner(database)
    database.execute("create schema if not exists arsenal_test")
    database.execute(
        "create table if not exists arsenal_test.phase (owner uuid primary key, wave uuid)"
    )
    database.execute("""
        create or replace function public.island_economy_authority(
          p_actor_id uuid, p_island_owner uuid
        ) returns jsonb language sql stable security definer set search_path='' as $$
          select jsonb_build_object(
            'actor_id',p_actor_id,'island_owner',p_island_owner,
            'is_member',p_actor_id=p_island_owner or exists (
              select 1 from public.island_members where island_owner=p_island_owner
                and player_id=p_actor_id and left_at is null),
            'reservation_id',(select wave from arsenal_test.phase where owner=p_island_owner),
            'session_leader_id',null,'actor_assignment_wave_id',null)
        $$;
        revoke all on function public.island_economy_authority(uuid,uuid)
          from public,anon,authenticated;
        grant execute on function public.island_economy_authority(uuid,uuid) to service_role;
    """)
    yield database


def change(database, actor, initial, uid="arsenal001", kind="buy", **changes):
    options = dict(
        weapon="pistols" if kind == "buy" else None,
        copy=None,
        generation=None,
        price=60 if kind == "buy" else None,
        unlock=0 if kind == "buy" else None,
    )
    options.update(changes)
    return rpc(
        database,
        "island_shared_arsenal_mutate",
        actor,
        initial["currentEconomy"]["islandOwner"],
        *keys(initial),
        uid,
        kind,
        options["weapon"],
        options["copy"],
        options["generation"],
        options["price"],
        options["unlock"],
    )


def counts(database, actor, uid):
    return database.execute(
        """
        select (select count(*) from public.island_economy_operations
                 where actor_id=%s and action_uid=%s),
               (select count(*) from public.shared_arsenal_receipts r
                 join public.island_economy_operations o on o.id=r.operation_id
                 where o.actor_id=%s and o.action_uid=%s)
    """,
        (actor, uid, actor, uid),
    ).fetchone()


def seed_copies(database, owner, initial, count):
    as_owner(database)
    database.execute(
        """
        insert into public.arsenal_copies
          (island_owner,copy_no,weapon,source,economy_account_id,economy_run_epoch)
        select %s,n,'pistols','converted',%s,%s from generate_series(1,%s) n
    """,
        (owner, *keys(initial), count),
    )


def test_missing_authority_fails_closed_and_leaves_no_root_or_charge(database):
    owner, member, _, initial = ready(database)
    as_owner(database)
    database.execute("drop function if exists public.island_economy_authority(uuid,uuid)")
    result = change(database, member, initial)
    assert result == {"status": "refused", "reason": "path_unavailable"}
    assert counts(database, member, "arsenal001") == (0, 0)
    assert (
        database.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize("payload", ["null", "[]", "{}", '{"is_member":true}'])
def test_malformed_authority_cannot_authorize_or_leave_a_root(authority, payload):
    _, member, _, initial = ready(authority)
    as_owner(authority)
    # Payloads are fixed test constants; the reserved provider is still test-only.
    authority.execute(
        "create or replace function public.island_economy_authority"
        "(p_actor_id uuid,p_island_owner uuid) "
        "returns jsonb language sql as $$ select '" + payload + "'::jsonb $$"
    )
    assert change(authority, member, initial) == {"status": "refused", "reason": "path_unavailable"}
    assert counts(authority, member, "arsenal001") == (0, 0)


def test_buy_uses_real_treasury_child_and_original_receipt_before_mutable_checks(authority):
    database = authority
    owner, member, _, initial = ready(database)
    first = change(database, member, initial)
    assert first["status"] == "done" and not first["repeat"]
    assert first["receipt"]["result"]["priceCoins"] == "60"
    assert first["currentEconomy"]["treasury"]["balanceCoins"] == "140"
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (owner, member),
    )
    database.execute("insert into arsenal_test.phase values(%s,%s)", (owner, uuid4()))
    again = change(database, member, initial, price=999999, unlock=100)
    assert again["repeat"] and again["receipt"] == first["receipt"]
    assert again["currentEconomy"] is None
    assert counts(database, member, "arsenal001") == (1, 1)
    ledger = database.execute(
        "select action_uid,balance_delta from public.island_treasury_transactions "
        "where account_id=%s and kind='spend'",
        (keys(initial)[0],),
    ).fetchall()
    assert ledger == [("fx_" + first["operationId"].replace("-", "") + "_charge", -60)]
    reconciles(database, keys(initial)[0])


@pytest.mark.parametrize(
    "refusal,changes",
    [
        ("locked", {"unlock": 10}),
        ("insufficient_funds", {"price": 201}),
        ("invalid_change", {"price": -1}),
        ("invalid_change", {"weapon": "musket"}),
    ],
)
def test_refused_buy_rolls_back_root_and_every_effect(authority, refusal, changes):
    _, member, _, initial = ready(authority)
    result = change(authority, member, initial, **changes)
    assert result == {"status": "refused", "reason": refusal}
    assert counts(authority, member, "arsenal001") == (0, 0)
    assert change(authority, member, initial)["status"] == "done"
    reconciles(authority, keys(initial)[0])


def test_buy_island_unlock_ignores_veteran_personal_progress(authority):
    owner, member, _, initial = ready(authority)
    as_owner(authority)
    authority.execute("update public.islands set won_wave_best=100 where player_id=%s", (member,))
    assert change(authority, member, initial, unlock=10)["reason"] == "locked"
    authority.execute("update public.islands set wave_best=10 where player_id=%s", (owner,))
    assert change(authority, member, initial, unlock=10)["status"] == "done"


def test_reservation_and_nonmember_refusals_leave_no_claim(authority):
    owner, member, outsider, initial = ready(authority)
    assert change(authority, outsider, initial)["reason"] == "not_member"
    as_owner(authority)
    authority.execute("insert into arsenal_test.phase values(%s,%s)", (owner, uuid4()))
    assert change(authority, member, initial)["reason"] == "wave_running"
    assert counts(authority, member, "arsenal001") == (0, 0)


def test_total_capacity_and_grandfathered_return_preserve_copies(authority):
    owner, member, _, initial = ready(authority, 10000)
    seed_copies(authority, owner, initial, 24)
    assert change(authority, member, initial)["reason"] == "arsenal_full"
    copy_id = authority.execute(
        "select id from public.arsenal_copies where island_owner=%s order by copy_no limit 1",
        (owner,),
    ).fetchone()[0]
    taken = change(
        authority, member, initial, uid="arsenal002", kind="take", copy=copy_id, generation=0
    )
    assert taken["receipt"]["result"]["holderGeneration"] == "1"
    returned = change(
        authority, member, initial, uid="arsenal003", kind="return", copy=copy_id, generation=1
    )
    assert returned["receipt"]["result"]["holderGeneration"] == "2"
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 24
    )
    authority.execute("set constraints arsenal_copies_capacity immediate")


def test_swap_stale_generation_changed_replay_and_cross_domain_uid(authority):
    owner, member, _, initial = ready(authority)
    seed_copies(authority, owner, initial, 2)
    copies = [
        row[0]
        for row in authority.execute(
            "select id from public.arsenal_copies where island_owner=%s order by copy_no", (owner,)
        )
    ]
    first = change(authority, member, initial, kind="take", copy=copies[0], generation=0)
    assert first["status"] == "done"
    altered = change(authority, member, initial, kind="take", copy=copies[1], generation=0)
    assert altered["reason"] == "action_conflict"
    swapped = change(
        authority, member, initial, uid="arsenal002", kind="take", copy=copies[1], generation=0
    )
    assert swapped["status"] == "done"
    assert (
        change(
            authority,
            member,
            initial,
            uid="arsenal003",
            kind="return",
            copy=copies[0],
            generation=1,
        )["reason"]
        == "stale_holder"
    )
    assert change(authority, member, initial, weapon="pistols")["reason"] == "action_conflict"
    assert counts(authority, member, "arsenal003") == (0, 0)
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s and holder=%s",
            (owner, member),
        ).fetchone()[0]
        == 1
    )


def test_unbound_legacy_stock_requires_explicit_conversion(authority):
    owner, member, _, initial = ready(authority)
    as_owner(authority)
    authority.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,source) "
        "values(%s,1,'pistols','converted')",
        (owner,),
    )
    assert change(authority, member, initial)["reason"] == "path_unavailable"
    assert counts(authority, member, "arsenal001") == (0, 0)


def test_original_receipt_survives_retirement_but_uid_cannot_target_new_epoch(authority):
    owner, member, _, initial = ready(authority)
    first = change(authority, member, initial)
    as_owner(authority)
    authority.execute(
        "update public.island_economy_accounts set state='retired', "
        "retired_at=clock_timestamp() where id=%s",
        (keys(initial)[0],),
    )
    account, epoch = authority.execute(
        "insert into public.island_economy_accounts(island_owner) "
        "values(%s) returning id,run_epoch",
        (owner,),
    ).fetchone()
    authority.execute(
        "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
        "where island_owner=%s",
        (account, epoch, owner),
    )
    replay = change(authority, member, initial)
    assert replay["receipt"] == first["receipt"] and replay["currentEconomy"] is None
    assert change(authority, member, initial, uid="arsenal002")["reason"] == "path_unavailable"
    new_context = {
        "currentEconomy": {
            "islandOwner": str(owner),
            "accountId": str(account),
            "runEpoch": str(epoch),
        }
    }
    assert change(authority, member, new_context)["reason"] == "action_conflict"
    assert (
        authority.execute(
            "select balance_coins from public.island_economy_accounts where id=%s", (account,)
        ).fetchone()[0]
        == 0
    )


@pytest.mark.parametrize("arsenal_first", [True, False])
def test_free_and_paid_domains_share_one_real_root_namespace(authority, arsenal_first):
    from psycopg.types.json import Jsonb

    owner, member, _, initial = ready(authority)
    as_owner(authority)
    if arsenal_first:
        assert change(authority, member, initial)["status"] == "done"
    other = rpc(
        authority,
        "island_economy_claim_operation_locked",
        member,
        *keys(initial),
        "arsenal001",
        "house:role",
        Jsonb({"role": "crew"}),
    )
    if arsenal_first:
        assert other["reason"] == "action_conflict"
    else:
        assert other["status"] == "claimed"
        assert change(authority, member, initial)["reason"] == "action_conflict"
        assert (
            authority.execute(
                "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
            ).fetchone()[0]
            == 0
        )
    reconciles(authority, keys(initial)[0])


def test_private_projection_identifies_copy_tenure_and_basic_weapon(authority):
    _, member, outsider, initial = ready(authority)
    first = change(authority, member, initial)
    as_owner(authority)
    projection = rpc(
        authority, "island_shared_arsenal_loadouts_locked", *keys(initial), [member, outsider]
    )
    assert projection[0]["copyId"] == first["receipt"]["result"]["copyId"]
    assert projection[0]["generation"] == "1"
    assert projection[1] == {
        "playerId": str(outsider),
        "weapon": "musket",
        "copyId": None,
        "generation": None,
    }


def test_domain_grants_and_immutable_receipt_protect_server_only_state(authority):
    _, member, _, initial = ready(authority)
    first = change(authority, member, initial)
    as_owner(authority)
    signature = (
        "public.island_shared_arsenal_mutate"
        "(uuid,uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer)"
    )
    for role in ("anon", "authenticated"):
        assert not authority.execute(
            "select has_function_privilege(%s,%s,'EXECUTE')", (role, signature)
        ).fetchone()[0]
        assert not authority.execute(
            "select has_table_privilege(%s,'public.shared_arsenal_receipts','SELECT')", (role,)
        ).fetchone()[0]
    for private in (
        "public.island_shared_arsenal_holder_locked"
        "(uuid,uuid,uuid,uuid,numeric,text,timestamptz,uuid,timestamptz)",
        "public.island_shared_arsenal_settle_returns_locked(uuid,uuid,uuid)",
        "public.island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[])",
    ):
        assert not authority.execute(
            "select has_function_privilege('service_role',%s,'EXECUTE')", (private,)
        ).fetchone()[0]
    with pytest.raises(psycopg.Error), authority.transaction():
        authority.execute(
            "update public.shared_arsenal_receipts set result='{}'::jsonb where operation_id=%s",
            (first["operationId"],),
        )


def lifecycle(
    database, actor, initial, copy, transition, *, generation=1, wave=None, now=None, deadline=None
):
    as_owner(database)
    return rpc(
        database,
        "island_shared_arsenal_holder_locked",
        *keys(initial),
        actor,
        copy,
        generation,
        transition,
        now or datetime(2026, 11, 18, tzinfo=UTC),
        wave,
        deadline,
    )


def test_private_withdrawal_retains_reserved_copy_until_original_wave_closes(authority):
    _, member, _, initial = ready(authority)
    copy = change(authority, member, initial)["receipt"]["result"]["copyId"]
    wave = uuid4()
    assert lifecycle(authority, member, initial, copy, "withdraw", wave=wave)["changed"]
    row = authority.execute(
        "select holder,holder_generation,pending_return_wave_id "
        "from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone()
    assert row == (member, 1, wave)
    assert (
        change(authority, member, initial, uid="return001", kind="return", copy=copy, generation=1)[
            "reason"
        ]
        == "wave_running"
    )
    as_owner(authority)
    assert (
        rpc(authority, "island_shared_arsenal_settle_returns_locked", *keys(initial), uuid4()) == 0
    )
    assert rpc(authority, "island_shared_arsenal_settle_returns_locked", *keys(initial), wave) == 1
    assert rpc(authority, "island_shared_arsenal_settle_returns_locked", *keys(initial), wave) == 0
    assert authority.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (None, 2)


def test_disconnect_deadline_and_early_reconnect_persist_without_money(authority):
    _, member, _, initial = ready(authority)
    copy = change(authority, member, initial)["receipt"]["result"]["copyId"]
    now = datetime(2026, 11, 18, tzinfo=UTC)
    deadline = now + timedelta(seconds=60)
    assert lifecycle(authority, member, initial, copy, "disconnect", now=now, deadline=deadline)[
        "changed"
    ]
    assert not lifecycle(
        authority,
        member,
        initial,
        copy,
        "disconnect",
        now=now + timedelta(seconds=30),
        deadline=deadline + timedelta(seconds=30),
    )["changed"]
    assert (
        authority.execute(
            "select disconnected_until from public.arsenal_copies where id=%s", (copy,)
        ).fetchone()[0]
        == deadline
    )
    assert not lifecycle(
        authority, member, initial, copy, "expire", now=deadline - timedelta(microseconds=1)
    )["changed"]
    assert lifecycle(
        authority, member, initial, copy, "reconnect", now=deadline - timedelta(microseconds=1)
    )["changed"]
    assert (
        authority.execute(
            "select disconnected_until from public.arsenal_copies where id=%s", (copy,)
        ).fetchone()[0]
        is None
    )
    reconciles(authority, keys(initial)[0])


@pytest.mark.parametrize("wave", [None, uuid4()])
def test_expired_holder_transitions_without_arsenal_reads_or_new_wave(authority, wave):
    _, member, _, initial = ready(authority)
    copy = change(authority, member, initial)["receipt"]["result"]["copyId"]
    now = datetime(2026, 11, 18, tzinfo=UTC)
    deadline = now + timedelta(seconds=60)
    lifecycle(authority, member, initial, copy, "disconnect", now=now, deadline=deadline)
    late = lifecycle(authority, member, initial, copy, "reconnect", now=deadline)
    assert late == {"status": "refused", "reason": "holder_grace_expired"}
    assert lifecycle(authority, member, initial, copy, "expire", now=deadline, wave=wave)["changed"]
    row = authority.execute(
        "select holder,pending_return_wave_id from public.arsenal_copies where id=%s", (copy,)
    ).fetchone()
    assert row == ((member, wave) if wave else (None, None))


def test_full_inventory_release_and_stale_tenure_cannot_affect_new_holder(authority):
    owner, member, _, initial = ready(authority)
    seed_copies(authority, owner, initial, 24)
    copy = authority.execute(
        "select id from public.arsenal_copies where island_owner=%s order by copy_no limit 1",
        (owner,),
    ).fetchone()[0]
    change(authority, member, initial, kind="take", copy=copy, generation=0)
    assert lifecycle(authority, member, initial, copy, "withdraw")["changed"]
    change(authority, member, initial, uid="retake001", kind="take", copy=copy, generation=2)
    assert not lifecycle(authority, member, initial, copy, "withdraw", wave=uuid4())["changed"]
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 24
    )
    assert authority.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, 3)
    authority.execute("set constraints arsenal_copies_capacity immediate")


def test_grandfathered_pending_settlement_passes_deferred_capacity_at_commit(authority):
    owner, member, _, initial = ready(authority)
    seed_copies(authority, owner, initial, 24)
    copy = authority.execute(
        "select id from public.arsenal_copies where island_owner=%s order by copy_no limit 1",
        (owner,),
    ).fetchone()[0]
    change(authority, member, initial, kind="take", copy=copy, generation=0)
    wave = uuid4()
    lifecycle(authority, member, initial, copy, "withdraw", wave=wave)
    rpc(authority, "island_shared_arsenal_settle_returns_locked", *keys(initial), wave)
    authority.execute("set constraints arsenal_copies_capacity immediate")
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s and holder is null",
            (owner,),
        ).fetchone()[0]
        == 24
    )


def test_legacy_stored_capacity_is_still_enforced_when_deferred_constraints_fire(database):
    owner, _, _, _ = ready(database, admitted=False)
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        database.execute(
            "insert into public.arsenal_copies(island_owner,copy_no,weapon,source) "
            "select %s,n,'pistols','converted' from generate_series(1,21)n",
            (owner,),
        )
        database.execute("set constraints arsenal_copies_capacity immediate")


def test_new_shared_bought_copies_cannot_bypass_total_capacity_at_commit(authority):
    owner, _, _, initial = ready(authority)
    with pytest.raises(psycopg.errors.CheckViolation), authority.transaction():
        as_owner(authority)
        authority.execute(
            "insert into public.arsenal_copies(island_owner,copy_no,weapon,source, "
            "economy_account_id,economy_run_epoch) select %s,n,'pistols','bought',%s,%s "
            "from generate_series(1,21)n",
            (owner, *keys(initial)),
        )
        authority.execute("set constraints arsenal_copies_capacity immediate")


def test_valid_legacy_twenty_stored_four_carried_converts_and_all_returns_commit(authority):
    owner, member, _, initial = ready(authority)
    friends = (uuid4(), uuid4())
    add_players(authority, *friends)
    for friend in friends:
        rpc(authority, "game_join", friend, owner, 10)
    as_owner(authority)
    holders = (owner, member, *friends)
    for number in range(1, 25):
        authority.execute(
            "insert into public.arsenal_copies"
            "(island_owner,copy_no,weapon,holder,source) values(%s,%s,'pistols',%s,'converted')",
            (owner, number, holders[number - 21] if number > 20 else None),
        )
    authority.execute("set constraints arsenal_copies_capacity immediate")
    # Only this test fixture binds legacy stock; application conversion remains separate.
    authority.execute(
        "update public.arsenal_copies set economy_account_id=%s,economy_run_epoch=%s "
        "where island_owner=%s",
        (*keys(initial), owner),
    )
    for index, holder in enumerate(holders):
        copy = authority.execute(
            "select id from public.arsenal_copies where island_owner=%s and holder=%s",
            (owner, holder),
        ).fetchone()[0]
        assert (
            change(
                authority,
                holder,
                initial,
                uid=f"return00{index}",
                kind="return",
                copy=copy,
                generation=0,
            )["status"]
            == "done"
        )
    authority.execute("set constraints all immediate")
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s and holder is null",
            (owner,),
        ).fetchone()[0]
        == 24
    )


def test_capacity_guard_validates_destination_when_a_legacy_copy_changes_owner(database):
    owner, _, _, _ = ready(database, admitted=False)
    other, _, _, _ = ready(database, admitted=False)
    as_owner(database)
    database.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,source) "
        "select %s,n,'pistols','converted' from generate_series(1,20)n",
        (owner,),
    )
    copy = database.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,source) "
        "values(%s,1,'pistols','converted') returning id",
        (other,),
    ).fetchone()[0]
    database.execute("set constraints all immediate")
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        database.execute(
            "update public.arsenal_copies set island_owner=%s,copy_no=21 where id=%s", (owner, copy)
        )


def test_late_receipt_failure_rolls_back_charge_copy_and_operation(authority):
    owner, member, _, initial = ready(authority)
    as_owner(authority)
    authority.execute("""
        create function arsenal_test.fail_receipt() returns trigger language plpgsql as $$
        begin raise exception 'test-only late receipt failure'; end $$;
        create trigger arsenal_test_fail before insert on public.shared_arsenal_receipts
        for each row execute function arsenal_test.fail_receipt();
    """)
    with pytest.raises(psycopg.Error), authority.transaction():
        change(authority, member, initial)
    assert counts(authority, member, "arsenal001") == (0, 0)
    assert (
        authority.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )
    reconciles(authority, keys(initial)[0])


@pytest.mark.parametrize("race", ["same_uid", "last_slot", "wager"])
def test_concurrent_intents_commit_only_affordable_unique_copies(authority, scratch_server, race):
    owner, member, _, initial = ready(authority, 1000 if race == "last_slot" else 60)
    if race == "last_slot":
        seed_copies(authority, owner, initial, 19)
    authority.commit()
    barrier = Barrier(2)

    def run(index):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait()
            if race == "wager" and index == 1:
                return reserve(connection, member, initial, 60, uid="wager0001")
            uid = "arsenal001" if race == "same_uid" else f"arsenal00{index + 1}"
            return change(connection, member, initial, uid=uid)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(run, range(2)))
    if race == "same_uid":
        assert all(result["status"] == "done" for result in results)
        assert sum(not result["repeat"] for result in results) == 1
    else:
        assert sum(result["status"] == "done" for result in results) == 1
        if race == "last_slot":
            assert [
                result.get("reason") for result in results if result["status"] == "refused"
            ] == ["arsenal_full"]
    as_owner(authority)
    reconciles(authority, keys(initial)[0])
