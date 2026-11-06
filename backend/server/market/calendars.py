"""Opening hours of the stock markets, loaded from backend/content/market/calendars.json.

A real stock company can be traded only while its market is open: Monday to Friday, between the
opening and the closing time, and not on a holiday. The file lists each market with its local
hours, its closed days, its short days (an early close) and the UTC offset that holds for the
whole window (6 Nov to 31 Dec 2026, no clock change falls inside it). So the server needs no
timezone database to know whether New York is open.

session_at() answers one question for one market and one moment: is it open? If it is open, it
says when today's session began and when it ends. If it is closed, it says why (weekend, holiday,
outside_hours, or no_calendar when the moment is before or after the window), when the market
opens next (None if that lies beyond the window) and when its latest session ended (the call
rule in feed.py needs it). The island companies follow Binance and are always open.

A mistake in the file stops the server at start-up with a message that names the market and the
field, so a typo cannot hide until a player trades.

Used by: companies.py (is a market known?), feed.py (when to ask for prices), exchange.py (the
status of a company), messages.py (when does a market open?) and the tests.
"""

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

from server.market import CONTENT_FOLDER

CALENDARS_FILE = CONTENT_FOLDER / "calendars.json"

# The market id of the island companies: they follow Binance and never close.
ALWAYS = "always"
ALWAYS_NAME = "Around the clock"

# Why a market is closed.
WEEKEND = "weekend"
HOLIDAY = "holiday"
OUTSIDE_HOURS = "outside_hours"
NO_CALENDAR = "no_calendar"

MARKET_ID = re.compile(r"[a-z0-9-]{2,40}")
TIME_TEXT = re.compile(r"([01]\d|2[0-3]):([0-5]\d)")
OFFSET_TEXT = re.compile(r"([+-])(0\d|1[0-4]):([0-5]\d)")
ONE_DAY = timedelta(days=1)
SATURDAY = 5  # date.weekday() counts Monday as 0


class CalendarError(ValueError):
    """The calendar file has a problem. The message says where."""


@dataclass(frozen=True)
class ShortDay:
    """A day with an early close."""

    closes: time
    name: str


@dataclass(frozen=True)
class Market:
    """One stock market with its hours, all in its own local time."""

    id: str
    name: str
    time_zone: str  # for people and for the test that checks utc_offset
    utc_offset: timedelta  # holds for the whole window
    opens: time
    closes: time
    closed_days: Mapping[date, str]  # date -> name of the holiday
    short_days: Mapping[date, ShortDay]
    source: str  # where the hours were read
    valid_from: date
    valid_to: date


@dataclass(frozen=True)
class Session:
    """Is a market open at one moment? If not, why not and when does it open again?"""

    is_open: bool
    reason: str | None = None  # None while open, otherwise WEEKEND, HOLIDAY, ...
    holiday: str | None = None  # the name of the holiday, when the reason is HOLIDAY
    opens_at: datetime | None = None  # closed: the next opening inside the window (UTC)
    opened_at: datetime | None = None  # open: when today's session began (UTC)
    closes_at: datetime | None = None  # open: when today's session ends (UTC)
    last_close: datetime | None = None  # closed: when the latest session ended (UTC)


ALWAYS_OPEN = Session(is_open=True)


# --- the answer: is a market open now? ---


def hours_in_utc(market: Market, day: date) -> tuple[datetime, datetime]:
    """When the session of a trading day begins and ends, in UTC."""
    short_day = market.short_days.get(day)
    closes = market.closes if short_day is None else short_day.closes
    opening = datetime.combine(day, market.opens) - market.utc_offset
    closing = datetime.combine(day, closes) - market.utc_offset
    return opening.replace(tzinfo=UTC), closing.replace(tzinfo=UTC)


def day_off(market: Market, day: date) -> tuple[str, str | None] | None:
    """(reason, holiday name) if there is no trading on this day, otherwise None."""
    if day.weekday() >= SATURDAY:
        return WEEKEND, None
    if day in market.closed_days:
        return HOLIDAY, market.closed_days[day]
    return None


