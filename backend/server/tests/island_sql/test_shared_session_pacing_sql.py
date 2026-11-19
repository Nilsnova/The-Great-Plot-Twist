"""Real common-root settings/exit and background pacing integration.

Only disposable PostgreSQL is used; browser presence is never an authority.
"""

from uuid import uuid4

import pytest

pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.wave_economy import freeze_reward_basis  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    open_island,
)
from server.tests.island_sql.test_shared_session_close_sql import close  # noqa: E402
from server.tests.island_sql.test_shared_session_control_sql import attach  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import bell, live_room  # noqa: E402
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402


def settings(database, room, actor=None, *, uid="native_settings_001", **changes):
    owner, _, _, treasury, sessions = room
    actor = actor or owner
    as_server(database)
    return rpc(
        database,
        "shared_session_settings",
        actor,
        owner,
        keys(treasury)[1],
        sessions[actor],
        1,
        uid,
        Jsonb(changes),
    )


def test_only_leader_changes_settings_and_its_receipt_replays_without_fresh_state(database):
    room = live_room(database)
    assert settings(database, room, room[1], breakPaused=True) == {
        "status": "refused",
        "reason": "not_session_leader",
    }
    changed = settings(database, room, breakPaused=True, autoNext=True, countdownSeconds=3)
    assert changed["status"] == "done"
    assert changed["receipt"]["result"] == {
        "breakPaused": True,
        "autoNext": True,
        "countdownSeconds": 3,
    }
    again = settings(database, room, breakPaused=True, autoNext=True, countdownSeconds=3)
    assert again["receipt"] == changed["receipt"] and again["repeat"] is True
    assert again["economy"] is None and again["session"] is None


def test_explicit_exit_withdraws_matching_slot_and_does_not_erase_participation(database):
    room = live_room(database)
    owner, member, _, treasury, sessions = room
    started = bell(database, room)
    as_server(database)
    rpc(database, "shared_session_heartbeat", member, owner, keys(treasury)[1], sessions[member], 1)
    result = rpc(
        database,
        "shared_session_leave",
        member,
        owner,
        keys(treasury)[1],
        sessions[member],
        1,
        "native_exit_001",
    )
    assert result["status"] == "done" and result["session"]["isController"] is False
    as_owner(database)
    assert (
        database.execute(
            "select status from public.shared_session_slots where wave_id=%s and player_id=%s",
            (started["waveId"], member),
        ).fetchone()[0]
        == "withdrawn"
    )
    assert (
        database.execute(
            "select count(*) from public.island_wave_participation_receipts "
            "where wave_id=%s and player_id=%s",
            (started["waveId"], member),
        ).fetchone()[0]
        == 1
    )


def test_bad_setting_does_not_consume_the_click(database):
    room = live_room(database)
    assert settings(database, room, countdownSeconds="2") == {
        "status": "refused",
        "reason": "invalid_change",
    }
    assert settings(database, room, countdownSeconds=2)["status"] == "done"


def test_auto_next_only_becomes_due_after_won_break_and_pause_preserves_remaining(database):
    room = live_room(database)
    settings(database, room, autoNext=True, countdownSeconds=2)
    started = bell(database, room)
    close(database, started)
    as_server(database)
    assert rpc(database, "shared_session_auto_candidates", 20)["candidates"] == []
    settings(database, room, uid="pause_break_001", breakPaused=True)
    as_owner(database)
    pending = database.execute(
        "select next_bell_at,break_remaining_ms,next_after_wave_id "
        "from public.shared_session_settings where island_owner=%s",
        (room[0],),
    ).fetchone()
    assert pending[0] is None and 0 < pending[1] <= 8000
    assert str(pending[2]) == started["waveId"]
    settings(database, room, uid="resume_break_001", breakPaused=False)
    as_owner(database)
    assert database.execute(
        "select next_bell_at>clock_timestamp() "
        "from public.shared_session_settings where island_owner=%s",
        (room[0],),
    ).fetchone()[0]


