from fractions import Fraction

import pytest

from server.island.structure_health import FULL_HP_UNITS, project_hp_units, settle_hp_units


def test_health_projection_is_pure_and_floors_only_the_projected_delta() -> None:
    assert project_hp_units(500_000, 300_000, Fraction(1, 1)) == 1_000_000
    assert project_hp_units(500_000, 150_000, Fraction(1, 1)) == 750_000


def test_projection_pauses_for_a_reserved_wave() -> None:
    assert project_hp_units(500_000, 600_000, Fraction(0, 1)) == 500_000


def test_destroyed_structures_recover_between_waves_but_pause_in_a_reservation() -> None:
    assert project_hp_units(0, 600_000, Fraction(1, 1)) == FULL_HP_UNITS
    assert project_hp_units(0, 600_000, Fraction(0, 1)) == 0


def test_projection_rejects_hp_outside_the_normalized_range() -> None:
    with pytest.raises(ValueError):
        project_hp_units(FULL_HP_UNITS + 1, 1, Fraction(1, 1))


def test_settlement_advances_anchor_even_when_recovery_is_paused() -> None:
    assert settle_hp_units(500_000, 100, 900_100, Fraction(0, 1)) == (500_000, 900_100)


def test_settlement_never_moves_an_anchor_backwards() -> None:
    assert settle_hp_units(500_000, 1_000, 900, Fraction(1, 1)) == (500_000, 1_000)


def test_settlement_clamps_to_full_health() -> None:
    assert settle_hp_units(999_999, 10, 600_010, Fraction(1, 1)) == (1_000_000, 600_010)