def next_opening_after(market: Market, day: date) -> datetime | None:
    """The opening of the next trading day after `day`, or None beyond the end of the window."""
    following = day + ONE_DAY
    while following <= market.valid_to:
        if day_off(market, following) is None:
            return hours_in_utc(market, following)[0]
        following += ONE_DAY
    return None


def last_closing_before(market: Market, day: date) -> datetime | None:
    """The closing of the latest trading day before `day`, or None before the window starts."""
    earlier = min(day - ONE_DAY, market.valid_to)
    while earlier >= market.valid_from:
        if day_off(market, earlier) is None:
            return hours_in_utc(market, earlier)[1]
        earlier -= ONE_DAY
    return None


def session_at(market: Market, now: datetime) -> Session:
    """Is `market` open at `now`? The local date is the UTC time plus the market's offset."""
    now = now.astimezone(UTC)
    today = (now + market.utc_offset).date()
    if today < market.valid_from:
        opens_at = next_opening_after(market, market.valid_from - ONE_DAY)
        return Session(False, NO_CALENDAR, opens_at=opens_at)
    if today > market.valid_to:
        last_close = last_closing_before(market, market.valid_to + ONE_DAY)
        return Session(False, NO_CALENDAR, last_close=last_close)

    last_close = last_closing_before(market, today)
    off = day_off(market, today)
    if off is not None:
        reason, holiday = off
        opens_at = next_opening_after(market, today)
        return Session(False, reason, holiday, opens_at=opens_at, last_close=last_close)

    opening, closing = hours_in_utc(market, today)
    if opening <= now < closing:
        return Session(True, opened_at=opening, closes_at=closing)
    if now < opening:
        return Session(False, OUTSIDE_HOURS, opens_at=opening, last_close=last_close)
    opens_at = next_opening_after(market, today)
    return Session(False, OUTSIDE_HOURS, opens_at=opens_at, last_close=closing)


@dataclass(frozen=True)
class Calendars:
    """All markets of the file, and the window they are valid for."""

    valid_from: date
    valid_to: date
    checked_on: date
    markets: Mapping[str, Market] = field(default_factory=dict)

    def session_at(self, market_id: str, now: datetime) -> Session:
        """The session of a market. The island companies' market ALWAYS is always open."""
        if market_id == ALWAYS:
            return ALWAYS_OPEN
        return session_at(self.markets[market_id], now)

    def market_name(self, market_id: str) -> str:
        if market_id == ALWAYS:
            return ALWAYS_NAME
        return self.markets[market_id].name


# --- reading the file ---


def read_text(entry: dict, name: str, where: str, shortest: int, longest: int) -> str:
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip():
        raise CalendarError(f"{where}: '{name}' must be text that is not empty.")
    if not shortest <= len(value) <= longest:
        raise CalendarError(f"{where}: '{name}' must be {shortest} to {longest} characters long.")
    return value


def read_date(value: object, name: str, where: str) -> date:
    """A date written 2026-11-06."""
    try:
        if not isinstance(value, str):
            raise ValueError
        return date.fromisoformat(value)
    except ValueError as error:
        raise CalendarError(f"{where}: '{name}' must be a real date like 2026-11-06.") from error


def read_time(value: object, name: str, where: str) -> time:
    """A time of day written 09:30."""
    match = TIME_TEXT.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        raise CalendarError(f"{where}: '{name}' must be a time like 09:30.")
    return time(int(match.group(1)), int(match.group(2)))


def read_offset(value: object, where: str) -> timedelta:
    """A UTC offset written -05:00 or +01:00."""
    match = OFFSET_TEXT.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        raise CalendarError(f"{where}: 'utcOffset' must look like -05:00 or +01:00.")
    offset = timedelta(hours=int(match.group(2)), minutes=int(match.group(3)))
    return -offset if match.group(1) == "-" else offset


