"""Tests for market/messages.py: the plain-English texts of the refusals.

The server message is the plain words. The screen shows it and has its own fallback per code.
Times are written on the Lisbon clock ("14:30 Lisbon time"). Nothing here uses a clock or a network.
"""

from datetime import UTC, date, datetime

import pytest

from server.market import messages
from server.market.calendars import Session, load_calendars
from server.market.positions import DAILY_STAKE_CAP_COINS
from server.tests.market_helpers import island_company, stock_company

CALENDARS = load_calendars()
APPLE = stock_company("AAPL", name="Apple")


def utc(month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, month, day, hour, minute, tzinfo=UTC)


# --- times in plain words ---


def test_a_moment_is_written_with_the_weekday_the_date_and_the_lisbon_time():
    assert messages.when_in_words(utc(11, 6, 14, 30)) == "Friday 6 November at 14:30 Lisbon time"
    assert messages.when_in_words(utc(12, 28, 8, 0)) == "Monday 28 December at 08:00 Lisbon time"


def test_a_clock_time_is_written_hours_and_minutes_on_the_lisbon_clock():
    assert messages.clock_in_words(utc(11, 6, 12, 6)) == "12:06 Lisbon time"


def test_the_place_of_a_market_is_the_name_before_the_brackets():
    assert messages.place_of("New York (NYSE and Nasdaq)") == "New York"
    assert messages.place_of("Euronext (Amsterdam, Brussels, Lisbon, Paris)") == "Euronext"
    assert messages.place_of("Xetra") == "Xetra"


# --- a market that is closed ---


def test_outside_its_hours_the_message_says_where_it_trades_and_when_it_opens_again():
    session = Session(False, "outside_hours", opens_at=utc(11, 6, 14, 30))

    error = messages.market_closed(APPLE, CALENDARS, session)

    assert (error.status_code, error.code) == (409, "market_closed")
    assert error.message == (
        "Apple trades in New York, which is closed now (outside its hours). "
        "It opens again on Friday 6 November at 14:30 Lisbon time."
    )


def test_on_a_holiday_the_message_names_the_holiday():
    session = Session(False, "holiday", "Thanksgiving Day", opens_at=utc(11, 27, 14, 30))

    error = messages.market_closed(APPLE, CALENDARS, session)

    assert error.message == (
        "Apple trades in New York, which is closed for Thanksgiving Day. "
        "It opens again on Friday 27 November at 14:30 Lisbon time."
    )


def test_at_the_weekend_the_message_says_so():
    session = Session(False, "weekend", opens_at=utc(11, 9, 14, 30))

    error = messages.market_closed(APPLE, CALENDARS, session)

    assert "closed now (it is the weekend)" in error.message
    assert error.message.endswith("It opens again on Monday 9 November at 14:30 Lisbon time.")


def test_after_the_calendar_the_message_says_the_hours_are_not_known_yet():
    session = Session(False, "no_calendar")

    error = messages.market_closed(APPLE, CALENDARS, session)

    assert "Its opening hours after 31 December 2026 are not known yet." in error.message


def test_when_the_next_opening_is_beyond_the_calendar_the_message_says_the_same():
    session = Session(False, "outside_hours")  # opens_at is None

    error = messages.market_closed(APPLE, CALENDARS, session)

    assert error.message.endswith("Its opening hours after 31 December 2026 are not known yet.")


# --- the other refusals ---


def test_prices_that_are_not_up_to_date_pause_trading():
    error = messages.prices_stale(APPLE)

    assert (error.status_code, error.code) == (409, "prices_stale")
    assert error.message == (
        "The price of Apple is not up to date right now, so trading is paused. "
        "Try again in a moment."
    )


def test_a_company_without_a_connected_source_cannot_be_traded():
    error = messages.company_unavailable(APPLE.name)

    assert (error.status_code, error.code) == (409, "company_unavailable")
    assert error.message == "Apple cannot be traded right now: its prices are not connected."


