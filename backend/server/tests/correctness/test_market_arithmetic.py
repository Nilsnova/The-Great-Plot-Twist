"""Independent rational oracles for the live Exchange's 10x positions and fees.

The original G21 checkpoint covered retired spot trades. These seeded checks exercise the
current production functions directly; no compatibility module or alternate game model is used.
"""

import math
import random
from decimal import Decimal
from fractions import Fraction

import pytest

from server.market.positions import (
    closing_amounts,
    fee_for,
    opening_costs,
    position_value,
    zero_price,
)


def oracle_close(side: str, stake: int, entry: Decimal, price: Decimal, rate: int) -> tuple:
    """Multiply exact fractions; then floor value and ceil the stake's basis-point fee."""
    direction = 1 if side == "rising" else -1
    raw = stake * (1 + direction * 10 * (Fraction(price) / Fraction(entry) - 1))
    value = max(0, min(math.floor(raw), 1_000_000))
    fee = min((stake * rate + 9999) // 10_000, value)
    return value, fee, value - fee, raw <= 0


def assert_position_arithmetic(
    side: str, stake: int, entry: Decimal, price: Decimal, rate: int
) -> None:
    expected = oracle_close(side, stake, entry, price, rate)
    actual = closing_amounts(side, stake, entry, price, rate)
    assert (actual.value, actual.fee, actual.coins_change, actual.used_up) == expected
    assert position_value(side, stake, entry, price) == expected[0]
    expected_open_fee = (stake * rate + 9999) // 10_000
    assert opening_costs(stake, rate) == stake + expected_open_fee
    assert fee_for(stake, rate) == expected_open_fee
    assert 0 <= actual.fee <= actual.value <= 1_000_000
    assert actual.coins_change >= 0
    if actual.used_up:
        assert (actual.value, actual.fee, actual.coins_change) == (0, 0, 0)


@pytest.mark.parametrize("seed", [21, 2102, 0xC01A])
@pytest.mark.parametrize("side", ["rising", "falling"])
@pytest.mark.parametrize("rate", [100, 200], ids=("relit", "dark"))
def test_current_leveraged_position_value_and_fees_on_seeded_price_walks(seed, side, rate):
    rng = random.Random(seed)
    for _ in range(10):
        entry_ticks = rng.randint(1, 10_000_000)
        entry = Decimal(entry_ticks) / 100_000
        stake = rng.randint(10, 500)
        price_ticks = entry_ticks
        previous_price, previous_value = None, None
        for _ in range(100):
            price_ticks = max(1, price_ticks + rng.randint(-entry_ticks // 20, entry_ticks // 20))
            price = Decimal(price_ticks) / 100_000
            assert_position_arithmetic(side, stake, entry, price, rate)
            value = position_value(side, stake, entry, price)
            if previous_price is not None:
                low, high = sorted(((previous_price, previous_value), (price, value)))
                assert low[1] <= high[1] if side == "rising" else low[1] >= high[1]
            previous_price, previous_value = price, value


@pytest.mark.parametrize("stake", [10, 25, 50, 100, 250, 500])
@pytest.mark.parametrize("side", ["rising", "falling"])
@pytest.mark.parametrize("rate", [100, 200])
def test_zero_price_exact_boundary_and_one_eight_decimal_tick_on_each_side(stake, side, rate):
    entry = Decimal("200.00000000")
    exact_point = Fraction(entry) * (Fraction(9, 10) if side == "rising" else Fraction(11, 10))
    point = Decimal(exact_point.numerator) / exact_point.denominator
    assert zero_price(side, entry) == point
    for price in (point - Decimal("0.00000001"), point, point + Decimal("0.00000001")):
        assert_position_arithmetic(side, stake, entry, price, rate)
    assert closing_amounts(side, stake, entry, point, rate).used_up


@pytest.mark.parametrize("side", ["rising", "falling"])
@pytest.mark.parametrize("rate", [100, 200])
def test_huge_gaps_and_subcent_entries_preserve_caps_and_never_create_debt(side, rate):
    for entry in (Decimal("0.00000001"), Decimal("0.99999999"), Decimal("999999999999.99999999")):
        for price in (Decimal("0.00000001"), entry, Decimal("999999999999.99999999")):
            assert_position_arithmetic(side, 500, entry, price, rate)


@pytest.mark.parametrize("rate,step", [(100, 100), (200, 50)])
def test_fee_steps_on_both_sides_of_every_supported_stake_fee_boundary(rate, step):
    for stake in range(10, 501):
        assert fee_for(stake, rate) == (stake + step - 1) // step
