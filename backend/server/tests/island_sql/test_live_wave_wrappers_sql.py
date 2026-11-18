"""The live co-op path with structure_recovery off, through the SQL wrappers the backend calls.

routes/waves.py sends every island wave through recovery_wave_start / _join / _current (protocol 2,
p_admit_v1 false); a recovery-version-0 island must then behave exactly like the legacy wave_*
functions: one wave per island, every member's current and join, each finisher's own loot through
the legacy wave_finish, no join after the first finish, the 900 s expiry, and the next bell. Nothing
of recovery v1 may be written on the way.

Run on the private disposable PostgreSQL fixture from backend/ (as the postgres user):

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_live_wave_wrappers_sql.py
"""

from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_server,
    call,
    move_start,
    open_island,
)

CREW = tuple(UUID(int=960 + number) for number in range(3))
RULES = ["tower_health", "pathing", "defenses_v2", "tower_obstacles", "ship_fire"]


def ring(database, player, uid):
    as_server(database)
    return call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,10,15,900,100,'calm',1,0,"
        "%s::text[],null,false,2::smallint)",
        player,
        uid,
        OWNER,
        RULES,
    )


def current(database, player):
    as_server(database)
    return call(
        database,
        "select public.recovery_wave_current(%s,'island',%s,2::smallint)",
        player,
        OWNER,
    )


def join(database, player, wave_id):
    as_server(database)
    return call(database, "select public.recovery_wave_join(%s,%s,2::smallint)", player, wave_id)


def finish(database, player, wave_id, survived=True):
    as_server(database)
    return call(
        database,
        "select public.wave_finish(%s,%s,%s,7,10,5,5,20,5,2,2)",
        player,
        wave_id,
        survived,
    )


def recovery_rows(database):
    as_server(database)
    return database.execute(
        "select (select recovery_version from public.island_recovery_state"
        " where island_owner = %s),"
        " (select count(*) from public.recovery_wave_states),"
        " (select count(*) from public.recovery_wave_participants)",
        (OWNER,),
    ).fetchone()


@pytest.fixture
def crew_island(database):
    add_players(database, OWNER, *CREW)
    open_island(database, OWNER, "K7Q2M")
    for number, player in enumerate(CREW):
        open_island(database, player, f"CRW{number + 2}Q")
        as_server(database)
        joined = call(database, "select public.game_join(%s,%s,10)", player, OWNER)
        assert joined["status"] == "joined" and joined["role"] == "member"
    return database


def test_four_captains_play_a_version_0_wave_through_the_wrappers(crew_island):
    database = crew_island
    started = ring(database, OWNER, "bell-live-0001")
    assert started["status"] == "started"
    assert (started["recoveryVersion"], started["waveProtocol"]) == (0, 1)
    assert started["rules"] == RULES
    assert "initialSnapshot" not in started and "participantToken" not in started
    wave_id = started["waveId"]

    repeat = ring(database, OWNER, "bell-live-0001")
    assert repeat["waveId"] == wave_id and repeat["repeat"] is True
    assert (repeat["recoveryVersion"], repeat["waveProtocol"]) == (0, 1)
    # A second bell while it runs, by a crew member: one wave per island.
    busy = ring(database, CREW[0], "bell-live-0002")
    assert busy == {"status": "refused", "reason": "wave_running"}

    for player in CREW[:2]:
        seen = current(database, player)
        assert seen["status"] == "running" and seen["waveId"] == wave_id
        assert (seen["recoveryVersion"], seen["waveProtocol"]) == (0, 1)
        joined = join(database, player, wave_id)
        assert joined["status"] == "joined" and joined["waveId"] == wave_id
        assert (joined["recoveryVersion"], joined["waveProtocol"]) == (0, 1)
        again = join(database, player, wave_id)
        assert again["status"] == "joined" and again["waveId"] == wave_id

    move_start(database, wave_id, 30)
    first = finish(database, OWNER, wave_id)
    second = finish(database, CREW[0], wave_id)
    assert first["status"] == "done" and second["status"] == "done"
    assert first["loot"] > 0 and second["loot"] > 0
    assert finish(database, CREW[0], wave_id)["repeat"] is True  # a repeat pays nothing more
    # The first finish closed the wave: a late fourth captain cannot join, and nothing runs now.
    assert join(database, CREW[2], wave_id) == {"status": "refused", "reason": "wave_over"}
    assert current(database, CREW[2]) == {"status": "empty"}
    # A joined captain who had not finished yet still finishes their own part.
    assert finish(database, CREW[1], wave_id)["status"] == "done"

    following = ring(database, CREW[1], "bell-live-0003")
    assert following["status"] == "started" and following["wave"] == started["wave"] + 1
    assert (following["recoveryVersion"], following["waveProtocol"]) == (0, 1)
    assert recovery_rows(database) == (0, 0, 0)


def test_an_abandoned_version_0_wave_expires_after_900_s_and_the_next_bell_rings(crew_island):
    database = crew_island
    started = ring(database, OWNER, "bell-live-0101")
    wave_id = started["waveId"]
    assert join(database, CREW[0], wave_id)["status"] == "joined"
    move_start(database, wave_id, 901)
    assert current(database, CREW[0]) == {"status": "empty"}
    assert join(database, CREW[1], wave_id) == {"status": "refused", "reason": "wave_over"}
    following = ring(database, CREW[0], "bell-live-0102")
    assert following["status"] == "started" and following["waveId"] != wave_id
    as_server(database)
    expired = database.execute(
        "select expired, loot from public.wave_runs where id = %s", (wave_id,)
    ).fetchone()
    assert expired == (True, 0)
    assert recovery_rows(database) == (0, 0, 0)