def test_a_delisted_company_can_still_be_closed():
    gold = island_company("PAXGUSDT", name="Greyfathom Salvage")

    error = messages.company_delisted(gold)

    assert (error.status_code, error.code) == (409, "company_delisted")
    assert error.message == (
        "Greyfathom Salvage was delisted after the Relighting. "
        "You can still close your positions in it."
    )


def test_the_daily_cap_says_how_many_coins_are_left_today():
    error = messages.daily_stake_cap(380)

    assert (error.status_code, error.code) == (409, "daily_stake_cap")
    assert error.message == (
        "You can put at most 2,000 coins into new positions per game day (from 08:00 Lisbon "
        "time). You can still use 380 coins today."
    )
    assert DAILY_STAKE_CAP_COINS == 2000


def test_too_many_positions_asks_the_player_to_close_one():
    error = messages.too_many_positions()

    assert (error.status_code, error.code) == (409, "too_many_positions")
    assert error.message == "You can have at most 20 open positions. Close one first."


def test_a_position_the_player_closed_says_when():
    error = messages.position_closed("closed", utc(11, 6, 12, 6))

    assert (error.status_code, error.code) == (409, "position_closed")
    assert error.message == "This position is already closed: you closed it at 12:06 Lisbon time."


def test_a_position_that_reached_its_zero_point_says_so_and_when():
    error = messages.position_closed("zeroed", utc(11, 6, 10, 2))

    assert error.message == (
        "This position is already closed: it reached its zero point at 10:02 Lisbon time "
        "and closed at zero."
    )


@pytest.mark.parametrize("closed_as", ["closed", "zeroed"])
def test_a_position_closed_at_an_unknown_time_still_gets_a_message(closed_as):
    error = messages.position_closed(closed_as, None)

    assert error.message.startswith("This position is already closed")
    assert "Lisbon" not in error.message


def test_a_live_position_can_only_be_closed_on_the_live_market():
    error = messages.wrong_price_mode("live")

    assert (error.status_code, error.code) == (409, "wrong_price_mode")
    assert error.message == (
        "This position was opened on the live market, so it can only be closed there."
    )


def test_a_recording_position_can_only_be_closed_in_demo_mode():
    error = messages.wrong_price_mode("replay")

    assert error.message == (
        "This position was opened on the demo recording, so it can only be closed in demo mode."
    )


def test_the_not_found_errors_are_404s():
    assert (messages.no_such_company().status_code, messages.no_such_company().code) == (
        404,
        "no_such_company",
    )
    assert (messages.no_such_position().status_code, messages.no_such_position().code) == (
        404,
        "no_such_position",
    )
    assert messages.no_such_position().message == "You have no position with that id."


def test_an_unknown_outcome_tells_the_player_to_check_their_positions():
    error = messages.outcome_unknown()

    assert (error.status_code, error.code) == (503, "database_unavailable")
    assert error.message == (
        "The database did not answer in time. Your trade may or may not have gone through: "
        "check your positions before you try again."
    )


def test_the_feature_off_message():
    error = messages.feature_off()

    assert (error.status_code, error.code) == (404, "feature_off")
    assert error.message == "The Island Exchange is not open yet."


def test_a_date_is_written_in_words():
    assert messages.date_in_words(date(2026, 12, 31)) == "31 December 2026"


def test_the_demo_note_names_the_recording_day_and_the_credit():
    assert messages.demo_note("Binance Vision", date(2026, 11, 4)) == (
        "Demo recording: prices from 4 November 2026 (Binance Vision), played back. "
        "Trades here use your real coins."
    )


def test_the_demo_note_still_works_without_a_recording_day():
    assert messages.demo_note("Binance Vision", None) == (
        "Demo recording: recorded prices (Binance Vision), played back. "
        "Trades here use your real coins."
    )


def test_the_simulation_note_says_play_money_and_no_prizes():
    assert messages.SIMULATION_NOTE == (
        "Simulation with play money. Real names and real prices, no real money and no prizes."
    )
