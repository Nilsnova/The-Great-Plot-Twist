"""Shared geometric boundaries and real HTTP refusal before the existing Move CAS."""

import json
from dataclasses import replace
from pathlib import Path

import pytest

from server.flags import parse_flags
from server.island import layout
from server.island.wall_rows import MAX_WALL_ROWS, added_wall_row, wall_row_counts
from server.tests.island_helpers import ISLAND_SETTINGS, World
from server.tests.test_island_move_routes import move, move_calls, spot

SHARED = json.loads((Path(__file__).parent / "fixtures" / "wall-rows.json").read_text())
HEART = tuple(SHARED["heart"])


@pytest.mark.parametrize("case", SHARED["counts"], ids=lambda case: case["name"])
def test_counts_match_shared_client_fixture(case: dict) -> None:
    assert wall_row_counts(case["walls"], HEART) == case["rows"]


@pytest.mark.parametrize("case", SHARED["changes"], ids=lambda case: case["name"])
def test_new_rows_and_old_excess_match_shared_client_fixture(case: dict) -> None:
    assert added_wall_row(case["before"], case["after"], HEART) == case["refused"]


def test_original_twelve_reserved_sites_have_two_rows_per_approach() -> None:
    rules = layout.island_layout()
    walls = [(spot.x, spot.z) for spot in rules.spots if spot.slot == "wall"]
    assert MAX_WALL_ROWS == 3
    assert len(walls) == 12
    assert wall_row_counts(walls, rules.heart) == {"east": 2, "south": 2, "west": 2}


def test_move_http_rejects_fourth_row_before_storage_without_payment() -> None:
    settings = replace(ISLAND_SETTINGS, flags=parse_flags("islands,placement"))
    world = World(settings=settings)
    assert move(world, spot="wall_6", x=-12, z=-1).status_code == 200
    before = world.island().json()
    calls = len(move_calls(world))
    refused = move(world, spot="wall_11", x=-7.5, z=-1)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "wall_rows"
    assert len(move_calls(world)) == calls
    assert world.island().json() == before
    shared_row = move(world, spot="wall_11", x=-12, z=1)
    assert shared_row.status_code == 200
    assert shared_row.json()["coins"] == before["coins"]
    moved = spot(shared_row.json(), "wall_11")
    assert (moved["x"], moved["z"]) == (-12, 1)
