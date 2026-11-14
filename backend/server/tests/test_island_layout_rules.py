"""Tests for island/layout.py: the build grid of T36 (flexible placement, decision D041).

They prove the rules a move must pass (on the grid, on land, not on a fixed building or another
spot, a way from the heart to the beach) and that an old save, with no stored positions, turns
into the fixed spots of before, each on its own grid cell.

Used by: pytest (cd backend && uv run pytest).
"""

import json

import pytest

from server.island import layout
from server.island.catalogue import load_island

RULES = layout.load_layout()


def refused_code(spot_id: str, x: float, z: float, positions=None) -> str:
    placed = layout.positions_of(RULES, {}) if positions is None else positions
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(RULES, placed, spot_id, x, z)
    return error.value.code


# --- the file and the old saves ---


def test_the_file_lists_the_22_spots_of_islands_json_in_the_same_order():
    catalogue = load_island()
    assert [spot.spot for spot in RULES.spots] == [spot.id for spot in catalogue.spots]


def test_the_slot_of_every_spot_matches_the_kinds_islands_json_allows():
    catalogue = load_island()
    kinds = {spot.id: spot.kinds for spot in catalogue.spots}
    first = {"wall": "wall", "tower": "cannon", "watchtower": "watchtower", "house": "house"}
    for spot in RULES.spots:
        assert kinds[spot.spot][0] == first[spot.slot]


def test_an_old_save_with_no_stored_positions_stands_on_the_fixed_spots():
    placed = layout.positions_of(RULES, {})
    assert placed["wall_1"] == (-18.5, -4)
    assert placed["tower_1"] == (0, -14)
    assert len(placed) == 22


def test_every_fixed_spot_is_already_a_cell_of_the_grid():
    for spot in RULES.spots:
        assert layout.on_grid(RULES, spot.x) and layout.on_grid(RULES, spot.z), spot.spot


def test_the_fixed_layout_passes_every_rule_so_old_saves_stay_legal():
    placed = layout.positions_of(RULES, {})
    for spot in RULES.spots:
        layout.check_move(RULES, placed, spot.spot, spot.x, spot.z)
    assert layout.route_open(RULES, placed)


def test_a_stored_position_replaces_the_fixed_spot_and_unknown_plots_are_ignored():
    placed = layout.positions_of(RULES, {"cannon_1": (-10, -10), "pp_tower_1": (1, 1)})
    assert placed["cannon_1"] == (-10, -10)
    assert "pp_tower_1" not in placed


def test_the_layout_version_is_1_for_an_old_save_and_2_once_something_moved():
    assert layout.info_of(RULES, {}).version == 1
    assert layout.info_of(RULES, {"wall_1": (-17, -4)}).version == 2
    assert layout.info_of(RULES, None).movable is False


def test_a_broken_file_is_refused(tmp_path):
    data = json.loads(layout.CONTENT_FILE.read_text())
    data["spots"][0][1] = "castle"
    path = tmp_path / "island_layout.json"
    path.write_text(json.dumps(data))
    with pytest.raises(layout.LayoutFileError):
        layout.load_layout(path)


# --- a move ---


def test_a_move_to_a_free_grid_cell_on_land_is_allowed():
    placed = layout.positions_of(RULES, {})
    layout.check_move(RULES, placed, "cannon_1", -10, -10)


def test_an_unknown_spot_is_refused():
    assert refused_code("pp_tower_1", -10, -10) == "no_such_spot"


def test_a_place_between_two_grid_cells_is_refused():
    assert refused_code("cannon_1", -10.25, -10) == "off_grid"


def test_a_place_in_the_sea_is_refused():
    assert refused_code("cannon_1", -21, -10) == "not_on_land"
    assert refused_code("cannon_1", 0, 25) == "not_on_land"


def test_a_place_on_the_heart_or_a_fixed_building_is_refused():
    assert refused_code("wall_1", 0, 2) == "place_taken"
    assert refused_code("wall_1", -8, 4.5) == "place_taken"  # the cabin
    assert refused_code("wall_1", 8.5, 12) == "place_taken"  # the bell


def test_a_place_that_overlaps_another_spot_is_refused():
    # cannon_5 stands at (-15, -6); a 2-wide cannon one unit to its side overlaps it.
    assert refused_code("cannon_1", -14, -6) == "place_taken"


def test_two_walls_may_touch_side_by_side_to_make_a_line():
    # wall_10 stands at (-9.5, -1) and is 2 wide: a wall 2 units to its east only touches it.
    placed = layout.positions_of(RULES, {})
    layout.check_move(RULES, placed, "wall_11", -7.5, -1)


def test_a_building_may_stay_where_it_stands():
    placed = layout.positions_of(RULES, {})
    layout.check_move(RULES, placed, "house_1", 7, -6)


def test_towers_and_houses_may_not_cut_the_heart_off_from_the_beach():
    # Close a ring around the heart with every tower, the watchtower and both houses: the last
    # building that closes it is refused, because the boarders could no longer reach the heart.
    ring = {
        "cannon_1": (-3, -1),
        "cannon_2": (-1, -1),
        "cannon_3": (1, -1),
        "cannon_4": (3, -1),
        "cannon_5": (-3, 5),
        "cannon_6": (-1, 5),
        "cannon_7": (1, 5),
        "house_1": (4.5, 2),
        "house_2": (-4, 2),
    }
    placed = layout.positions_of(RULES, ring)
    assert layout.route_open(RULES, placed)
    assert refused_code("tower_1", 3.5, 5, placed) == "blocks_route"


def test_walls_never_block_the_route_because_boarders_break_them():
    ring = {
        f"wall_{n}": (x, z)
        for n, (x, z) in enumerate(
            [(-3, -1), (-1, -1), (1, -1), (3, -1), (-3, 5), (-1, 5), (1, 5), (3, 5)], start=1
        )
    }
    ring.update({"wall_9": (-3, 1), "wall_10": (-3, 3), "wall_11": (3, 1), "wall_12": (3, 3)})
    placed = layout.positions_of(RULES, ring)
    assert layout.route_open(RULES, placed)


def test_the_rules_check_the_footprint_of_the_slot():
    assert layout.footprint_of(RULES, "house_1") == 3
    assert layout.footprint_of(RULES, "wall_1") == 2
