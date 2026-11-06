"""Lisbon time: which game day, bulletin day and harbor week a moment belongs to.

Everything in the game that resets on a schedule uses the clock of Lisbon (Europe/Lisbon), not the
server's clock and not a fixed offset. Lisbon is on UTC+0 until 01:00 UTC on Sunday 28 March 2027,
then on UTC+1 until 01:00 UTC on Sunday 31 October 2027, and the zone database knows both changes.
So a day can be 23 or 25 hours long, and nothing here counts hours by hand.

Three kinds of "day", all pure functions of one moment (no network, no clock of their own):

    game day       the Lisbon date, from 00:00 to 24:00. Daily caps reset when it changes.
    bulletin day   from 08:00 to 08:00. The harbor bulletin is published at 08:00, and the Island
                   Exchange starts its market day then too (market/rules.py agrees, and a test
                   checks it).
    harbor week    from Monday 00:00. Weekly things reset when it changes.

All intervals are half open: at exactly 00:00, 08:00 or 18:00 the new day, bulletin day or night
has already begun.

If the server has no timezone database, the fallback is UTC, with a warning in the log. That is
right until 28 March 2027 and one hour off in summer (docs/DECISIONS.md, the open-world entry, says
what to do before then: add the `tzdata` package).

Used by: weather/nights.py (where a night starts and ends), daily/frame.py (the day, bulletin day
and week), daily/chapter_two_hook.py and the tests.
"""

import logging
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

LISBON_ZONE_NAME = "Europe/Lisbon"
BULLETIN_HOUR = 8  # the bulletin is published at 08:00; the Exchange's market day starts then too
WEEK_STARTS_ON = 0  # Monday, as date.weekday() counts (Monday is 0, Sunday is 6)

DAYS_PER_WEEK = 7


def load_lisbon_zone() -> tzinfo:
    """The Lisbon time zone. Falls back to UTC if the server has no timezone database."""
    try:
        return ZoneInfo(LISBON_ZONE_NAME)
    except ZoneInfoNotFoundError:
        logger.warning("No timezone database on this server: Lisbon time uses UTC.")
        return UTC


LISBON = load_lisbon_zone()


def to_lisbon(moment: datetime) -> datetime:
    """The same moment on the clock of Lisbon. A time without a timezone is refused."""
    if moment.tzinfo is None:
        raise ValueError("A time without a timezone cannot be turned into Lisbon time.")
    return moment.astimezone(LISBON)


def at_lisbon_hour(day: date, hour: int) -> datetime:
    """That wall-clock hour in Lisbon on that date, as a UTC time.

    at_lisbon_hour(date(2026, 11, 5), 8) is 08:00 UTC, and in summer 08:00 Lisbon time is 07:00 UTC.
    """
    return datetime.combine(day, time(hour), tzinfo=LISBON).astimezone(UTC)


def game_day(moment: datetime) -> date:
    """The id of the game day: the Lisbon date of this moment."""
    return to_lisbon(moment).date()


def bulletin_day(moment: datetime) -> date:
    """The date of the latest 08:00 Lisbon time that is not after this moment."""
    day = game_day(moment)
    if at_lisbon_hour(day, BULLETIN_HOUR) > moment:
        return day - timedelta(days=1)
    return day


def harbor_week(moment: datetime) -> date:
    """The Monday of the Lisbon week this moment belongs to."""
    day = game_day(moment)
    return day - timedelta(days=(day.weekday() - WEEK_STARTS_ON) % DAYS_PER_WEEK)