def test_direct_other_island_attach_normalizes_expired_source_without_worker(database):
    room = live_room(database)
    owner, member, other_owner, _, _ = room
    as_owner(database)
    open_island(database, other_owner, "SWP92")
    as_server(database)
    rpc(database, "game_join", member, other_owner, 10)
    other_treasury = rpc(
        database, "island_treasury_admit", other_owner, other_owner, "other_admit001", 200
    )
    as_owner(database)
    database.execute(
        "update public.shared_session_controls set "
        "last_seen=clock_timestamp()-interval '61 seconds',"
        "connected_until=clock_timestamp()-interval '46 seconds' where player_id=%s",
        (member,),
    )
    attached = attach(database, member, other_owner, other_treasury, uuid4())
    assert attached["status"] == "done"
    assert attached["session"]["connectionGeneration"] == "2"
    as_owner(database)
    assert (
        database.execute(
            "select island_owner from public.shared_session_controls where player_id=%s", (member,)
        ).fetchone()[0]
        == other_owner
    )


def auto_start(database, room, preceding, *, prepared=None):
    owner, _, _, treasury, sessions = room
    if prepared is None:
        as_owner(database)
        prepared = template()
        prepared.update(
            expectedRevision=database.execute(
                "select revision from public.island_recovery_state where island_owner=%s", (owner,)
            ).fetchone()[0],
            expectedSource=rpc(database, "shared_session_source_locked", owner),
            weatherLabel="Calm",
            eventByWave={"2": None},
            bossByWave={"2": False},
            finishPolicy={
                "restartBack": 2,
                "rescue": {"enabled": False, "fromWave": 4, "lastWave": 100, "restartBack": 1},
            },
        )
        prepared["createWave"]["seed"] = 43
    basis = freeze_reward_basis(load_island(), played_wave=2, seed=43, house_levels=0)
    as_server(database)
    return rpc(
        database,
        "shared_session_wave_auto_start",
        owner,
        owner,
        keys(treasury)[1],
        preceding["waveId"],
        sessions[owner],
        1,
        43,
        0,
        900,
        100,
        "calm",
        1,
        0,
        ["structure_recovery"],
        Jsonb(prepared),
        Jsonb(basis.envelope()),
    )


def test_due_auto_next_accepts_once_with_actual_countdown_and_server_root(database):
    room = live_room(database)
    settings(database, room, autoNext=True)
    started = bell(database, room)
    close(database, started)
    settings(database, room, uid="auto_countdown001", countdownSeconds=3)
    as_owner(database)
    database.execute(
        "update public.shared_session_settings set next_bell_at=clock_timestamp() "
        "where island_owner=%s",
        (room[0],),
    )
    as_server(database)
    candidates = rpc(database, "shared_session_auto_candidates", 20)["candidates"]
    assert candidates[0]["afterWaveId"] == started["waveId"]
    next_wave = auto_start(database, room, started)
    assert next_wave["status"] == "started" and next_wave["wave"] == 2
    assert next_wave["countdownSeconds"] == 3
    replay = auto_start(database, room, started)
    assert replay["waveId"] == next_wave["waveId"] and replay["historical"] is True
    assert replay["economy"] is None and replay["session"] is None
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (room[0],)
        ).fetchone()[0]
        == 2
    )
    assert (
        database.execute(
            "select is_player_intent from public.island_economy_operations "
            "where actor_id=%s and domain_action='wave_auto_start'",
            (room[0],),
        ).fetchone()[0]
        is False
    )


def test_stale_auto_hint_cannot_restart_paused_break_or_consume_its_root(database):
    room = live_room(database)
    settings(database, room, autoNext=True)
    started = bell(database, room)
    close(database, started)
    settings(database, room, uid="pause_before_auto", breakPaused=True)
    assert auto_start(database, room, started) == {
        "status": "refused",
        "reason": "auto_next_not_due",
    }
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where actor_id=%s and domain_action='wave_auto_start'",
            (room[0],),
        ).fetchone()[0]
        == 0
    )


