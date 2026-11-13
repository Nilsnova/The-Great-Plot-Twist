"""Real SQL checks for 20261113030000_host_console_v3.sql: the "game" counts of
host_console_overview() on seeded data, and that nothing else about the function changed.

Opt-in, like test_islands_and_waves_sql.py (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import json
from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    call,
    finish,
    move_start,
    open_island,
    start,
)

PEOPLE = tuple(UUID(int=1100 + number) for number in range(8))
HOST_A, A2, A3, HOST_B, B2, LONER, GUEST_1, GUEST_2 = PEOPLE


def overview(database):
    as_server(database)
    return call(database, "select public.host_console_overview()")


def join(database, player, owner):
    as_server(database)
    return call(database, "select public.game_join(%s, %s, 10)", player, owner)


def test_the_game_key_is_there_with_every_count_at_zero_on_an_empty_database(database):
    assert overview(database)["game"] == {
        "islands": {"total": 0, "createdToday": 0},
        "games": {"withMembers": 0, "maxMembers": 0},
        "waves": {"runningNow": 0, "finishedToday": 0, "bestWave": 0},
        "demo": {"codeActive": False, "guestsToday": 0},
    }


def test_the_old_keys_are_still_there_and_the_game_key_is_the_only_new_one(database):
    keys = set(overview(database))
    assert keys == {
        "players", "crews", "openPositions", "day", "walletToday", "schemaObjects",
        "lastKeepaliveAt", "game",
    }  # fmt: skip


def test_islands_are_counted_and_only_todays_count_as_new(database):
    add_players(database, HOST_A, HOST_B, LONER)
    for player, code in ((HOST_A, "AAAAA"), (HOST_B, "BBBBB"), (LONER, "CCCCC")):
        open_island(database, player, code)
    as_owner(database)
    database.execute(
        "update public.islands set created_at = now() - interval '2 days' where code = 'CCCCC'"
    )

    assert overview(database)["game"]["islands"] == {"total": 3, "createdToday": 2}


def test_games_with_members_count_islands_with_more_than_one_active_member(database):
    add_players(database, *PEOPLE[:6])
    for player, code in ((HOST_A, "AAAAA"), (HOST_B, "BBBBB"), (LONER, "CCCCC")):
        open_island(database, player, code)
        join(database, player, player)
    join(database, A2, HOST_A)
    join(database, A3, HOST_A)
    join(database, B2, HOST_B)

    assert overview(database)["game"]["games"] == {"withMembers": 2, "maxMembers": 3}

    as_server(database)
    call(database, "select public.game_leave(%s, %s)", B2, HOST_B)
    assert overview(database)["game"]["games"] == {"withMembers": 1, "maxMembers": 3}


def test_waves_running_finished_today_and_the_best_wave(database):
    add_players(database, HOST_A, HOST_B, LONER)
    for player, code in ((HOST_A, "AAAAA"), (HOST_B, "BBBBB"), (LONER, "CCCCC")):
        open_island(database, player, code)
    # HOST_A survives waves 1 and 2, HOST_B loses wave 1, LONER leaves a wave running,
    # and an old survived wave was finished two days ago.
    first = start(database, HOST_A, "bell-0001", owner=HOST_A)
    move_start(database, first["waveId"], 30)
    finish(database, HOST_A, first["waveId"])
    second = start(database, HOST_A, "bell-0002", owner=HOST_A)
    move_start(database, second["waveId"], 30)
    finish(database, HOST_A, second["waveId"])
    lost = start(database, HOST_B, "bell-0003", owner=HOST_B)
    move_start(database, lost["waveId"], 30)
    finish(database, HOST_B, lost["waveId"], survived=False)
    start(database, LONER, "bell-0004", owner=LONER)
    as_owner(database)
    database.execute(
        "update public.wave_runs set finished_at = now() - interval '2 days' where id = %s",
        (first["waveId"],),
    )

    assert overview(database)["game"]["waves"] == {
        "runningNow": 1,
        "finishedToday": 2,
        "bestWave": 2,
    }


def test_an_expired_wave_is_not_running_and_not_finished_today(database):
    add_players(database, HOST_A)
    open_island(database, HOST_A, "AAAAA")
    old = start(database, HOST_A, "bell-0001", owner=HOST_A)
    move_start(database, old["waveId"], 1000)
    start(database, HOST_A, "bell-0002", owner=HOST_A)  # closes the old one as expired

    assert overview(database)["game"]["waves"] == {
        "runningNow": 1,
        "finishedToday": 0,
        "bestWave": 0,
    }


def test_the_class_code_is_active_only_when_one_is_set_and_guests_count_by_day(database):
    add_players(database, HOST_A, GUEST_1, GUEST_2)
    as_owner(database)
    database.execute(
        "update public.demo_class_code set code = 'K7QXM', set_at = now() where name = 'class_demo'"
    )
    as_server(database)
    for guest in (GUEST_1, GUEST_2):
        call(database, "select public.demo_guest_admit(%s)", guest)
    as_owner(database)
    database.execute(
        "update public.demo_guests set admitted_at = now() - interval '3 days' "
        "where player_id = %s",
        (GUEST_2,),
    )

    assert overview(database)["game"]["demo"] == {"codeActive": True, "guestsToday": 1}

    as_owner(database)
    database.execute(
        "update public.demo_class_code set code = null, set_at = null where name = 'class_demo'"
    )
    assert overview(database)["game"]["demo"]["codeActive"] is False


def test_the_game_key_holds_numbers_and_flags_only(database):
    add_players(database, HOST_A, A2)
    open_island(database, HOST_A, "AAAAA")
    join(database, HOST_A, HOST_A)
    join(database, A2, HOST_A)
    text = json.dumps(overview(database)["game"])

    assert "AAAAA" not in text and str(HOST_A) not in text and str(A2) not in text

    def leaves(value):
        if isinstance(value, dict):
            for item in value.values():
                yield from leaves(item)
        else:
            yield value

    assert all(isinstance(leaf, (int, bool)) for leaf in leaves(overview(database)["game"]))


def test_only_the_server_may_run_it_and_it_stays_an_invoker_function(database):
    rights = database.execute(
        """
        select has_function_privilege('anon', 'public.host_console_overview()', 'execute'),
               has_function_privilege('authenticated', 'public.host_console_overview()', 'execute'),
               has_function_privilege('service_role', 'public.host_console_overview()', 'execute'),
               prosecdef, proconfig, provolatile
          from pg_proc where oid = 'public.host_console_overview()'::regprocedure
        """
    ).fetchone()
    assert rights == (False, False, True, False, ['search_path=""'], "s")
    assert not call(
        database,
        "select exists (select 1 from information_schema.routine_privileges "
        "where routine_name = 'host_console_overview' and grantee = 'PUBLIC')",
    )
