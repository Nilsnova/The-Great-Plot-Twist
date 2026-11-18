"""The trusted perimeter policy extends wall placement without reinterpreting old saves."""

import pytest

from server.island import layout
from server.island.catalogue import Spot, load_island
from server.island.rules import plan_spots
from server.island.wall_cohort import is_inventory_wall_id

RULES = layout.load_layout()
PERIMETER = {"wall_rule_version": 1, "wall_capacity": 128}


def test_legacy_and_perimeter_reads_interpret_the_same_old_row_explicitly():
    stored = {"wall_11": (-4, -5.5)}
    legacy = layout.positions_of(RULES, stored)
    current = layout.positions_of(RULES, stored, **PERIMETER)
    assert legacy["wall_11"] != stored["wall_11"]
    assert layout.on_wall_lane(RULES, *legacy["wall_11"])
    assert current["wall_11"] == stored["wall_11"]
    assert layout.positions_of(RULES, current, **PERIMETER) == current


def test_admission_can_preserve_all_effective_legacy_positions():
    raw = {"wall_11": (-4, -5.5), "cannon_1": (19, 1)}
    effective = layout.positions_of(RULES, raw)
    assert effective["wall_2"] != (19, 1)
    assert layout.positions_of(RULES, effective, **PERIMETER) == effective


def test_added_inventory_does_not_reserve_cells_without_accepted_positions():
    stored = {"wall_13": (4, -19.5), "wall_128": (-4, -9), "wall_129": (6, 10)}
    assert len(layout.positions_of(RULES, {})) == 22
    assert len(layout.positions_of(RULES, {}, **PERIMETER)) == 22
    assert "wall_13" not in layout.positions_of(RULES, stored)
    placed = layout.positions_of(RULES, stored, **PERIMETER)
    assert len(placed) == 24 and "wall_129" not in placed
    assert placed["wall_13"] == stored["wall_13"]
    assert placed["wall_128"] == stored["wall_128"]
    assert layout.positions_of(RULES, placed, **PERIMETER) == placed


def test_added_inventory_views_keep_null_coordinates_until_positioned():
    catalogue = load_island()
    views = plan_spots(catalogue, {}, spots=(Spot("wall_13", ("wall",)),))
    empty = layout.place_spots(RULES, views, {}, **PERIMETER)[0]
    assert not empty.built and (empty.x, empty.z) == (None, None)
    placed = layout.place_spots(RULES, views, {"wall_13": (4, -19.5)}, **PERIMETER)[0]
    assert (placed.x, placed.z) == (4, -19.5)


def test_new_policy_is_separate_from_fixed_versus_stored_layout_version():
    empty = layout.info_of(RULES, {}, **PERIMETER)
    moved = layout.info_of(RULES, {"wall_13": (4, -19.5)}, **PERIMETER)
    assert (empty.version, moved.version) == (1, 2)
    assert (empty.wall_rule_version, empty.wall_capacity, empty.movable) == (1, 128, True)
    legacy = layout.info_of(RULES, {})
    assert (legacy.wall_rule_version, legacy.wall_capacity) == (0, 12)


@pytest.mark.parametrize("version,capacity", [(1, 12), (0, 128), (2, 128), (True, 128), (1, True)])
def test_unknown_policy_never_grants_permission_or_silently_downgrades(version, capacity):
    with pytest.raises(ValueError, match="Unsupported wall placement policy"):
        layout.positions_of(RULES, {}, wall_rule_version=version, wall_capacity=capacity)
    with pytest.raises(ValueError, match="Unsupported wall placement policy"):
        layout.check_move(
            RULES, {}, "wall_13", 4, -19.5, wall_rule_version=version, wall_capacity=capacity
        )


@pytest.mark.parametrize("spot", ["wall_1", "wall_13", "wall_128"])
def test_free_grid_accepts_both_existing_and_bounded_new_wall_ids_off_old_lanes(spot):
    positions = layout.positions_of(RULES, {}, **PERIMETER)
    assert not layout.on_wall_lane(RULES, 4, -19.5)
    layout.check_move(RULES, positions, spot, 4, -19.5, **PERIMETER)


@pytest.mark.parametrize(
    "spot,x,z,code",
    [
        ("wall_129", 4, -19.5, "no_such_spot"),
        ("wall_013", 4, -19.5, "no_such_spot"),
        ("wall_13", 4.25, -19.5, "off_grid"),
        ("wall_13", 0, 25, "not_on_land"),
        ("wall_13", 0, 2, "place_taken"),
        ("wall_13", -8, -6, "place_taken"),
    ],
)
def test_free_grid_preserves_identity_grid_land_and_occupancy_refusals(spot, x, z, code):
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(
            RULES, layout.positions_of(RULES, {}, **PERIMETER), spot, x, z, **PERIMETER
        )
    assert error.value.code == code


def test_accepted_inventory_uses_real_footprints_and_allows_edge_sharing():
    positions = layout.positions_of(RULES, {"wall_13": (-4, -9)}, **PERIMETER)
    assert layout.footprint_of(RULES, "wall_13") == 0
    assert layout.footprint_of(RULES, "wall_13", wall_capacity=128) == 2
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(RULES, positions, "wall_128", -3.5, -9, **PERIMETER)
    assert error.value.code == "place_taken"
    layout.check_move(RULES, positions, "wall_128", -2, -9, **PERIMETER)


@pytest.mark.parametrize(
    "spot",
    ["wall_0", "wall_12", "wall_013", "wall_129", "wall_١٣", "xwall_13", "wall_" + "9" * 5000],
)
def test_inventory_identity_is_canonical_and_bounded(spot):
    assert not is_inventory_wall_id(spot)
