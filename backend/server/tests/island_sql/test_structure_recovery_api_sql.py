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
        "'participant_token','UPDATE')"
    ).fetchone() == (False, True, False)
    assert database.execute(
        "select to_regprocedure('public.recovery_wave_events_page(uuid,uuid,bigint,bigint)'), "
        "to_regprocedure('public.recovery_wave_events_page(uuid,uuid,bigint,bigint,integer)')"
    ).fetchone() == (None, "recovery_wave_events_page(uuid,uuid,bigint,bigint,integer)")


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
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert first_page["status"] == "ok"
    assert first_page["headSeq"] == 1
    assert first_page["sealedThroughTick"] >= 0
    assert first_page["events"] == [event]
    page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
        OWNER,
        wave_id,
        first_page["headSeq"],
        first_page["sealedThroughTick"],
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


def test_v2_pages_are_stateless_across_reconnect_and_interleaved_readers(database):
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
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert first_page["through"] is None
    completed_frontier_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
        OWNER,
        wave_id,
        first_page["headSeq"],
        first_page["sealedThroughTick"],
    )
    assert completed_frontier_page["events"] == first_page["events"]
    # Retry after losing the first response and read it again after another reader
    # has independently advanced the wave's global head and seal.
    lost_response_retry = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert lost_response_retry["status"] == "ok"
    old_frontier_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
        OWNER,
        wave_id,
        first_page["headSeq"],
        first_page["sealedThroughTick"],
    )
    assert old_frontier_page["status"] == "ok"
    assert old_frontier_page["headSeq"] == first_page["headSeq"]
    assert old_frontier_page["sealedThroughTick"] == first_page["sealedThroughTick"]
    assert old_frontier_page["events"] == first_page["events"]

    second_input = call(
        database,
        "select public.recovery_wave_inputs(%s,%s,%s::jsonb)",
        OWNER,
        wave_id,
        json.dumps(
            [
                {
                    "inputUid": "captain004",
                    "actorCounter": 2,
                    "tick": 0,
                    "command": {"type": "captain_move", "x": 3, "z": 4},
                }
            ]
        ),
    )
    assert second_input["status"] == "accepted"
    second_reader_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert second_reader_page["headSeq"] == 2
    assert second_reader_page["headSeq"] > first_page["headSeq"]
    replay_old_frontier = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
        OWNER,
        wave_id,
        first_page["headSeq"],
        first_page["sealedThroughTick"],
    )
    assert replay_old_frontier["status"] == "ok"
    assert replay_old_frontier["headSeq"] == first_page["headSeq"]
    assert [event["serverSeq"] for event in replay_old_frontier["events"]] == [1]

    new_frontier_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
        OWNER,
        wave_id,
        second_reader_page["headSeq"],
        second_reader_page["sealedThroughTick"],
    )
    assert new_frontier_page["events"] == second_reader_page["events"]


def test_v2_health_checkpoint_accepts_complete_empty_snapshot_and_detects_divergence(database):
    wave_id, _ = seed_recovery_wave(database)
    first_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
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
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert page["headSeq"] == 1
    event = database.execute(
        "select effective_tick from public.recovery_wave_events where wave_id=%s and seq=1",
        (wave_id,),
    ).fetchone()[0]
    assert event <= page["sealedThroughTick"]
    forged_prefix = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,0,%s)",
        OWNER,
        wave_id,
        page["sealedThroughTick"],
    )
    assert forged_prefix == {"status": "refused", "reason": "page_incomplete"}
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
        "configVersion": 1,
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
        "eventByWave": {"1": "frozen_event"},
        "bossByWave": {"1": True},
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
    assert first["initialSnapshot"]["configVersion"] == 1
    assert first["initialSnapshot"]["createWave"]["event"] == "frozen_event"
    assert first["initialSnapshot"]["createWave"]["boss"] is True
    template["eventByWave"]["1"] = "future_event"
    template["bossByWave"]["1"] = False
    repeat = call(database, sql, *args[:-1], json.dumps(template))
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
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
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
        "configVersion": 1,
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
        "eventByWave": {"1": None, "2": None},
        "bossByWave": {"1": False, "2": False},
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


