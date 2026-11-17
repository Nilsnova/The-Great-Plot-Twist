"""Real SQL checks for 20261117030000_paid_structure_repair.sql.

Opt-in on the disposable Unix-socket PostgreSQL fixture with every migration applied twice.
Run from backend/ with CASE_PG_SCRATCH=1. Transaction atomicity and quota tests use only this
local database; no credentials, network database, or live environment are involved.
"""

import json
import threading
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_game_rooms_sql import join  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    build,
    call,
    ledger,
    open_island,
)

OWNER = UUID(int=961)
MEMBER = UUID(int=962)
OTHER = UUID(int=963)
ISLAND_CODE = "RPQ25"
PRICES = {
    "wall": [10, 20, 40, 80, 160],
    "cannon": [30, 60, 120, 240, 480],
    "mortar": [60, 120, 240, 480, 960],
    "harpoon": [40, 80, 160, 320, 640],
    "swivel": [50, 100, 200, 400, 800],
    "culverin": [80, 160, 320, 640, 1280],
}
MAX_HP = {"wall": 60, "cannon": 80, "mortar": 70, "harpoon": 60, "swivel": 72, "culverin": 56}


def seed_recovery(
    database,
    structure_rows=(("wall_1", "wall"),),
    *,
    active=False,
    paid_used=0,
    wave_prices=None,
):
    """Create one island, its ordinary builds and their exact recovery-v1 rows."""
    add_players(database, OWNER, MEMBER, OTHER)
    open_island(database, OWNER, ISLAND_CODE)
    open_island(database, MEMBER, "RPQ26")
    open_island(database, OTHER, "RPQ27")
    for index, (spot, kind) in enumerate(structure_rows, start=1):
        build(database, OWNER, spot, kind, f"build-{index:05d}", coins=10)
    join(database, MEMBER, OWNER)

    epoch = UUID(int=964)
    as_server(database)
    database.execute(
        "update public.island_recovery_state set reset_epoch=%s, recovery_version=1, "
        "wave_protocol=2, revision=0 where island_owner=%s",
        (epoch, OWNER),
    )
    for spot, kind in structure_rows:
        instance = call(
            database,
            "select recovery_instance_id from public.islet_buildings "
            "where player_id=%s and plot=%s",
            OWNER,
            spot,
        )
        database.execute(
            "insert into public.island_structure_health "
            "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
            "settled_at,rate_numerator,rate_denominator,repair_seq) "
            "values (%s,%s,%s,%s,1,500000,%s,1,clock_timestamp(),1,1,0)",
            (OWNER, spot, instance, kind, MAX_HP[kind]),
        )
        database.execute(
            "update public.island_structure_health set rate_numerator=0 "
            "where island_owner=%s and spot=%s",
            (OWNER, spot),
        )

    wave_id = None
    if active:
        wave_id = UUID(int=965)
        reserve_at = call(database, "select clock_timestamp() - interval '10 seconds'")
        start_at = call(database, "select clock_timestamp() - interval '5 seconds'")
        expires_at = call(database, "select clock_timestamp() + interval '10 minutes'")
        snapshot = {
            "recoveryVersion": 1,
            "waveProtocol": 2,
            "waveId": str(wave_id),
            "islandOwner": str(OWNER),
            "resetEpoch": str(epoch),
            "configVersion": 1,
            "startsAt": start_at.isoformat(),
            "maximumSeconds": 600,
            "priceSchedule": wave_prices or PRICES,
            "structures": [
                {
                    "spot": spot,
                    "instanceId": str(
                        call(
                            database,
                            "select recovery_instance_id from public.islet_buildings "
                            "where player_id=%s and plot=%s",
                            OWNER,
                            spot,
                        )
                    ),
                    "kind": kind,
                    "level": 1,
                    "hpUnits": 500000,
                    "maxHP": MAX_HP[kind],
                    "repairSeq": 0,
                }
                for spot, kind in structure_rows
            ],
        }
        database.execute(
            "insert into public.recovery_wave_states "
            "(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot,"
            "paid_used,journal_head,sealed_through_tick,last_repair_seq) "
            "values (%s,%s,%s,1,2,%s::jsonb,%s,0,-1,0)",
            (wave_id, OWNER, epoch, json.dumps(snapshot), paid_used),
        )
        database.execute(
            "update public.island_recovery_state set current_wave_id=%s, "
            "reserved_at=%s, starts_at=%s, expires_at=%s where island_owner=%s",
            (wave_id, reserve_at, start_at, expires_at, OWNER),
        )
    return epoch, wave_id


