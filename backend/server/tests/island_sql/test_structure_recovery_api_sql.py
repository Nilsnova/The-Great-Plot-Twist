"""Real PostgreSQL checks for the protocol-2 journal transport."""

import json
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
    start,
)


def test_participant_mutability_is_column_scoped(database):
    assert database.execute(
        "select has_table_privilege('service_role',"
        "'public.recovery_wave_participants','UPDATE'), "
        "has_column_privilege('service_role','public.recovery_wave_participants',"
        "'last_actor_counter','UPDATE'), "
        "has_column_privilege('service_role','public.recovery_wave_participants',"
        "'page_head_seq','UPDATE'), "
        "has_column_privilege('service_role','public.recovery_wave_participants',"
        "'participant_token','UPDATE')"
    ).fetchone() == (False, True, True, False)


def seed_recovery_wave(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    started = start(database, OWNER, "waveapi01", owner=OWNER)
    wave_id = UUID(started["waveId"])
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '10 seconds' where id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.island_recovery_state set recovery_version=1,wave_protocol=2,"
        "current_wave_id=%s,reserved_at=now()-interval '10 seconds',"
        "starts_at=now()-interval '10 seconds',expires_at=now()+interval '890 seconds',"
        "revision=revision+1 where island_owner=%s",
        (wave_id, OWNER),
    )
    reset_epoch = database.execute(
        "select reset_epoch from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id,island_owner,reset_epoch,recovery_version,"
        "wave_protocol,initial_snapshot) values (%s,%s,%s,1,2,%s::jsonb)",
        (
            wave_id,
            OWNER,
            reset_epoch,
            json.dumps({"createWave": {}, "structures": [], "participants": []}),
        ),
    )
    token = uuid4()
    database.execute(
        "insert into public.recovery_wave_participants (wave_id,player_id,participant_token) "
        "values (%s,%s,%s)",
        (wave_id, OWNER, token),
    )
    as_server(database)
    return wave_id, token


def test_v2_input_append_is_idempotent_and_event_page_fixes_watermark(database):
    wave_id, token = seed_recovery_wave(database)
    args = (OWNER, wave_id)
    first = call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        *args,
        json.dumps(
            [
                {
                    "inputUid": "captain001",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ]
        ),
    )
    assert first["status"] == "accepted"
    event = first["accepted"][0]
    assert event["type"] == "captain_input"
    assert event["participantToken"] == str(token)
    assert event["payload"]["participantToken"] == str(token)
    assert event["payload"]["captain"] == {"level": 1, "skills": [], "weapon": "musket"}
    assert event["payload"]["command"] == {"type": "captain_move", "x": 1, "z": 2}

    repeat = call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        *args,
        json.dumps(
            [
                {
                    "inputUid": "captain001",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ]
        ),
    )
    assert repeat["accepted"] == [event]
    assert repeat["headSeq"] == 1
    assert repeat["repeat"] is True

    first_page = call(
        database, "select public.recovery_wave_events_page(%s,%s,0,null)", OWNER, wave_id
    )
    assert first_page["status"] == "ok"
    assert first_page["headSeq"] == 1
    assert first_page["sealedThroughTick"] >= 0
    assert first_page["events"] == [event]
    page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s)",
        OWNER,
        wave_id,
        1,
    )
    assert page["through"] == 1
    assert page["headSeq"] == 1
    assert page["sealedThroughTick"] == first_page["sealedThroughTick"]
    assert page["events"] == [event]


def test_v2_input_uid_reuse_with_different_command_is_refused(database):
    wave_id, _ = seed_recovery_wave(database)
    first = call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        OWNER,
        wave_id,
        json.dumps(
            [
                {
                    "inputUid": "captain002",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ]
        ),
    )
    assert first["status"] == "accepted"
    conflict = call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        OWNER,
        wave_id,
        json.dumps(
            [
                {
                    "inputUid": "captain002",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 3, "z": 4},
                }
            ]
        ),
    )
    assert conflict == {"status": "refused", "reason": "input_conflict"}
    assert (
        call(
            database,
            "select journal_head from public.recovery_wave_states where wave_id=%s",
            wave_id,
        )
        == 1
    )


