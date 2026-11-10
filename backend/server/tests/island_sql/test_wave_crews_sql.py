"""Real SQL checks for 20261110020000_wave_crews.sql: shared waves with a loot for everyone.

Opt-in, like test_islands_and_waves_sql.py (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

from uuid import UUID, uuid4

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_server,
    balance,
    call,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)

THIRD = UUID(int=924)


def join(database, player, wave_id):
    as_server(database)
    return call(database, "select public.wave_join(%s, %s)", player, wave_id)


def current(database, place="island", owner=None):
    as_server(database)
    return call(database, "select public.wave_current(%s, %s)", place, owner)


def island_wave(database, *players):
    """OWNER's island with a running wave rung by OWNER, and `players` added as users."""
    add_players(database, OWNER, *players)
    open_island(database, OWNER, "K7Q2M")
    return start(database, OWNER, "bell-0001", owner=OWNER)


def flags_of(database, player):
    return call(database, "select flags from public.islands where player_id = %s", player)


def test_the_bell_ringer_is_the_first_participant_and_the_answer_names_the_place(database):
    wave = island_wave(database)

    assert wave["place"] == "island"
    rows = database.execute(
        "select player_id from public.wave_participants where wave_id = %s", (wave["waveId"],)
    ).fetchall()
    assert rows == [(OWNER,)]


def test_a_friend_joins_the_running_wave_once(database):
    wave = island_wave(database, FRIEND)

    joined = join(database, FRIEND, wave["waveId"])
    again = join(database, FRIEND, wave["waveId"])

    assert joined["status"] == "joined" and joined["repeat"] is False
    assert {key: joined[key] for key in ("waveId", "wave", "seed", "startsAt", "place")} == {
        key: wave[key] for key in ("waveId", "wave", "seed", "startsAt", "place")
    }
    assert again == {**joined, "repeat": True}


def test_the_current_wave_is_found_by_island_and_by_pirate_point(database):
    wave = island_wave(database, FRIEND)
    point = start(database, FRIEND, "bell-0002", place="pirate_point")

    on_island = current(database, owner=OWNER)
    on_point = current(database, place="pirate_point")

    assert on_island["waveId"] == wave["waveId"] and on_island["status"] == "running"
    assert on_point["waveId"] == point["waveId"] and on_point["place"] == "pirate_point"
    assert current(database, owner=FRIEND) is None


def test_every_participant_gets_their_own_loot_once_and_the_island_one_flag(database):
    wave = island_wave(database, FRIEND)
    join(database, FRIEND, wave["waveId"])
    move_start(database, wave["waveId"], 20)

    owner = finish(database, OWNER, wave["waveId"])
    friend = finish(database, FRIEND, wave["waveId"])
    repeat = finish(database, FRIEND, wave["waveId"], survived=False)

    assert (owner["loot"], owner["flags"], friend["loot"], friend["flags"]) == (15, 1, 15, 1)
    assert repeat == {**friend, "repeat": True}
    assert balance(database, OWNER) == 115 and balance(database, FRIEND) == 15
    assert ledger(database, FRIEND, "pirate_loot") == [(15, f"wave:{wave['waveId']}:{FRIEND}")]
    assert flags_of(database, OWNER) == 1


def test_a_lost_first_finish_closes_the_wave_and_a_later_survived_one_counts_the_flag(database):
    wave = island_wave(database, FRIEND)
    join(database, FRIEND, wave["waveId"])
    move_start(database, wave["waveId"], 20)

    lost = finish(database, OWNER, wave["waveId"], survived=False)
    next_bell = start(database, OWNER, "bell-0002", owner=OWNER)
    won = finish(database, FRIEND, wave["waveId"])

    assert lost["loot"] == 0 and lost["flags"] == 0
    assert next_bell["status"] == "started"  # the first finish closed the old wave
    assert (won["loot"], won["waveBest"], won["flags"]) == (15, 1, 1)


def test_nobody_joins_a_wave_that_is_over(database):
    wave = island_wave(database, FRIEND, THIRD)
    join(database, FRIEND, wave["waveId"])
    move_start(database, wave["waveId"], 20)
    finish(database, OWNER, wave["waveId"])

    assert join(database, THIRD, wave["waveId"]) == {"status": "refused", "reason": "wave_over"}
    assert join(database, FRIEND, wave["waveId"])["repeat"] is True  # already in: still answered
    assert join(database, THIRD, uuid4()) == {"status": "refused", "reason": "no_such_wave"}
    assert current(database, owner=OWNER) is None


def test_a_wave_past_its_maximum_length_is_over_for_joins_and_pays_nothing(database):
    wave = island_wave(database, FRIEND)
    join(database, FRIEND, wave["waveId"])
    move_start(database, wave["waveId"], 1000)

    late = finish(database, FRIEND, wave["waveId"])

    assert (late["loot"], late["survived"], late["expired"]) == (0, False, True)
    assert join(database, OWNER, wave["waveId"])["repeat"] is True
    assert current(database, owner=OWNER) is None


def test_someone_who_never_joined_cannot_finish(database):
    wave = island_wave(database, FRIEND)
    move_start(database, wave["waveId"], 20)

    assert finish(database, FRIEND, wave["waveId"]) == {
        "status": "refused",
        "reason": "not_in_wave",
    }


def test_everyone_at_pirate_point_gets_the_pirate_point_loot(database):
    add_players(database, OWNER, FRIEND, THIRD)
    wave = start(database, OWNER, "bell-0001", place="pirate_point")
    join(database, FRIEND, wave["waveId"])
    join(database, THIRD, wave["waveId"])
    move_start(database, wave["waveId"], 20)

    results = [finish(database, player, wave["waveId"]) for player in (OWNER, FRIEND, THIRD)]

    assert [result["loot"] for result in results] == [25, 25, 25]  # 20 + 5 x wave 1
    assert results[-1]["waveBest"] == 1 and results[-1]["flags"] == 1
    assert start(database, FRIEND, "bell-0002", place="pirate_point")["wave"] == 2


def test_no_browser_role_may_read_participants_or_run_the_new_functions(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.wave_participants', 'select'),
               has_table_privilege('service_role', 'public.wave_participants', 'delete'),
               has_function_privilege('authenticated', 'public.wave_join(uuid, uuid)', 'execute'),
               has_function_privilege('authenticated', 'public.wave_current(text, uuid)',
                                      'execute'),
               (select count(*) from pg_proc where proname = 'wave_finish')
        """
    ).fetchone()
    assert rights == (False, False, False, False, 1)
    assert (
        call(database, "select count(*) from pg_policies where tablename = 'wave_participants'")
        == 0
    )
