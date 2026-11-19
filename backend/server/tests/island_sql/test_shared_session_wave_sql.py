"""Actual accepted-bell/controller/assignment integration on disposable PostgreSQL.

The existing test-only recovery configuration stands in for a trusted server
template. Membership, controllers, profiles, rewards and authority are real
production tables and hooks; no authority provider or participant is fabricated.
"""

from time import monotonic, sleep
from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.wave_economy import freeze_reward_basis  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import (  # noqa: E402
    attach,
    authority,
    prepared,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402


def live_room(database):
    owner, member, outsider, treasury = prepared(database)
    sessions = {owner: uuid4(), member: uuid4()}
    for actor, session in sessions.items():
        assert attach(database, actor, owner, treasury, session)["status"] == "done"
    return owner, member, outsider, treasury, sessions


def bell(database, room, *, countdown=0, uid="native_bell_001"):
    owner, _, _, treasury, sessions = room
    as_owner(database)
    revision = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (owner,)
    ).fetchone()[0]
    snapshot = template()
    snapshot["expectedRevision"] = revision
    snapshot["weatherLabel"] = "Calm"
    snapshot["expectedSource"] = rpc(database, "shared_session_source_locked", owner)
    snapshot["weather"] = {"kind": "calm", "ships": 1, "fog": 0}
    snapshot["createWave"]["seed"] = 42
    basis = freeze_reward_basis(load_island(), played_wave=1, seed=42, house_levels=0)
    as_server(database)
    return rpc(
        database,
        "shared_session_wave_start",
        owner,
        owner,
        keys(treasury)[1],
        sessions[owner],
        1,
        uid,
        42,
        countdown,
        0,
        900,
        100,
        "calm",
        1,
        0,
        ["structure_recovery"],
        Jsonb(snapshot),
        Jsonb(basis.envelope()),
    )


def test_bell_freezes_full_roster_personal_assignment_and_original_economy(database):
    room = live_room(database)
    owner, member, _, treasury, sessions = room
    started = bell(database, room)
    assert started["status"] == "started"
    wave = UUID(started["waveId"])
    snapshot = started["initialSnapshot"]
    assert snapshot["economy"] == {
        "mode": "island_shared",
        "version": 1,
        "islandOwner": str(owner),
        "accountId": keys(treasury)[0],
        "runEpoch": keys(treasury)[1],
    }
    assert snapshot["islandEpoch"] != keys(treasury)[1]
    assert len(snapshot["participants"]) == 2
    assert all(set(row) == {"participantToken", "captain"} for row in snapshot["participants"])
    for actor in (owner, member):
        assert authority(database, actor, owner)["actor_assignment_wave_id"] == str(wave)
        assert authority(database, actor, owner)["reservation_id"] == str(wave)
    as_owner(database)
    roster = database.execute(
        "select roster from public.island_wave_accounting where wave_id=%s", (wave,)
    ).fetchone()[0]
    assert {row["playerId"]: row["controllingSessionId"] for row in roster} == {
        str(actor): str(session) for actor, session in sessions.items()
    }
    assert (
        database.execute(
            "select count(*) from public.shared_session_slots where wave_id=%s", (wave,)
        ).fetchone()[0]
        == 2
    )


def test_countdown_heartbeat_never_creates_participation(database):
    room = live_room(database)
    owner, _, _, treasury, sessions = room
    started = bell(database, room, countdown=30)
    as_server(database)
    rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], sessions[owner], 1)
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.island_wave_participation_receipts where wave_id=%s",
            (started["waveId"],),
        ).fetchone()[0]
        == 0
    )


def test_post_start_active_heartbeat_confirms_once_and_survives_withdrawal(database):
    room = live_room(database)
    owner, _, _, treasury, sessions = room
    started = bell(database, room)
    as_server(database)
    for _ in range(2):
        rpc(
            database,
            "shared_session_heartbeat",
            owner,
            owner,
            keys(treasury)[1],
            sessions[owner],
            1,
        )
    as_owner(database)
    database.execute(
        "select public.shared_session_withdraw_locked(%s,%s,'leave',clock_timestamp())",
        (owner, started["waveId"]),
    )
    assert (
        database.execute(
            "select count(*) from public.island_wave_participation_receipts "
            "where wave_id=%s and player_id=%s",
            (started["waveId"], owner),
        ).fetchone()[0]
        == 1
    )


def test_original_bell_retry_does_not_need_current_controller_or_rebuild_template(database):
    room = live_room(database)
    owner, _, _, treasury, sessions = room
    original = bell(database, room)
    attach(database, owner, owner, treasury, sessions[owner], 1)
    as_server(database)
    repeated = rpc(
        database, "shared_session_wave_replay", owner, owner, keys(treasury)[1], "native_bell_001"
    )
    assert repeated["waveId"] == original["waveId"] and repeated["repeat"] is True
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 1
    )


