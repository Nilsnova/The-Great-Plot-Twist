"""Tests for routes/island.py and island/service.py: GET /api/island, POST /api/island/build and
GET /api/island/visit/{code}.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py), the
sign-in check answers from a fake transport. The prices come from the real islands.json.

Used by: pytest (cd backend && uv run pytest).
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FRIEND_ID,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER_ID,
    World,
    opened,
)

SPOT_IDS = [
    "wall_1", "wall_2", "wall_3", "wall_4", "wall_5", "wall_6",
    "cannon_1", "cannon_2", "cannon_3", "cannon_4", "cannon_5", "cannon_6", "cannon_7",
    "tower_1", "house_1", "house_2",
    "wall_7", "wall_8", "wall_9", "wall_10", "wall_11", "wall_12",
]  # fmt: skip
INSUFFICIENT = httpx.Response(400, json={"code": "P0001", "message": "insufficient_funds"})
REPEATED = httpx.Response(409, json={"code": "23505", "message": "already_applied"})
DOWN = httpx.Response(503, json={"code": "XX000"})


# --- GET /api/island ---


def test_the_island_needs_a_sign_in():
    world = World()

    assert_error(world.client.get("/api/island"), 401, "unauthorized")
    assert world.database.requests == []


def test_the_island_is_closed_while_the_flag_is_off_and_nothing_is_read():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))

    assert_error(world.island(), 404, "feature_off")
    assert_error(world.build(), 404, "feature_off")
    assert_error(world.visit("ISLE-K7Q2M"), 404, "feature_off")
    assert world.database.requests == []


def test_a_new_player_sees_the_code_the_coins_and_sixteen_empty_spots():
    world = World()

    response = world.island()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert list(body) == [
        "code", "coins", "waveBest", "nextWave", "flags", "spots",
        "crew", "captain", "prices", "unlocks", "skills", "weapons",
    ]  # fmt: skip
    assert (body["code"], body["coins"], body["waveBest"], body["flags"]) == (
        "ISLE-K7Q2M",
        100,
        0,
        0,
    )
    assert [spot["id"] for spot in body["spots"]] == SPOT_IDS
    assert body["spots"][0] == {
        "id": "wall_1", "kind": "wall", "kinds": ["wall"], "built": False,
        "level": 0, "cost": 10, "upgradeCost": None,
    }  # fmt: skip
    assert body["nextWave"] == 1


def test_the_prices_are_the_economy_table():
    spots = {spot["id"]: spot for spot in World().island().json()["spots"]}

    assert (spots["wall_1"]["cost"], spots["cannon_4"]["cost"]) == (10, 30)
    assert (spots["tower_1"]["kind"], spots["tower_1"]["cost"]) == ("watchtower", 40)
    assert (spots["house_2"]["kind"], spots["house_2"]["cost"]) == ("house", 50)


def test_the_island_is_opened_with_a_fresh_code_and_the_starting_coins():
    world = World()

    world.island()

    (call,) = world.database.calls("island_open")
    assert call["p_player_id"] == PLAYER_ID
    assert call["p_starting_coins"] == 200  # islands.json startingCoins since 11 Nov
    assert len(call["p_code"]) == 5


def test_a_code_that_is_taken_is_tried_again_with_a_new_one():
    world = World()
    world.database.open_replies = [{"status": "code_taken"}, opened("ZZ234")]

    assert world.island().json()["code"] == "ISLE-ZZ234"
    assert len(world.database.calls("island_open")) == 2


def test_built_spots_show_as_built_and_old_islet_rows_are_left_out():
    world = World()
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon"},
        {"plot": "plot_2", "building_type": "workshop"},
    ]

    spots = world.island().json()["spots"]

    assert [spot["id"] for spot in spots if spot["built"]] == ["cannon_1"]
    assert len(spots) == 22


def test_a_player_without_a_profile_gets_404():
    world = World()
    world.database.open_replies = [{"status": "missing"}]

    assert_error(world.island(), 404, "player_not_set_up")


def test_a_broken_island_file_answers_503():
    world = World()
    world.app.state.island = None

    assert_error(world.island(), 503, "island_unavailable")


def test_an_admitted_guest_plays_like_a_player():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))

    response = world.island(headers=GUEST)

    assert response.status_code == 200
    assert world.database.calls("island_open")[0]["p_player_id"] == GUEST_ID


def test_a_guest_without_the_class_code_is_refused():
    world = World()  # the demo flag is off, so no guest is admitted

    assert_error(world.island(headers=GUEST), 403, "demo_closed")


# --- POST /api/island/build ---


def test_a_build_pays_the_price_of_the_file_in_coins_only_and_answers_the_island():
    world = World()

    response = world.build()

    assert response.status_code == 200
    body = response.json()
    assert body["coins"] == 70
    assert [spot["id"] for spot in body["spots"] if spot["built"]] == ["cannon_1"]
    (call,) = world.database.calls("islet_build")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_plot": "cannon_1",
        "p_building_type": "cannon",
        "p_coins": 30,
        "p_timber": 0,
        "p_starter_timber": 0,
        "p_ref": "island:click-0001",
    }


def test_the_island_is_opened_before_the_first_build_so_the_starting_coins_are_there():
    world = World()

    world.build()

    assert world.database.paths()[0] == "POST /rpc/island_open"


def test_a_repeated_click_answers_the_island_and_builds_nothing():
    world = World()
    world.database.known_refs.add("island:click-0001")

    response = world.build()

    assert response.status_code == 200
    assert response.json()["code"] == "ISLE-K7Q2M"
    assert world.database.calls("islet_build") == []


def test_a_click_that_was_still_running_answers_the_island():
    world = World()
    world.database.build_reply = REPEATED

    assert world.build().status_code == 200


def test_a_build_the_player_cannot_pay_is_refused():
    world = World()
    world.database.build_reply = INSUFFICIENT
    world.database.progress["wave_best"] = 2  # the house unlocks after wave 2

    response = world.build(spot="house_1", kind="house")

    assert_error(response, 409, "insufficient_funds")
    assert "50 coins" in response.json()["error"]["message"]


def test_a_spot_that_is_built_is_refused_before_the_database_is_asked():
    world = World()
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]

    assert_error(world.build(), 409, "spot_taken")
    assert world.database.calls("islet_build") == []


def test_a_spot_taken_at_the_same_moment_is_refused_by_the_database():
    world = World()
    world.database.build_reply = {
        "status": "refused",
        "reason": "plot_occupied",
        "standing": "cannon",
    }

    assert_error(world.build(), 409, "spot_taken")


def test_the_cabin_stands_already():
    assert_error(World().build(spot="cabin", kind="cabin"), 409, "spot_taken")


def test_a_kind_on_the_wrong_spot_is_refused():
    response = World().build(spot="wall_1", kind="cannon")

    assert_error(response, 422, "wrong_kind")
    assert "wall" in response.json()["error"]["message"]


def test_an_unknown_spot_is_refused():
    assert_error(World().build(spot="tower_9", kind="watchtower"), 404, "no_such_spot")


@pytest.mark.parametrize(
    "body",
    [
        {"actionUid": "short"},
        {"actionUid": "bad uid with spaces"},
        {"spot": "Cannon_1"},
        {"coins": 0},
        {"playerId": FRIEND_ID},
    ],
)
def test_a_build_that_does_not_fit_is_refused(body):
    world = World()

    assert_error(world.build(**body), 422, "validation_error")
    assert world.database.calls("islet_build") == []


def test_a_database_that_is_down_says_the_outcome_is_unknown():
    world = World()
    world.database.build_reply = DOWN

    assert_error(world.build(), 503, "database_unavailable")


def test_too_many_builds_in_a_minute_are_refused():
    world = World()
    for number in range(30):
        assert world.build(actionUid=f"click-{number:04d}").status_code == 200

    response = world.build(actionUid="click-0099")

    assert_error(response, 429, "too_many_requests")
    assert int(response.headers["retry-after"]) >= 1


# --- GET /api/island/visit/{code} ---


def friend_island(world: World) -> None:
    world.database.islands["K7Q2M"] = {
        "player_id": FRIEND_ID,
        "code": "K7Q2M",
        "wave_best": 3,
        "flags": 3,
    }
    world.database.names[FRIEND_ID] = "Captain Gull"
    world.database.buildings[FRIEND_ID] = [{"plot": "wall_2", "building_type": "wall"}]


@pytest.mark.parametrize("code", ["ISLE-K7Q2M", "isle-k7q2m", "K7Q2M", "k7q-2m"])
def test_a_friend_visits_an_island_by_its_code(code):
    world = World()
    friend_island(world)

    response = world.visit(code)

    assert response.status_code == 200
    body = response.json()
    assert list(body) == ["code", "ownerName", "waveBest", "spots", "crew"]
    assert (body["code"], body["ownerName"], body["waveBest"]) == ("ISLE-K7Q2M", "Captain Gull", 3)
    assert [spot["id"] for spot in body["spots"] if spot["built"]] == ["wall_2"]


@pytest.mark.parametrize("code", ["ISLE-ZZZZZ", "HARBOR-K7Q2M", "K7Q20", "x"])
def test_an_unknown_or_malformed_code_is_no_island(code):
    world = World()
    friend_island(world)

    assert_error(world.visit(code), 404, "no_such_island")


def test_a_visit_does_not_open_an_island():
    world = World()
    friend_island(world)

    world.visit("ISLE-K7Q2M")

    assert world.database.calls("island_open") == []


def test_guessing_codes_is_slowed_down():
    world = World()
    for _ in range(30):
        world.visit("ISLE-ZZZZZ")

    assert_error(world.visit("ISLE-ZZZZZ"), 429, "too_many_requests")