def instance(database, spot="wall_1"):
    return call(
        database,
        "select recovery_instance_id from public.islet_buildings where player_id=%s and plot=%s",
        OWNER,
        spot,
    )


def hp(database, spot="wall_1"):
    return database.execute(
        "select hp_units,repair_seq from public.island_structure_health "
        "where island_owner=%s and spot=%s",
        (OWNER, spot),
    ).fetchone()


def repair(
    database,
    *,
    player=OWNER,
    spot="wall_1",
    action_uid="repair-0001",
    epoch=None,
    wave_id=None,
    window="between_waves",
    level=1,
    repair_seq=0,
    price=10,
    instance_id=None,
    fingerprint="a" * 64,
    prices=PRICES,
):
    """Call the same locked RPC the route uses, passing only server-selected prices/fingerprint."""
    as_server(database)
    return call(
        database,
        "select public.island_structure_repair(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",
        player,
        OWNER,
        spot,
        instance_id or instance(database, spot),
        action_uid,
        epoch or UUID(int=964),
        window,
        wave_id,
        level,
        repair_seq,
        price,
        fingerprint,
        json.dumps(prices),
    )


def test_between_wave_repair_restores_full_health_and_never_refunds_as_build_contribution(database):
    seed_recovery(database)
    before = balance(database, OWNER)

    done = repair(database)
    retry = repair(database)

    assert done["status"] == "done" and done["repeat"] is False
    assert done["receipt"]["chargedPrice"] == 10
    assert done["receipt"]["balanceAtCommit"] == before - 10
    assert done["receipt"]["waveId"] is None
    assert done["receipt"]["useOrdinal"] is None
    assert done["receipt"]["eventSeq"] is None
    assert retry["repeat"] is True
    assert retry["receipt"] == done["receipt"]
    assert retry["balance"] == before - 10
    assert hp(database) == (1_000_000, 1)
    assert ledger(database, OWNER, "building_purchase")[-1] == (
        -10,
        "structure_repair:repair-0001",
    )
    assert (
        call(
            database,
            "select count(*) from public.building_payments where payer=%s "
            "and ref='structure_repair:repair-0001'",
            OWNER,
        )
        == 0
    )