def test_v2_page_requires_reading_previous_fixed_head_before_next_watermark(database):
    wave_id, _ = seed_recovery_wave(database)
    call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        OWNER,
        wave_id,
        json.dumps(
            [
                {
                    "inputUid": "captain003",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ]
        ),
    )
    first_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null)",
        OWNER,
        wave_id,
    )
    assert first_page["through"] is None
    refused = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null)",
        OWNER,
        wave_id,
    )
    assert refused == {"status": "refused", "reason": "page_incomplete"}
    page = call(database, "select public.recovery_wave_events_page(%s,%s,0,1)", OWNER, wave_id)
    assert page["through"] == 1
    next_page = call(
        database, "select public.recovery_wave_events_page(%s,%s,1,null)", OWNER, wave_id
    )
    assert next_page["status"] == "ok"
    assert next_page["headSeq"] == 1


def test_v2_health_checkpoint_accepts_complete_empty_snapshot_and_detects_divergence(database):
    wave_id, _ = seed_recovery_wave(database)
    first_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null)",
        OWNER,
        wave_id,
    )
    epoch = database.execute(
        "select reset_epoch from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    checkpoint_uid = "checkpoint01"
    args = (
        OWNER,
        wave_id,
        epoch,
        checkpoint_uid,
        max(0, first_page["sealedThroughTick"]),
        0,
        0,
        json.dumps({}),
        json.dumps({}),
    )
    sql = "select public.recovery_wave_report_health(%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)"
    accepted = call(database, sql, *args)
    assert accepted == {
        "status": "accepted",
        "accepted": True,
        "repeated": False,
        "throughTick": args[4],
        "inputHeadSeq": 0,
        "lastRepairSeq": 0,
        "hpUnits": {},
    }
    repeated = call(database, sql, *args)
    assert repeated == {**accepted, "repeated": True}
    diverged = call(
        database, sql, *args[:4], args[4], 0, 0, json.dumps({}), json.dumps({"unexpected": 1})
    )
    assert diverged == {"status": "refused", "reason": "checkpoint_divergence"}


def test_health_checkpoint_rejects_omitted_applicable_journal_event(database):
    wave_id, _ = seed_recovery_wave(database)
    call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        OWNER,
        wave_id,
        json.dumps(
            [
                {
                    "inputUid": "prefixcheck01",
                    "actorCounter": 1,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ]
        ),
    )
    # Let the server-sealed simulation frontier pass the accepted input's
    # effective tick, while the checkpoint below deliberately omits its seq.
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '30 seconds' where id=%s",
        (wave_id,),
    )
    as_server(database)
    page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null)",
        OWNER,
        wave_id,
    )
    assert page["headSeq"] == 1
    event = database.execute(
        "select effective_tick from public.recovery_wave_events where wave_id=%s and seq=1",
        (wave_id,),
    ).fetchone()[0]
    assert event <= page["sealedThroughTick"]
    epoch = database.execute(
        "select reset_epoch from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    result = call(
        database,
        "select public.recovery_wave_report_health("
        "%s,%s,%s,'prefixcheck02',%s,0,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        page["sealedThroughTick"],
        json.dumps({}),
        json.dumps({}),
    )
    assert result == {"status": "refused", "reason": "health_sync_required"}
    assert database.execute(
        "select count(*) from public.recovery_health_checkpoints where wave_id=%s", (wave_id,)
    ).fetchone() == (0,)


