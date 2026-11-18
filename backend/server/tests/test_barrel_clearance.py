"""The moved unsaved barrel frees two wall cells while retaining its exact ground reserve."""

import pytest

from server.island import layout


def placement() -> tuple[layout.LayoutRules, dict[str, layout.Position]]:
    rules = layout.island_layout(True)
    placed = layout.positions_of(rules, {}, wall_rule_version=1, wall_capacity=128)
    return rules, placed


@pytest.mark.parametrize("z", [6, 8])
def test_western_corridor_cells_pass_the_authoritative_validator(z: float) -> None:
    rules, placed = placement()
    layout.check_move(rules, placed, "wall_13", -12.5, z, wall_rule_version=1, wall_capacity=128)


def test_the_new_barrel_base_still_refuses_a_paid_wall() -> None:
    rules, placed = placement()
    with pytest.raises(layout.MoveRefused) as error:
        layout.check_move(
            rules, placed, "wall_13", -10.5, 8, wall_rule_version=1, wall_capacity=128
        )
    assert error.value.code == "place_taken"


def test_the_barrel_reserve_moves_without_growing_or_becoming_a_tree() -> None:
    rules, _ = placement()
    barrel = next(row for row in rules.wall_obstacles if row.id == "barrel")
    assert (barrel.x, barrel.z, barrel.w, barrel.d, barrel.radius) == (-10.5, 8, 1.25, 0.75, 0)
