"""Boss and late-wave loot (fix/playtest-1117, the owner): a boss wave pays 3 times, the boss
wave 40 5 times, and island waves above 40 half again (rounded down) before the boss multiplier;
the finisher and galleon bonuses ride on the base afterwards as before. The database works the
coins out from the plain arguments waves.loot_arguments folds; this checks what those pay."""

from dataclasses import dataclass

import pytest

from server.island import wave_events
from server.island.catalogue import load_island
from server.island.waves import loot_arguments


@dataclass
class Where:
    place: str
    wave: int
    seed: int = 1


def pays(arguments, wave, houses=0, boss=False, point=False):
    """What wave_finish / recovery_wave_finish pay for these arguments (a survived wave)."""
    if point:
        amount = arguments["p_point_loot_base"] + arguments["p_loot_per_wave"] * wave
    else:
        amount = (
            arguments["p_loot_base"]
            + arguments["p_loot_per_wave"] * wave
            + arguments["p_loot_per_house"] * houses
        )
    return amount * arguments["p_boss_multiplier"] if boss else amount


@pytest.mark.parametrize(
    ("wave", "normal", "boss"),
    [
        (10, 125, 375),
        (20, 225, 675),
        (30, 325, 975),
        (40, 365, 1825),
        (50, 607, 1821),
        (60, 667, 2001),
    ],
)
def test_island_loot_by_wave_normal_and_boss(wave, normal, boss):
    catalogue = load_island()
    arguments = loot_arguments(catalogue, Where("island", wave), None, True, False)
    assert pays(arguments, wave) == normal
    assert pays(arguments, wave, boss=True) == boss


def test_wave_41_is_raised_and_bonuses_are_added_after_the_raise_and_before_the_boss():
    catalogue = load_island()
    plain = loot_arguments(catalogue, Where("island", 41), None, True, False)
    assert pays(plain, 41) == 553  # floor(1.5 x 369)
    finisher = wave_events.bonus_base(["finisher"], 45)
    with_bonus = loot_arguments(catalogue, Where("island", 45), ["finisher"], True, False)
    assert with_bonus["p_boss_multiplier"] == 3
    assert pays(with_bonus, 45, boss=True) == ((385 * 3 // 2) + finisher) * 3
    forty = loot_arguments(catalogue, Where("island", 40), ["finisher"], True, False)
    assert pays(forty, 40, boss=True) == (365 + wave_events.bonus_base(["finisher"], 40)) * 5


def test_pirate_point_and_houses():
    catalogue = load_island()
    point = loot_arguments(catalogue, Where("pirate_point", 50), None, True, False)
    assert pays(point, 50, point=True) == 40 + 205 - 25 + 4 * 50  # the taper, no raise
    houses = loot_arguments(catalogue, Where("island", 42), None, True, False)
    assert pays(houses, 42, houses=4) == (205 + 4 * 42 + 10 * 4) * 3 // 2
