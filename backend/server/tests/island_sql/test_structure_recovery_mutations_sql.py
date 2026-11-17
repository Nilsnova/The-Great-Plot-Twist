"""Disposable PostgreSQL checks for the T55 island mutation recovery hooks.

Run from backend/ with CASE_PG_SCRATCH=1. The scratch fixture applies the full
migration chain twice; every case rolls back its data.
"""

import json
from datetime import timedelta
import threading
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    open_island,
)

OWNER = UUID(int=981)
EPOCH = UUID(int=982)
WAVE = UUID(int=983)
CONFIG = {
    "recoveryVersion": 1,
    "waveProtocol": 2,
    "fullHpUnits": 1_000_000,
    "baseRecoveryMilliseconds": 600_000,
    "structureMaxHp": {
        "wall": [60, 120, 200, 300, 420],
        "cannon": [80, 130, 200, 290, 400],
        "mortar": [70, 115, 180, 260, 360],
        "harpoon": [60, 100, 155, 230, 320],
        "culverin": [56, 91, 140, 203, 280],
        "swivel": [72, 117, 180, 261, 360],
    },
    "wallSkillMaxHpFactors": {"stone": [2, 1], "bastion": [3, 2]},
    "wallResearchMaxHpFactors": {"thick_walls": [23, 20]},
    "recoveryRateFactors": {
        "carpenterMultiplierPerWorker": 1,
        "carpenterMaximumWorkers": 2,
        "workshopPercentPerHouse": 30,
        "workshopPercentCap": 50,
        "workshopRadius": 10,
        "wallSpecRateFactors": {"quick_mend": [2, 1], "bastion": [3, 1]},
        "wallResearchRateFactors": {"mason_drill": [3, 2]},
    },
}
DEFAULT_POSITIONS = {
    "wall_1": {"x": -18.5, "z": -1},
    "wall_2": {"x": 19, "z": 1},
    "cannon_1": {"x": -12.5, "z": -14.5},
    "house_1": {"x": 7, "z": -6},
}


def template(structures=()):
    return {
        "configVersion": 1,
        "createWave": {"defenses": []},
        "priceSchedule": {"wall": [10, 20, 40, 80, 160]},
        "structureConfigBySpot": {
            spot: {"kind": kind, "level": 1, "maxHP": CONFIG["structureMaxHp"][kind][0],
                   "rateNumerator": 0, "rateDenominator": 1}
            for spot, kind in structures
        },
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": CONFIG,
        "defaultPositions": DEFAULT_POSITIONS,
        "eventByWave": {"1": None},
        "bossByWave": {"1": False},
    }


def seed_v1(database, structures=("wall_1",)):
    """Seed one v1 owner and a complete immutable refresh template."""
    add_players(database, OWNER)
    open_island(database, OWNER, "MUT55")
    as_server(database)
    kinds = {"wall_1": "wall", "wall_2": "wall", "cannon_1": "cannon"}
    for spot in structures:
        kind = kinds[spot]
        call(database, "select public.islet_build(%s,%s,%s,%s,0,0,%s)",
             OWNER, spot, kind, 10, f"seed-{spot}")
    database.execute(
        "update public.island_recovery_state set reset_epoch=%s,recovery_version=1,"
        "wave_protocol=2,revision=0 where island_owner=%s", (EPOCH, OWNER)
    )
    snapshot = template(tuple((spot, kinds[spot]) for spot in structures))
    snapshot["structures"] = [
        {
            "spot": spot,
            "instanceId": str(call(
                database,
                "select recovery_instance_id from public.islet_buildings where player_id=%s and plot=%s",
                OWNER, spot,
            )),
            "kind": kinds[spot],
            "level": 1,
            "hpUnits": 500_000,
            "maxHP": CONFIG["structureMaxHp"][kinds[spot]][0],
            "repairSeq": 0,
        }
        for spot in structures
    ]
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot) "
        "values (%s,%s,%s,1,2,%s::jsonb)",
        (WAVE, OWNER, EPOCH, json.dumps(snapshot)),
    )
    for spot in structures:
        kind = kinds[spot]
        max_hp = CONFIG["structureMaxHp"][kind][0]
        instance_id = call(
            database,
            "select recovery_instance_id from public.islet_buildings where player_id=%s and plot=%s",
            OWNER, spot,
        )
        database.execute(
            "insert into public.island_structure_health "
            "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
            "settled_at,rate_numerator,rate_denominator,repair_seq) "
            "values (%s,%s,%s,%s,1,500000,%s,1,clock_timestamp(),0,1,0)",
            (OWNER, spot, instance_id, kind, max_hp),
        )
    as_owner(database)


