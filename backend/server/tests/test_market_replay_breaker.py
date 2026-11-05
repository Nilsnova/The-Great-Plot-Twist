"""How often does the circuit breaker trip on the recorded replay? The numbers are written here.

The replay is 90 real minutes (4 Nov 2026, 11:00 to 12:29 UTC, the time of the class). These tests
play it through the real price rules, one look per minute, and count the pauses. A pause is a
trip of the 30 % breaker: the company stops for 15 minutes.

Why this file exists: with the default multiplier of 100 a real move of just 0.3 % is a 30 % game
move. Nils asked for 100, so the team should see what it means. The numbers below are quoted in
docs/DECISIONS.md (D017). If a rule changes and these tests fail, change the quoted numbers too.
"""

import random
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from server.market.companies import load_companies
from server.market.feed import load_replay
from server.market.rules import LIVE, evaluate, price_limits

FIRST_MINUTE = datetime(2026, 11, 4, 11, 0, tzinfo=UTC)


def play(symbol: str, start_price, multiplier: int) -> tuple[int, int]:
    """Look at one company once per replay minute. Returns (pauses, minutes spent paused)."""
    base = None
    pauses = 0
    minutes_paused = 0
    was_paused = False
    for minute, real_price in enumerate(load_replay().closes[symbol]):
        now = FIRST_MINUTE + timedelta(minutes=minute)
        look = evaluate(base, start_price, real_price, LIVE, now, multiplier)
        base = look.base
        is_paused = look.halted_until is not None
        pauses += is_paused and not was_paused
        minutes_paused += is_paused
        was_paused = is_paused
    return pauses, minutes_paused


def pauses_by_company(multiplier: int) -> dict[str, int]:
    return {
        company.follows: play(company.symbol, company.start_price, multiplier)[0]
        for company in load_companies()
    }


def test_at_multiplier_100_the_breaker_trips_in_six_of_seven_companies_within_90_minutes():
    assert pauses_by_company(100) == {
        "BTC": 1,
        "ETH": 3,
        "SOL": 2,
        "XRP": 2,
        "BNB": 1,
        "EUR/USD": 0,
        "Gold": 1,
    }


def test_at_multiplier_100_that_is_10_pauses_in_all_in_one_class_slot():
    assert sum(pauses_by_company(100).values()) == 10


def test_at_multiplier_100_ether_spends_half_of_the_class_slot_paused():
    pauses, minutes_paused = play("ETHUSDT", load_companies()[1].start_price, 100)

    assert (pauses, minutes_paused) == (3, 45)


def test_at_multiplier_100_the_calm_euro_company_never_trips_and_gold_trips_once():
    companies = {company.follows: company for company in load_companies()}

    euro = play("EURUSDT", companies["EUR/USD"].start_price, 100)
    gold = play("PAXGUSDT", companies["Gold"].start_price, 100)

    assert euro == (0, 0)
    assert gold == (1, 15)


def test_at_multiplier_50_four_companies_trip_once():
    assert pauses_by_company(50) == {
        "BTC": 1,
        "ETH": 1,
        "SOL": 1,
        "XRP": 1,
        "BNB": 0,
        "EUR/USD": 0,
        "Gold": 0,
    }


def test_at_multiplier_30_only_solana_and_xrp_trip_once():
    pauses = pauses_by_company(30)

    assert pauses["SOL"] == pauses["XRP"] == 1
    assert sum(pauses.values()) == 2


def test_at_multiplier_20_nothing_trips_in_the_class_slot():
    assert sum(pauses_by_company(20).values()) == 0


@pytest.mark.parametrize("multiplier", [20, 30, 50, 100])
def test_a_price_never_leaves_the_band_of_30_percent_around_its_base_in_the_replay(multiplier):
    # The breaker holds a price at the limit, so even a jump cannot push it further.
    base = None
    for company in load_companies():
        base = None
        for minute, real_price in enumerate(load_replay().closes[company.symbol]):
            now = FIRST_MINUTE + timedelta(minutes=minute)
            look = evaluate(base, company.start_price, real_price, LIVE, now, multiplier)
            base = look.base
            assert abs(look.move_percent) <= 30
            assert look.price > 0


# --- days, not minutes: a price must never sink to one cent (found by the independent review) ---


def wander(company, multiplier: int, days: int, seed: int) -> list[Decimal]:
    """The prices of one company over `days` days, looked at once a minute.

    The real price takes a random step every minute. The steps are the recorded 1-minute moves,
    picked by a seeded random choice, with the trend of the recording taken out. The seed makes
    every run the same.
    """
    closes = load_replay().closes[company.symbol]
    steps = [closes[i + 1] / closes[i] for i in range(len(closes) - 1)]
    trend = (closes[-1] / closes[0]) ** (Decimal(1) / len(steps))
    steps = [step / trend for step in steps]
    chooser = random.Random(seed)
    real_price = Decimal(100)
    now = datetime(2026, 11, 20, 8, 0, tzinfo=UTC)
    base = None
    prices = []
    for _ in range(days * 24 * 60):
        real_price *= chooser.choice(steps)
        look = evaluate(base, company.start_price, real_price, LIVE, now, multiplier)
        if look.must_save:
            base = look.base
        prices.append(look.price)
        now += timedelta(minutes=1)
    return prices


@pytest.mark.parametrize("ticker", ["ETH", "SOL"])
def test_at_multiplier_100_a_price_stays_between_its_floor_and_its_ceiling_for_three_days(ticker):
    company = next(c for c in load_companies() if c.follows == ticker)
    floor, ceiling = price_limits(company.start_price)

    prices = wander(company, 100, days=3, seed=42)

    assert min(prices) >= floor
    assert max(prices) <= ceiling
    assert min(prices) > Decimal("0.01")


def test_at_multiplier_100_a_price_that_reaches_the_floor_can_still_move_again():
    # With the old floor (5 % of the base) a price stuck at one cent never moved again.
    company = next(c for c in load_companies() if c.follows == "ETH")
    floor, _ = price_limits(company.start_price)

    prices = wander(company, 100, days=5, seed=42)

    assert min(prices) == floor  # this run does reach the floor ...
    after_first_floor = prices[prices.index(floor) :]
    assert len(set(after_first_floor)) > 100  # ... and the price keeps moving afterwards
