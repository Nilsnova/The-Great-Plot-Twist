"""A new Captain fall cannot precede its real committed revival event.

Uses actual controller/bell/report/ordered hold/completion on disposable SQL.
No slot, fall, hold timestamp or authority source is directly written.
"""

from time import sleep
from uuid import uuid4

import pytest

pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import (  # noqa: E402
    bell,
    captain_report,
    inputs,
    live_room,
    prefix,
)


def test_fresh_basis_refuses_pre_revival_down_time_but_accepts_same_tick_fall(database):
    room = live_room(database)
    owner, member, _, treasury, sessions = room
    started = bell(database, room)
    as_owner(database)
    target = str(
        database.execute(
            "select participant_token from public.shared_session_slots "
            "where wave_id=%s and player_id=%s",
            (started["waveId"], member),
        ).fetchone()[0]
    )
    fallen, first_report = captain_report(database, room, started, fallen=target, minimum_tick=1)
    original_down = first_report["captains"][target]["downAtTick"]
    original_fall = fallen["captains"][target]["fallId"]
    accepted = inputs(
        database,
        room,
        started,
        owner,
        [
            {
                "inputUid": uuid4().hex,
                "actorCounter": 1,
                "tick": 0,
                "command": {
                    "type": "captain_revive_hold_start",
                    "targetId": target,
                    "fallId": original_fall,
                },
            }
        ],
    )
    hold = accepted["accepted"][0]["payload"]["hold"]
    sleep(2.05)  # Real ordinary hold elapsed; no trusted timestamp is overwritten.
    as_server(database)
    completed = rpc(
        database,
        "island_shared_captain_revive",
        owner,
        owner,
        *keys(treasury),
        "fall_basis_help001",
        started["waveId"],
        target,
        original_fall,
        hold["holdId"],
        sessions[owner],
        1,
    )
    assert completed["status"] == "done"
    as_owner(database)
    event_seq, event_tick = database.execute(
        "select seq,effective_tick from public.recovery_wave_events "
        "where wave_id=%s and event_kind='captain_revive'",
        (started["waveId"],),
    ).fetchone()
    assert event_tick > original_down
    page = prefix(database, room, started, minimum_tick=event_tick + 1)
    as_owner(database)
    facts = {
        str(token): {"hpUnits": hp, "downAtTick": down, "reviveBasisSeq": basis}
        for token, hp, down, basis in database.execute(
            "select participant_token,hp_units,down_at_tick,revive_basis_seq "
            "from public.shared_session_slots where wave_id=%s",
            (started["waveId"],),
        )
    }
    facts[target].update(hpUnits=0, downAtTick=original_down, reviveBasisSeq=event_seq)
    body = {
        "checkpointUid": uuid4().hex,
        "throughTick": page["sealedThroughTick"],
        "inputHeadSeq": page["through"],
        "captains": facts,
    }
    before = database.execute(
        "select count(*) from public.shared_session_captain_reports where wave_id=%s",
        (started["waveId"],),
    ).fetchone()[0]
    as_server(database)
    answer = rpc(
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
    assert answer == {"status": "refused", "reason": "stale_fall"}
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.shared_session_captain_reports where wave_id=%s",
            (started["waveId"],),
        ).fetchone()[0]
        == before
    )
    assert database.execute(
        "select down,fall_id,hp_units from public.shared_session_slots "
        "where wave_id=%s and player_id=%s",
        (started["waveId"], member),
    ).fetchone() == (False, None, 500_000)
    body["checkpointUid"] = uuid4().hex
    body["captains"][target]["downAtTick"] = event_tick
    as_server(database)
    new_fall = rpc(
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
    assert new_fall["accepted"] is True
    assert new_fall["captains"][target]["fallId"] != original_fall
    assert new_fall["captains"][target]["downAtTick"] == event_tick
    repeated = rpc(
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
    assert repeated["repeated"] is True
    assert repeated["captains"][target]["fallId"] == new_fall["captains"][target]["fallId"]
