"""Tests for the games of docs/GAME-V3.md section 2 (routes/games.py, island/games.py): create a
game, join it with its code (at most 10 players), Continue, the lobby, leave, and the alias POST
/api/island/invite/join.

Nothing here uses the network: the database is a FakeIslandDatabase whose FakeGames mirrors the
SQL rules of supabase/migrations/20261112040000_game_rooms.sql (island_helpers.py). The real SQL
is checked, opt-in, in island_sql/test_game_rooms_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests import island_helpers
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FRIEND_ID,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    World,
    opened,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))
FRIEND = {"Authorization": "Bearer test.friend.signature"}


@pytest.fixture(autouse=True)
def more_players(monkeypatch):
    """A friend and twelve more signed-in GitHub players, for the 10-player door."""
    users = dict(island_helpers.USERS)
    users["Bearer test.friend.signature"] = {"id": FRIEND_ID, "is_anonymous": False}
    for number in range(1, 13):
        users[f"Bearer test.crew-{number}.signature"] = {
            "id": crew_id(number),
            "is_anonymous": False,
        }
    monkeypatch.setattr(island_helpers, "USERS", users)


def crew_id(number: int) -> str:
    return f"cccccccc-0000-4000-8000-{number:012d}"


def crew(number: int) -> dict:
    return {"Authorization": f"Bearer test.crew-{number}.signature"}


def game_world() -> World:
    """PLAYER hosts ISLE-K7Q2M (Captain Gull, best wave 3); everybody has a captain name."""
    world = World(settings=WITH_GUESTS)
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 3, "flags": 3,
    }  # fmt: skip
    names = world.database.names
    names.update({PLAYER_ID: "Captain Gull", FRIEND_ID: "Captain Wren", GUEST_ID: "Guest Puffin"})
    for number in range(1, 13):
        names[crew_id(number)] = f"Crew {number}"
    return world


def join(world: World, code: str = "ISLE-K7Q2M", headers=FRIEND, path="/api/games/join", **extra):
    body = {"code": code, "actionUid": "join-00001", **extra}
    return world.client.post(path, json=body, headers=headers)


def leave(world: World, code: str = "ISLE-K7Q2M", headers=FRIEND) -> httpx.Response:
    return world.client.post("/api/games/leave", json={"code": code}, headers=headers)


# --- POST /api/games ---


def test_create_makes_your_game_once_and_then_answers_it():
    world = game_world()
    world.database.open_replies = [{**opened(), "created": True}, opened()]

    first = world.client.post("/api/games", json={}, headers=PLAYER)
    again = world.client.post("/api/games", headers=PLAYER)

    assert first.status_code == 200
    assert first.headers["cache-control"] == "private, no-store"
    assert first.json() == {
        "game": {
            "code": "ISLE-K7Q2M",
            "hostName": "Captain Gull",
            "role": "host",
            "waveBest": 0,
            "members": 1,
            "maxMembers": 10,
        },
        "created": True,
    }
    assert again.json()["created"] is False
    assert again.json()["game"]["code"] == "ISLE-K7Q2M"
    calls = world.database.calls("game_join")
    assert (
        calls == [{"p_player_id": PLAYER_ID, "p_island_owner": PLAYER_ID, "p_max_members": 10}] * 2
    )
    assert world.database.games.rows[PLAYER_ID][PLAYER_ID]["role"] == "host"


def test_create_refuses_extra_fields_and_needs_the_login_and_the_flag():
    world = game_world()
    assert_error(
        world.client.post("/api/games", json={"x": 1}, headers=PLAYER), 422, "validation_error"
    )
    assert_error(world.client.post("/api/games", json={}), 401, "unauthorized")
    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    assert_error(off.client.post("/api/games", json={}, headers=PLAYER), 404, "feature_off")


def test_create_for_a_player_without_a_profile():
    world = game_world()
    world.database.open_replies = [{"status": "missing"}]

    assert_error(world.client.post("/api/games", json={}, headers=PLAYER), 404, "player_not_set_up")


# --- POST /api/games/join ---


def test_join_makes_you_a_member_for_good_and_a_repeat_changes_nothing():
    world = game_world()

    first = join(world, code="k7q2m")
    again = join(world)

    assert first.status_code == 200
    assert first.json()["game"] == {
        "code": "ISLE-K7Q2M",
        "hostName": "Captain Gull",
        "role": "member",
        "waveBest": 3,
        "members": 2,
        "maxMembers": 10,
    }
    assert first.json()["island"] == {"code": "ISLE-K7Q2M", "ownerName": "Captain Gull"}
    assert again.json()["game"]["members"] == 2
    assert world.database.games.rows[PLAYER_ID][FRIEND_ID]["left"] is None
    assert world.database.calls("demo_guest_admit") == []  # a GitHub player is not recorded


def test_the_host_joining_their_own_game_is_the_host():
    world = game_world()

    assert join(world, headers=PLAYER).json()["game"]["role"] == "host"


def test_a_game_takes_ten_players_and_refuses_the_eleventh():
    world = game_world()
    for number in range(1, 10):  # the host plus 9 friends
        assert join(world, headers=crew(number)).status_code == 200

    full = join(world, headers=crew(10))

    assert_error(full, 409, "game_full")
    assert full.json()["error"]["message"] == "This game has 10 players already."
    assert world.database.games.active(PLAYER_ID) == 10
    # A member coming back is not a new player: the door stays open for them.
    assert join(world, headers=crew(3)).status_code == 200
    # One leaves, so the next one gets in.
    assert leave(world, headers=crew(1)).json() == {"left": True}
    assert join(world, headers=crew(10)).status_code == 200
    assert_error(join(world, headers=crew(11)), 409, "game_full")


def test_join_refuses_an_unknown_code_and_a_malformed_body():
    world = game_world()

    assert_error(join(world, code="ISLE-ZZZZZ"), 404, "no_such_game")
    assert_error(join(world, code="HARBOR-K7QXM"), 404, "no_such_game")
    assert_error(join(world, extra=1), 422, "validation_error")
    assert_error(join(world, actionUid="no"), 422, "validation_error")
    assert world.database.calls("game_join") == []


def test_join_admits_a_guest_who_brings_a_valid_code():
    world = game_world()

    response = join(world, headers=GUEST)

    assert response.status_code == 200
    assert world.database.calls("demo_guest_admit") == [{"p_player_id": GUEST_ID}]
    assert world.database.games.rows[PLAYER_ID][GUEST_ID]["role"] == "member"


def test_join_needs_a_login_the_flag_and_for_guests_the_demo_flag():
    world = game_world()
    assert_error(join(world, headers={}), 401, "unauthorized")

    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("demo")))
    assert_error(join(off), 404, "feature_off")

    no_guests = World(settings=ISLAND_SETTINGS)
    assert_error(join(no_guests, headers=GUEST), 403, "demo_closed")
    assert no_guests.database.requests == []


def test_a_guest_whose_login_is_gone_is_told_so():
    world = game_world()
    world.database.games.no_profile.add(FRIEND_ID)

    assert_error(join(world), 404, "player_not_set_up")


def test_guessing_codes_is_slow_but_opening_your_own_games_is_not():
    world = game_world()

    guesses = [join(world, code="ISLE-ZZZZZ", headers=crew(1)).status_code for _ in range(11)]
    assert guesses == [404] * 10 + [429]

    assert join(world).status_code == 200
    # A member opening the game again does not spend the code budget.
    assert all(join(world).status_code == 200 for _ in range(15))


def test_the_invite_route_is_an_alias_of_join():
    world = game_world()

    response = join(world, headers=GUEST, path="/api/island/invite/join")

    assert response.status_code == 200
    assert response.json()["game"]["role"] == "member"
    assert world.database.games.rows[PLAYER_ID][GUEST_ID]["left"] is None
    assert_error(
        join(world, code="ISLE-ZZZZZ", path="/api/island/invite/join"), 404, "no_such_island"
    )
    for number in range(1, 9):
        join(world, headers=crew(number))
    assert_error(join(world, headers=crew(9), path="/api/island/invite/join"), 409, "game_full")


# --- GET /api/games (Continue) ---


def test_continue_lists_your_games_newest_first_and_leaves_out_the_ones_you_left():
    world = game_world()
    world.database.islands["FR3ND"] = {
        "player_id": FRIEND_ID, "code": "FR3ND", "wave_best": 7, "flags": 7,
    }  # fmt: skip
    world.database.islands["CR3WZ"] = {
        "player_id": crew_id(1), "code": "CR3WZ", "wave_best": 1, "flags": 1,
    }  # fmt: skip
    world.database.games.add(PLAYER_ID, PLAYER_ID)
    assert join(world, code="ISLE-FR3ND", headers=PLAYER).status_code == 200
    assert join(world, code="ISLE-CR3WZ", headers=PLAYER).status_code == 200
    assert leave(world, code="ISLE-CR3WZ", headers=PLAYER).json() == {"left": True}

    response = world.client.get("/api/games", headers=PLAYER)

    assert response.status_code == 200
    assert response.json() == {
        "games": [
            {
                "code": "ISLE-FR3ND",
                "hostName": "Captain Wren",
                "role": "member",
                "waveBest": 7,
                "members": 2,
                "maxMembers": 10,
            },
            {
                "code": "ISLE-K7Q2M",
                "hostName": "Captain Gull",
                "role": "host",
                "waveBest": 3,
                "members": 1,
                "maxMembers": 10,
            },
        ]
    }
    assert world.database.calls("game_list") == [{"p_player_id": PLAYER_ID, "p_limit": 20}]


def test_a_brand_new_player_has_no_games():
    world = game_world()

    assert world.client.get("/api/games", headers=crew(5)).json() == {"games": []}


def test_continue_refuses_an_answer_it_cannot_read():
    world = game_world()
    world.database.games.list = lambda request: httpx.Response(200, json={"oops": 1})

    assert_error(world.client.get("/api/games", headers=PLAYER), 502, "database_error")


# --- GET /api/games/{code} (the lobby) ---


def test_the_lobby_lists_the_host_first_then_the_members_by_joining():
    world = game_world()
    join(world, headers=crew(2))
    join(world, headers=FRIEND)

    response = world.client.get("/api/games/isle-k7q2m", headers=FRIEND)

    assert response.status_code == 200
    body = response.json()
    assert body["game"]["role"] == "member"
    assert body["game"]["members"] == 3
    assert body["members"] == [
        {"id": PLAYER_ID, "name": "Captain Gull", "role": "host", "you": False},
        {"id": crew_id(2), "name": "Crew 2", "role": "member", "you": False},
        {"id": FRIEND_ID, "name": "Captain Wren", "role": "member", "you": True},
    ]
    host = world.client.get("/api/games/ISLE-K7Q2M", headers=PLAYER).json()
    assert host["game"]["role"] == "host"


def test_the_lobby_is_only_for_members():
    world = game_world()

    assert_error(world.client.get("/api/games/ISLE-K7Q2M", headers=FRIEND), 403, "not_member")
    assert_error(world.client.get("/api/games/ISLE-ZZZZZ", headers=FRIEND), 404, "no_such_game")
    join(world)
    leave(world)
    assert_error(world.client.get("/api/games/ISLE-K7Q2M", headers=FRIEND), 403, "not_member")


# --- POST /api/games/leave ---


def test_leave_refusals_and_repeats():
    world = game_world()

    assert_error(leave(world, headers=PLAYER), 409, "host_cannot_leave")
    assert_error(leave(world, code="ISLE-ZZZZZ"), 404, "no_such_game")
    assert leave(world).json() == {"left": False}  # never in it: nothing changes
    join(world)
    assert leave(world).json() == {"left": True}
    assert leave(world).json() == {"left": False}
    assert_error(
        world.client.post("/api/games/leave", json={"code": "ISLE-K7Q2M", "x": 1}, headers=FRIEND),
        422,
        "validation_error",
    )


def test_a_member_who_left_can_join_again():
    world = game_world()
    join(world)
    leave(world)

    assert join(world).json()["game"]["members"] == 2
    assert world.database.games.rows[PLAYER_ID][FRIEND_ID]["left"] is None


def test_the_game_routes_have_a_budget():
    world = game_world()
    join(world)

    answers = [world.client.get("/api/games", headers=FRIEND).status_code for _ in range(30)]
    assert answers == [200] * 29 + [429]  # the join spent one of the 30
