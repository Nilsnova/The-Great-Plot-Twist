"""VIS62 on the current (legacy, 12-wall) rules: a moved wall may not stand on a tree trunk or a
fixed prop, while saved coordinates and pirate routes do not depend on these reserves."""

from dataclasses import replace

import pytest

from server.island import layout

TRUNKS = [(-16, 0), (-13, -12), (-9, -17), (9, -17), (15, -8), (16, 2), (14, 11), (-12, 13)]


def test_explicit_legacy_wall_move_still_requires_its_lane_and_clear_ground():
    rules = replace(layout.island_layout(), wall_perimeter=frozenset(), wall_defaults={})
    placed = layout.positions_of(rules, {"wall_1": (-16, 0)})
    assert placed["wall_1"] == (-16, 0)  # Read/settlement keeps the old paid cell.
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(rules, placed, "wall_1", -16, 0)
    assert error.value.code == "place_taken"
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(rules, placed, "wall_1", -13, -10.5)
    assert error.value.code == "off_path"


@pytest.mark.parametrize("x,z", TRUNKS)
def test_every_lane_cell_on_a_trunk_is_refused(x, z):
    rules = layout.island_layout()
    placed = layout.positions_of(rules, {})
    try:
        layout.check_move(rules, placed, "wall_1", x, z)
    except layout.MoveRefused as error:
        assert error.code in {"place_taken", "off_path", "not_on_land"}
    else:
        pytest.fail(f"a wall was allowed on the tree at {x},{z}")


def test_saved_coordinates_and_routes_do_not_depend_on_scenery_reserves():
    rules = layout.island_layout()
    old = {"wall_10": (-16, 0)}
    placed = layout.positions_of(rules, old)
    without = replace(rules, wall_obstacles=())
    assert layout.positions_of(rules, old) == layout.positions_of(without, old)
    assert layout.route_open(rules, placed) == layout.route_open(without, placed)
