"""Atomic shared construction and legacy exclusion on disposable PostgreSQL.

Uses the complete migration chain twice, synthetic members, and real Captain hooks.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from queue import Queue
from threading import Barrier
from time import monotonic, sleep
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import CAMPAIGN_FILE, CONTENT_FILE, load_island  # noqa: E402
from server.island.construction_rules import catalogue_manifest  # noqa: E402
from server.island.economy_operations import system_uid  # noqa: E402
from server.tests.case_sql import conftest as postgres_fixture  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    money,
    ready,
    reconciles,
    reserve,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    open_island,
)
from server.tests.island_sql.test_personal_captain_sql import (  # noqa: E402
    RULES,
    initialized,
    private,
    view,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import (  # noqa: E402
    template,
)

MANIFEST = catalogue_manifest(load_island())


@pytest.fixture
def isolated_transition(scratch_server, tmp_path):
    """Run committed adoption races without leaving records in other SQL fixtures."""
    pgserver = pytest.importorskip("pgserver")
    assert psycopg.conninfo.conninfo_to_dict(scratch_server.get_uri())["host"].startswith("/")
    with pgserver.get_server(
        tmp_path / "construction-transition-pg", cleanup_mode="delete"
    ) as server:
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute(Path(postgres_fixture.__file__).with_name("stub.sql").read_text())
            for _ in range(2):
                for migration in sorted(postgres_fixture.MIGRATIONS.glob("*.sql")):
                    connection.execute(migration.read_text())
        with psycopg.connect(server.get_uri()) as connection:
            yield connection, server


def intent(action="build", *, spot="wall_1", kind="wall", instance=None, level=0, coins="9"):
    return {
        "action": action,
        "spot": spot,
        "kind": kind,
        "instanceId": instance,
        "expectedLevel": level,
        "quotedCoins": coins,
    }


def construct(connection, actor, treasury, request=None, *, uid=None, manifest=None):
    as_server(connection)
    return rpc(
        connection,
        "island_economy_construct",
        actor,
        *keys(treasury),
        uid or uuid4().hex,
        Jsonb(request or intent()),
        Jsonb(manifest or MANIFEST),
    )


def target(result, action, coins):
    asset = result["receipt"]["result"]
    return intent(
        action,
        spot=asset["spot"],
        kind=asset["kind"],
        instance=asset["instanceId"],
        level=asset["level"],
        coins=coins,
    )


def standing(connection, owner, spot="wall_1"):
    as_owner(connection)
    return connection.execute(
        "select building_type,level,recovery_instance_id,coins_paid,spec "
        "from public.islet_buildings where player_id=%s and plot=%s",
        (owner, spot),
    ).fetchone()


def initialize_member(connection, member, owner, treasury):
    as_server(connection)
    rpc(connection, "personal_captain_initialize", member, owner, keys(treasury)[1], Jsonb(RULES))


def test_discount_purchase_and_half_actual_refund_share_the_island_account(database):
    owner, member, _, treasury, _ = initialized(database)
    initialize_member(database, member, owner, treasury)
    manifest = deepcopy(MANIFEST)
    manifest["kinds"]["wall"]["prices"][0] = "100"
    wallets = [balance(database, player) for player in (owner, member)]
    built = construct(database, owner, treasury, intent(coins="90"), manifest=manifest)
    assert built["status"] == "done", built
    assert money(built) == (110, 0, 110)
    effect = built["receipt"]["result"]
    assert effect["chargedCoins"] == "90"
    assert (
        effect["engineerCommitmentId"]
        == view(database, owner)["captain"]["engineerCommitment"]["id"]
    )
    torn = construct(database, member, treasury, target(built, "demolish", "45"))
    assert money(torn) == (155, 0, 155)
    assert torn["receipt"]["result"]["refundedCoins"] == "45"
    assert standing(database, owner) is None
    assert [balance(database, player) for player in (owner, member)] == wallets
    reconciles(database, keys(treasury)[0])


def test_valid_catalogue_levels_can_exceed_old_cumulative_storage_ceiling(database, tmp_path):
    data = json.loads(CONTENT_FILE.read_text())
    for kind in data["kinds"]:
        if kind["kind"] == "wall":
            kind["prices"] = [700000] * len(kind["prices"])
    path = tmp_path / "islands.json"
    path.write_text(json.dumps(data))
    manifest = catalogue_manifest(load_island(path, CAMPAIGN_FILE))
    owner, _, _, treasury, _ = initialized(database)
    as_server(database)
    rpc(
        database,
        "island_treasury_credit",
        owner,
        *keys(treasury),
        system_uid(str(uuid4()), "loot"),
        "pirate_loot",
        "fixture:canonical",
        3000000,
    )
    private_balance = balance(database, owner)
    first = construct(database, owner, treasury, intent(coins="630000"), manifest=manifest)
    second = construct(
        database, owner, treasury, target(first, "upgrade", "630000"), manifest=manifest
    )
    assert second["status"] == "done", second
    assert standing(database, owner)[3] == 1260000
    assert (
        second["receipt"]["result"]["engineerCommitmentId"]
        == first["receipt"]["result"]["engineerCommitmentId"]
    )
    removed = construct(
        database, owner, treasury, target(second, "demolish", "630000"), manifest=manifest
    )
    assert removed["receipt"]["result"]["refundedCoins"] == "630000"
    assert money(removed) == (2370200, 0, 2370200)
    assert balance(database, owner) == private_balance
    reconciles(database, keys(treasury)[0])


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1.5", "-1"])
def test_cumulative_storage_rejects_nonfinite_fractional_and_negative_values(database, value):
    owner, _, _, treasury, _ = initialized(database)
    construct(database, owner, treasury)
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation), database.transaction():
        database.execute(
            "update public.islet_buildings set coins_paid=%s::numeric "
            "where player_id=%s and plot='wall_1'",
            (value, owner),
        )
    assert standing(database, owner)[3] == 9
    reconciles(database, keys(treasury)[0])


def test_refund_uses_actual_ledger_basis_despite_wide_legacy_total_or_changed_catalogue(database):
    owner, _, _, treasury, _ = initialized(database)
    built = construct(database, owner, treasury)
    as_owner(database)
    database.execute(
        "update public.islet_buildings set coins_paid=%s::numeric "
        "where player_id=%s and plot='wall_1'",
        (str(2**80), owner),
    )
    assert standing(database, owner)[3] == 2**80
    manifest = deepcopy(MANIFEST)
    manifest["kinds"]["wall"]["prices"] = ["999999"] * 5
    removed = construct(
        database, owner, treasury, target(built, "demolish", "4"), manifest=manifest
    )
    assert removed["receipt"]["result"]["refundedCoins"] == "4"
    assert money(removed) == (195, 0, 195)
    reconciles(database, keys(treasury)[0])


def test_demolition_does_not_require_unrelated_personal_captain_initialization(database):
    owner, member, _, treasury, _ = initialized(database)
    built = construct(database, owner, treasury)
    removed = construct(database, member, treasury, target(built, "demolish", "4"))
    assert removed["status"] == "done"
    assert money(removed) == (195, 0, 195)


def test_upgrade_keeps_instance_specialization_and_layout_then_refunds_total_basis(database):
    owner, _, _, treasury, _ = initialized(database)
    built = construct(database, owner, treasury)
    assert built["status"] == "done", built
    as_owner(database)
    database.execute(
        "update public.islet_buildings set spec='bastion' where player_id=%s and plot='wall_1'",
        (owner,),
    )
    layout_before = database.execute(
        "select * from public.island_layout where island_owner=%s", (owner,)
    ).fetchall()
    upgraded = construct(database, owner, treasury, target(built, "upgrade", "18"))
    assert upgraded["status"] == "done", upgraded
    assert (
        construct(database, owner, treasury, target(built, "upgrade", "18"))["reason"]
        == "stale_construction_quote"
    )
    row = standing(database, owner)
    assert row[1:] == (2, row[2], 27, "bastion")
    assert str(row[2]) == built["receipt"]["result"]["instanceId"]
    assert (
        upgraded["receipt"]["result"]["engineerCommitmentId"]
        == built["receipt"]["result"]["engineerCommitmentId"]
    )
    as_owner(database)
    assert (
        database.execute(
            "select * from public.island_layout where island_owner=%s", (owner,)
        ).fetchall()
        == layout_before
    )
    demolished = construct(database, owner, treasury, target(upgraded, "demolish", "13"))
    assert money(demolished) == (186, 0, 186)


def test_retry_returns_original_receipt_and_cannot_delete_a_replacement(database):
    owner, _, _, treasury, _ = initialized(database)
    built = construct(database, owner, treasury, uid="build001")
    request = target(built, "demolish", "4")
    removed = construct(database, owner, treasury, request, uid="remove01")
    replacement = construct(database, owner, treasury, uid="build002")
    retried = construct(database, owner, treasury, request, uid="remove01")
    assert retried["repeat"] is True and retried["receipt"] == removed["receipt"]
    assert money(retried) == money(replacement)
    assert str(standing(database, owner)[2]) == replacement["receipt"]["result"]["instanceId"]
    assert construct(database, owner, treasury, request)["reason"] == "stale_construction_quote"
    assert (
        construct(database, owner, treasury, {**request, "quotedCoins": "5"}, uid="remove01")[
            "reason"
        ]
        == "action_conflict"
    )


def test_identical_build_retry_does_not_recharge_or_extend_engineer_binding(database):
    owner, _, _, treasury, _ = initialized(database)
    first = construct(database, owner, treasury, uid="build001")
    again = construct(database, owner, treasury, uid="build001", manifest={"kinds": {}})
    assert again["receipt"] == first["receipt"] and again["repeat"] is True
    assert money(again) == money(first)
    assert (
        view(database, owner)["captain"]["engineerCommitment"]["id"]
        == first["receipt"]["result"]["engineerCommitmentId"]
    )
    assert (
        construct(database, owner, treasury, intent(spot="wall_2"), uid="build001")["reason"]
        == "action_conflict"
    )


def test_new_discount_after_a_withdrawn_wave_supersedes_its_frozen_engineer_generation(database):
    owner, _, _, treasury, _ = initialized(database)
    first = construct(database, owner, treasury, uid="build001")
    c1 = first["receipt"]["result"]["engineerCommitmentId"]
    wave = uuid4()
    private(database, "personal_captain_attach_wave_locked", owner, wave, 1)
    private(database, "personal_captain_release_assignment_locked", owner, wave)
    second = construct(database, owner, treasury, intent(spot="wall_2"))
    c2 = second["receipt"]["result"]["engineerCommitmentId"]
    third = construct(database, owner, treasury, intent(spot="wall_3"))
    assert c2 != c1 and third["receipt"]["result"]["engineerCommitmentId"] == c2
    private(database, "personal_captain_complete_locked", owner, wave, 1, "lost", True, c1)
    assert view(database, owner)["captain"]["engineerCommitment"]["id"] == c2
    repeat = construct(database, owner, treasury, uid="build001")
    assert repeat["receipt"] == first["receipt"] and repeat["repeat"] is True
    assert view(database, owner)["captain"]["engineerCommitment"]["id"] == c2


def test_departed_actor_only_receives_their_original_receipt(database):
    owner, member, _, treasury, _ = initialized(database)
    initialize_member(database, member, owner, treasury)
    request = intent(coins="10")
    first = construct(database, member, treasury, request, uid="build001")
    as_server(database)
    rpc(database, "game_leave", member, owner)
    repeat = construct(database, member, treasury, request, uid="build001")
    assert repeat["receipt"] == first["receipt"] and repeat["currentEconomy"] is None
    assert (
        construct(database, member, treasury, intent(spot="wall_2", coins="10"))["reason"]
        == "not_member"
    )


@pytest.mark.parametrize("change", ["retired_replaced", "pointer_replaced", "paused"])
def test_inactive_origin_retry_keeps_own_receipt_without_current_projection(database, change):
    owner, _, _, treasury, _ = initialized(database)
    original = construct(database, owner, treasury, uid="historical1")
    account, _ = keys(treasury)
    as_owner(database)
    if change == "paused":
        database.execute(
            "update public.island_economy_state set admission_state='paused' where island_owner=%s",
            (owner,),
        )
    else:
        if change == "retired_replaced":
            database.execute(
                "update public.island_economy_accounts set state='retired',"
                "retired_at=clock_timestamp() where id=%s",
                (account,),
            )
        replacement, epoch = uuid4(), uuid4()
        database.execute(
            "insert into public.island_economy_accounts(id,island_owner,run_epoch) "
            "values(%s,%s,%s)",
            (replacement, owner, epoch),
        )
        database.execute(
            "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
            "where island_owner=%s",
            (replacement, epoch, owner),
        )
    again = construct(database, owner, treasury, uid="historical1")
    assert again["repeat"] is True and again["receipt"] == original["receipt"]
    assert again["currentEconomy"] is None
    assert (
        construct(database, owner, treasury, intent(spot="wall_2"))["reason"] == "path_unavailable"
    )
    reconciles(database, account)


def test_a_build_action_cannot_be_retargeted_to_another_island_account(database):
    owner, _, _, treasury, _ = initialized(database)
    first = construct(database, owner, treasury, uid="build001")
    other_owner, _, _, other = ready(database)
    as_server(database)
    rpc(database, "game_join", owner, other_owner, 10)
    assert construct(database, owner, other, uid="build001")["reason"] == "action_conflict"
    assert standing(database, other_owner) is None
    reconciles(database, keys(treasury)[0])
    reconciles(database, keys(other)[0])
    assert money(first) == (191, 0, 191)


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"quotedCoins": "10"}, "stale_construction_quote"),
        ({"spot": "wall_12"}, "locked"),
        ({"spot": "heart"}, "protected"),
        ({"kind": "cannon"}, "protected"),
    ],
)
def test_failed_builds_never_debit_or_bind(database, change, reason):
    owner, _, _, treasury, _ = initialized(database)
    if reason == "locked":
        as_owner(database)
        database.execute("update public.islands set wave_best=0 where player_id=%s", (owner,))
    refused = construct(database, owner, treasury, {**intent(), **change})
    assert refused == {"status": "refused", "reason": reason}
    assert view(database, owner)["captain"]["engineerCommitment"] is None
    reconciles(database, keys(treasury)[0])


def test_wager_hold_prevents_spending_reserved_coins_without_private_fallback(database):
    owner, _, _, treasury, _ = initialized(database)
    held = reserve(database, owner, treasury, 195)
    wallet = balance(database, owner)
    assert construct(database, owner, treasury)["reason"] == "insufficient_funds"
    assert money(held) == (200, 195, 5)
    assert standing(database, owner) is None
    assert view(database, owner)["captain"]["engineerCommitment"] is None
    assert balance(database, owner) == wallet


def test_a_refused_intent_releases_its_root_claim_for_a_corrected_request(database):
    owner, _, _, treasury, _ = initialized(database)
    assert (
        construct(database, owner, treasury, intent(coins="10"), uid="correct1")["reason"]
        == "stale_construction_quote"
    )
    assert construct(database, owner, treasury, uid="correct1")["status"] == "done"


def test_zero_refund_action_uid_conflicts_with_financial_and_other_domain_effects(database):
    owner, _, _, treasury, _ = initialized(database)
    manifest = deepcopy(MANIFEST)
    manifest["kinds"]["wall"]["prices"][0] = "1"
    built = construct(database, owner, treasury, intent(coins="1"), manifest=manifest)
    removed = construct(database, owner, treasury, target(built, "demolish", "0"), uid="zero0001")
    assert removed["status"] == "done"
    as_server(database)
    assert (
        rpc(
            database,
            "island_treasury_spend",
            owner,
            *keys(treasury),
            "zero0001",
            "building_purchase",
            "cross:financial",
            1,
        )["reason"]
        == "action_conflict"
    )
    assert construct(database, owner, treasury, uid="zero0001")["reason"] == "action_conflict"
    assert (
        rpc(
            database,
            "island_treasury_spend",
            owner,
            *keys(treasury),
            "spent001",
            "building_purchase",
            "cross:other",
            1,
        )["status"]
        == "done"
    )
    assert construct(database, owner, treasury, uid="spent001")["reason"] == "action_conflict"


def test_unmapped_private_building_cannot_refund_or_upgrade_from_shared_coins(database):
    owner, _, _, treasury = ready(database, admitted=False)
    as_server(database)
    assert (
        rpc(database, "island_build", owner, owner, "wall_1", "wall", "private1", 10)["status"]
        == "done"
    )
    treasury = rpc(database, "island_treasury_admit", owner, owner, "admit001", 200)
    initialize_member(database, owner, owner, treasury)
    instance = str(standing(database, owner)[2])
    for action, quote in (("upgrade", "20"), ("demolish", "5")):
        refused = construct(
            database, owner, treasury, intent(action, instance=instance, level=1, coins=quote)
        )
        assert refused["reason"] == "construction_basis_missing"
    assert standing(database, owner)[1] == 1
    reconciles(database, keys(treasury)[0])


def test_old_personal_mutation_and_quote_rpcs_are_blocked_after_admission(database):
    owner, _, _, treasury, _ = initialized(database)
    wallet = balance(database, owner)
    arguments = [
        ("island_build", (owner, owner, "wall_1", "wall", "legacy01", 10)),
        ("island_upgrade", (owner, owner, "wall_1", "legacy02", [10, 20], 2)),
        ("island_demolish", (owner, owner, "wall_1", "legacy03", Jsonb({"wall": [10, 20]}))),
        ("island_demolish_quote", (owner, owner, "wall_1", Jsonb({"wall": [10, 20]}))),
    ]
    as_server(database)
    for name, values in arguments:
        assert rpc(database, name, *values) == {
            "status": "refused",
            "reason": "economy_context_required",
        }
    assert balance(database, owner) == wallet
    assert standing(database, owner) is None
    reconciles(database, keys(treasury)[0])


@pytest.mark.parametrize("expired", [False, True])
def test_countdown_or_expired_unclosed_reservation_blocks_permanent_mutation(database, expired):
    owner, _, _, treasury, _ = initialized(database)
    as_owner(database)
    database.execute(
        "insert into public.wave_runs(started_by,island_owner,wave,starts_at,action_uid,"
        "place,seed,minimum_seconds,maximum_seconds,weather_kind,weather_ships,weather_fog) "
        "values(%s,%s,1,clock_timestamp() + %s * interval '1 minute','reserved1',"
        "'island',1,1,60,'calm',1,1)",
        (owner, owner, -600 if expired else 1),
    )
    assert construct(database, owner, treasury)["reason"] == "wave_running"
    as_owner(database)
    assert database.execute(
        "select finished_at from public.wave_runs where island_owner=%s", (owner,)
    ).fetchone() == (None,)
    assert standing(database, owner) is None


def test_a_waiting_purchase_rechecks_the_reservation_committed_under_shared_locks(
    database,
    scratch_server,
):
    owner, _, _, treasury, _ = initialized(database)
    database.commit()
    barrier = Barrier(2)

    def buy():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            return construct(connection, owner, treasury)

    with psycopg.connect(scratch_server.get_uri()) as reservation:
        private(reservation, "island_treasury_lock_scope", owner)
        reservation.execute(
            "select id from public.island_economy_accounts where id=%s for update",
            (keys(treasury)[0],),
        )
        private(reservation, "personal_captain_lock_state_locked", owner)
        reservation.execute(
            "select player_id from public.islands where player_id=%s for update", (owner,)
        )
        private(reservation, "island_economy_require_idle_locked", owner)
        with ThreadPoolExecutor(max_workers=1) as pool:
            purchase = pool.submit(buy)
            barrier.wait(timeout=10)
            reservation.execute(
                "update public.island_recovery_state set current_wave_id=%s,"
                "reserved_at=clock_timestamp(),starts_at=clock_timestamp(),"
                "expires_at=clock_timestamp()+interval '1 minute' "
                "where island_owner=%s",
                (uuid4(), owner),
            )
            reservation.commit()
            assert purchase.result(timeout=10)["reason"] == "wave_running"
    assert standing(database, owner) is None
    assert view(database, owner)["captain"]["engineerCommitment"] is None
    reconciles(database, keys(treasury)[0])


@pytest.mark.parametrize("table", ["islet_buildings", "island_construction_receipts"])
def test_late_failure_rolls_back_debit_payment_and_commitment(database, table):
    owner, _, _, treasury, _ = initialized(database)
    as_owner(database)
    database.execute(
        "create function pg_temp.reject_test_asset() returns trigger language plpgsql "
        "as $$ begin raise exception 'synthetic_asset_failure'; end $$"
    )
    database.execute(
        f"create trigger reject_test_asset before insert on public.{table} "
        "for each row execute function pg_temp.reject_test_asset()"
    )
    with pytest.raises(psycopg.Error, match="synthetic_asset_failure"), database.transaction():
        construct(database, owner, treasury)
    assert view(database, owner)["captain"]["engineerCommitment"] is None
    assert standing(database, owner) is None
    as_owner(database)
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (keys(treasury)[0],)
    ).fetchone() == (200,)
    assert database.execute(
        "select count(*) from public.island_construction_payments where account_id=%s",
        (keys(treasury)[0],),
    ).fetchone() == (0,)
    reconciles(database, keys(treasury)[0])


def test_v1_health_and_layout_keep_the_same_instance_through_upgrade_and_demolition(database):
    owner, _, _, treasury, _ = initialized(database)
    epoch = uuid4()
    as_owner(database)
    database.execute(
        "update public.island_recovery_state set reset_epoch=%s,recovery_version=1,"
        "wave_protocol=2 where island_owner=%s",
        (epoch, owner),
    )
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot) "
        "values(%s,%s,%s,1,2,%s)",
        (uuid4(), owner, epoch, Jsonb(template())),
    )
    database.execute(
        "insert into public.island_layout(island_owner,plot,x_half,z_half) "
        "values(%s,'wall_1',-37,-2)",
        (owner,),
    )
    built = construct(database, owner, treasury)
    assert built["status"] == "done", built
    instance = built["receipt"]["result"]["instanceId"]
    other = construct(database, owner, treasury, intent(spot="wall_2"))
    assert other["status"] == "done", other
    other_building = standing(database, owner, "wall_2")
    as_owner(database)
    assert database.execute(
        "select instance_id,hp_units,max_hp from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'",
        (owner,),
    ).fetchone() == (UUID(instance), 1000000, 60)
    database.execute(
        "update public.island_structure_health set hp_units=500000,"
        "rate_numerator=0 where island_owner=%s and spot='wall_1'",
        (owner,),
    )
    assert (
        construct(database, owner, treasury, target(built, "upgrade", "18"))["reason"]
        == "needs_repair"
    )
    as_owner(database)
    database.execute(
        "update public.island_structure_health set hp_units=500000,"
        "rate_numerator=1,rate_denominator=1,"
        "settled_at=clock_timestamp()-interval '10 minutes' "
        "where island_owner=%s and spot='wall_1'",
        (owner,),
    )
    upgraded = construct(database, owner, treasury, target(built, "upgrade", "18"))
    assert upgraded["status"] == "done", upgraded
    as_owner(database)
    assert database.execute(
        "select instance_id,hp_units,max_hp,level from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'",
        (owner,),
    ).fetchone() == (UUID(instance), 1000000, 120, 2)
    assert (
        construct(database, owner, treasury, target(upgraded, "demolish", "13"))["status"] == "done"
    )
    as_owner(database)
    assert database.execute(
        "select count(*) from public.island_structure_health where island_owner=%s", (owner,)
    ).fetchone() == (1,)
    assert standing(database, owner, "wall_2") == other_building
    as_owner(database)
    assert database.execute(
        "select instance_id,hp_units,max_hp,level from public.island_structure_health "
        "where island_owner=%s and spot='wall_2'",
        (owner,),
    ).fetchone() == (UUID(other["receipt"]["result"]["instanceId"]), 1000000, 60, 1)
    assert database.execute(
        "select x_half,z_half from public.island_layout where island_owner=%s", (owner,)
    ).fetchone() == (-37, -2)


def test_assigned_captain_cannot_buy_and_tiny_rounding_does_not_bind(database):
    owner, _, _, treasury, _ = initialized(database)
    manifest = deepcopy(MANIFEST)
    manifest["kinds"]["wall"]["prices"][0] = "1"
    first = construct(database, owner, treasury, intent(coins="1"), manifest=manifest)
    assert first["status"] == "done" and first["receipt"]["result"]["engineerCommitmentId"] is None
    assert view(database, owner)["captain"]["engineerCommitment"] is None
    private(database, "personal_captain_attach_wave_locked", owner, uuid4(), 1)
    assert (
        construct(database, owner, treasury, intent(spot="wall_2"))["reason"] == "captain_assigned"
    )
    removed = construct(database, owner, treasury, target(first, "demolish", "0"))
    assert removed["status"] == "done" and removed["receipt"]["result"]["treasuryReceiptId"] is None
    assert money(removed) == (199, 0, 199)


def test_a_non_discounted_purchase_does_not_change_an_assigned_captain(database):
    owner, _, _, treasury, _ = initialized(database, role="medic")
    private(database, "personal_captain_attach_wave_locked", owner, uuid4(), 1)
    before = view(database, owner)
    result = construct(database, owner, treasury, intent(coins="10"))
    assert result["status"] == "done", result
    assert result["receipt"]["result"]["engineerCommitmentId"] is None
    assert view(database, owner) == before


def test_construct_and_wager_race_cannot_overspend(database, scratch_server):
    owner, member, _, treasury, _ = initialized(database)
    initialize_member(database, member, owner, treasury)
    as_server(database)
    rpc(
        database,
        "island_treasury_spend",
        owner,
        *keys(treasury),
        "setup001",
        "building_purchase",
        "setup:cash",
        190,
    )
    database.commit()
    barrier = Barrier(2)

    def compete(is_build):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            if is_build:
                return construct(connection, member, treasury, intent(coins="10"))
            as_server(connection)
            return reserve(connection, member, treasury, 10)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(compete, [True, False]))
    assert sorted(result["status"] for result in results) == ["done", "refused"]
    assert (
        next(result for result in results if result["status"] == "refused")["reason"]
        == "insufficient_funds"
    )
    reconciles(database, keys(treasury)[0])


def test_parallel_same_action_only_creates_one_asset_and_charge(database, scratch_server):
    owner, _, _, treasury, _ = initialized(database)
    database.commit()
    barrier = Barrier(2)

    def buy(_):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=10)
            return construct(connection, owner, treasury, uid="parallel1")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(buy, range(2)))
    assert sorted(result["repeat"] for result in results) == [False, True]
    assert results[0]["receipt"] == results[1]["receipt"]
    assert money(results[0]) == money(results[1]) == (191, 0, 191)
    reconciles(database, keys(treasury)[0])


def test_admission_and_legacy_build_serialize_without_shared_private_fallback(
    database, scratch_server
):
    owner, _, _, _ = ready(database, admitted=False)
    database.commit()
    barrier = Barrier(2)

    def compete(admission):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            as_server(connection)
            barrier.wait(timeout=10)
            if admission:
                return rpc(connection, "island_treasury_admit", owner, owner, "admit001", 200)
            return rpc(connection, "island_build", owner, owner, "wall_1", "wall", "legacy01", 10)

    with ThreadPoolExecutor(max_workers=2) as pool:
        admitted, build = list(pool.map(compete, [True, False]))
    assert admitted["status"] == "done"
    assert (build["status"], balance(database, owner)) in (("done", 90), ("refused", 100))
    if build["status"] == "refused":
        assert build["reason"] == "economy_context_required"
    as_server(database)
    assert (
        rpc(database, "island_build", owner, owner, "wall_2", "wall", "legacy02", 10)["reason"]
        == "economy_context_required"
    )


def test_history_and_private_legacy_aliases_have_no_write_or_execute_capability(database):
    owner, _, _, treasury, _ = initialized(database)
    construct(database, owner, treasury)
    as_owner(database)
    for table in ("island_construction_payments", "island_construction_receipts"):
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_table_privilege(%s,%s,'insert,update,delete')",
                (role, "public." + table),
            ).fetchone() == (False,)
        with (
            pytest.raises(psycopg.Error, match="construction_history_immutable"),
            database.transaction(),
        ):
            database.execute(
                f"delete from public.{table} where account_id=%s", (keys(treasury)[0],)
            )
    for signature in (
        "island_build_legacy_personal(uuid,uuid,text,text,text,integer)",
        "island_upgrade_legacy_personal(uuid,uuid,text,text,integer[],integer)",
        "island_demolish_legacy_personal(uuid,uuid,text,text,jsonb)",
        "island_demolish_quote_legacy_personal(uuid,uuid,text,jsonb)",
        "island_economy_require_idle_locked(uuid)",
        "island_construction_legacy_actor_allowed_locked(uuid)",
    ):
        for role in ("anon", "authenticated", "service_role"):
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, "public." + signature)
            ).fetchone() == (False,)


@pytest.mark.parametrize("action", ["build", "upgrade"])
def test_managed_actor_cannot_bypass_engineer_binding_on_a_legacy_target(database, action):
    actor, _, _, _, _ = initialized(database)
    owner, _, _, _ = ready(database, admitted=False)
    rpc(database, "game_join", actor, owner, 10)
    assert (
        rpc(database, "island_build", owner, owner, "wall_1", "wall", "seedwall1", 10)["status"]
        == "done"
    )
    wallet = balance(database, actor)
    captain = view(database, actor)
    if action == "build":
        result = rpc(database, "island_build", actor, owner, "wall_2", "wall", "legacy001", 9)
    else:
        result = rpc(
            database, "island_upgrade", actor, owner, "wall_1", "legacy001", [9, 18, 36, 72, 144], 5
        )
    assert result == {"status": "refused", "reason": "captain_context_required"}
    assert balance(database, actor) == wallet and view(database, actor) == captain
    assert standing(database, owner)[1] == 1 and standing(database, owner, "wall_2") is None


def test_unadopted_actor_keeps_legacy_build_and_upgrade_behavior(database):
    actor, _, _, _ = ready(database, admitted=False)
    first = rpc(database, "island_build", actor, actor, "wall_1", "wall", "legacy001", 10)
    second = rpc(
        database, "island_upgrade", actor, actor, "wall_1", "legacy002", [10, 20, 40, 80, 160], 5
    )
    assert first["status"] == second["status"] == "done"
    assert balance(database, actor) == 70 and standing(database, actor)[1] == 2
    as_server(database)
    assert rpc(database, "personal_captain_context", actor) == {"status": "legacy"}


@pytest.mark.parametrize("transition", ["adoption", "respec"])
def test_legacy_build_rechecks_global_personal_mode_after_waiting_for_transition(
    isolated_transition, transition
):
    database, server = isolated_transition
    owner, actor, _, treasury, _ = initialized(database)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    code = "".join(alphabet[(actor.int >> (5 * index)) % len(alphabet)] for index in range(5))
    open_island(database, actor, code)
    as_owner(database)
    database.execute(
        "update public.islands set captain_level=4,won_wave_best=4,"
        "captain_role='engineer',captain_skills=array['steady_aim'] where player_id=%s",
        (actor,),
    )
    if transition == "respec":
        initialize_member(database, actor, owner, treasury)
    database.commit()
    as_server(database)
    if transition == "adoption":
        result = rpc(
            database, "personal_captain_initialize", actor, owner, keys(treasury)[1], Jsonb(RULES)
        )
        assert result["status"] == "ok"
    else:
        revision = view(database, actor)["captain"]["revision"]
        result = rpc(
            database, "personal_captain_change", actor, "respec001", "respec", None, revision
        )
        assert result["status"] == "done"
    started = Queue()

    def buy():
        with psycopg.connect(server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            as_server(connection)
            started.put(connection.info.backend_pid)
            return rpc(connection, "island_build", actor, actor, "wall_1", "wall", "waiting01", 9)

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(buy)
        worker = started.get(timeout=5)
        as_owner(database)
        deadline = monotonic() + 3
        blocked = False
        while monotonic() < deadline:
            blocked = database.execute(
                "select %s = any(pg_blocking_pids(%s))", (database.info.backend_pid, worker)
            ).fetchone()[0]
            if blocked:
                break
            sleep(0.01)
        assert blocked, "The legacy mutation must wait for the personal-state transition."
        database.commit()
        answer = future.result(timeout=5)
    assert answer == {"status": "refused", "reason": "captain_context_required"}
    assert balance(database, actor) == 100 and standing(database, actor) is None
    assert view(database, actor)["captain"]["engineerCommitment"] is None
