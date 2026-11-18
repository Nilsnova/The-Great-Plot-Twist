"""Prospective scenery refusal; old coordinates and receipt reconciliation remain readable."""

from dataclasses import replace

import pytest

from server.island import layout
from server.tests.test_island_move_routes import move, move_calls
from server.tests.test_wall_build_routes import intent, ready
from server.tests.test_wall_offer_routes import post

TRUNKS = [(-16, 0), (-13, -12), (-9, -17), (9, -17), (15, -8), (16, 2), (14, 11), (-12, 13)]
PROPS = [(4, 13), (-12, 7), (-3, 12), (-3.5, 2.5), (4, 5.5)]


@pytest.mark.parametrize("x,z", TRUNKS + PROPS)
def test_new_wall_cannot_share_a_tree_or_prop_ground_reserve(x, z):
    rules = layout.island_layout(True)
    placed = layout.positions_of(rules, {}, wall_rule_version=1, wall_capacity=128)
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(rules, placed, "wall_13", x, z, wall_rule_version=1, wall_capacity=128)
    assert error.value.code == "place_taken"


def test_clear_half_grid_cells_and_touching_wall_edges_still_work():
    rules = layout.island_layout(True)
    placed = layout.positions_of(
        rules, {"wall_14": (-11, -10.5)}, wall_rule_version=1, wall_capacity=128
    )
    layout.check_move(rules, placed, "wall_13", -13, -10.5, wall_rule_version=1, wall_capacity=128)
    with pytest.raises(layout.MoveRefused):
        layout.check_move(
            rules, placed, "wall_13", -13, -11, wall_rule_version=1, wall_capacity=128
        )


def test_explicit_legacy_wall_move_still_requires_its_lane_and_clear_ground():
    rules = layout.island_layout()
    placed = layout.positions_of(rules, {"wall_1": (-16, 0)})
    assert placed["wall_1"] == (-16, 0)  # Read/settlement keeps the old paid cell.
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(rules, placed, "wall_1", -16, 0)
    assert error.value.code == "place_taken"
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(rules, placed, "wall_1", -13, -10.5)
    assert error.value.code == "off_path"


def test_existing_coordinates_and_route_admission_do_not_depend_on_scenery_reserves():
    rules = layout.island_layout(True)
    old = {"wall_13": (-13, -12), "wall_10": (-16, 0)}
    placed = layout.positions_of(rules, old, wall_rule_version=1, wall_capacity=128)
    assert placed["wall_13"] == old["wall_13"]
    without = replace(rules, wall_obstacles=())
    assert layout.positions_of(rules, old) == layout.positions_of(without, old)
    assert layout.route_open(rules, placed) == layout.route_open(without, placed)
    layout.check_move(rules, placed, "wall_13", -13, -10.5, wall_rule_version=1, wall_capacity=128)


def test_quote_and_uncommitted_build_refuse_before_any_paid_rpc():
    game = ready()
    quoted = post(game, "quote", cells=[{"x": -13, "z": -12}])
    assert quoted.status_code == 409 and quoted.json()["error"]["code"] == "place_taken"
    body = {"placements": [{"spot": "wall_1", "x": -13, "z": -12}], "quotedTotal": 10,
            "islandEpoch": game.database.wall_epochs[next(iter(game.database.wall_epochs))],
            "actionUid": "scenery-paid-01"}
    built = post(game, "build", **body)
    assert built.status_code == 409 and built.json()["error"]["code"] == "place_taken"
    assert game.database.calls("island_wall_build") == []
    assert game.database.balance == 100 and game.database.wall_build_receipts == {}


def test_explicit_move_refuses_before_atomic_save():
    game = ready()
    moved = move(game, spot="wall_1", x=-13, z=-12)
    assert moved.status_code == 409 and moved.json()["error"]["code"] == "place_taken"
    assert move_calls(game) == []


def test_historical_overlapping_receipt_replays_before_current_geometry(monkeypatch):
    game = ready()
    original = layout.island_layout
    monkeypatch.setattr(
        layout, "island_layout", lambda more=False: replace(original(more), wall_obstacles=())
    )
    quoted = post(game, "quote", cells=[{"x": -13, "z": -12}])
    assert quoted.status_code == 200
    body = intent(quoted.json(), "historical-scenery-01")
    assert post(game, "build", **body).status_code == 200
    monkeypatch.setattr(layout, "island_layout", original)
    replay = post(game, "build", **body)
    assert replay.status_code == 200 and replay.json()["receipt"]["repeat"] is True
    assert replay.json()["island"]["coins"] == 90
    assert len(game.database.calls("island_wall_build")) == 1
