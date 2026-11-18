"""Real PostgreSQL checks for 20261118030000_recovery_away.sql (feat/recovery-teammate-instant).

The all-away threshold is three minutes, every events page says whether the wave is closed, and an
input lands one tick after the server's now (still after the seal).
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import OWNER, call  # noqa: E402
from server.tests.island_sql.test_recovery_wave_end_sql import (  # noqa: E402
    FINISH,
    INPUTS,
    PAGE,
    move,
    move_start,
    ring,
    two_player_wave,
)

CURRENT = "select public.recovery_wave_current(%s,'island',%s,2::smallint)"


def test_a_wave_silent_for_two_and_a_half_minutes_is_still_running_and_resumes(database):
    wave_id, _ = two_player_wave(database, join=False)
    call(database, PAGE, OWNER, wave_id, 0)
    # The only player's tab was hidden for 150 s: the bell and current still see the same wave.
    move_start(database, wave_id, 160, activity=150)
    assert call(database, CURRENT, OWNER, OWNER)["status"] == "running"
    assert ring(database, "awaywave0002") == {"status": "refused", "reason": "wave_running"}
    # Coming back: the journal reads again and the wave goes on.
    page = call(database, PAGE, OWNER, wave_id, 0)
    assert page["status"] == "ok" and page["closed"] is False
    assert call(database, INPUTS, OWNER, wave_id, move("backagain01", 1))["status"] == "accepted"
    assert database.execute(
        "select finished_at from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (None,)


def test_a_wave_silent_for_more_than_three_minutes_is_ended_by_the_next_bell(database):
    wave_id, epoch = two_player_wave(database, join=False)
    call(database, PAGE, OWNER, wave_id, 0)
    move_start(database, wave_id, 300, activity=181)
    assert call(database, CURRENT, OWNER, OWNER) == {"status": "empty"}
    assert ring(database, "awaywave0003")["status"] == "started"
    assert database.execute(
        "select expired, survived from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (True, False)
    # The returning player's read says the wave is closed; its finish answers the expired close.
    page = call(database, PAGE, OWNER, wave_id, 0)
    assert page["closed"] is True
    done = call(
        database,
        FINISH,
        OWNER,
        wave_id,
        True,
        epoch,
        "awayclose001",
        max(0, page["sealedThroughTick"]),
        page["headSeq"],
    )
    assert done["status"] == "done" and done["expired"] is True and done["loot"] == 0


def test_an_input_lands_one_tick_after_now_and_after_the_seal(database):
    wave_id, _ = two_player_wave(database)
    page = call(database, PAGE, OWNER, wave_id, 0)
    accepted = call(database, INPUTS, OWNER, wave_id, move("leadcheck01", 1))
    tick = accepted["accepted"][0]["effectiveTick"]
    assert tick > page["sealedThroughTick"]
    now_tick = database.execute(
        "select floor(extract(epoch from (clock_timestamp()-starts_at))*20)::integer "
        "from public.wave_runs where id=%s",
        (wave_id,),
    ).fetchone()[0]
    # One tick of lead (was five): never more than two ticks ahead of the server's now.
    assert tick <= now_tick + 2