def test_recovery_start_freezes_v1_and_repeat_reads_same_token_and_snapshot(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    template = {
        "createWave": {"defenses": []},
        "priceSchedule": {},
        "structureConfigBySpot": {},
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": {
            "recoveryVersion": 1,
            "waveProtocol": 2,
            "structureMaxHp": {},
            "recoveryRateFactors": {"carpenterMaximumWorkers": 2},
        },
        "defaultPositions": {},
    }
    template["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    sql = (
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)"
    )
    args = (OWNER, "recovery01", OWNER, ["structure_recovery"], json.dumps(template))
    first = call(database, sql, *args)
    assert first["status"] == "started"
    assert first["recoveryVersion"] == 1
    assert first["waveProtocol"] == 2
    assert first["lastActorCounter"] == 0
    assert len(first["participantToken"]) == 36
    assert first["initialSnapshot"]["participants"] == [
        {
            "participantToken": first["participantToken"],
            "captain": {"level": 1, "skills": [], "weapon": "musket"},
        }
    ]
    repeat = call(database, sql, *args)
    assert repeat["repeat"] is True
    assert repeat["participantToken"] == first["participantToken"]
    assert repeat["initialSnapshot"] == first["initialSnapshot"]
    assert database.execute(
        "select count(*) from public.recovery_wave_states where wave_id=%s",
        (first["waveId"],),
    ).fetchone() == (1,)

    current = call(
        database,
        "select public.recovery_wave_current(%s,'island',%s,2::smallint)",
        OWNER,
        OWNER,
    )
    assert current["status"] == "running"
    assert current["participantToken"] == first["participantToken"]
    assert call(
        database,
        "select public.recovery_wave_current(%s,'island',%s,1::smallint)",
        OWNER,
        OWNER,
    ) == {"status": "refused", "reason": "client_update_required"}

    add_players(database, FRIEND)
    open_island(database, FRIEND, "M8P3N")
    as_owner(database)
    database.execute(
        "insert into public.island_members (island_owner,player_id,role) values (%s,%s,'member')",
        (OWNER, FRIEND),
    )
    as_server(database)
    joined = call(
        database,
        "select public.recovery_wave_join(%s,%s,2::smallint)",
        FRIEND,
        first["waveId"],
    )
    assert joined["recoveryVersion"] == 1
    assert joined["waveProtocol"] == 2
    assert joined["lastActorCounter"] == 0
    assert joined["participantToken"] != first["participantToken"]
    repeat_join = call(
        database,
        "select public.recovery_wave_join(%s,%s,2::smallint)",
        FRIEND,
        first["waveId"],
    )
    assert repeat_join["participantToken"] == joined["participantToken"]
    assert database.execute(
        "select journal_head from public.recovery_wave_states where wave_id=%s",
        (first["waveId"],),
    ).fetchone() == (1,)
    page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null)",
        OWNER,
        first["waveId"],
    )
    assert page["events"][0]["type"] == "participant_joined"
    assert page["events"][0]["participantToken"] == str(joined["participantToken"])
    assert page["events"][0]["payload"]["captain"] == {"level": 1, "skills": [], "weapon": "musket"}
    assert "player_id" not in page["events"][0]["payload"]
    assert call(
        database,
        "select public.recovery_wave_join(%s,%s,1::smallint)",
        FRIEND,
        first["waveId"],
    ) == {"status": "refused", "reason": "client_update_required"}
    assert database.execute(
        "select count(*) from public.recovery_wave_states where wave_id=%s",
        (first["waveId"],),
    ).fetchone() == (1,)


def test_recovery_start_rejects_stale_template_without_side_effects(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    revision = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    template = {
        "expectedRevision": revision + 1,
        "createWave": {"defenses": []},
        "priceSchedule": {},
        "structureConfigBySpot": {},
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": {
            "recoveryVersion": 1,
            "waveProtocol": 2,
            "structureMaxHp": {},
            "recoveryRateFactors": {"carpenterMaximumWorkers": 2},
        },
        "defaultPositions": {},
    }
    sql = (
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)"
    )
    args = (OWNER, "stalecfg01", OWNER, ["structure_recovery"], json.dumps(template))
    refused = call(database, sql, *args)
    assert refused == {"status": "refused", "reason": "island_changed"}
    assert database.execute(
        "select count(*) from public.wave_runs where started_by=%s and action_uid='stalecfg01'",
        (OWNER,),
    ).fetchone() == (0,)
    assert database.execute(
        "select count(*) from public.island_structure_health where island_owner=%s", (OWNER,)
    ).fetchone() == (0,)
    assert database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone() == (revision,)
    template["expectedRevision"] = revision
    retried = call(
        database, sql, OWNER, "stalecfg02", OWNER, ["structure_recovery"], json.dumps(template)
    )
    assert retried["status"] == "started"
    assert retried["recoveryVersion"] == 1


