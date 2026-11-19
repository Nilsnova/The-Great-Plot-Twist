"""Tests for POST /api/island/move and the positions in every island answer (T36, decision D041).

They use the pretend database of island_helpers.py: every island answer asks the layout table (the
flag "placement" is retired, always on), the server checks the placement rules before
island_move(), and its refusals (wave_running, busy) reach the browser as plain 409s.

Used by: pytest (cd backend && uv run pytest).
"""

import json

import pytest

from server.island import layout
from server.tests.island_helpers import PLAYER_ID, World


@pytest.fixture
def world() -> World:
    return World()


def move(world: World, **body):
    request = {"spot": "cannon_1", "x": -10, "z": -10.5}
    request.update(body)
    return world.client.post(
        "/api/island/move", json=request, headers={"Authorization": "Bearer test.player.signature"}
    )


def spot(answer: dict, spot_id: str) -> dict:
    return next(item for item in answer["spots"] if item["id"] == spot_id)


def move_calls(world: World) -> list[dict]:
    return [
        json.loads(request.content)
        for request in world.database.requests
        if request.url.path.endswith("/rpc/island_move")
    ]


def test_an_old_save_shows_its_fixed_spots_as_grid_cells_and_may_move(world):
    answer = world.island().json()
    assert (spot(answer, "tower_1")["x"], spot(answer, "tower_1")["z"]) == (14.0, 3.0)
    assert answer["layout"] == {"version": 1, "grid": 0.5, "movable": True}


def test_a_stored_cell_replaces_the_fixed_spot_and_the_layout_is_version_2(world):
    world.database.layout_rows = [{"plot": "cannon_1", "x_half": -20, "z_half": -21}]
    answer = world.island().json()
    assert (spot(answer, "cannon_1")["x"], spot(answer, "cannon_1")["z"]) == (-10.0, -10.5)
    assert answer["layout"]["version"] == 2


def test_a_missing_layout_table_keeps_the_island_working_with_the_fixed_spots(world):
    world.database.layout_missing = True
    response = world.island()
    assert response.status_code == 200
    assert response.json()["layout"]["movable"] is False
    refused = move(world)
    assert refused.status_code == 503
    assert refused.json()["error"]["code"] == "layout_unavailable"


def test_a_legal_move_is_stored_in_half_units_and_answers_the_island(world):
    response = move(world)
    assert response.status_code == 200
    assert move_calls(world) == [
        {
            "p_island_owner": PLAYER_ID,
            "p_mover": PLAYER_ID,
            "p_plot": "cannon_1",
            "p_x_half": -20,
            "p_z_half": -21,
            "p_seen": [],
        }
    ]
    moved = spot(response.json(), "cannon_1")
    assert (moved["x"], moved["z"]) == (-10.0, -10.5)


def test_the_server_sends_the_rows_it_checked_in_plot_order(world):
    world.database.layout_rows = [
        {"plot": "wall_2", "x_half": 8, "z_half": -38},
        {"plot": "wall_10", "x_half": -18, "z_half": -2},
    ]
    assert move(world).status_code == 200
    assert [row["plot"] for row in move_calls(world)[0]["p_seen"]] == ["wall_10", "wall_2"]


def test_a_move_to_where_the_spot_stands_changes_nothing(world):
    response = move(world, x=-12.5, z=-14.5)
    assert response.status_code == 200
    assert move_calls(world) == []


@pytest.mark.parametrize(
    ("x", "z", "status", "code"),
    [
        (-10.25, -10, 422, "off_grid"),
        (-21, -10, 409, "not_on_land"),
        (0, 2, 409, "place_taken"),
        (-14, -6, 409, "place_taken"),
    ],
)
def test_an_illegal_move_is_refused_before_the_database_is_asked(world, x, z, status, code):
    response = move(world, x=x, z=z)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert move_calls(world) == []


def test_a_wall_moved_off_every_pirate_path_is_409_off_path(world):
    response = move(world, spot="wall_1", x=-4, z=-5.5)
    assert response.status_code == 409
    assert response.json()["error"] == {"code": "off_path", "message": "Walls go on a pirate path."}
    assert move_calls(world) == []


def test_a_wall_stored_off_every_path_shows_on_the_nearest_lane_cell(world):
    # D056: a wall moved before the rule (the old north spot of wall_11) stands on a lane now.
    world.database.layout_rows = [{"plot": "wall_11", "x_half": -8, "z_half": -11}]
    answer = world.island().json()
    where = (spot(answer, "wall_11")["x"], spot(answer, "wall_11")["z"])
    assert where != (-4.0, -5.5)
    assert layout.on_wall_lane(layout.island_layout(), *where)


def test_an_unknown_spot_is_404(world):
    response = move(world, spot="pp_tower_1")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "no_such_spot"


def test_a_move_under_a_running_wave_is_409_wave_running(world):
    world.database.move_replies = [{"status": "refused", "reason": "wave_running"}]
    response = move(world)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "wave_running"


def test_one_busy_answer_is_tried_again_and_two_are_409_busy(world):
    world.database.move_replies = [{"status": "refused", "reason": "busy"}]
    assert move(world).status_code == 200
    assert len(move_calls(world)) == 2
    world.database.move_replies = [{"status": "refused", "reason": "busy"}] * 2
    response = move(world, x=-10, z=-11)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "busy"


def test_a_coordinate_that_is_not_a_number_or_an_extra_field_is_422(world):
    assert move(world, x="1").status_code == 422
    assert move(world, x=True).status_code == 422
    assert move(world, actionUid="click-0001").status_code == 422


def test_a_friend_who_is_not_a_member_may_not_move_on_that_island(world):
    world.database.islands["FR3ND"] = {
        "player_id": "66666666-7777-4888-9999-000000000000",
        "code": "FR3ND",
        "wave_best": 0,
        "flags": 0,
    }
    response = move(world, code="ISLE-FR3ND")
    assert response.status_code in (403, 404)
    assert move_calls(world) == []