def test_grace_does_not_hide_captain_and_first_withdrawal_is_one_sealed_server_event(database):
    room = live_room(database)
    owner, member, _, treasury, sessions = room
    started = bell(database, room)
    as_server(database)
    rpc(
        database, "shared_session_disconnect", member, owner, keys(treasury)[1], sessions[member], 1
    )
    page = rpc(
        database,
        "shared_session_wave_events",
        owner,
        owner,
        keys(treasury)[1],
        started["waveId"],
        None,
        None,
        0,
        None,
        None,
    )
    assert not any(event["type"] == "captain_withdrawn" for event in page["events"])
    as_owner(database)
    for _ in range(2):
        database.execute(
            "select public.shared_session_withdraw_locked(%s,%s,'leave',clock_timestamp())",
            (member, started["waveId"]),
        )
    events = database.execute(
        "select actor_id,input_uid,actor_counter,participant_token,effective_tick,payload "
        "from public.recovery_wave_events where wave_id=%s and event_kind='captain_withdrawn'",
        (started["waveId"],),
    ).fetchall()
    assert len(events) == 1
    actor, uid, counter, token, tick, payload = events[0]
    assert actor is uid is counter is None
    assert tick > page["sealedThroughTick"]
    assert payload == {"participantToken": str(token), "reason": "leave"}


def buy_copy(database, room, actor):
    owner, _, _, treasury, _ = room
    as_owner(database)
    database.execute(
        "update public.islands set wave_best=2,next_wave=1 where player_id=%s", (owner,)
    )
    entry = next(row for row in load_island().weapons if row.weapon == "pistols")
    as_server(database)
    result = rpc(
        database,
        "island_shared_arsenal_mutate",
        actor,
        owner,
        *keys(treasury),
        uuid4().hex,
        "buy",
        "pistols",
        None,
        None,
        entry.coins,
        entry.unlock_wave,
    )
    assert result["status"] == "done"
    return result["receipt"]["result"]["copyId"]


def test_idle_copy_returns_after_absolute_grace_even_without_assignment_or_slot(database):
    room = live_room(database)
    copy = buy_copy(database, room, room[1])
    as_owner(database)
    database.execute(
        "update public.shared_session_controls set "
        "last_seen=clock_timestamp()-interval '61 seconds',"
        "connected_until=clock_timestamp()-interval '46 seconds' where player_id=%s",
        (room[1],),
    )
    as_server(database)
    rpc(database, "shared_session_process_due", 20)
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id "
        "from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone() == (None, 2, None)


def test_active_idle_travel_returns_old_island_copy_before_replacing_controller(database):
    room = live_room(database)
    owner, member, other_owner, _, sessions = room
    copy = buy_copy(database, room, member)
    as_owner(database)
    open_island(database, other_owner, "SWP93")
    as_server(database)
    rpc(database, "game_join", member, other_owner, 10)
    other = rpc(database, "island_treasury_admit", other_owner, other_owner, "other_admit001", 200)
    changed = attach(database, member, other_owner, other, sessions[member], 1)
    assert changed["status"] == "done" and changed["session"]["connectionGeneration"] == "2"
    as_owner(database)
    assert database.execute(
        "select holder,holder_generation,pending_return_wave_id "
        "from public.arsenal_copies where id=%s",
        (copy,),
    ).fetchone() == (None, 2, None)
    assert (
        database.execute(
            "select island_owner from public.shared_session_controls where player_id=%s", (member,)
        ).fetchone()[0]
        == other_owner
    )


def test_private_pacing_writers_are_not_service_or_browser_rpc_surfaces(database):
    as_owner(database)
    for name in (
        "shared_session_accept_bell_locked",
        "shared_session_change_locked",
        "shared_session_snapshot_before_captain_state_locked",
        "shared_session_withdraw_before_journal_locked",
    ):
        oid = database.execute(
            "select oid from pg_proc where pronamespace='public'::regnamespace and proname=%s",
            (name,),
        ).fetchone()[0]
        for role in ("anon", "authenticated", "service_role"):
            assert (
                database.execute(
                    "select has_function_privilege(%s,%s,'execute')", (role, oid)
                ).fetchone()[0]
                is False
            )
    for name in (
        "shared_session_leave",
        "shared_session_settings",
        "shared_session_auto_candidates",
        "shared_session_wave_auto_start",
    ):
        oid = database.execute(
            "select oid from pg_proc where pronamespace='public'::regnamespace and proname=%s",
            (name,),
        ).fetchone()[0]
        assert (
            database.execute(
                "select has_function_privilege('service_role',%s,'execute')", (oid,)
            ).fetchone()[0]
            is True
        )
        assert (
            database.execute(
                "select has_function_privilege('authenticated',%s,'execute')", (oid,)
            ).fetchone()[0]
            is False
        )
