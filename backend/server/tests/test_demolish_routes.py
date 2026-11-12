"""Tearing a building down between waves (docs/GAME-V3.md section 4.2): GET and POST
/api/island/demolish.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py); the price
lists come from the real islands.json. The amounts are the database's (island_demolish and
island_demolish_quote); the SQL side of the same rules is in island_sql/test_demolish_sql.py.
"""

from dataclasses import replace

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FRIEND_ID,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    World,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))

PRICES = {
    "wall": [10, 20, 40, 80, 160],
    "cannon": [30, 60, 120, 240, 480],
    "mortar": [60, 120, 240, 480, 960],
    "watchtower": [40, 80, 160, 320, 640],
    "house": [50, 100, 200],
}


def world_with_names() -> World:
    world = World(settings=WITH_GUESTS)
    world.database.names.update({PLAYER_ID: "Nils", FRIEND_ID: "Ana", GUEST_ID: "Ben"})
    return world


def game_of_owner(world: World, member: bool = True) -> None:
    """PLAYER hosts ISLE-K7Q2M; the guest is a member unless `member` is False."""
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 3, "flags": 3,
    }  # fmt: skip
    if member:
        world.database.games.add(PLAYER_ID, GUEST_ID)


def quote(world: World, headers=PLAYER, **params):
    return world.client.get(
        "/api/island/demolish", params={"spot": "cannon_1", **params}, headers=headers
    )


def demolish(world: World, **body):
    return world.post("/api/island/demolish", **{"spot": "cannon_1", **body})


def test_the_quote_is_the_databases_with_names_and_changes_nothing():
    world = world_with_names()

    response = quote(world)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "spot": "cannon_1",
        "kind": "cannon",
        "name": "Cannon",
        "level": 3,
        "refunds": [
            {"id": FRIEND_ID, "name": "Ana", "coins": 75, "you": False},
            {"id": PLAYER_ID, "name": "Nils", "coins": 30, "you": True},
        ],
        "repeat": False,
    }
    (call,) = world.database.calls("island_demolish_quote")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "cannon_1",
        "p_prices": PRICES,
    }
    assert world.database.calls("island_demolish") == []


def test_a_tear_down_answers_the_island_and_the_refunds_paid():
    world = world_with_names()

    response = demolish(world)

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "ISLE-K7Q2M" and "spots" in body and "coins" in body
    assert body["demolished"]["refunds"][1] == {
        "id": PLAYER_ID, "name": "Nils", "coins": 30, "you": True,
    }  # fmt: skip
    (call,) = world.database.calls("island_demolish")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "cannon_1",
        "p_action_uid": "click-0001",
        "p_prices": PRICES,
    }


def test_a_member_tears_down_in_the_hosts_game_and_a_stranger_cannot():
    world = world_with_names()
    game_of_owner(world)

    response = demolish(world, headers=GUEST, code="ISLE-K7Q2M")

    assert response.status_code == 200
    (call,) = world.database.calls("island_demolish")
    assert (call["p_player_id"], call["p_island_owner"]) == (GUEST_ID, PLAYER_ID)
    assert [item["you"] for item in response.json()["demolished"]["refunds"]] == [False, False]

    stranger = world_with_names()
    game_of_owner(stranger, member=False)
    assert_error(demolish(stranger, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert_error(quote(stranger, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert stranger.database.calls("island_demolish") == []
    assert_error(demolish(world_with_names(), code="ISLE-ZZZZZ"), 404, "no_such_island")


def test_the_heart_and_the_campaign_buildings_never_come_down():
    world = world_with_names()
    for spot in (
        "cabin",
        "heart",
        "island_bell",
        "island_harbor",
        "island_techhub",
        "island_wreck",
    ):
        refused = demolish(world, spot=spot)
        assert_error(refused, 409, "protected")
        assert refused.json()["error"]["message"] == (
            "The heart of the island stays. Only walls, towers and houses come down."
        )
        assert_error(quote(world, spot=spot), 409, "protected")
    assert_error(demolish(world, spot="pp_tower_1"), 404, "no_such_spot")  # Pirate Point: not here
    assert_error(demolish(world, spot="plot_2"), 404, "no_such_spot")
    assert world.database.calls("island_demolish") == []


def test_the_databases_refusals_become_plain_errors():
    for reason, status, code in (
        ("wave_running", 409, "wave_running"),
        ("not_built", 409, "not_built"),
        ("not_member", 403, "not_member"),
        ("protected", 409, "protected"),
        ("busy", 409, "busy"),
    ):
        world = world_with_names()
        world.database.paid_replies["island_demolish"] = {"status": "refused", "reason": reason}
        world.database.paid_replies["island_demolish_quote"] = {
            "status": "refused",
            "reason": reason,
        }
        assert_error(demolish(world), status, code)
        assert_error(quote(world), status, code)
    running = world_with_names()
    running.database.paid_replies["island_demolish"] = {
        "status": "refused",
        "reason": "wave_running",
    }
    assert demolish(running).json()["error"]["message"] == (
        "A wave is under way. Tear it down between waves."
    )


def test_a_repeated_click_is_answered_as_a_repeat():
    world = world_with_names()
    world.database.paid_replies["island_demolish"] = {
        **world.database.paid_replies.get("island_demolish", {}),
        "status": "done", "plot": "cannon_1", "kind": "cannon", "level": 3,
        "refunds": [{"playerId": PLAYER_ID, "paid": 60, "coins": 30}], "repeat": True,
    }  # fmt: skip

    response = demolish(world)

    assert response.status_code == 200
    assert response.json()["demolished"]["repeat"] is True


def test_a_bad_body_or_query_is_a_422():
    world = world_with_names()
    assert demolish(world, actionUid="short").status_code == 422
    assert demolish(world, extra=True).status_code == 422
    assert quote(world, spot="Not A Spot!").status_code == 422
    assert world.database.calls("island_demolish") == []
