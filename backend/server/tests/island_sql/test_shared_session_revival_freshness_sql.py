"""Recent accepted party facts survive unrelated journal-reader seal progress.

Real native controllers/bell/checkpoints provide all state on disposable SQL.
No authority, slot, fall, timestamp or seal is directly inserted or updated.
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
    live_room,
    prefix,
)


def fallen_room(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    token = str(
        database.execute(
            "select participant_token from public.shared_session_slots "
            "where wave_id=%s and player_id=%s",
            (started["waveId"], room[1]),
        ).fetchone()[0]
    )
    _, report = captain_report(database, room, started, fallen=token, minimum_tick=1)
    return room, started, token, report


def context(database, room, started, target):
    as_owner(database)
    plan = rpc(database, "shared_session_lock_plan", [room[0]], room[0])
    rpc(database, "shared_session_lock_plan_rows", Jsonb(plan))
    return rpc(
        database,
        "shared_session_revival_context_locked",
        room[0],
        started["waveId"],
        target,
        room[4][room[0]],
        1,
    )


def fresh_report(database, room, started, body):
    page = prefix(database, room, started, minimum_tick=body["throughTick"] + 1)
    renewed = {
        **body,
        "checkpointUid": uuid4().hex,
        "throughTick": page["sealedThroughTick"],
        "inputHeadSeq": page["through"],
    }
    as_server(database)
    answer = rpc(
        database,
        "shared_session_wave_captains",
        room[0],
        room[0],
        keys(room[3])[1],
        started["waveId"],
        room[4][room[0]],
        1,
        Jsonb(renewed),
    )
    assert answer["accepted"] is True
    return renewed


def test_recent_party_checkpoint_survives_real_global_seal_advance(database):
    room, started, target, report = fallen_room(database)
    page = prefix(database, room, started, minimum_tick=report["throughTick"] + 3)
    assert page["sealedThroughTick"] > report["throughTick"]
    answer = context(database, room, started, target)
    assert answer["helperHpUnits"] == 1_000_000 and answer["targetHpUnits"] == 0
    assert answer["targetToken"] == target


@pytest.mark.parametrize("offset_ms,expected", [(2000, True), (2000.001, False), (-0.001, False)])
def test_exact_two_second_private_clock_boundary(database, offset_ms, expected):
    as_owner(database)
    accepted = database.execute(
        "select public.shared_session_checkpoint_is_recent("
        "timestamptz '2026-01-01 00:00:00+00',20,"
        "timestamptz '2026-01-01 00:00:01+00'+%s*interval '1 millisecond')",
        (offset_ms,),
    ).fetchone()[0]
    assert accepted is expected


def test_quiescent_prefix_does_not_stay_fresh_for_the_whole_hold(database):
    room, started, target, report = fallen_room(database)
    sleep(2.05)
    with pytest.raises(Exception, match="health_sync_required"):
        with database.transaction():
            context(database, room, started, target)
    # A newly accepted UID cannot refresh the age of an unchanged old prefix.
    as_server(database)
    same_prefix = {**report, "checkpointUid": uuid4().hex}
    assert (
        rpc(
            database,
            "shared_session_wave_captains",
            room[0],
            room[0],
            keys(room[3])[1],
            started["waveId"],
            room[4][room[0]],
            1,
            Jsonb(same_prefix),
        )["accepted"]
        is True
    )
    with pytest.raises(Exception, match="health_sync_required"):
        with database.transaction():
            context(database, room, started, target)
    fresh_report(database, room, started, report)
    assert context(database, room, started, target)["targetToken"] == target
