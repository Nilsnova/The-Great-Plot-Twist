"""Canonical native terminal effects on real controller/bell/accounting state.

The disposable full-chain database contains no substitute authority provider.
Clock travel is confined to the explicit private close's trusted server timestamp.
"""

from datetime import timedelta
from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner, as_server  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import bell, live_room  # noqa: E402


def close(database, started, outcome="won", *, at=None):
    as_owner(database)
    if at is None:
        at = database.execute("select clock_timestamp()").fetchone()[0]
    return rpc(
        database, "shared_session_close_locked", UUID(started["waveId"]), outcome, Jsonb([]), at
    )


def finish(database, room, started, actor=None, *, generation=1):
    owner, _, _, treasury, sessions = room
    actor = actor or owner
    as_server(database)
    return rpc(
        database,
        "shared_session_wave_finish",
        actor,
        owner,
        keys(treasury)[1],
        UUID(started["waveId"]),
        sessions[actor],
        generation,
        Jsonb(
            {
                "survived": True,
                "shipsSunk": 0,
                "bonuses": [],
                "rescued": False,
                "checkpoint": None,
                "walls": None,
            }
        ),
    )


def test_native_finish_settles_once_and_only_projects_actors_completion(database):
    room = live_room(database)
    owner, member, _, _, sessions = room
    started = bell(database, room)
    as_server(database)
    rpc(
        database,
        "shared_session_heartbeat",
        owner,
        owner,
        started["initialSnapshot"]["economy"]["runEpoch"],
        sessions[owner],
        1,
    )
    first = finish(database, room, started)
    assert first["status"] == "done" and first["outcome"] == "won"
    assert first["completion"]["playerId"] == str(owner)
    assert first["completion"]["confirmedParticipation"] is True
    assert first["origin"] == started["initialSnapshot"]["economy"]
    assert "completions" not in first
    again = finish(database, room, started, generation=999)
    assert again["repeat"] is True
    assert again["completion"] == first["completion"]
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.island_wave_closures where wave_id=%s",
            (started["waveId"],),
        ).fetchone()[0]
        == 1
    )
    assert (
        database.execute(
            "select assignment_wave_id from public.personal_captain_profiles where player_id=%s",
            (member,),
        ).fetchone()[0]
        is None
    )


def test_late_close_normalizes_all_grace_before_accepting_a_win(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    last_seen = database.execute(
        "select max(last_seen) from public.shared_session_controls where island_owner=%s",
        (room[0],),
    ).fetchone()[0]
    result = close(database, started, at=last_seen + timedelta(seconds=60))
    assert result["outcome"] == "abandoned"
    assert result["lootCoins"] == "0"
    assert (
        database.execute(
            "select count(*) from public.shared_session_slots "
            "where wave_id=%s and status='withdrawn'",
            (started["waveId"],),
        ).fetchone()[0]
        == 2
    )


def test_overall_expiry_wins_even_with_live_captains(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    expires = database.execute(
        "select starts_at+make_interval(secs=>maximum_seconds) from public.wave_runs where id=%s",
        (started["waveId"],),
    ).fetchone()[0]
    assert close(database, started, at=expires)["outcome"] == "expired"


def test_terminal_fault_rolls_back_run_assignment_and_treasury(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    database.execute(
        "create function pg_temp.reject_terminal() returns trigger language plpgsql "
        "as $$ begin raise exception 'terminal fault'; end $$"
    )
    database.execute(
        "create trigger terminal_fault before insert on public.island_wave_closures "
        "for each row execute function pg_temp.reject_terminal()"
    )
    with pytest.raises(Exception, match="terminal fault"):
        with database.transaction():
            close(database, started)
    assert (
        database.execute(
            "select finished_at from public.wave_runs where id=%s", (started["waveId"],)
        ).fetchone()[0]
        is None
    )
    assert database.execute(
        "select assignment_wave_id from public.personal_captain_profiles where player_id=%s",
        (room[0],),
    ).fetchone()[0] == UUID(started["waveId"])
    assert (
        database.execute(
            "select count(*) from public.island_treasury_transactions where reference=%s",
            ("wave:" + started["waveId"],),
        ).fetchone()[0]
        == 0
    )


def test_worker_closes_silent_loss_without_browser_or_extended_deadline(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    database.execute(
        "update public.shared_session_controls set "
        "last_seen=clock_timestamp()-interval '61 seconds',"
        "connected_until=clock_timestamp()-interval '46 seconds' "
        "where island_owner=%s",
        (room[0],),
    )
    as_server(database)
    result = rpc(database, "shared_session_process_due", 20)
    assert result["closed"] == 1
    as_owner(database)
    assert (
        database.execute(
            "select outcome from public.island_wave_closures where wave_id=%s", (started["waveId"],)
        ).fetchone()[0]
        == "abandoned"
    )
    assert (
        database.execute(
            "select count(*) from public.shared_session_controls where island_owner=%s", (room[0],)
        ).fetchone()[0]
        == 0
    )


def test_member_departure_historical_finish_has_no_current_treasury_or_session(database):
    room = live_room(database)
    started = bell(database, room)
    close(database, started)
    as_owner(database)
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (room[0], room[1]),
    )
    replay = finish(database, room, started, room[1], generation=999)
    assert replay["completion"]["playerId"] == str(room[1])
    assert replay["economy"] is None and replay["session"] is None
