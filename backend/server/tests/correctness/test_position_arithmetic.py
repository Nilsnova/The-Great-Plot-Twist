"""Current spot-position valuation on seeded walks; no database, leverage or economy simulation.

The replacement 10x/zero-close position contract is pending on the Exchange implementation.
These tests exercise only the pure arithmetic exposed by today's position view.
"""

import math
import random
from datetime import UTC, datetime
from decimal import Decimal
from fractions import Fraction

import pytest

from server.market.companies import Company
from server.market.exchange import CompanyQuote, MarketService
from server.market.rules import Base, Evaluation
from server.market.store import PositionRow

NOW = datetime(2026, 11, 6, 12, tzinfo=UTC)
COMPANY = Company("g21-test", "Test Company", "TEST", "Test", "TESTUSDT", Decimal(10), "Test")


def quote_at(price: Decimal) -> CompanyQuote:
    base = Base(Decimal(10), Decimal(100), NOW, "live")
    evaluation = Evaluation(price, Decimal(0), None, base, False)
    return CompanyQuote(COMPANY, evaluation)


def expected_profit(price: Decimal, average: Decimal) -> Decimal:
    """Signed half-up percent rounding using exact fractions instead of Decimal.quantize."""
    percent = (Fraction(price) / Fraction(average) - 1) * 100
    sign = -1 if percent < 0 else 1
    return Decimal(sign * math.floor(abs(percent) * 100 + Fraction(1, 2))) / 100


@pytest.mark.parametrize("seed", [21, 2102, 0xC01A])
def test_seeded_position_marks_preserve_units_cost_and_exact_value(seed: int) -> None:
    rng = random.Random(seed)
    for _ in range(10):
        average = Decimal(rng.randint(400, 12_500)) / 100
        units = rng.choice([1, rng.randint(1, 100_000)])
        row = PositionRow(COMPANY.id, units, average, NOW, NOW)
        ticks = rng.randint(400, 12_500)
        previous_value = None
        previous_price = None
        for _ in range(100):
            ticks = max(1, ticks + rng.randint(-500, 500))
            price = Decimal(ticks) / 100
            quote = quote_at(price)
            view = MarketService.view_position(quote, row, NOW)
            assert view.value == math.floor(units * Fraction(price))
            assert view.profit_percent == expected_profit(price, average)
            assert view.row == row
            assert view.quote == quote
            assert row.units == units
            assert row.avg_price == average
            if price == average:
                assert view.profit_percent == 0
            if previous_price is not None:
                if price >= previous_price:
                    assert view.value >= previous_value
                else:
                    assert view.value <= previous_value
            previous_value, previous_price = view.value, price


@pytest.mark.parametrize(
    "price,percentage",
    [("199.97", "-0.02"), ("199.99", "-0.01"), ("200", "0"),
     ("200.01", "0.01"), ("200.03", "0.02")],
)
def test_profit_half_ties_round_away_from_zero(price: str, percentage: str) -> None:
    row = PositionRow(COMPANY.id, 1, Decimal(200), NOW, NOW)
    view = MarketService.view_position(quote_at(Decimal(price)), row, NOW)
    assert view.profit_percent == Decimal(percentage)