def test_finish_normalizes_expiry_closed_by_settlement_without_late_credit(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    template = {
        "configVersion": 1,
        "expectedRevision": database.execute(
            "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
        ).fetchone()[0],
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
        "eventByWave": {"1": None, "2": None},
        "bossByWave": {"1": False, "2": False},
    }
    started = call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,10,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        "expiryclose1",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    wave_id = started["waveId"]
    epoch = UUID(started["initialSnapshot"]["islandEpoch"])
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '11 seconds' where id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.island_recovery_state set starts_at=now()-interval '11 seconds',"
        "reserved_at=now()-interval '11 seconds',expires_at=now()-interval '1 second' "
        "where island_owner=%s",
        (OWNER,),
    )
    as_server(database)
    settled = call(
        database,
        "select public.structure_recovery_settle_locked(%s,clock_timestamp())",
        OWNER,
    )
    assert settled["status"] == "settled"
    assert database.execute(
        "select closed_at is not null from public.recovery_wave_states where wave_id=%s",
        (wave_id,),
    ).fetchone() == (True,)
    assert database.execute(
        "select finished_at,expired from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (None, False)
    result = call(
        database,
        "select public.recovery_wave_finish(%s,%s,true,7,10,5,5,20,5,2,2,%s,"
        "'lateexpiry01',0,0,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        json.dumps({}),
        json.dumps({}),
    )
    assert result["status"] == "done"
    assert result["expired"] is True
    assert result["loot"] == 0
    assert result["recovery"]["checkpointUid"] is None
    assert result["recovery"]["basisRepairSeq"] == {}
    assert database.execute(
        "select expired,finished_at is not null from public.wave_runs where id=%s",
        (wave_id,),
    ).fetchone() == (True, True)


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
        "configVersion": 1,
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
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,900,50,"
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

    wave_id = started["waveId"]
    epoch = UUID(started["initialSnapshot"]["islandEpoch"])
    instance_id = UUID(structure["instanceId"])
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '10 seconds' where id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.island_recovery_state set starts_at=now()-interval '10 seconds',"
        "reserved_at=now()-interval '10 seconds',expires_at=now()+interval '890 seconds' "
        "where island_owner=%s",
        (OWNER,),
    )
    database.execute(
        "update public.recovery_wave_states set sealed_through_tick=10000 where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    first_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    assert first_page["headSeq"] == 0
    assert first_page["sealedThroughTick"] == 10000
    paid = call(
        database,
        "select public.island_structure_repair(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",
        OWNER,
        OWNER,
        "wall_1",
        instance_id,
        "futurepaid01",
        epoch,
        "reserved_wave",
        wave_id,
        1,
        0,
        10,
        "a" * 64,
        json.dumps({"wall": [10, 20, 40, 80, 160]}),
    )
    assert paid["status"] == "done"
    call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,0,%s)",
        OWNER,
        wave_id,
        first_page["sealedThroughTick"],
    )
    current_page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    event_tick = database.execute(
        "select effective_tick from public.recovery_wave_events where wave_id=%s "
        "and event_kind='structure_repaired'",
        (wave_id,),
    ).fetchone()[0]
    assert current_page["headSeq"] == 1
    assert event_tick > current_page["sealedThroughTick"]
    stale_finish = call(
        database,
        "select public.recovery_wave_finish(%s,%s,true,0,10,5,5,20,5,2,2,%s,"
        "'paidfinish00',%s,%s,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        current_page["sealedThroughTick"],
        current_page["headSeq"],
        json.dumps({str(instance_id): 0}),
        json.dumps({str(instance_id): 400000}),
    )
    assert stale_finish == {"status": "refused", "reason": "health_sync_required"}
    assert database.execute(
        "select count(*) from public.recovery_health_checkpoints "
        "where wave_id=%s and actor_id=%s and checkpoint_uid='paidfinish00'",
        (wave_id, OWNER),
    ).fetchone() == (0,)
    checkpoint = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'futurehp01',%s,%s,0,"
        "%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        current_page["sealedThroughTick"],
        current_page["headSeq"],
        json.dumps({str(instance_id): 0}),
        json.dumps({str(instance_id): 400000}),
    )
    assert checkpoint["status"] == "accepted"
    refused = call(
        database,
        "select public.recovery_wave_finish(%s,%s,true,0,10,5,5,20,5,2,2,%s,"
        "'paidfinish01',%s,%s,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        current_page["sealedThroughTick"],
        current_page["headSeq"],
        json.dumps({str(instance_id): 0}),
        json.dumps({str(instance_id): 400000}),
    )
    assert refused == {"status": "refused", "reason": "health_sync_required"}
    assert database.execute(
        "select closed_at from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone() == (None,)
    assert database.execute(
        "select finished_at from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (None,)
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '901 seconds' where id=%s",
        (wave_id,),
    )
    database.execute(
        "update public.island_recovery_state set starts_at=now()-interval '901 seconds',"
        "reserved_at=now()-interval '901 seconds',expires_at=now()-interval '1 second' "
        "where island_owner=%s",
        (OWNER,),
    )
    as_server(database)
    settled = call(
        database,
        "select public.structure_recovery_settle_locked(%s,clock_timestamp())",
        OWNER,
    )
    assert settled["status"] == "settled"
    late_finish = call(
        database,
        "select public.recovery_wave_finish(%s,%s,true,0,10,5,5,20,5,2,2,%s,"
        "'paidexpiry01',%s,%s,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        current_page["sealedThroughTick"],
        current_page["headSeq"],
        json.dumps({str(instance_id): 0}),
        json.dumps({str(instance_id): 400000}),
    )
    assert late_finish["status"] == "done"
    assert late_finish["expired"] is True
    assert late_finish["loot"] == 0
    assert late_finish["recovery"]["checkpointUid"] is None
    assert late_finish["recovery"]["closedHp"] == {str(instance_id): 1000000}
    assert late_finish["recovery"]["basisRepairSeq"] == {str(instance_id): 1}


def test_recovery_finish_preserves_first_close_receipt_and_pays_each_actor_once(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    as_server(database)
    template = {
        "configVersion": 1,
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
        "eventByWave": {"1": None, "2": None},
        "bossByWave": {"1": False, "2": False},
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
    page = call(
        database, "select public.recovery_wave_events_page(%s,%s,0,null,null)", OWNER, wave_id
    )
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
        99,
        json.dumps({"late-instance": 99}),
        json.dumps({"late-instance": 1}),
    )
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=now() where island_owner=%s and player_id=%s",
        (OWNER, FRIEND),
    )
    as_server(database)
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


def test_late_registered_finisher_expires_without_rewriting_normal_close(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    as_server(database)
    template = {
        "configVersion": 1,
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
        "eventByWave": {"1": None},
        "bossByWave": {"1": False},
    }
    template["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    started = call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        "latefinish01",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    wave_id = started["waveId"]
    epoch = UUID(started["initialSnapshot"]["islandEpoch"])
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
    joined = call(
        database,
        "select public.recovery_wave_join(%s,%s,2::smallint)",
        FRIEND,
        wave_id,
    )
    assert joined["status"] == "joined"
    page = call(
        database,
        "select public.recovery_wave_events_page(%s,%s,0,null,null)",
        OWNER,
        wave_id,
    )
    finish_sql = (
        "select public.recovery_wave_finish(%s,%s,true,7,10,5,5,20,5,2,2,%s,%s,"
        "%s,%s,0,%s::jsonb,%s::jsonb)"
    )
    owner_finish = call(
        database,
        finish_sql,
        OWNER,
        wave_id,
        epoch,
        "ownerlate01",
        page["sealedThroughTick"],
        page["headSeq"],
        json.dumps({}),
        json.dumps({}),
    )
    assert owner_finish["loot"] == 15
    canonical = owner_finish["recovery"]
    first_run = database.execute(
        "select finished_at,survived,loot,expired from public.wave_runs where id=%s",
        (wave_id,),
    ).fetchone()
    first_owner_balance = database.execute(
        "select balance from public.wallets where player_id=%s", (OWNER,)
    ).fetchone()[0]
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-interval '901 seconds' where id=%s",
        (wave_id,),
    )
    as_server(database)
    late = call(
        database,
        finish_sql,
        FRIEND,
        wave_id,
        epoch,
        "friendlate01",
        page["sealedThroughTick"],
        page["headSeq"],
        json.dumps({}),
        json.dumps({}),
    )
    assert late["status"] == "done"
    assert late["expired"] is True
    assert late["loot"] == 0
    assert late["recovery"] == canonical
    assert (
        database.execute(
            "select finished_at,survived,loot,expired from public.wave_runs where id=%s",
            (wave_id,),
        ).fetchone()
        == first_run
    )
    assert database.execute(
        "select loot,expired from public.wave_participants where wave_id=%s and player_id=%s",
        (wave_id, FRIEND),
    ).fetchone() == (0, True)
    assert (
        database.execute(
            "select balance from public.wallets where player_id=%s", (OWNER,)
        ).fetchone()[0]
        == first_owner_balance
    )


def test_recovery_current_lets_a_member_find_and_join_but_still_refuses_outsiders(database):
    outsider = UUID(int=924)
    add_players(database, OWNER, FRIEND, outsider)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    open_island(database, outsider, "P9R4S")
    as_owner(database)
    database.execute(
        "insert into public.island_members (island_owner,player_id,role) values (%s,%s,'member')",
        (OWNER, FRIEND),
    )
    as_server(database)
    template = {
        "configVersion": 1,
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
        "eventByWave": {"1": None},
        "bossByWave": {"1": False},
        "expectedRevision": database.execute(
            "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
        ).fetchone()[0],
    }
    started = call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        "joiners01",
        OWNER,
        ["structure_recovery"],
        json.dumps(template),
    )
    assert started["status"] == "started"
    current_sql = "select public.recovery_wave_current(%s,'island',%s,%s::smallint)"

    joinable = call(database, current_sql, FRIEND, OWNER, 2)
    assert joinable["status"] == "running"
    assert joinable["waveId"] == started["waveId"]
    assert joinable["seed"] == 4242 and joinable["wave"] == started["wave"]
    assert joinable["startsAt"] == started["startsAt"]
    assert (joinable["recoveryVersion"], joinable["waveProtocol"]) == (1, 2)
    assert joinable["joined"] is False
    # Nothing private: no token, no counter, and no snapshot (it lists the owner's token).
    for private in ("participantToken", "lastActorCounter", "initialSnapshot"):
        assert private not in joinable
    assert started["participantToken"] not in json.dumps(joinable)
    assert call(database, current_sql, FRIEND, OWNER, 1) == {
        "status": "refused",
        "reason": "client_update_required",
    }

    joined = call(
        database,
        "select public.recovery_wave_join(%s,%s,2::smallint)",
        FRIEND,
        joinable["waveId"],
    )
    assert joined["status"] == "joined"
    assert joined["participantToken"] != started["participantToken"]
    member_current = call(database, current_sql, FRIEND, OWNER, 2)
    assert member_current["joined"] is True
    assert member_current["participantToken"] == joined["participantToken"]
    assert member_current["lastActorCounter"] == 0
    assert member_current["initialSnapshot"] == joined["initialSnapshot"]
    owner_current = call(database, current_sql, OWNER, OWNER, 2)
    assert owner_current["participantToken"] == started["participantToken"]
    assert owner_current["joined"] is True

    assert call(database, current_sql, outsider, OWNER, 2) == {
        "status": "refused",
        "reason": "not_in_wave",
    }
    leaver = UUID(int=925)
    add_players(database, leaver)
    open_island(database, leaver, "Q2T5V")
    as_owner(database)
    database.execute(
        "insert into public.island_members (island_owner,player_id,role,left_at) "
        "values (%s,%s,'member',now())",
        (OWNER, leaver),
    )
    as_server(database)
    assert call(database, current_sql, leaver, OWNER, 2) == {
        "status": "refused",
        "reason": "not_in_wave",
    }