def test_recovery_start_snapshots_db_wall_identity_and_legacy_effective_hp(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    call(
        database,
        "select public.island_build(%s,%s,'wall_1','wall','wallbuild01',10)",
        OWNER,
        OWNER,
    )
    as_owner(database)
    database.execute(
        "update public.islet_buildings set wall_health=40,"
        "wall_damaged_at=now()-interval '5 minutes' where player_id=%s and plot='wall_1'",
        (OWNER,),
    )
    as_server(database)
    manifest = {
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "fullHpUnits": 1000000,
        "baseRecoveryMilliseconds": 600000,
        "structureMaxHp": {"wall": [60, 120, 200, 300, 420]},
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
    template = {
        "createWave": {"defenses": [{"id": "wall_1", "kind": "wall", "level": 1, "x": 0, "z": 0}]},
        "priceSchedule": {"wall": [10, 20, 40, 80, 160]},
        "structureConfigBySpot": {
            "wall_1": {
                "kind": "wall",
                "level": 1,
                "maxHP": 60,
                "rateNumerator": 100,
                "rateDenominator": 100,
                "wallSpec": None,
                "wallResearch": None,
                "nearbyWorkshops": 0,
            }
        },
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": manifest,
        "defaultPositions": {"wall_1": {"x": 0, "z": 0}},
        "eventByWave": {"1": None},
        "bossByWave": {"1": False},
    }
    template["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    started = call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        "wallwave01",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    assert started["recoveryVersion"] == 1
    structure = started["initialSnapshot"]["structures"][0]
    assert structure["spot"] == "wall_1"
    assert structure["hpUnits"] == 400000
    assert structure["maxHP"] == 60
    defense = started["initialSnapshot"]["createWave"]["defenses"][0]
    assert defense["instanceId"] == structure["instanceId"]
    assert defense["hpUnits"] == 400000
    assert defense["maxHP"] == 60
    current_health = database.execute(
        "select hp_units,repair_seq from public.island_structure_health "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    ).fetchone()
    assert current_health == (400000, 0)


def test_recovery_finish_preserves_first_close_receipt_and_pays_each_actor_once(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    as_server(database)
    template = {
        "createWave": {"defenses": []},
        "priceSchedule": {},
        "structureConfigBySpot": {},
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": {
            "recoveryVersion": 1,
            "waveProtocol": 2,
            "structureMaxHp": {},
            "recoveryRateFactors": {"carpenterMaximumWorkers": 2},
        },
        "defaultPositions": {},
    }
    template["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    start_sql = (
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)"
    )
    started = call(
        database,
        start_sql,
        OWNER,
        "finishwave1",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    wave_id = started["waveId"]
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '20 seconds' where id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.island_recovery_state set starts_at=now()-interval '20 seconds',"
        "reserved_at=now()-interval '20 seconds',expires_at=now()+interval '880 seconds' "
        "where island_owner=%s",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values (%s,%s,'member')",
        (OWNER, FRIEND),
    )
    as_server(database)
    joined = call(database, "select public.recovery_wave_join(%s,%s,2::smallint)", FRIEND, wave_id)
    assert joined["status"] == "joined"
    page = call(database, "select public.recovery_wave_events_page(%s,%s,0,null)", OWNER, wave_id)
    epoch = database.execute(
        "select reset_epoch from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    finish_sql = (
        "select public.recovery_wave_finish(%s,%s,true,7,10,5,5,20,5,2,2,%s,%s,"
        "%s,%s,0,%s::jsonb,%s::jsonb)"
    )
    first_args = (
        OWNER,
        wave_id,
        epoch,
        "ownercheck01",
        page["sealedThroughTick"],
        page["headSeq"],
        json.dumps({}),
        json.dumps({}),
    )
    first = call(database, finish_sql, *first_args)
    assert first["status"] == "done"
    assert first["loot"] == 15
    canonical = first["recovery"]
    assert canonical["checkpointUid"] == "ownercheck01"
    assert canonical["closedHp"] == {}
    assert canonical["islandEpoch"] == str(epoch)
    assert canonical["throughTick"] == page["sealedThroughTick"]

    same_actor_repeat = call(database, finish_sql, *first_args)
    assert same_actor_repeat["repeat"] is True
    assert same_actor_repeat["loot"] == first["loot"]
    assert same_actor_repeat["recovery"] == canonical

    second_args = (
        FRIEND,
        wave_id,
        epoch,
        "friendcheck01",
        page["sealedThroughTick"] + 3,
        0,
        json.dumps({}),
        json.dumps({}),
    )
    second = call(database, finish_sql, *second_args)
    assert second["status"] == "done"
    assert second["loot"] == 15
    assert second["recovery"] == canonical
    assert database.execute(
        "select count(*) from public.wallet_transactions where reason='pirate_loot' "
        "and ref like %s",
        (f"wave:{wave_id}:%",),
    ).fetchone() == (2,)
    assert database.execute(
        "select closed_at is not null,closed_hp,checkpoint_uid "
        "from public.recovery_wave_states where wave_id=%s",
        (wave_id,),
    ).fetchone() == (True, {}, "ownercheck01")

    # Saved v1 policy remains active after its admission flag is disabled, and
    # the next run uses the v1 reservation path despite the legacy wave_start fence.
    template["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    next_started = call(
        database,
        start_sql,
        OWNER,
        "finishwave2",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    assert next_started["status"] == "started"
    assert next_started["recoveryVersion"] == 1
    assert next_started["waveId"] != str(wave_id)
    assert next_started["wave"] == started["wave"] + 1
    assert database.execute(
        "select closed_at is not null from public.recovery_wave_states where wave_id=%s",
        (wave_id,),
    ).fetchone() == (True,)
