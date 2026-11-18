"""Real holder deletion and loadout storage; canonical session orchestration is separate."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.economy_test_authority import (  # noqa: E402
    configure_test_authority,
    install_test_authority,
)
from server.tests.island_sql.test_arsenal_runtime_sql import setup  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    keys,
    ready,
    rpc,
)
from server.tests.island_sql.test_shared_arsenal_sql import change, seed_copies  # noqa: E402
from server.tests.island_sql.test_wave_treasury_settlement_sql import (  # noqa: E402
    freeze,
    ready_wave,
)

NOW = datetime(2026, 11, 18, tzinfo=UTC)


def held_copy(database):
    owner, member, _, initial = setup(database)
    receipt = change(database, member, initial)
    as_owner(database)
    return owner, member, initial, receipt["receipt"]["result"]["copyId"]


def pending_return(database, member, initial, copy, wave):
    return rpc(
        database,
        "island_shared_arsenal_holder_locked",
        *keys(initial),
        member,
        copy,
        1,
        "withdraw",
        NOW,
        wave,
        None,
    )


def prepare_deletion(database, member, initial, copy, *, wave=None, generation=1):
    return rpc(
        database,
        "island_shared_arsenal_prepare_holder_deletion_locked",
        *keys(initial),
        member,
        copy,
        generation,
        NOW,
        wave,
    )


def test_prepared_pending_copy_survives_real_auth_profile_deletion(database):
    owner, member, initial, copy = held_copy(database)
    wave = uuid4()
    assert pending_return(database, member, initial, copy, wave)["changed"]
    database.execute("delete from auth.users where id=%s", (member,))
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id "
        "from public.arsenal_copies where id=%s and island_owner=%s",
        (copy, owner),
    ).fetchone() == (member, 1, wave)
    assert rpc(database, "island_shared_arsenal_settle_returns_locked", *keys(initial), wave) == 1
    database.execute("set constraints all immediate")
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (None, 2)


def test_unprepared_shared_holder_blocks_physical_deletion(database):
    _, member, _, copy = held_copy(database)
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="arsenal_holder_not_prepared"),
        database.transaction(),
    ):
        database.execute("delete from auth.users where id=%s", (member,))
    assert database.execute("select id from auth.users where id=%s", (member,)).fetchone()
    assert database.execute(
        "select holder from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member,)


@pytest.mark.parametrize("shared", [False, True])
def test_new_holder_still_requires_a_live_profile(database, shared):
    owner, _, _, initial = setup(database, shared=shared)
    as_owner(database)
    account, epoch = keys(initial) if shared else (None, None)
    with pytest.raises(psycopg.errors.ForeignKeyViolation), database.transaction():
        database.execute(
            "insert into public.arsenal_copies(island_owner,copy_no,weapon,holder,source,"
            "economy_account_id,economy_run_epoch) values(%s,1,'pistols',%s,'converted',%s,%s)",
            (owner, uuid4(), account, epoch),
        )


def test_deleted_pending_holder_cannot_become_live_without_a_profile(database):
    _, member, initial, copy = held_copy(database)
    wave = uuid4()
    pending_return(database, member, initial, copy, wave)
    database.execute("delete from auth.users where id=%s", (member,))
    with pytest.raises(psycopg.errors.ForeignKeyViolation), database.transaction():
        database.execute(
            "update public.arsenal_copies set pending_return_wave_id=null where id=%s", (copy,)
        )
    assert database.execute(
        "select holder,pending_return_wave_id from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, wave)


def test_frozen_loadout_capture_refuses_unbound_target_inventory(database):
    owner, member, _, initial = setup(database)
    as_owner(database)
    database.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,holder,source) "
        "values(%s,1,'pistols',%s,'converted')",
        (owner, member),
    )
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="arsenal_inventory_unbound"),
        database.transaction(),
    ):
        rpc(database, "island_shared_arsenal_loadouts_locked", *keys(initial), [member])


def test_outside_wave_preparation_returns_copy_and_repeats_after_matching_release(database):
    _, member, initial, copy = held_copy(database)
    assert prepare_deletion(database, member, initial, copy)["changed"]
    assert not prepare_deletion(database, member, initial, copy)["changed"]
    database.execute("delete from auth.users where id=%s", (member,))
    database.execute("set constraints all immediate")
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (None, 2)


def test_deletion_preparation_consumes_already_withdrawn_original_wave_only(database):
    _, member, initial, copy = held_copy(database)
    wave = uuid4()
    pending_return(database, member, initial, copy, wave)
    assert not prepare_deletion(database, member, initial, copy, wave=wave)["changed"]
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="arsenal_deletion_wave_changed"),
        database.transaction(),
    ):
        prepare_deletion(database, member, initial, copy, wave=uuid4())
    assert (
        rpc(database, "island_shared_arsenal_settle_returns_locked", *keys(initial), uuid4()) == 0
    )
    assert database.execute(
        "select holder,pending_return_wave_id from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, wave)


@pytest.mark.parametrize("changed", ["generation", "epoch", "actor"])
def test_deletion_preparation_rejects_a_different_tenure_or_origin(database, changed):
    owner, member, initial, copy = held_copy(database)
    account, epoch = keys(initial)
    reason = (
        "arsenal_deletion_origin_changed" if changed == "epoch" else "arsenal_deletion_stale_holder"
    )
    with pytest.raises(psycopg.errors.CheckViolation, match=reason), database.transaction():
        rpc(
            database,
            "island_shared_arsenal_prepare_holder_deletion_locked",
            account,
            uuid4() if changed == "epoch" else epoch,
            owner if changed == "actor" else member,
            copy,
            0 if changed == "generation" else 1,
            NOW,
            None,
        )
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, 1)


def test_failed_encompassing_delete_restores_profile_and_copy_tenure(database):
    _, member, initial, copy = held_copy(database)
    with pytest.raises(psycopg.errors.DivisionByZero), database.transaction():
        prepare_deletion(database, member, initial, copy)
        database.execute("delete from auth.users where id=%s", (member,))
        database.execute("select 1/0")
    assert database.execute("select id from auth.users where id=%s", (member,)).fetchone()
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, 1)


def test_legacy_held_copy_retains_original_profile_cascade_behavior(database):
    owner, member, _, _ = ready(database, admitted=False)
    as_owner(database)
    copy = database.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,holder,source) "
        "values(%s,1,'pistols',%s,'converted') returning id",
        (owner, member),
    ).fetchone()[0]
    database.execute("delete from auth.users where id=%s", (member,))
    assert (
        database.execute("select id from public.arsenal_copies where id=%s", (copy,)).fetchone()
        is None
    )


def test_holder_discovery_is_distinct_sorted_shared_only_and_creates_nothing(database):
    owner, member, _, _ = held_copy(database)
    second, _, _, initial = ready(database)
    as_owner(database)
    seed_copies(database, second, initial, 1)
    database.execute(
        "update public.arsenal_copies set holder=%s where island_owner=%s", (member, second)
    )
    expected = sorted([owner, second])
    assert rpc(database, "island_shared_arsenal_holder_owners", member) == expected
    assert rpc(database, "island_shared_arsenal_holder_owners", member) == expected
    assert rpc(database, "island_shared_arsenal_holder_owners", uuid4()) == []


def test_grandfathered_pending_copy_survives_committed_physical_deletion(database):
    owner, member, _, initial = setup(database)
    seed_copies(database, owner, initial, 24)
    copy = database.execute(
        "select id from public.arsenal_copies where island_owner=%s order by copy_no limit 1",
        (owner,),
    ).fetchone()[0]
    change(database, member, initial, kind="take", copy=copy, generation=0)
    as_owner(database)
    wave = uuid4()
    prepare_deletion(database, member, initial, copy, wave=wave)
    database.execute("delete from auth.users where id=%s", (member,))
    database.execute("set constraints all immediate")
    database.commit()
    assert (
        database.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 24
    )
    rpc(database, "island_shared_arsenal_settle_returns_locked", *keys(initial), wave)
    database.execute("set constraints all immediate")
    database.commit()
    assert (
        database.execute(
            "select count(*) from public.arsenal_copies where island_owner=%s and holder is null",
            (owner,),
        ).fetchone()[0]
        == 24
    )


def test_loadout_result_preserves_exact_copy_and_excludes_pending_holder(database):
    _, member, initial, copy = held_copy(database)
    assert rpc(database, "island_shared_arsenal_loadouts_locked", *keys(initial), [member]) == [
        {"playerId": str(member), "copyId": copy, "weapon": "pistols", "generation": "1"}
    ]
    prepare_deletion(database, member, initial, copy, wave=uuid4())
    assert rpc(database, "island_shared_arsenal_loadouts_locked", *keys(initial), [member]) == [
        {"playerId": str(member), "copyId": None, "weapon": "musket", "generation": None}
    ]


def test_owner_asset_reset_preserves_common_history_and_legacy_movements(database):
    owner, member, initial, copy = held_copy(database)
    database.execute(
        "insert into public.arsenal_moves(player_id,action_uid,island_owner,kind,copy_id) "
        "values(%s,'legacy001',%s,'buy',%s)",
        (member, owner, copy),
    )
    before = database.execute("select result from public.shared_arsenal_receipts").fetchall()
    result = rpc(database, "island_shared_arsenal_reset_locked", *keys(initial), owner, NOW)
    assert result == {"copiesCleared": 1, "historicalMovesRetained": 1}
    assert (
        database.execute("select result from public.shared_arsenal_receipts").fetchall() == before
    )
    assert database.execute(
        "select copy_id from public.arsenal_moves where player_id=%s and action_uid='legacy001'",
        (member,),
    ).fetchone() == (None,)
    assert (
        database.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (keys(initial)[0],),
        ).fetchone()[0]
        == 140
    )


def test_paused_owner_can_dispose_stock_without_enabling_reset_or_bell(database):
    owner, _, initial, _ = held_copy(database)
    database.execute(
        "update public.island_economy_state set admission_state='paused' where island_owner=%s",
        (owner,),
    )
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="arsenal_loadout_origin_changed"),
        database.transaction(),
    ):
        rpc(database, "island_shared_arsenal_loadouts_locked", *keys(initial), [owner])
    assert rpc(database, "island_shared_arsenal_reset_locked", *keys(initial), owner, NOW) == {
        "copiesCleared": 1,
        "historicalMovesRetained": 0,
    }
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    assert rpc(database, "island_fresh_start", owner, "paused-reset01", code, 100) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    assert database.execute(
        "select admission_state,current_account_id::text from public.island_economy_state "
        "where island_owner=%s",
        (owner,),
    ).fetchone() == ("paused", initial["currentEconomy"]["accountId"])


@pytest.mark.parametrize(
    ("blocked", "reason"),
    [
        ("member", "arsenal_reset_not_owner"),
        ("wrong_epoch", "arsenal_reset_origin_changed"),
        ("pending", "arsenal_reset_pending_return"),
        ("authority", "arsenal_reset_authority_missing"),
    ],
)
def test_asset_reset_refuses_incomplete_current_owner_authority(database, blocked, reason):
    owner, member, initial, copy = held_copy(database)
    if blocked == "pending":
        prepare_deletion(database, member, initial, copy, wave=uuid4())
    if blocked == "authority":
        database.execute("drop function public.island_economy_authority(uuid,uuid)")
    with pytest.raises(psycopg.errors.CheckViolation, match=reason), database.transaction():
        rpc(
            database,
            "island_shared_arsenal_reset_locked",
            keys(initial)[0],
            uuid4() if blocked == "wrong_epoch" else keys(initial)[1],
            member if blocked == "member" else owner,
            NOW,
        )
    assert database.execute("select id from public.arsenal_copies where id=%s", (copy,)).fetchone()


def test_asset_reset_refuses_real_unclosed_accounting_even_after_wave_metadata_closed(database):
    wave = ready_wave(database)
    freeze(database, wave)
    as_owner(database)
    install_test_authority(database)
    configure_test_authority(database, wave.owner, wave.owner)
    database.execute(
        "update public.wave_runs set finished_at=clock_timestamp(),survived=false,"
        "ships_sunk=0,loot=0 where id=%s",
        (wave.id,),
    )
    with (
        pytest.raises(psycopg.errors.CheckViolation, match="arsenal_reset_wave_unclosed"),
        database.transaction(),
    ):
        rpc(database, "island_shared_arsenal_reset_locked", *keys(wave.treasury), wave.owner, NOW)


def test_failed_encompassing_reset_restores_copy_and_movement_pointer(database):
    owner, member, initial, copy = held_copy(database)
    database.execute(
        "insert into public.arsenal_moves(player_id,action_uid,island_owner,kind,copy_id) "
        "values(%s,'legacy001',%s,'buy',%s)",
        (member, owner, copy),
    )
    with pytest.raises(psycopg.errors.DivisionByZero), database.transaction():
        rpc(database, "island_shared_arsenal_reset_locked", *keys(initial), owner, NOW)
        database.execute("select 1/0")
    assert database.execute(
        "select holder,holder_generation from public.arsenal_copies where id=%s", (copy,)
    ).fetchone() == (member, 1)
    assert database.execute(
        "select copy_id::text from public.arsenal_moves "
        "where player_id=%s and action_uid='legacy001'",
        (member,),
    ).fetchone() == (copy,)


def test_private_lifecycle_helpers_have_no_browser_or_service_execution(database):
    functions = (
        "island_shared_arsenal_holder_owners(uuid)",
        "island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[])",
        "island_shared_arsenal_prepare_holder_deletion_locked(uuid,uuid,uuid,uuid,numeric,timestamptz,uuid)",
        "island_shared_arsenal_reset_locked(uuid,uuid,uuid,timestamptz)",
    )
    for function in functions:
        for role in ("anon", "authenticated", "service_role"):
            assert not database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, f"public.{function}")
            ).fetchone()[0]