def inputs(database, room, started, actor, commands, generation=1):
    owner, _, _, treasury, sessions = room
    as_server(database)
    return rpc(
        database,
        "shared_session_wave_inputs",
        actor,
        owner,
        keys(treasury)[1],
        started["waveId"],
        sessions[actor],
        generation,
        Jsonb(commands),
    )


def prefix(database, room, started, *, minimum_tick=0):
    owner, _, _, treasury, sessions = room
    end = monotonic() + 2
    while True:
        as_server(database)
        page = rpc(
            database,
            "shared_session_wave_events",
            owner,
            owner,
            keys(treasury)[1],
            started["waveId"],
            sessions[owner],
            1,
            0,
            None,
            None,
        )
        if page["sealedThroughTick"] >= minimum_tick:
            return page
        assert monotonic() < end, "The real server clock did not seal the requested prefix."
        sleep(0.01)


def captain_report(database, room, started, *, fallen=None, minimum_tick=0, bases=None):
    owner, _, _, treasury, sessions = room
    page = prefix(database, room, started, minimum_tick=minimum_tick)
    facts = {
        row["participantToken"]: {
            "hpUnits": 0 if row["participantToken"] == fallen else 1_000_000,
            "downAtTick": page["sealedThroughTick"] if row["participantToken"] == fallen else None,
            "reviveBasisSeq": (bases or {}).get(row["participantToken"], 0),
        }
        for row in started["initialSnapshot"]["participants"]
    }
    report = {
        "checkpointUid": uuid4().hex,
        "throughTick": page["sealedThroughTick"],
        "inputHeadSeq": page["through"],
        "captains": facts,
    }
    as_server(database)
    value = rpc(
        database,
        "shared_session_wave_captains",
        owner,
        owner,
        keys(treasury)[1],
        started["waveId"],
        sessions[owner],
        1,
        Jsonb(report),
    )
    return value, report


def test_native_inputs_use_frozen_captain_and_replay_without_second_event(database):
    room = live_room(database)
    owner, _, _, _, _ = room
    started = bell(database, room)
    command = [
        {
            "inputUid": "native_move_001",
            "actorCounter": 1,
            "tick": 0,
            "command": {"type": "captain_move", "x": 1, "z": 2},
        }
    ]
    first = inputs(database, room, started, owner, command)
    assert first["status"] == "accepted" and first["headSeq"] == 1
    assert (
        first["accepted"][0]["payload"]["captain"]
        == started["initialSnapshot"]["participants"][0]["captain"]
    )
    assert inputs(database, room, started, owner, command) == first
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.recovery_wave_events where wave_id=%s",
            (started["waveId"],),
        ).fetchone()[0]
        == 1
    )


def test_raw_revive_or_away_cannot_hide_or_heal_a_shared_captain(database):
    room = live_room(database)
    owner, _, _, _, _ = room
    started = bell(database, room)
    for command in (
        {"type": "captain_revive", "targetId": str(uuid4()), "x": 0, "z": 0},
        {"type": "captain_move", "x": 0, "z": 0, "away": True},
        {"type": "captain_revive_hold_start", "targetId": None, "fallId": None},
    ):
        answer = inputs(
            database,
            room,
            started,
            owner,
            [{"inputUid": uuid4().hex, "actorCounter": 1, "tick": 0, "command": command}],
        )
        assert answer == {"status": "refused", "reason": "bad_recovery_input"}
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.recovery_wave_events where wave_id=%s",
            (started["waveId"],),
        ).fetchone()[0]
        == 0
    )


def test_real_captain_report_creates_fall_once_and_retained_reconnect_never_heals(database):
    room = live_room(database)
    owner, _, _, treasury, sessions = room
    started = bell(database, room)
    token = started["initialSnapshot"]["participants"][1]["participantToken"]
    reported, body = captain_report(database, room, started, fallen=token)
    assert reported["accepted"] is True
    fall = reported["captains"][token]["fallId"]
    assert UUID(fall)
    as_server(database)
    replay = rpc(
        database,
        "shared_session_wave_captains",
        owner,
        owner,
        keys(treasury)[1],
        started["waveId"],
        sessions[owner],
        1,
        Jsonb(body),
    )
    assert replay["captains"][token]["fallId"] == fall and replay["repeated"] is True
    target = database.execute(
        "select player_id from public.shared_session_slots where wave_id=%s "
        "and participant_token=%s",
        (started["waveId"], token),
    ).fetchone()[0]
    rpc(
        database, "shared_session_disconnect", target, owner, keys(treasury)[1], sessions[target], 1
    )
    attach(database, target, owner, treasury, sessions[target], 1)
    as_owner(database)
    assert database.execute(
        "select hp_units,fall_id,connection_generation from public.shared_session_slots "
        "where wave_id=%s and participant_token=%s",
        (started["waveId"], token),
    ).fetchone() == (0, UUID(fall), 2)