def test_legacy_build_advances_v0_revision_and_v1_new_instance_starts_full(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "MUT56")
    as_server(database)
    before = call(database,
                  "select revision from public.island_recovery_state where island_owner=%s", OWNER)
    legacy = call(database,
        "select public.island_build(%s,%s,'wall_1','wall','legacy-build-01',10)", OWNER, OWNER)
    assert legacy["status"] == "done" and legacy["repeat"] is False
    after = call(database,
                 "select revision from public.island_recovery_state where island_owner=%s", OWNER)
    assert after == before + 1

    # Fresh owner: v1 build uses the immutable manifest and initializes the new instance at 100%.
    OWNER2 = UUID(int=984)
    add_players(database, OWNER2)
    open_island(database, OWNER2, "MUT57")
    database.execute(
        "update public.island_recovery_state set reset_epoch=%s,recovery_version=1,"
        "wave_protocol=2 where island_owner=%s", (EPOCH, OWNER2)
    )
    snapshot = template()
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot) "
        "values (%s,%s,%s,1,2,%s::jsonb)",
        (UUID(int=985), OWNER2, EPOCH, json.dumps(snapshot)),
    )
    built = call(database,
        "select public.island_build(%s,%s,'wall_1','wall','v1-build-0001',10)", OWNER2, OWNER2)
    assert built["status"] == "done"
    assert call(database,
        "select hp_units from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER2) == 1_000_000


def test_upgrade_refuses_damaged_v1_wall_without_charge_and_specialise_preserves_fraction(database):
    seed_v1(database)
    starting_balance = balance(database, OWNER)
    as_server(database)
    refused = call(database,
        "select public.island_upgrade(%s,%s,'wall_1','upgrade-0001',array[10,20,40,80,160],2)",
        OWNER, OWNER)
    assert refused == {"status": "refused", "reason": "needs_repair"}
    assert balance(database, OWNER) == starting_balance
    assert call(database,
        "select level from public.islet_buildings where player_id=%s and plot='wall_1'", OWNER) == 1

    database.execute(
        "update public.island_structure_health set hp_units=1000000 where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s,reserved_at=clock_timestamp(),"
        "starts_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour' "
        "where island_owner=%s", (WAVE, OWNER)
    )
    phase_refused = call(database,
        "select public.island_upgrade(%s,%s,'wall_1','upgrade-0002',array[10,20,40,80,160],2)",
        OWNER, OWNER)
    assert phase_refused == {"status": "refused", "reason": "wave_running"}
    assert balance(database, OWNER) == starting_balance
    database.execute(
        "update public.island_recovery_state set current_wave_id=null,reserved_at=null,"
        "starts_at=null,expires_at=null where island_owner=%s", (OWNER,)
    )
    database.execute(
        "update public.island_structure_health set hp_units=500000,rate_numerator=0,"
        "settled_at=clock_timestamp() where island_owner=%s and spot='wall_1'", (OWNER,)
    )

    # Research prerequisite is present; a wall specialization increases max HP but not actual HP.
    database.execute(
        "insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref) "
        "values (%s,'wall',%s,10,'research:seed-0001')", (OWNER, OWNER)
    )
    changed = call(database,
        "select public.island_specialise(%s,%s,'wall_1','wall','stone','specialise-01',1)",
        OWNER, OWNER)
    assert changed["status"] == "done"
    assert call(database,
        "select hp_units from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER) == 500_000
    assert call(database,
        "select max_hp from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER) == 120


def test_carpenter_rate_change_does_not_apply_new_rate_to_elapsed_old_time(database):
    seed_v1(database)
    as_server(database)
    database.execute(
        "update public.island_structure_health set settled_at=clock_timestamp()-interval '10 minutes',"
        "hp_units=500000,rate_numerator=0,rate_denominator=1 "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    )
    hired = call(database,
        "select public.island_hire(%s,'carpenter','hire-0001',10,10)", OWNER)
    assert hired["status"] == "done"
    health = database.execute(
        "select hp_units,rate_numerator,rate_denominator from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    ).fetchone()
    assert health == (500_000, 200, 100)


def test_wall_research_rate_change_settles_old_rate_before_refresh(database):
    seed_v1(database)
    as_server(database)
    database.execute(
        "update public.island_structure_health set settled_at=clock_timestamp()-interval '10 minutes',"
        "hp_units=500000,rate_numerator=0,rate_denominator=1 "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    )
    database.execute(
        "insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref,tier) "
        "values (%s,'wall',%s,10,'research:seed-0001',1)", (OWNER, OWNER)
    )
    changed = call(database,
        "select public.island_research(%s,%s,'wall','research-0001',10,0,2,'mason_drill',false)",
        OWNER, OWNER)
    assert changed["status"] == "done"
    health = database.execute(
        "select hp_units,rate_numerator,rate_denominator from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    ).fetchone()
    assert health == (500_000, 300, 200)


def test_moved_workshop_at_radius_boundary_updates_future_rate(database):
    seed_v1(database)
    as_server(database)
    call(database, "select public.islet_build(%s,'house_1','house',10,0,0,'seed-house-01')", OWNER)
    database.execute(
        "update public.islet_buildings set level=2,spec='workshop' "
        "where player_id=%s and plot='house_1'", (OWNER,)
    )
    moved = call(database,
        "select public.island_move(%s,%s,'house_1',-17,-2,'[]'::jsonb)", OWNER, OWNER)
    assert moved == {"status": "done"}
    position = call(database,
        "select jsonb_build_object('x',x_half,'z',z_half) from public.island_layout "
        "where island_owner=%s and plot='house_1'", OWNER)
    assert position == {"x": -17, "z": -2}
    health = database.execute(
        "select rate_numerator,rate_denominator from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    ).fetchone()
    assert health == (130, 100)


def test_v1_in_wave_hire_keeps_snapshot_paused_hp_and_resumes_after_expiry(database):
    seed_v1(database)
    as_server(database)
    start_template = template((("wall_1", "wall"),))
    start_template["expectedRevision"] = call(
        database,
        "select revision from public.island_recovery_state where island_owner=%s",
        OWNER,
    )
    start_template["createWave"]["defenses"] = [
        {"id": "wall_1", "kind": "wall", "level": 1, "x": -18.5, "z": -1}
    ]
    started = call(
        database,
        "select public.recovery_wave_start(%s,'wave-start-01','island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER, OWNER, ["structure_recovery"], json.dumps(start_template),
    )
    assert started["status"] == "started"
    snapshot = started["initialSnapshot"]

    hired = call(database,
        "select public.island_hire(%s,'carpenter','hire-wave-01',10,10)", OWNER)
    assert hired["status"] == "done"
    health = database.execute(
        "select hp_units,rate_numerator,rate_denominator from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'", (OWNER,)
    ).fetchone()
    assert health == (500_000, 200, 100)
    assert call(database,
        "select initial_snapshot from public.recovery_wave_states where wave_id=%s",
        started["waveId"]) == snapshot
    during_wave = call(database,
        "select public.structure_recovery_settle_locked(%s,clock_timestamp())", OWNER)
    assert during_wave["status"] == "reserved"
    assert call(database,
        "select hp_units from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER) == 500_000

    # Use the exact post-mutation DB anchor as the synthetic canonical expiry
    # boundary; no arbitrary timing tolerance is introduced.
    expired_at = call(database,
        "select settled_at from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER)
    starts_at = expired_at - timedelta(seconds=900)
    database.execute("update public.wave_runs set starts_at=%s where id=%s",
                     (starts_at, started["waveId"]))
    database.execute(
        "update public.island_recovery_state set reserved_at=%s,starts_at=%s,expires_at=%s "
        "where island_owner=%s", (starts_at, starts_at, expired_at, OWNER)
    )
    finished = call(database,
        "select public.recovery_wave_finish(%s,%s,true,0,0,0,0,0,0,1,0,%s,"
        "null,null,null,null,null,null)", OWNER, started["waveId"], EPOCH)
    assert finished["status"] == "done" and finished["expired"] is True
    after_expiry = database.execute(
        "select hp_units,settled_at,rate_numerator,rate_denominator "
        "from public.island_structure_health where island_owner=%s and spot='wall_1'", (OWNER,)
    ).fetchone()
    expected_at_finish = call(
        database,
        "select public.structure_recovery_project_hp(500000,"
        "floor(extract(epoch from (%s::timestamptz-%s::timestamptz))*1000)::bigint,200,100)",
        after_expiry[1], expired_at,
    )
    assert after_expiry[0] == expected_at_finish
    assert after_expiry[2:] == (200, 100)

    millis_to_full = call(database,
        "select ceil((1000000-%s)::numeric*600000*%s/(1000000::numeric*%s))::bigint",
        after_expiry[0], after_expiry[3], after_expiry[2])
    exact_full_at = after_expiry[1] + timedelta(milliseconds=millis_to_full)
    call(database,
        "select public.structure_recovery_settle_locked(%s,%s)", OWNER, exact_full_at)
    assert call(database,
        "select hp_units from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER) == 1_000_000


def test_v1_cannot_purchase_a_retired_recovery_skill(database):
    seed_v1(database)
    as_server(database)
    tree = [{"skill": "quick_fix", "cost": 1, "needs": [], "role": None}]
    refused = call(database,
        "select public.island_learn_skill(%s,'quick_fix','skill-0001',%s::jsonb,1)",
        OWNER, json.dumps(tree))
    assert refused == {"status": "refused", "reason": "retired_skill"}
    assert call(database,
        "select count(*) from public.captain_skill_learns where player_id=%s and skill='quick_fix'",
        OWNER) == 0


def test_demolition_removes_only_current_health_and_keeps_wave_history(database):
    seed_v1(database)
    as_server(database)
    database.execute(
        "insert into public.recovery_wave_events(wave_id,seq,event_kind,effective_tick,payload) "
        "values (%s,1,'before_demolish',0,'{}'::jsonb)", (WAVE,)
    )
    prices = {
        "wall": [10, 20, 40, 80, 160],
        "cannon": [30, 60, 120, 240, 480],
        "mortar": [60, 120, 240, 480, 960],
        "harpoon": [40, 80, 160, 320, 640],
        "swivel": [50, 100, 200, 400, 800],
        "culverin": [80, 160, 320, 640, 1280],
    }
    result = call(database,
        "select public.island_demolish(%s,%s,'wall_1','demolish-001',%s::jsonb)",
        OWNER, OWNER, json.dumps(prices))
    assert result["status"] == "done"
    assert call(database,
        "select count(*) from public.island_structure_health where island_owner=%s and spot='wall_1'",
        OWNER) == 0
    assert call(database,
        "select count(*) from public.recovery_wave_states where wave_id=%s", WAVE) == 1
    assert call(database,
        "select count(*) from public.recovery_wave_events where wave_id=%s and event_kind='before_demolish'",
        WAVE) == 1


def test_failed_v1_refresh_rolls_back_build_wallet_revision_and_history(database):
    seed_v1(database)
    as_server(database)
    before_balance = balance(database, OWNER)
    before_revision = call(database,
        "select revision from public.island_recovery_state where island_owner=%s", OWNER)
    database.execute("savepoint invalid_manifest_probe")
    as_owner(database)
    database.execute("delete from public.recovery_wave_states where wave_id=%s", (WAVE,))
    as_server(database)
    with pytest.raises(psycopg.errors.RaiseException, match="recovery_config_missing"):
        call(database,
            "select public.island_build(%s,%s,'wall_2','wall','rollback-0001',10)",
            OWNER, OWNER)
    database.execute("rollback to savepoint invalid_manifest_probe")
    as_owner(database)
    assert balance(database, OWNER) == before_balance
    assert call(database,
        "select count(*) from public.islet_buildings where player_id=%s and plot='wall_2'",
        OWNER) == 0
    assert call(database,
        "select revision from public.island_recovery_state where island_owner=%s", OWNER) == before_revision
    assert call(database,
        "select count(*) from public.recovery_wave_states where wave_id=%s", WAVE) == 1


def test_reset_advances_epoch_clears_current_health_and_keeps_wave_history(database):
    seed_v1(database)
    as_server(database)
    now = call(database, "select clock_timestamp()")
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s,reserved_at=%s,"
        "starts_at=%s,expires_at=%s where island_owner=%s",
        (WAVE, now, now, now + timedelta(hours=1), OWNER),
    )
    database.execute(
        "insert into public.recovery_wave_events(wave_id,seq,event_kind,effective_tick,payload) "
        "values (%s,1,'test_event',0,'{}'::jsonb)", (WAVE,)
    )
    instance_id = call(database,
        "select recovery_instance_id from public.islet_buildings where player_id=%s and plot='wall_1'",
        OWNER)
    database.execute(
        "insert into public.structure_repair_receipts "
        "(payer_id,action_uid,island_owner,reset_epoch,instance_id,spot,building_kind,level,wave_id,"
        "use_ordinal,charged_price,event_seq,receipt_json,request_fingerprint) "
        "values (%s,'receipt-0001',%s,%s,%s,'wall_1','wall',1,%s,1,10,1,'{}'::jsonb,%s)",
        (OWNER, OWNER, EPOCH, instance_id, WAVE, "a" * 64),
    )
    old_epoch = call(database,
        "select reset_epoch from public.island_recovery_state where island_owner=%s", OWNER)
    active_reset = call(database,
        "select public.island_fresh_start(%s,'reset-active-01','MUT55',100)", OWNER)
    assert active_reset == {"status": "refused", "reason": "wave_running"}
    assert call(database,
        "select reset_epoch from public.island_recovery_state where island_owner=%s", OWNER) == old_epoch
    expired_at = now - timedelta(seconds=901)
    expires_at = expired_at + timedelta(seconds=900)
    database.execute(
        "update public.island_recovery_state set reserved_at=%s,starts_at=%s,expires_at=%s "
        "where island_owner=%s", (expired_at, expired_at, expires_at, OWNER)
    )
    result = call(database,
        "select public.island_fresh_start(%s,'reset-0001','MUT55',100)", OWNER)
    assert result["status"] == "done"
    state = database.execute(
        "select recovery_version,wave_protocol,reset_epoch,current_wave_id,reserved_at,starts_at,"
        "expires_at from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()
    assert state[0:2] == (1, 2)
    assert state[2] != old_epoch
    assert state[3:] == (None, None, None, None)
    assert call(database,
        "select count(*) from public.island_structure_health where island_owner=%s", OWNER) == 0
    assert call(database, "select count(*) from public.recovery_wave_states where wave_id=%s", WAVE) == 1
    assert call(database,
        "select count(*) from public.recovery_wave_events where wave_id=%s and seq=1", WAVE) == 1
    assert call(database,
        "select count(*) from public.structure_repair_receipts where payer_id=%s and action_uid='receipt-0001'",
        OWNER) == 1


def test_reset_and_damaged_upgrade_serialize_without_deadlock(scratch_server, database):
    seed_v1(database)
    database.commit()
    barrier = threading.Barrier(2)
    answers = {}
    failures = []

    def run(name, sql, args):
        try:
            with psycopg.connect(scratch_server.get_uri()) as connection:
                as_server(connection)
                connection.execute("set local lock_timeout = '10s'")
                barrier.wait(timeout=5)
                answers[name] = call(connection, sql, *args)
                connection.commit()
        except Exception as error:  # pragma: no cover - asserted empty below
            failures.append(error)

    workers = [
        threading.Thread(
            target=run,
            args=("reset", "select public.island_fresh_start(%s,'reset-race-01','MUT55',100)",
                  (OWNER,)),
        ),
        threading.Thread(
            target=run,
            args=("upgrade", "select public.island_upgrade(%s,%s,'wall_1','upgrade-race-01',"
                  "array[10,20,40,80,160],2)", (OWNER, OWNER)),
        ),
    ]
    try:
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=10)
        assert all(not worker.is_alive() for worker in workers)
        assert failures == []
        assert answers["reset"]["status"] == "done"
        assert answers["upgrade"] == {"status": "refused", "reason": "needs_repair"} or answers[
            "upgrade"
        ] == {"status": "refused", "reason": "not_built"}
        as_server(database)
        assert call(database,
            "select recovery_version from public.island_recovery_state where island_owner=%s", OWNER) == 1
        assert call(database,
            "select count(*) from public.island_structure_health where island_owner=%s", OWNER) == 0
    finally:
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as cleanup:
            cleanup.execute("delete from auth.users where id=%s", (OWNER,))


def test_mutation_hooks_and_internal_helpers_remain_service_only(database):
    as_owner(database)
    for signature in (
        "island_build(uuid,uuid,text,text,text,integer)",
        "island_upgrade(uuid,uuid,text,text,integer[],integer)",
        "island_hire(uuid,text,text,integer,integer)",
        "island_research(uuid,uuid,text,text,integer,integer,integer,text,boolean)",
        "island_specialise(uuid,uuid,text,text,text,text,integer)",
        "island_tower_tree(uuid,uuid,text,text,text,integer,text,integer,integer,integer)",
        "island_move(uuid,uuid,text,integer,integer,jsonb)",
        "island_demolish(uuid,uuid,text,text,jsonb)",
        "island_fresh_start(uuid,text,text,integer)",
        "island_learn_skill(uuid,text,text,jsonb,integer)",
        "structure_recovery_mutation_begin(uuid)",
        "structure_recovery_mutation_finish(uuid,jsonb)",
    ):
        browser, service = database.execute(
            "select has_function_privilege('authenticated',%s,'execute'),"
            "has_function_privilege('service_role',%s,'execute')",
            (f"public.{signature}", f"public.{signature}"),
        ).fetchone()
        assert browser is False, signature
        assert service is True, signature
