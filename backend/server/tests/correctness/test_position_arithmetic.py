"""Seeded current portfolio valuations retain stored positions and server-owned 10x math.

The independent exact-fraction oracle is shared only among these new correctness tests.
"""

import math
import random
from datetime import UTC, datetime
from decimal import Decimal
from fractions import Fraction

import pytest

from server.market.board import Snapshot
from server.market.calendars import ALWAYS_OPEN
from server.market.companies import Company
from server.market.portfolio import view_position
from server.market.positions import fee_for, profit_percent, zero_price
from server.market.readings import Reading
from server.market.states import CompanyState
from server.market.store import PositionRow
from server.routes.market import position_out
from server.tests.correctness.test_market_arithmetic import oracle_close

NOW = datetime(2026, 11, 6, 12, tzinfo=UTC)
COMPANY = Company(
    "g21-test",
    "Test Company",
    "TEST",
    "island",
    "Test instrument",
    "TESTUSDT",
    "always",
    "USDT",
    8,
    "A test company.",
)


def snapshot_at(price: Decimal, relit: bool) -> Snapshot:
    state = CompanyState(
        COMPANY, Reading(price, NOW, NOW, "live"), ALWAYS_OPEN, "open", None, False, True
    )
    return Snapshot((state,), NOW, relit, True, False)


def expected_profit(value: int, stake: int) -> Decimal:
    percent = Fraction(value - stake, stake) * 100
    sign = -1 if percent < 0 else 1
    return Decimal(sign * math.floor(abs(percent) * 100 + Fraction(1, 2))) / 100


def row_for(side: str, stake: int, entry: Decimal, rate: int) -> PositionRow:
    return PositionRow(
        "00000000-0000-4000-8000-000000000021",
        COMPANY.id,
        side,
        "live",
        stake,
        entry,
        zero_price(side, entry),
        fee_for(stake, rate),
        NOW,
        "open",
        None,
        None,
        None,
        None,
    )


@pytest.mark.parametrize("seed", [21, 2102, 0xC01A])
@pytest.mark.parametrize("side", ["rising", "falling"])
@pytest.mark.parametrize("relit", [False, True], ids=("dark", "relit"))
def test_seeded_portfolio_marks_preserve_position_and_exact_leveraged_value(seed, side, relit):
    rng = random.Random(seed)
    rate = 100 if relit else 200
    for _ in range(10):
        entry = Decimal(rng.randint(400, 12_500)) / 100
        stake = rng.randint(10, 500)
        row = row_for(side, stake, entry, rate)
        ticks = int(entry * 100)
        for _ in range(100):
            ticks = max(1, ticks + rng.randint(-500, 500))
            price = Decimal(ticks) / 100
            view = view_position(row, snapshot_at(price, relit), "live")
            value, fee, received, used_up = oracle_close(side, stake, entry, price, rate)
            assert view.row is row and view.price == price and view.can_close
            assert (
                view.closing.value,
                view.closing.fee,
                view.closing.coins_change,
                view.closing.used_up,
            ) == (value, fee, received, used_up)
            assert view.result == received - stake - row.open_fee
            assert profit_percent(value, stake) == expected_profit(value, stake)
            public = position_out(view)
            assert public.value == value and public.closeFee == fee
            assert public.wouldReceive == received and public.result == view.result
            assert public.profitPercent == float(expected_profit(value, stake))
            assert row.stake == stake and row.entry_price == entry and row.status == "open"


@pytest.mark.parametrize(
    "value,stake,percentage",
    [
        (0, 100, "-100.00"),
        (1, 20000, "-100.00"),
        (3, 20000, "-99.99"),
        (100, 100, "0.00"),
        (20001, 20000, "0.01"),
        (20003, 20000, "0.02"),
    ],
)
def test_profit_half_ties_round_away_from_zero(value, stake, percentage):
    assert profit_percent(value, stake) == Decimal(percentage) == expected_profit(value, stake)
