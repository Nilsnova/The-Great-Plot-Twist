"""The plain-English texts of the Island Exchange: what the server says when it refuses something.

Every refusal is an ApiError with a short code the screen can check and a message in plain words.
The screen shows the server's message and has its own fallback line per code (docs/INTERFACES.md
lists every code). Times are written on the Lisbon clock, the clock of the team and the class
("It opens again on Friday 6 November at 14:30 Lisbon time"). Weekday and month names are written
out here, so the text does not depend on the language setting of the server.

Used by: trading.py and exchange.py (they raise these errors), routes/market.py (the notes on the
board) and the tests.
"""

from datetime import date, datetime

from server.errors import ApiError
from server.market.calendars import NO_CALENDAR, OUTSIDE_HOURS, WEEKEND, Calendars, Session
from server.market.companies import Company
from server.market.game_day import GAME_DAY_START_HOUR, lisbon_time
from server.market.positions import DAILY_STAKE_CAP_COINS, MAX_OPEN_POSITIONS

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

SIMULATION_NOTE = (
    "Simulation with play money. Real names and real prices, no real money and no prizes."
)


# --- times and names in words ---


def date_in_words(day: date) -> str:
    """A date such as "31 December 2026"."""
    return f"{day.day} {MONTHS[day.month - 1]} {day.year}"


def clock_in_words(moment: datetime) -> str:
    """A time of day on the Lisbon clock, such as "12:06 Lisbon time"."""
    return f"{lisbon_time(moment):%H:%M} Lisbon time"


def when_in_words(moment: datetime) -> str:
    """A moment such as "Friday 6 November at 14:30 Lisbon time"."""
    local = lisbon_time(moment)
    weekday = WEEKDAYS[local.weekday()]
    return f"{weekday} {local.day} {MONTHS[local.month - 1]} at {clock_in_words(moment)}"


def place_of(market_name: str) -> str:
    """The place of a market: its name before the brackets ("New York (NYSE and Nasdaq)")."""
    return market_name.split(" (")[0]


def demo_note(credit: str, recorded_on: date | None) -> str:
    """The label of demo mode. The recording is public, and the trades use real coins."""
    if recorded_on is None:
        what = f"recorded prices ({credit})"
    else:
        what = f"prices from {date_in_words(recorded_on)} ({credit})"
    return f"Demo recording: {what}, played back. Trades here use your real coins."


# --- the refusals ---


def feature_off() -> ApiError:
    return ApiError(404, "feature_off", "The Island Exchange is not open yet.")


def no_such_company() -> ApiError:
    return ApiError(404, "no_such_company", "There is no company with that id.")


def no_such_position() -> ApiError:
    return ApiError(404, "no_such_position", "You have no position with that id.")


def why_closed(session: Session) -> str:
    """The part of the sentence that says why a market is closed."""
    if session.reason == WEEKEND:
        return "closed now (it is the weekend)"
    if session.reason == OUTSIDE_HOURS:
        return "closed now (outside its hours)"
    if session.holiday is not None:
        return f"closed for {session.holiday}"
    return "closed now"


def market_closed(company: Company, calendars: Calendars, session: Session) -> ApiError:
    """A stock cannot be traded while its market is closed. Says when it opens again."""
    market_name = calendars.market_name(company.market)
    text = f"{company.name} trades in {place_of(market_name)}, which is {why_closed(session)}."
    if session.opens_at is not None and session.reason != NO_CALENDAR:
        text += f" It opens again on {when_in_words(session.opens_at)}."
    else:
        text += f" Its opening hours after {date_in_words(calendars.valid_to)} are not known yet."
    return ApiError(409, "market_closed", text)


def prices_stale(company: Company) -> ApiError:
    return ApiError(
        409,
        "prices_stale",
        f"The price of {company.name} is not up to date right now, so trading is paused. "
        "Try again in a moment.",
    )


def company_unavailable(company_name: str) -> ApiError:
    return ApiError(
        409,
        "company_unavailable",
        f"{company_name} cannot be traded right now: its prices are not connected.",
    )


def company_delisted(company: Company) -> ApiError:
    return ApiError(
        409,
        "company_delisted",
        f"{company.name} was delisted after the Relighting. "
        "You can still close your positions in it.",
    )


def daily_stake_cap(coins_left: int) -> ApiError:
    start = f"{GAME_DAY_START_HOUR:02d}:00 Lisbon time"
    return ApiError(
        409,
        "daily_stake_cap",
        f"You can put at most {DAILY_STAKE_CAP_COINS:,} coins into new positions per game day "
        f"(from {start}). You can still use {coins_left:,} coins today.",
    )


def too_many_positions() -> ApiError:
    return ApiError(
        409,
        "too_many_positions",
        f"You can have at most {MAX_OPEN_POSITIONS} open positions. Close one first.",
    )


def position_closed(closed_as: str, closed_at: datetime | None) -> ApiError:
    """The position is not open any more. Says how it closed and, if known, when."""
    when = "" if closed_at is None else f" at {clock_in_words(closed_at)}"
    if closed_as == "zeroed":
        how = f"it reached its zero point{when} and closed at zero"
    else:
        how = f"you closed it{when}"
    return ApiError(409, "position_closed", f"This position is already closed: {how}.")


def wrong_price_mode(price_mode: str) -> ApiError:
    """A position can only be closed on the kind of prices it was opened on (rule R20)."""
    if price_mode == "replay":
        where = "on the demo recording, so it can only be closed in demo mode"
    else:
        where = "on the live market, so it can only be closed there"
    return ApiError(409, "wrong_price_mode", f"This position was opened {where}.")


def outcome_unknown() -> ApiError:
    """The database did not answer in time, or its answer could not be read.

    The trade may or may not have gone through, so the player must look at the positions first.
    """
    return ApiError(
        503,
        "database_unavailable",
        "The database did not answer in time. Your trade may or may not have gone through: "
        "check your positions before you try again.",
    )
