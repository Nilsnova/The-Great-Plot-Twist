from fractions import Fraction

import pytest

from server.island.structure_recovery_rate import recovery_rate_factor


def test_rate_is_zero_during_a_reserved_wave() -> None:
    assert recovery_rate_factor(2, 2, "wall", "bastion", "mason_drill", False) == 0


def test_rate_combines_capped_owner_crew_and_workshops_with_tech() -> None:
    assert recovery_rate_factor(3, 4, "wall", "bastion", "mason_drill", True) == Fraction(81, 4)


def test_rate_supports_each_approved_wall_choice() -> None:
    assert recovery_rate_factor(0, 0, "wall", None, None, True) == Fraction(1, 1)
    assert recovery_rate_factor(0, 0, "wall", "quick_mend", None, True) == Fraction(2, 1)
    assert recovery_rate_factor(0, 0, "wall", "bastion", None, True) == Fraction(3, 1)
    assert recovery_rate_factor(2, 10, "wall", "quick_mend", "mason_drill", True) == Fraction(27, 2)
    assert recovery_rate_factor(2, 10, "wall", "bastion", "mason_drill", True) == Fraction(81, 4)


@pytest.mark.parametrize(
    ("wall_spec", "wall_research"),
    [("unknown", None), (None, "unknown")],
)
def test_rate_rejects_unrecognized_wall_choices(
    wall_spec: str | None, wall_research: str | None
) -> None:
    with pytest.raises(ValueError):
        recovery_rate_factor(0, 0, "wall", wall_spec, wall_research, True)


def test_rate_rejects_negative_source_counts_and_invalid_phase() -> None:
    with pytest.raises(ValueError):
        recovery_rate_factor(-1, 0, "wall", None, None, True)
    with pytest.raises(ValueError):
        recovery_rate_factor(0, -1, "wall", None, None, True)
    with pytest.raises(ValueError):
        recovery_rate_factor(0, 0, "wall", None, None, 1)


def test_only_the_equipped_wall_spec_applies_when_bastion_is_researched() -> None:
    assert recovery_rate_factor(2, 10, "wall", "quick_mend", None, True) == Fraction(9, 1)


def test_wall_only_modifiers_do_not_boost_towers() -> None:
    assert recovery_rate_factor(2, 10, "cannon", "quick_mend", "mason_drill", True) == Fraction(
        9, 2
    )


def test_other_valid_wall_choices_have_no_recovery_rate_bonus() -> None:
    assert recovery_rate_factor(0, 0, "wall", "stone", "thick_walls", True) == Fraction(1, 1)