def test_intact_unaffordable_and_changed_uid_requests_have_no_paid_side_effects(database):
    seed_recovery(database)
    as_server(database)
    database.execute(
        "update public.island_structure_health set hp_units=1000000 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )

    intact = repair(database)
    assert intact["reason"] == "intact"
    assert balance(database, OWNER) == 90
    assert hp(database) == (1_000_000, 0)
    as_server(database)
    database.execute(
        "update public.island_structure_health set hp_units=500000 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    database.execute("update public.wallets set balance=0 where player_id=%s", (OWNER,))
    assert repair(database, action_uid="repair-0002")["reason"] == "insufficient_funds"
    assert balance(database, OWNER) == 0
    assert (
        call(
            database,
            "select count(*) from public.structure_repair_receipts where island_owner=%s",
            OWNER,
        )
        == 0
    )


@pytest.mark.parametrize("prices", [{}, {"wall": []}, {"wall": [None]}, {"wall": "10"}])
def test_missing_or_invalid_price_json_is_refused_without_wallet_or_health_changes(
    database, prices
):
    seed_recovery(database)

    refused = repair(database, prices=prices)

    assert refused["reason"] == "recovery_unavailable"
    assert balance(database, OWNER) == 90
    assert hp(database) == (500_000, 0)
    assert (
        call(
            database,
            "select count(*) from public.structure_repair_receipts where island_owner=%s",
            OWNER,
        )
        == 0
    )


def test_between_wave_healing_finishes_under_the_same_lock_before_intact_refusal(database):
    seed_recovery(database)
    as_server(database)
    database.execute(
        "update public.island_structure_health "
        "set settled_at=clock_timestamp()-interval '301 seconds', rate_numerator=1 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )

    refused = repair(database)

    assert refused["reason"] == "intact"
    assert balance(database, OWNER) == 90
    assert hp(database) == (1_000_000, 0)
    assert (
        call(
            database,
            "select count(*) from public.structure_repair_receipts where island_owner=%s",
            OWNER,
        )
        == 0
    )


def test_coop_member_without_wave_participant_token_can_pay_and_event_has_no_private_balance(
    database,
):
    epoch, wave_id = seed_recovery(database, active=True)
    before = balance(database, MEMBER)

    done = repair(
        database,
        player=MEMBER,
        action_uid="repair-0002",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
    )

    assert done["receipt"]["balanceAtCommit"] == before - 10
    assert done["receipt"]["useOrdinal"] == 1
    event = done["event"]
    assert event["type"] == "structure_repaired"
    assert event["participantToken"] is None
    assert "balanceAtCommit" not in event and "payer" not in event
    assert event["payload"] == {
        "spot": "wall_1",
        "instanceId": str(instance(database)),
        "hpUnits": 1_000_000,
        "maxHP": MAX_HP["wall"],
        "repairSeq": 1,
        "chargedPrice": 10,
    }
    assert (
        call(
            database,
            "select paid_used from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 1
    )


def test_old_success_uid_after_new_damage_returns_receipt_without_healing_or_charging(database):
    epoch, wave_id = seed_recovery(database, active=True)
    first = repair(
        database,
        action_uid="repair-0001",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
    )
    as_server(database)
    database.execute(
        "update public.island_structure_health set hp_units=400000 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    coins = balance(database, OWNER)

    old = repair(
        database,
        action_uid="repair-0001",
        epoch=epoch,
        wave_id=UUID(int=966),
        window="reserved_wave",
        repair_seq=1,
    )

    assert old["repeat"] is True and old["receipt"] == first["receipt"]
    assert old["balance"] == coins
    assert hp(database) == (400_000, 1)
    assert (
        call(
            database,
            "select paid_used from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 1
    )


def test_receipt_failure_rolls_back_wallet_health_quota_and_event(database):
    epoch, wave_id = seed_recovery(database, active=True)
    before = balance(database, OWNER)
    as_owner(database)
    database.execute(
        "create function public.test_repair_receipt_failure() returns trigger "
        "language plpgsql as $$ begin raise exception 'test_receipt_failure'; end $$"
    )
    database.execute(
        "create trigger test_repair_receipt_failure before insert "
        "on public.structure_repair_receipts for each row "
        "execute function public.test_repair_receipt_failure()"
    )
    database.execute("savepoint before_repair_failure")
    as_server(database)
    with pytest.raises(psycopg.Error, match="test_receipt_failure"):
        repair(
            database,
            action_uid="repair-0006",
            epoch=epoch,
            wave_id=wave_id,
            window="reserved_wave",
        )
    database.execute("rollback to savepoint before_repair_failure")
    as_owner(database)
    database.execute("drop trigger test_repair_receipt_failure on public.structure_repair_receipts")
    database.execute("drop function public.test_repair_receipt_failure()")

    assert balance(database, OWNER) == before
    assert hp(database) == (500_000, 0)
    assert (
        call(
            database,
            "select paid_used from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 0
    )
    assert (
        call(
            database,
            "select count(*) from public.recovery_wave_events where wave_id=%s",
            wave_id,
        )
        == 0
    )
    assert (
        call(
            database,
            "select count(*) from public.structure_repair_receipts where island_owner=%s",
            OWNER,
        )
        == 0
    )


def test_target_and_global_repair_sequences_do_not_alias_across_targets(database):
    epoch, wave_id = seed_recovery(
        database,
        (("wall_1", "wall"), ("wall_2", "wall")),
        active=True,
    )
    first_a = repair(
        database,
        action_uid="repair-0001",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
    )
    as_server(database)
    database.execute(
        "update public.island_structure_health set hp_units=500000 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    second_a = repair(
        database,
        action_uid="repair-0002",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
        repair_seq=1,
    )
    first_b = repair(
        database,
        spot="wall_2",
        action_uid="repair-0003",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
    )

    assert [
        first_a["receipt"]["repairSeq"],
        second_a["receipt"]["repairSeq"],
        first_b["receipt"]["repairSeq"],
    ] == [1, 2, 1]
    assert (
        call(
            database,
            "select last_repair_seq from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 3
    )
    assert call(
        database,
        "select array_agg(seq order by seq) from public.recovery_wave_events where wave_id=%s",
        wave_id,
    ) == [1, 2, 3]
    assert [hp(database, "wall_1"), hp(database, "wall_2")] == [
        (1_000_000, 2),
        (1_000_000, 1),
    ]


def test_legacy_policy_without_saved_recovery_has_no_repair_admission_or_charge(database):
    add_players(database, OWNER, MEMBER, OTHER)
    open_island(database, OWNER, ISLAND_CODE)
    build(database, OWNER, "wall_1", "wall", "legacy-0001", coins=10)
    building_instance = instance(database)

    refused = repair(database, instance_id=building_instance)

    assert refused["reason"] == "feature_off"
    assert balance(database, OWNER) == 90
    assert (
        call(
            database,
            "select count(*) from public.structure_repair_receipts where island_owner=%s",
            OWNER,
        )
        == 0
    )


def cleanup_committed(uri):
    """Remove only the test players after a committed cross-connection race."""
    with psycopg.connect(uri, autocommit=True) as cleanup:
        cleanup.execute("delete from auth.users where id = any(%s)", ([OWNER, MEMBER, OTHER],))


def test_two_members_racing_for_the_last_reserved_use_charge_exactly_one(scratch_server, database):
    epoch, wave_id = seed_recovery(
        database,
        (("wall_1", "wall"), ("wall_2", "wall")),
        active=True,
        paid_used=2,
    )
    join(database, OTHER, OWNER)
    database.commit()

    barrier = threading.Barrier(2)
    answers = []
    failures = []

    def attempt(player, spot, action_uid):
        try:
            with psycopg.connect(scratch_server.get_uri()) as connection:
                as_server(connection)
                barrier.wait(timeout=5)
                answer = repair(
                    connection,
                    player=player,
                    spot=spot,
                    action_uid=action_uid,
                    epoch=epoch,
                    wave_id=wave_id,
                    window="reserved_wave",
                )
                connection.commit()
                answers.append(answer)
        except Exception as error:
            failures.append(error)

    workers = [
        threading.Thread(target=attempt, args=(MEMBER, "wall_1", "repair-0004")),
        threading.Thread(target=attempt, args=(OTHER, "wall_2", "repair-0005")),
    ]
    try:
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=10)
        assert all(not worker.is_alive() for worker in workers)
        assert failures == []
        assert len(answers) == 2
        assert sum(answer["status"] == "done" for answer in answers) == 1
        refused = next(answer for answer in answers if answer["status"] == "refused")
        assert refused["reason"] == "repair_limit_reached"
        assert (
            call(
                database,
                "select paid_used from public.recovery_wave_states where wave_id=%s",
                wave_id,
            )
            == 3
        )
        assert sorted((balance(database, MEMBER), balance(database, OTHER))) == [90, 100]
        assert sorted((hp(database, "wall_1")[0], hp(database, "wall_2")[0])) == [
            500_000,
            1_000_000,
        ]
    finally:
        cleanup_committed(scratch_server.get_uri())


def test_reserved_price_uses_the_frozen_wave_schedule_not_a_new_catalogue_price(database):
    frozen_prices = {**PRICES, "wall": [17, 27, 47, 87, 167]}
    epoch, wave_id = seed_recovery(database, active=True, wave_prices=frozen_prices)

    accepted = repair(
        database,
        action_uid="repair-0003",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
        price=17,
    )
    stale = repair(
        database,
        action_uid="repair-0004",
        epoch=epoch,
        wave_id=wave_id,
        window="reserved_wave",
        repair_seq=1,
        price=10,
    )

    assert accepted["receipt"]["chargedPrice"] == 17
    assert stale["reason"] == "stale_recovery_quote"
    assert balance(database, OWNER) == 90 - 17
    assert (
        call(
            database,
            "select paid_used from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 1
    )
