"""Tests for market/states.py: what the board says about each company, and the sweep price list.

Pure functions with fixed readings and sessions: no network, no database, no clock.

The order of the checks (specs/L4-exchange-v2.md, section 4.6):
  1. unavailable  (source_off, not_in_recording, no_price)
  2. closed       (weekend, holiday, outside_hours, no_calendar)
  3. stale        (source_away, waiting_first_price, quote_old)
  4. open
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from server.market.calendars import ALWAYS_OPEN, Session
from server.market.companies import Company
from server.market.readings import (
    NO_READING,
    SOURCE_CACHE,
    SOURCE_LIVE,
    SOURCE_REPLAY,
    SOURCE_STALE,
    Reading,
)
from server.market.states import (
    MAX_QUOTE_LAG_SECONDS,
    sweep_prices,
)
from server.market.states import company_state as make_state

D = Decimal

ISLAND = Company(
    id="harbor-trust",
    name="Saltreach Harbor Trust",
    ticker="SHT",
    kind="island",
    follows="Bitcoin",
    symbol="BTCUSDT",
    market="always",
    currency="USDT",
    price_decimals=2,
    tagline="The old harbor bank.",
)
STOCK = Company(
    id="apple",
    name="Apple",
    ticker="AAPL",
    kind="stock",
    follows="Apple Inc. shares (Nasdaq)",
    symbol=None,
    market="us",
    currency="USD",
    price_decimals=2,
    tagline="Phones, laptops and the shop in every pocket.",
)
GREYFATHOM = Company(
    id="greyfathom-salvage",
    name="Greyfathom Salvage",
    ticker="GREY",
    kind="island",
    follows="Gold",
    symbol="PAXGUSDT",
    market="always",
    currency="USDT",
    price_decimals=2,
    tagline="Raises what the sea has taken.",
    delist_at_relighting=True,
)

# Monday 9 Nov 2026, 16:00 UTC: New York is open (14:30 to 21:00 UTC).
NOW = datetime(2026, 11, 9, 16, 0, tzinfo=UTC)
OPENED = datetime(2026, 11, 9, 14, 30, tzinfo=UTC)
CLOSES = datetime(2026, 11, 9, 21, 0, tzinfo=UTC)
OPEN_SESSION = Session(True, opened_at=OPENED, closes_at=CLOSES)
NIGHT = Session(
    False,
    "outside_hours",
    opens_at=datetime(2026, 11, 10, 14, 30, tzinfo=UTC),
    last_close=CLOSES,
)


def reading(source=SOURCE_LIVE, quoted_ago=1, fetched_ago=0, price="271.20") -> Reading:
    """A price quoted `quoted_ago` seconds before NOW and fetched `fetched_ago` seconds before."""
    return Reading(
        price=D(price),
        quoted_at=NOW - timedelta(seconds=quoted_ago),
        fetched_at=NOW - timedelta(seconds=fetched_ago),
        source=source,
    )


def state_of(company, price_reading, session, **overrides):
    options = {
        "source_on": True,
        "demo_mode": False,
        "relit": False,
        "trading_enabled": True,
    }
    options.update(overrides)
    return make_state(company, price_reading, session, **options)


# --- an island company ---


def test_an_island_company_with_a_fresh_price_is_open():
    state = state_of(ISLAND, reading(), ALWAYS_OPEN)

    assert (state.status, state.reason) == ("open", None)
    assert state.can_open is True
    assert state.can_close is True


def test_an_island_company_whose_source_is_away_is_stale_with_the_reason_source_away():
    state = state_of(ISLAND, reading(SOURCE_STALE, fetched_ago=120), ALWAYS_OPEN)

    assert (state.status, state.reason) == ("stale", "source_away")
    assert state.can_open is False
    assert state.can_close is False


def test_an_island_company_without_any_price_is_unavailable_with_the_reason_no_price():
    state = state_of(ISLAND, NO_READING, ALWAYS_OPEN)

    assert (state.status, state.reason) == ("unavailable", "no_price")
    assert state.can_open is False
    assert state.can_close is False


def test_the_state_keeps_the_reading_and_the_session_for_the_board():
    price_reading = reading()

    state = state_of(STOCK, price_reading, OPEN_SESSION)

    assert state.company is STOCK
    assert state.reading is price_reading
    assert state.session is OPEN_SESSION


def test_a_replayed_price_in_demo_mode_is_open_for_an_island_company():
    state = state_of(ISLAND, reading(SOURCE_REPLAY, quoted_ago=37), ALWAYS_OPEN, demo_mode=True)

    assert (state.status, state.reason) == ("open", None)


# --- a stock company ---


def test_a_stock_with_a_fresh_price_while_its_market_is_open_is_open():
    state = state_of(STOCK, reading(quoted_ago=2), OPEN_SESSION)

    assert (state.status, state.reason) == ("open", None)
    assert state.can_open is True


def test_a_stock_while_its_market_is_closed_is_closed_and_keeps_its_last_price():
    last_price = reading(SOURCE_CACHE, quoted_ago=3 * 3600, fetched_ago=3 * 3600)

    state = state_of(STOCK, last_price, NIGHT)

    assert (state.status, state.reason) == ("closed", "outside_hours")
    assert state.reading.price == D("271.20")
    assert state.session.opens_at == datetime(2026, 11, 10, 14, 30, tzinfo=UTC)
    assert (state.can_open, state.can_close) == (False, False)


def test_a_stock_on_a_holiday_is_closed_and_the_session_names_the_holiday():
    holiday = Session(
        False,
        "holiday",
        "Thanksgiving Day",
        opens_at=datetime(2026, 11, 27, 14, 30, tzinfo=UTC),
        last_close=datetime(2026, 11, 25, 21, 0, tzinfo=UTC),
    )

    state = state_of(STOCK, reading(SOURCE_CACHE), holiday)

    assert (state.status, state.reason) == ("closed", "holiday")
    assert state.session.holiday == "Thanksgiving Day"


@pytest.mark.parametrize("reason", ["weekend", "holiday", "outside_hours", "no_calendar"])
def test_every_closed_reason_of_the_calendar_is_the_reason_of_the_state(reason):
    closed = Session(False, reason)

    assert state_of(STOCK, reading(SOURCE_CACHE), closed).reason == reason


def test_a_stock_quoted_before_todays_opening_is_stale_waiting_for_the_first_price():
    yesterday_close = reading(quoted_ago=19 * 3600, fetched_ago=1)

    state = state_of(STOCK, yesterday_close, OPEN_SESSION)

    assert (state.status, state.reason) == ("stale", "waiting_first_price")
    assert state.can_open is False


def test_a_stock_quoted_exactly_at_the_opening_is_not_waiting():
    ten_seconds_later = OPENED + timedelta(seconds=10)
    quote_at_open = Reading(D("271.20"), OPENED, ten_seconds_later, SOURCE_LIVE)

    assert state_of(STOCK, quote_at_open, OPEN_SESSION).status == "open"


def test_a_stock_quoted_more_than_60_seconds_before_it_was_fetched_is_stale_with_quote_old():
    old_quote = reading(quoted_ago=MAX_QUOTE_LAG_SECONDS + 1, fetched_ago=0)

    state = state_of(STOCK, old_quote, OPEN_SESSION)

    assert (state.status, state.reason) == ("stale", "quote_old")


def test_a_stock_quoted_exactly_60_seconds_before_it_was_fetched_is_still_fine():
    assert MAX_QUOTE_LAG_SECONDS == 60

    assert state_of(STOCK, reading(quoted_ago=60, fetched_ago=0), OPEN_SESSION).status == "open"


def test_the_quote_lag_is_measured_from_the_fetch_not_from_now():
    # Fetched 50 seconds ago, quoted 100 seconds ago: the quote was 50 seconds old when fetched.
    cached = reading(SOURCE_CACHE, quoted_ago=100, fetched_ago=50)

    assert state_of(STOCK, cached, OPEN_SESSION).status == "open"


def test_a_stock_whose_provider_request_failed_is_stale_with_source_away():
    state = state_of(STOCK, reading(SOURCE_STALE, fetched_ago=300), OPEN_SESSION)

    assert (state.status, state.reason) == ("stale", "source_away")


def test_a_stock_without_a_source_is_unavailable_with_source_off():
    state = state_of(STOCK, NO_READING, OPEN_SESSION, source_on=False)

    assert (state.status, state.reason) == ("unavailable", "source_off")
    assert state.can_open is False


def test_a_stock_in_demo_mode_is_unavailable_because_it_is_not_in_the_recording():
    state = state_of(STOCK, NO_READING, OPEN_SESSION, source_on=False, demo_mode=True)

    assert (state.status, state.reason) == ("unavailable", "not_in_recording")


def test_an_island_company_is_never_a_stock_that_is_not_in_the_recording():
    state = state_of(ISLAND, reading(SOURCE_REPLAY), ALWAYS_OPEN, demo_mode=True)

    assert state.reason is None


# --- the order of the checks ---


def test_without_a_price_a_closed_stock_is_unavailable_and_not_closed():
    state = state_of(STOCK, NO_READING, NIGHT)

    assert (state.status, state.reason) == ("unavailable", "no_price")


def test_a_closed_market_wins_over_a_stale_price():
    state = state_of(STOCK, reading(SOURCE_STALE, fetched_ago=7200), NIGHT)

    assert (state.status, state.reason) == ("closed", "outside_hours")


def test_a_missing_source_wins_over_a_closed_market():
    state = state_of(STOCK, reading(SOURCE_CACHE), NIGHT, source_on=False)

    assert (state.status, state.reason) == ("unavailable", "source_off")


def test_a_stale_price_wins_over_a_quote_that_is_old():
    both = reading(SOURCE_STALE, quoted_ago=500, fetched_ago=400)

    assert state_of(STOCK, both, OPEN_SESSION).reason == "source_away"


def test_waiting_for_the_first_price_wins_over_an_old_quote():
    state = state_of(STOCK, reading(quoted_ago=20 * 3600, fetched_ago=1), OPEN_SESSION)

    assert state.reason == "waiting_first_price"


# --- can open and can close ---


def test_a_delisted_company_can_be_closed_but_not_opened():
    state = state_of(GREYFATHOM, reading(), ALWAYS_OPEN, relit=True)

    assert state.delisted is True
    assert (state.status, state.reason) == ("open", None)
    assert state.can_open is False
    assert state.can_close is True


def test_before_the_relighting_the_company_that_will_be_delisted_is_still_tradable():
    state = state_of(GREYFATHOM, reading(), ALWAYS_OPEN, relit=False)

    assert state.delisted is False
    assert state.can_open is True


def test_a_company_that_is_not_marked_is_never_delisted_after_the_relighting():
    assert state_of(ISLAND, reading(), ALWAYS_OPEN, relit=True).delisted is False


def test_while_the_flag_is_off_nothing_can_be_opened_or_closed():
    state = state_of(ISLAND, reading(), ALWAYS_OPEN, trading_enabled=False)

    assert (state.status, state.reason) == ("open", None)
    assert state.can_open is False
    assert state.can_close is False


def test_a_delisted_company_keeps_its_status_when_it_is_stale():
    state = state_of(GREYFATHOM, reading(SOURCE_STALE), ALWAYS_OPEN, relit=True)

    assert (state.status, state.delisted, state.can_close) == ("stale", True, False)


# --- the prices that close used-up positions ---


def test_the_sweep_price_list_holds_only_companies_that_are_open():
    open_island = state_of(ISLAND, reading(), ALWAYS_OPEN)
    closed_stock = state_of(STOCK, reading(SOURCE_CACHE), NIGHT)
    stale_gold = state_of(GREYFATHOM, reading(SOURCE_STALE), ALWAYS_OPEN)
    no_price = state_of(ISLAND, NO_READING, ALWAYS_OPEN)

    prices = sweep_prices([open_island, closed_stock, stale_gold, no_price])

    assert [price.company_id for price in prices] == ["harbor-trust"]


def test_a_sweep_price_carries_the_exact_price_the_quote_time_and_the_mode():
    quoted = NOW - timedelta(seconds=4)
    live = state_of(ISLAND, Reading(D("76159.21"), quoted, NOW, SOURCE_CACHE), ALWAYS_OPEN)

    (price,) = sweep_prices([live])

    assert price.company_id == "harbor-trust"
    assert price.price == D("76159.21")
    assert price.quoted_at == quoted
    assert price.mode == "live"


def test_a_replayed_price_is_swept_in_the_replay_mode():
    replayed = state_of(ISLAND, reading(SOURCE_REPLAY), ALWAYS_OPEN, demo_mode=True)

    (price,) = sweep_prices([replayed])

    assert price.mode == "replay"


def test_a_delisted_company_is_still_swept_because_its_positions_can_still_end():
    delisted = state_of(GREYFATHOM, reading(), ALWAYS_OPEN, relit=True)

    assert [price.company_id for price in sweep_prices([delisted])] == ["greyfathom-salvage"]


def test_nothing_is_swept_when_no_company_is_open():
    assert sweep_prices([]) == []
    assert sweep_prices([state_of(STOCK, NO_READING, NIGHT)]) == []
