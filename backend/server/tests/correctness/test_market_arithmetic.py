"""Independent arithmetic checks for the current Exchange, using fixed-seed price walks.

Only pure quote/trade math is exercised here, not G12's economy or abuse controls. The 10x
position and zero-close replacement is not implemented on this base revision (see G21 report).
"""

import math
import random
from decimal import Decimal
from fractions import Fraction

import pytest

from server.market.rules import price_from_real
from server.market.trade_rules import buy_amounts, fee_for, sell_amounts


def assert_trade_arithmetic(units: int, price: Decimal) -> None:
    """Compare Decimal implementation with exact rational/integer arithmetic."""
    exact = units * Fraction(price)
    buy_gross, sell_gross = math.ceil(exact), math.floor(exact)
    # Two percent is exactly 1/50; this oracle does not call the production fee helper.
    buy_fee, sell_fee = (buy_gross + 49) // 50, (sell_gross + 49) // 50
    bought, sold = buy_amounts(units, price), sell_amounts(units, price)

    assert (bought.gross, bought.fee) == (buy_gross, buy_fee)
    assert (sold.gross, sold.fee) == (sell_gross, sell_fee)
    assert bought.paid_by_player == buy_gross + buy_fee
    assert sold.received_by_player == sell_gross - sell_fee
    assert 0 <= bought.gross - exact < 1
    assert 0 <= exact - sold.gross < 1
    assert sold.received_by_player < bought.paid_by_player


@pytest.mark.parametrize("seed", [21, 2102, 0xC01A])
def test_trade_rounding_and_fees_on_seeded_price_walks(seed: int) -> None:
    rng = random.Random(seed)
    price_ticks = 100_000  # each tick is 1/10000 coin, so many samples straddle whole coins
    previous_price = Decimal(price_ticks) / 10_000
    rises = falls = 0
    for _ in range(1000):
        delta = rng.randint(-1000, 1000)
        price_ticks = max(1, price_ticks + delta)
        price = Decimal(price_ticks) / 10_000
        rises += price > previous_price
        falls += price < previous_price
        units = rng.randint(1, 100_000)
        assert_trade_arithmetic(units, price)
        # A higher quote cannot lower either gross amount or a net sale receipt.
        low, high = sorted((price, previous_price))
        assert buy_amounts(units, low).paid_by_player <= buy_amounts(units, high).paid_by_player
        assert sell_amounts(units, low).received_by_player <= sell_amounts(
            units, high
        ).received_by_player
        previous_price = price
    assert rises > 300 and falls > 300


@pytest.mark.parametrize("units", [1, 7, 100_000])
@pytest.mark.parametrize("ticks", [1, 99, 100, 101, 4999, 5000, 5001, 9999, 10_000, 10_001])
def test_rounding_at_cent_and_whole_coin_boundaries(units: int, ticks: int) -> None:
    assert_trade_arithmetic(units, Decimal(ticks) / 100)


@pytest.mark.parametrize("price", ["0.0001", "0.9999", "1.0001", "49.9999", "50.0001"])
def test_subcent_quotes_do_not_round_in_the_players_favour(price: str) -> None:
    assert_trade_arithmetic(1, Decimal(price))


def test_fee_steps_on_each_side_of_every_whole_fee_boundary() -> None:
    for multiple in range(1, 2001):
        gross = multiple * 50
        assert fee_for(gross - 1) == multiple
        assert fee_for(gross) == multiple
        assert fee_for(gross + 1) == multiple + 1


@pytest.mark.parametrize("seed", [21, 2102, 0xC01A])
def test_current_amplified_quotes_match_rational_oracle_on_seeded_walks(seed: int) -> None:
    """Pin existing arithmetic, without pretending it implements leveraged positions."""
    rng = random.Random(seed)
    for multiplier in (20, 30, 100):
        start = Fraction(rng.randint(400, 12_500), 100)
        base = start
        real_ticks = rng.randint(1_000_000, 5_000_000)
        base_real = Fraction(real_ticks, 100)
        for _ in range(300):
            real_ticks = max(1, real_ticks + rng.randint(-10_000, 10_000))
            real = Fraction(real_ticks, 100)
            raw = base * (1 + multiplier * (real / base_real - 1))
            limited = max(start / 4, min(raw, start * 4))
            # Positive rational half-up to cents, independently of Decimal.quantize.
            rounded_cents = math.floor(limited * 100 + Fraction(1, 2))
            expected = Decimal(max(1, rounded_cents)) / 100
            actual = price_from_real(
                Decimal(base.numerator) / base.denominator,
                Decimal(base_real.numerator) / base_real.denominator,
                Decimal(real.numerator) / real.denominator,
                multiplier,
                Decimal(start.numerator) / start.denominator,
            )
            assert actual == expected
            assert actual.as_tuple().exponent == -2