def read_day_list(entry: dict, key: str, where: str, window: tuple[date, date]) -> list[dict]:
    """The closedDays or shortDays list: every item has a real date inside the window."""
    items = entry.get(key)
    if not isinstance(items, list):
        raise CalendarError(f"{where}: '{key}' must be a list (it may be empty).")
    seen: set[date] = set()
    for index, item in enumerate(items):
        place = f"{where}: {key}[{index}]"
        if not isinstance(item, dict):
            raise CalendarError(f"{place} must be an object.")
        day = read_date(item.get("date"), "date", place)
        if not window[0] <= day <= window[1]:
            raise CalendarError(
                f"{place}: 'date' {day} must be inside the calendar ({window[0]} to {window[1]})."
            )
        if day in seen:
            raise CalendarError(f"{where}: {key}: the date {day} is listed twice.")
        seen.add(day)
        read_text(item, "name", place, 1, 60)
    return items


def read_short_days(
    entry: dict, where: str, window: tuple[date, date], opens: time, closes: time
) -> dict[date, ShortDay]:
    """The short days: an early close that is after the opening and before the regular close."""
    short_days = {}
    for index, item in enumerate(read_day_list(entry, "shortDays", where, window)):
        place = f"{where}: shortDays[{index}]"
        early_close = read_time(item.get("closes"), "closes", place)
        if early_close >= closes:
            raise CalendarError(
                f"{place}: 'closes' {early_close:%H:%M} must be before the regular close."
            )
        if early_close <= opens:
            raise CalendarError(f"{place}: 'closes' {early_close:%H:%M} must be after the opening.")
        day = date.fromisoformat(item["date"])
        short_days[day] = ShortDay(early_close, item["name"])
    return short_days


def read_market(entry: object, position: int, window: tuple[date, date]) -> Market:
    """Check one market of the file and turn it into a Market."""
    where = f"markets[{position}]"
    if not isinstance(entry, dict):
        raise CalendarError(f"{where} must be an object.")
    market_id = entry.get("id")
    if not isinstance(market_id, str) or not MARKET_ID.fullmatch(market_id):
        raise CalendarError(f"{where}: 'id' must be 2 to 40 lowercase letters, digits or hyphens.")
    if market_id == ALWAYS:
        raise CalendarError(
            f"{where}: 'id' cannot be '{ALWAYS}': that name is for island companies."
        )
    where = f"market '{market_id}'"
    opens = read_time(entry.get("opens"), "opens", where)
    closes = read_time(entry.get("closes"), "closes", where)
    if opens >= closes:
        raise CalendarError(f"{where}: 'opens' must be before 'closes'.")
    source = read_text(entry, "source", where, 10, 200)
    if not source.startswith("https://"):
        raise CalendarError(f"{where}: 'source' must be a web address that starts with https://.")
    closed_days = {}
    for item in read_day_list(entry, "closedDays", where, window):
        closed_days[date.fromisoformat(item["date"])] = item["name"]
    short_days = read_short_days(entry, where, window, opens, closes)
    for day in closed_days.keys() & short_days.keys():
        raise CalendarError(f"{where}: the date {day} is both a closed day and a short day.")
    return Market(
        id=market_id,
        name=read_text(entry, "name", where, 2, 60),
        time_zone=read_text(entry, "timeZone", where, 3, 40),
        utc_offset=read_offset(entry.get("utcOffset"), where),
        opens=opens,
        closes=closes,
        closed_days=closed_days,
        short_days=short_days,
        source=source,
        valid_from=window[0],
        valid_to=window[1],
    )


def load_calendars(path: Path = CALENDARS_FILE) -> Calendars:
    """Read and check the calendar file. Raises CalendarError if anything is wrong."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise CalendarError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise CalendarError(f"{path.name} must be a JSON object.")
    valid_from = read_date(data.get("validFrom"), "validFrom", "calendar")
    valid_to = read_date(data.get("validTo"), "validTo", "calendar")
    checked_on = read_date(data.get("checkedOn"), "checkedOn", "calendar")
    if valid_from > valid_to:
        raise CalendarError("calendar: 'validFrom' must be not after 'validTo'.")
    entries = data.get("markets")
    if not isinstance(entries, list) or not entries:
        raise CalendarError("calendar: 'markets' must be a list of 1 or more markets.")
    markets = [
        read_market(entry, position, (valid_from, valid_to))
        for position, entry in enumerate(entries)
    ]
    if len({market.id for market in markets}) != len(markets):
        raise CalendarError("Two markets share the same 'id'.")
    return Calendars(valid_from, valid_to, checked_on, {market.id: market for market in markets})
