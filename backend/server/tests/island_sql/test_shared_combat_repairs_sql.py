"""Actual shared-repair SQL with test-seeded canonical facts/binding on disposable PostgreSQL.

The real treasury, roots, recovery tables and repair RPC execute. Canonical authority is
real; its input facts and immutable economy snapshot production are explicit TEST-ONLY
fixtures, not authenticated acceptance or a production wave/session implementation.
No configured database is used.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from server.errors import ApiError  # noqa: E402
from server.island.shared_combat_repair import (  # noqa: E402
    SharedRepairRequest,
    repair_shared,
    require_shared_revival,
)
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    authority_outage,
    configure_test_authority,
    install_test_authority,
    malformed_authority_domain,
)
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    as_server,
    keys,
    ready,
    reconciles,
    reserve,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import build  # noqa: E402


@dataclass
class World:
    owner: object
    member: object
    outsider: object
    initial: dict
    recovery_epoch: object
    wave: object
    instances: dict


def seed(
    connection,
    *,
    coins=100,
    spots=("wall_1",),
    used=0,
    authority=True,
    binding=None,
    omit_binding=False,
    binding_patch=None,
    frozen_price=10,
):
    """Seed missing producer postconditions explicitly; no live API acceptance is claimed."""
    owner, member, outsider, _ = ready(connection, admitted=False)
    for index, spot in enumerate(spots):
        build(connection, owner, spot, "wall", f"build-{index:04d}", coins=10)
    initial = rpc(connection, "island_treasury_admit", owner, owner, "admit0001", coins)
    as_owner(connection)
    epoch, wave = uuid4(), uuid4()
    clock = connection.execute("select clock_timestamp()+interval '20 seconds'").fetchone()[0]
    instances = dict(
        connection.execute(
            "select plot,recovery_instance_id from public.islet_buildings where player_id=%s",
            (owner,),
        ).fetchall()
    )
    for spot, instance in instances.items():
        connection.execute(
            "insert into public.island_structure_health "
            "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
            "settled_at,rate_numerator,rate_denominator,repair_seq) "
            "values(%s,%s,%s,'wall',1,500000,60,1,clock_timestamp(),0,1,0)",
            (owner, spot, instance),
        )
    snapshot = {
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "waveId": str(wave),
        "islandOwner": str(owner),
        "resetEpoch": str(epoch),
        "startsAt": clock.isoformat(),
        "economy": dict(initial["currentEconomy"]) if binding is None else binding,
        "maximumSeconds": 600,
        "priceSchedule": {"wall": [frozen_price, 20, 40, 80, 160]},
        "structures": [
            {
                "spot": spot,
                "instanceId": str(instance),
                "kind": "wall",
                "level": 1,
                "hpUnits": 500000,
                "maxHP": 60,
                "repairSeq": 0,
            }
            for spot, instance in instances.items()
        ],
    }
    if omit_binding:
        snapshot.pop("economy")
    if binding_patch:
        snapshot["economy"].update(binding_patch)
    connection.execute(
        "insert into public.recovery_wave_states(wave_id,island_owner,reset_epoch,"
        "recovery_version,wave_protocol,initial_snapshot,paid_used) values(%s,%s,%s,1,2,%s,%s)",
        (wave, owner, epoch, Jsonb(snapshot), used),
    )
    connection.execute(
        "update public.island_recovery_state set reset_epoch=%s,recovery_version=1,"
        "wave_protocol=2,current_wave_id=%s,reserved_at=clock_timestamp(),starts_at=%s,"
        "expires_at=%s+interval '600 seconds' where island_owner=%s",
        (epoch, wave, clock, clock, owner),
    )
    if authority:
        install_test_authority(connection)
        for actor in (owner, member, outsider):
            configure_test_authority(
                connection, actor, owner, reservation_id=wave, session_leader_id=owner
            )
    return World(owner, member, outsider, initial, epoch, wave, instances)


def repair(
    connection,
    world,
    *,
    actor=None,
    uid="repair-0001",
    spot="wall_1",
    seq=0,
    price=10,
    epoch=None,
    instance=None,
    run_epoch=None,
):
    as_server(connection)
    account, run = keys(world.initial)
    return rpc(
        connection,
        "island_shared_structure_repair",
        actor or world.member,
        world.owner,
        account,
        run_epoch or run,
        uid,
        epoch or world.recovery_epoch,
        world.wave,
        spot,
        instance or world.instances[spot],
        1,
        seq,
        price,
    )


def counts(connection, world):
    as_owner(connection)
    return connection.execute(
        "select (select count(*) from public.island_economy_operations where "
        "account_id=%s and is_player_intent),"
        "(select count(*) from public.island_shared_repair_receipts r join "
        "public.island_economy_operations o on o.id=r.operation_id where o.account_id=%s),"
        "(select count(*) from public.island_treasury_transactions where account_id=%s),"
        "paid_used,journal_head from public.recovery_wave_states where wave_id=%s",
        (keys(world.initial)[0],) * 3 + (world.wave,),
    ).fetchone()


def damage(connection, world, amount=100_000):
    """Explicit accepted-checkpoint postcondition; no client report is admitted by this helper."""
    as_owner(connection)
    basis = dict(
        connection.execute(
            "select instance_id::text,repair_seq from public.island_structure_health "
            "where island_owner=%s",
            (world.owner,),
        ).fetchall()
    )
    hp = {instance: amount for instance in basis}
    connection.execute(
        "update public.recovery_wave_states set checkpoint_actor=%s,checkpoint_uid='damage001',"
        "checkpoint_through_tick=100,checkpoint_input_head_seq=journal_head,"
        "checkpoint_last_repair_seq=last_repair_seq,checkpoint_basis_repair_seq=%s,"
        "checkpoint_hp=%s,checkpoint_accepted_at=clock_timestamp() where wave_id=%s",
        (world.owner, Jsonb(basis), Jsonb(hp), world.wave),
    )


def test_real_countdown_repair_uses_treasury_full_price_and_common_receipt(database):
    world = seed(database)
    result = repair(database, world)
    assert result["status"] == "done" and result["repeat"] is False
    receipt = result["receipt"]
    assert set(receipt) == {"receiptId", "actionUid", "action", "actorId", "origin", "result"}
    assert receipt["origin"]["accountId"] == keys(world.initial)[0]
    assert receipt["result"]["chargedPrice"] == "10"
    assert receipt["result"]["financialReceipt"]["balanceDelta"] == "-10"
    assert receipt["result"]["financialReceipt"]["actionUid"].startswith("fx_")
    assert result["currentEconomy"]["treasury"] == {
        "balanceCoins": "90",
        "committedCoins": "0",
        "availableCoins": "90",
    }
    assert counts(database, world) == (1, 1, 2, 1, 1)
    assert database.execute(
        "select hp_units,repair_seq from public.island_structure_health where island_owner=%s",
        (world.owner,),
    ).fetchone() == (1_000_000, 1)
    assert database.execute(
        "select balance from public.wallets where player_id=%s", (world.member,)
    ).fetchone() == (0,)
    assert database.execute(
        "select effective_tick from public.recovery_wave_events where wave_id=%s", (world.wave,)
    ).fetchone() == (0,)
    reconciles(database, keys(world.initial)[0])


def test_retry_after_later_damage_never_heals_or_charges_again(database):
    world = seed(database)
    first = repair(database, world)
    damage(database, world)
    again = repair(database, world, seq=1)
    assert again == {"status": "done", "repeat": True, "receipt": first["receipt"]}
    assert counts(database, world) == (1, 1, 2, 1, 1)
    vector = rpc(database, "structure_recovery_wave_hp", world.wave)
    assert vector[str(world.instances["wall_1"])] == 100_000
    newer = repair(database, world, uid="repair-0002", seq=1)
    assert newer["receipt"]["result"]["eventSeq"] == 2
    as_owner(database)
    assert (
        database.execute(
            "select max(effective_tick) from public.recovery_wave_events where wave_id=%s",
            (world.wave,),
        ).fetchone()[0]
        >= 101
    )


def test_retry_after_canonical_end_and_departure_returns_only_owned_receipt(database):
    world = seed(database)
    first = repair(database, world)
    as_owner(database)
    # This is a domain-fixture clock boundary, not a natural runtime expiry.
    # Shared run, HP, accounting and personal closure belong to one canonical
    # hook; the old private legacy HP settler deliberately does not own it.
    plan = rpc(database, "shared_session_lock_plan", [world.owner], world.member)
    rpc(database, "shared_session_lock_plan_rows", Jsonb(plan))
    rpc(
        database, "shared_session_close_locked", world.wave, "expired", Jsonb([]),
        database.execute("select clock_timestamp()+interval '700 seconds'").fetchone()[0],
    )
    assert rpc(database, "game_leave", world.member, world.owner)["status"] == "left"
    again = repair(database, world)
    assert again == {"status": "done", "repeat": True, "receipt": first["receipt"]}
    assert counts(database, world) == (1, 1, 2, 1, 1)
    assert repair(database, world, uid="repair-0002")["reason"] == "not_member"


def test_funds_committed_to_a_bet_cannot_pay_for_a_repair_or_burn_root(database):
    world = seed(database, coins=10)
    assert reserve(database, world.member, world.initial, 10)["status"] == "done"
    assert repair(database, world) == {"status": "refused", "reason": "insufficient_funds"}
    assert counts(database, world) == (0, 0, 2, 0, 0)
    reconciles(database, keys(world.initial)[0])


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"price": 9}, "stale_recovery_quote"),
        ({"seq": 1}, "stale_recovery_quote"),
        ({"epoch": uuid4()}, "stale_recovery_quote"),
        ({"instance": uuid4()}, "stale_recovery_quote"),
        ({"run_epoch": uuid4()}, "epoch_mismatch"),
    ],
)
def test_stale_guards_roll_back_the_root_and_every_effect(database, changes, reason):
    world = seed(database)
    assert repair(database, world, **changes) == {"status": "refused", "reason": reason}
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_last_shared_quota_slot_is_consumed_once_across_members_and_structures(database):
    world = seed(database, spots=("wall_1", "wall_2"), used=2)
    assert repair(database, world)["receipt"]["result"]["useOrdinal"] == 3
    assert repair(database, world, actor=world.owner, spot="wall_2", uid="repair-0002") == {
        "status": "refused",
        "reason": "repair_limit_reached",
    }
    assert counts(database, world) == (1, 1, 2, 3, 1)


def test_missing_authority_is_not_replaced_by_membership_or_browser_facts(database):
    world = seed(database)
    as_owner(database)
    with authority_outage(database):
        assert repair(database, world) == {"status": "refused", "reason": "path_unavailable"}
        assert counts(database, world) == (0, 0, 1, 0, 0)


@pytest.mark.parametrize("binding", [{}, None, {"mode": "island_shared", "version": "1"}])
def test_absent_or_malformed_immutable_economy_binding_cannot_charge(database, binding):
    world = seed(database, binding={} if binding is None else binding)
    assert repair(database, world) == {"status": "refused", "reason": "path_unavailable"}
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_altered_paid_intent_or_domain_cannot_adopt_a_root(database):
    world = seed(database)
    assert repair(database, world)["status"] == "done"
    assert repair(database, world, price=11) == {"status": "refused", "reason": "action_conflict"}
    assert repair(database, world, seq=1)["repeat"] is True
    assert counts(database, world) == (1, 1, 2, 1, 1)


def test_failure_after_debit_and_hp_update_rolls_back_root_money_quota_and_event(database):
    world = seed(database)
    as_owner(database)
    database.execute(
        "create function pg_temp.reject_repair_receipt() "
        "returns trigger language plpgsql "
        "as $$ begin raise exception 'injected_receipt_failure'; end $$"
    )
    database.execute(
        "create trigger injected_receipt_failure before insert on "
        "public.island_shared_repair_receipts for each row "
        "execute function pg_temp.reject_repair_receipt()"
    )
    with pytest.raises(psycopg.errors.RaiseException, match="injected_receipt_failure"):
        with database.transaction():
            repair(database, world)
    assert counts(database, world) == (0, 0, 1, 0, 0)
    assert database.execute(
        "select hp_units,repair_seq from public.island_structure_health where island_owner=%s",
        (world.owner,),
    ).fetchone() == (500_000, 0)
    database.execute(
        "drop trigger injected_receipt_failure on public.island_shared_repair_receipts"
    )
    assert repair(database, world)["status"] == "done"


def test_concurrent_repair_and_full_fund_bet_have_only_one_winner(scratch_server):
    with psycopg.connect(scratch_server.get_uri()) as connection:
        world = seed(connection, coins=10)
        connection.commit()
    barrier = Barrier(2)

    def run(is_repair):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            barrier.wait(timeout=5)
            result = (
                repair(connection, world)
                if is_repair
                else reserve(
                    connection,
                    world.member,
                    world.initial,
                    10,
                )
            )
            connection.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, (True, False)))
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    refusal = next(result for result in results if result["status"] == "refused")
    assert refusal["reason"] == "insufficient_funds"
    with psycopg.connect(scratch_server.get_uri()) as connection:
        as_owner(connection)
        reconciles(connection, keys(world.initial)[0])
        assert (
            connection.execute(
                "select balance_coins-committed_coins from "
                "public.island_economy_accounts where id=%s",
                (keys(world.initial)[0],),
            ).fetchone()[0]
            == 0
        )


class LocalAdmin:
    """Test-only no-network adapter; calls actual published and new functions by named args."""

    def __init__(self, connection):
        self.connection = connection
        self.calls = []

    async def call_function(self, name, parameters):
        assert name in {
            "island_shared_repair_replay",
            "island_economy_context",
            "island_economy_authority",
            "island_shared_structure_repair",
        }
        self.calls.append(name)
        as_server(self.connection)
        arguments = sql.SQL(",").join(
            sql.SQL("{}=>%s").format(sql.Identifier(key)) for key in parameters
        )
        query = sql.SQL("select public.{}({})").format(sql.Identifier(name), arguments)
        values = tuple(
            Jsonb(value) if isinstance(value, dict) else value for value in parameters.values()
        )
        return self.connection.execute(query, values).fetchone()[0]


def body_for(world):
    return SharedRepairRequest.model_validate(
        {
            "economy": {
                key: world.initial["currentEconomy"][key]
                for key in ("mode", "version", "islandOwner", "runEpoch")
            },
            "spot": "wall_1",
            "instanceId": str(world.instances["wall_1"]),
            "actionUid": "repair-0001",
            "expectedEpoch": str(world.recovery_epoch),
            "expectedWindow": "reserved_wave",
            "expectedWaveId": str(world.wave),
            "expectedLevel": 1,
            "expectedRepairSeq": 0,
            "quotedPrice": 10,
            "waveProtocol": 2,
        }
    )


def test_real_adapter_uses_common_authority_and_one_atomic_mutation_then_owned_replay(database):
    world = seed(database)
    admin = LocalAdmin(database)
    body = body_for(world)

    first = asyncio.run(repair_shared(admin, str(world.member), body))

    assert first.receipt.result.chargedPrice == "10"
    assert admin.calls == [
        "island_shared_repair_replay",
        "island_economy_context",
        "island_economy_authority",
        "island_shared_structure_repair",
    ]
    damage(database, world)
    admin.calls.clear()
    refreshed = body.model_copy(update={"expected_repair_seq": 1})
    again = asyncio.run(repair_shared(admin, str(world.member), refreshed))
    assert again.receipt == first.receipt
    assert again.currentEconomy is None
    assert admin.calls == ["island_shared_repair_replay"]


def test_free_revive_needs_canonical_hold_provenance_after_real_permission(database):
    world = seed(database, coins=0)
    configure_test_authority(
        database,
        world.member,
        world.owner,
        reservation_id=world.wave,
        actor_assignment_wave_id=world.wave,
    )
    admin = LocalAdmin(database)

    with pytest.raises(ApiError) as caught:
        asyncio.run(require_shared_revival(admin, str(world.member), body_for(world).economy))

    assert caught.value.code == "economy_path_unavailable"
    assert admin.calls == ["island_economy_context", "island_economy_authority"]
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_engineer_repairs_pay_the_full_frozen_increment(database):
    world = seed(database, frozen_price=17)
    database.execute(
        "update public.islands set captain_role='engineer' where player_id=%s", (world.owner,)
    )
    result = repair(database, world, actor=world.owner, price=17)
    assert result["receipt"]["result"]["chargedPrice"] == "17"
    assert result["receipt"]["result"]["financialReceipt"]["balanceDelta"] == "-17"


def test_repair_receipt_and_financial_fact_cannot_be_updated_or_deleted(database):
    world = seed(database)
    repair(database, world)
    as_owner(database)
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        with database.transaction():
            database.execute("update public.island_shared_repair_receipts set receipt_json='{}'")
    with pytest.raises(psycopg.errors.RaiseException, match="immutable"):
        with database.transaction():
            database.execute("delete from public.island_shared_repair_receipts")


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_ordinary_clients_cannot_execute_shared_repair_or_read_its_private_receipts(database, role):
    world = seed(database)
    as_owner(database)
    database.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with database.transaction():
            database.execute("select * from public.island_shared_repair_receipts")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with database.transaction():
            database.execute(
                "select public.island_shared_structure_repair("
                "null,null,null,null,null,null,null,null,null,null,null,null)"
            )
    assert counts(database, world) == (0, 0, 1, 0, 0)


@pytest.mark.parametrize("same_uid", [True, False])
def test_actual_duplicate_or_last_quota_race_commits_only_one_effect(scratch_server, same_uid):
    with psycopg.connect(scratch_server.get_uri()) as connection:
        world = seed(connection, spots=("wall_1", "wall_2"), used=0 if same_uid else 2)
        connection.commit()
    barrier = Barrier(2)

    def run(second):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            barrier.wait(timeout=5)
            result = repair(
                connection,
                world,
                actor=world.member if same_uid or not second else world.owner,
                uid="repair-0001" if same_uid or not second else "repair-0002",
                spot="wall_1" if same_uid or not second else "wall_2",
            )
            connection.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, (False, True)))
    if same_uid:
        assert all(result["status"] == "done" for result in results)
        assert sorted(result["repeat"] for result in results) == [False, True]
        assert results[0]["receipt"] == results[1]["receipt"]
    else:
        assert sorted(result["status"] for result in results) == ["done", "refused"]
        assert next(result for result in results if result["status"] == "refused")["reason"] == (
            "repair_limit_reached"
        )
    with psycopg.connect(scratch_server.get_uri()) as connection:
        assert counts(connection, world) == (1, 1, 2, 1 if same_uid else 3, 1)
        reconciles(connection, keys(world.initial)[0])


def test_nonmember_new_intent_is_refused_without_a_root_or_financial_effect(database):
    world = seed(database)
    assert repair(database, world, actor=world.outsider) == {
        "status": "refused",
        "reason": "not_member",
    }
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_retired_origin_replay_is_read_only_but_new_identity_cannot_spend(database):
    world = seed(database)
    first = repair(database, world)
    as_owner(database)
    database.execute(
        "update public.island_economy_accounts set state='retired',"
        "retired_at=clock_timestamp() where id=%s",
        (keys(world.initial)[0],),
    )
    again = repair(database, world)
    assert again == {"status": "done", "repeat": True, "receipt": first["receipt"]}
    assert repair(database, world, uid="repair-0002") == {
        "status": "refused",
        "reason": "path_unavailable",
    }
    assert counts(database, world) == (1, 1, 2, 1, 1)


@pytest.mark.parametrize(
    "key,value",
    [
        ("is_member", "true"),
        ("actor_id", str(uuid4())),
        ("session_leader_id", []),
        ("reservation_id", False),
    ],
)
def test_malformed_trusted_authority_fails_closed(database, key, value, monkeypatch):
    world = seed(database)
    as_owner(database)
    authority = rpc(database, "island_economy_authority", world.member, world.owner)
    authority[key] = value
    monkeypatch.setattr(__name__ + ".rpc", malformed_authority_domain(
        database, "island_shared_structure_repair", authority
    ))
    assert repair(database, world) == {"status": "refused", "reason": "path_unavailable"}
    assert counts(database, world) == (0, 0, 1, 0, 0)


@pytest.mark.parametrize(
    "patch",
    [
        {"accountId": str(uuid4())},
        {"runEpoch": str(uuid4())},
        {"islandOwner": str(uuid4())},
        {"version": True},
        {"mode": "personal_legacy"},
    ],
)
def test_binding_must_match_exact_origin_and_json_types(database, patch):
    world = seed(database, binding_patch=patch)
    assert repair(database, world) == {"status": "refused", "reason": "path_unavailable"}
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_legacy_snapshot_without_an_economy_binding_cannot_charge(database):
    world = seed(database, omit_binding=True)
    assert repair(database, world) == {"status": "refused", "reason": "path_unavailable"}
    assert counts(database, world) == (0, 0, 1, 0, 0)


def test_fresh_repair_of_an_intact_journal_target_has_no_second_effect(database):
    world = seed(database)
    first = repair(database, world)
    assert first["status"] == "done"
    assert repair(database, world, uid="repair-0002", seq=1) == {
        "status": "refused",
        "reason": "intact",
    }
    assert counts(database, world) == (1, 1, 2, 1, 1)


def test_paid_repair_does_not_become_demolition_refundable(database):
    world = seed(database)
    as_owner(database)
    before = database.execute(
        "select count(*) from public.building_payments where island_owner=%s", (world.owner,)
    ).fetchone()
    assert repair(database, world)["status"] == "done"
    as_owner(database)
    after = database.execute(
        "select count(*) from public.building_payments where island_owner=%s", (world.owner,)
    ).fetchone()
    assert before == after
