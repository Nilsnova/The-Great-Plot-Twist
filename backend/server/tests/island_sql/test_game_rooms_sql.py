"""Real SQL checks for 20261112040000_game_rooms.sql: hosts, members, the 10-player door, leaving,
Continue and the lobby (docs/GAME-V3.md section 2).

Opt-in, like test_islands_and_waves_sql.py (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end. The same rules run without a database in
FakeGames (island_helpers.py), which test_games_routes.py uses.
"""

from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
)

CREW = tuple(UUID(int=950 + number) for number in range(12))


def join(database, player, owner, most=10):
    as_server(database)
    return call(database, "select public.game_join(%s, %s, %s)", player, owner, most)


def leave(database, player, owner):
    as_server(database)
    return call(database, "select public.game_leave(%s, %s)", player, owner)


def games_of(database, player):
    as_server(database)
    return call(database, "select public.game_list(%s, 20)", player)


def members_of(database, owner):
    as_server(database)
    return call(database, "select public.game_members(%s)", owner)


@pytest.fixture
def game(database):
    add_players(database, OWNER, FRIEND, *CREW)
    open_island(database, OWNER, "K7Q2M")
    return database


def test_the_host_opens_their_game_and_a_repeat_only_stamps_it(game):
    first = join(game, OWNER, OWNER)
    again = join(game, OWNER, OWNER)

    assert first == {"status": "joined", "role": "host", "members": 1, "repeat": False}
    assert again == {"status": "joined", "role": "host", "members": 1, "repeat": True}


def test_a_game_takes_ten_players_and_the_eleventh_is_refused(game):
    for player in CREW[:9]:
        assert join(game, player, OWNER)["status"] == "joined"

    full = join(game, CREW[9], OWNER)

    assert full == {"status": "refused", "reason": "game_full", "members": 10}
    assert join(game, CREW[0], OWNER)["repeat"] is True  # a member coming back is not new
    assert leave(game, CREW[0], OWNER) == {"status": "left", "repeat": False}
    assert join(game, CREW[9], OWNER)["members"] == 10
    assert join(game, CREW[0], OWNER)["reason"] == "game_full"  # left: counts as new again


def test_join_refuses_an_unknown_game_and_a_bad_maximum(game):
    assert join(game, FRIEND, FRIEND)["reason"] == "no_such_game"  # the friend has no island yet
    with pytest.raises(Exception, match="bad_game_join"):
        join(game, FRIEND, OWNER, most=1)


def test_the_host_cannot_leave_and_leaving_twice_changes_nothing(game):
    join(game, FRIEND, OWNER)

    assert leave(game, OWNER, OWNER) == {"status": "refused", "reason": "host_cannot_leave"}
    assert leave(game, FRIEND, OWNER) == {"status": "left", "repeat": False}
    assert leave(game, FRIEND, OWNER) == {"status": "left", "repeat": True}
    assert leave(game, FRIEND, FRIEND) == {"status": "refused", "reason": "no_such_game"}


def test_continue_lists_your_own_island_and_your_games_newest_first(game):
    open_island(game, FRIEND, "FR3ND")
    join(game, OWNER, FRIEND)

    listed = games_of(game, OWNER)

    # One transaction: now() is the same moment for both, so only the set is certain here.
    assert {item["code"] for item in listed} == {"FR3ND", "K7Q2M"}
    by_code = {item["code"]: item for item in listed}
    assert by_code["K7Q2M"]["role"] == "host"
    assert by_code["FR3ND"] | {"openedAt": None, "hostName": None} == {
        "code": "FR3ND",
        "hostId": str(FRIEND),
        "hostName": None,
        "role": "member",
        "waveBest": 0,
        "members": 2,
        "openedAt": None,
    }
    leave(game, OWNER, FRIEND)
    assert [item["code"] for item in games_of(game, OWNER)] == ["K7Q2M"]
    assert games_of(game, CREW[5]) == []


def test_the_lobby_lists_the_host_first(game):
    join(game, CREW[1], OWNER)
    join(game, FRIEND, OWNER)

    listed = members_of(game, OWNER)

    assert [item["role"] for item in listed] == ["host", "member", "member"]
    assert listed[0]["id"] == str(OWNER)
    assert {item["id"] for item in listed[1:]} == {str(CREW[1]), str(FRIEND)}


def test_the_rules_hold_in_the_table_itself(game):
    as_owner(game)
    with pytest.raises(Exception, match="island_members_host_is_owner"):
        game.execute(
            "insert into public.island_members (island_owner, player_id, role) "
            "values (%s, %s, 'host')",
            (OWNER, FRIEND),
        )


def test_the_browser_roles_get_nothing(game):
    as_owner(game)
    rights = game.execute(
        "select has_table_privilege('authenticated', 'public.island_members', 'select'),"
        " has_table_privilege('anon', 'public.island_members', 'select'),"
        " has_function_privilege('authenticated', 'public.game_join(uuid, uuid, integer)',"
        " 'execute')"
    ).fetchone()
    assert rights == (False, False, False)
