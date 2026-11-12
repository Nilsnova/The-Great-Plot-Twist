"""The Harbor's market stall opens after wave 4 of the campaign (docs/GAME-V3.md section 4).

With the island game on, POST /api/market/calls asks which games the player is in (rpc/game_list:
their own island and the games they joined) and refuses 409 harbor_closed until one of them has
won wave 4. A player with no island game at all (the class demo) is not held back, and with the
island game off nothing changes. Nothing reaches market_call_open while the Harbor is closed.
"""

from dataclasses import replace

from server.flags import parse_flags
from server.tests.market_calls_helpers import MARKET_ON, CallsWorld

WITH_ISLANDS = replace(MARKET_ON, flags=parse_flags("market,islands"))


def world_with_games(*waves: int, settings=WITH_ISLANDS) -> CallsWorld:
    world = CallsWorld(settings=settings)
    world.database.game_waves = list(waves)
    return world


def test_a_call_before_wave_four_of_any_game_is_harbor_closed():
    world = world_with_games(3, 1)

    response = world.call()

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "harbor_closed"
    assert error["message"] == "The Harbor opens after wave 4. Win wave 4 in your game first."
    assert len(world.database.calls("game_list")) == 1
    assert world.database.calls("market_call_open") == []


def test_a_game_that_won_wave_four_opens_the_stall():
    world = world_with_games(1, 4)

    assert world.call().status_code == 200
    assert len(world.database.calls("market_call_open")) == 1


def test_a_player_with_no_island_game_keeps_the_stall():
    assert world_with_games().call().status_code == 200


def test_with_the_island_game_off_the_stall_is_as_before():
    world = world_with_games(0, settings=MARKET_ON)

    assert world.call().status_code == 200
    assert world.database.calls("game_list") == []
