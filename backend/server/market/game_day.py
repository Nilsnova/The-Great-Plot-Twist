"""The game day of the Island Exchange: it starts at 08:00 Lisbon time.

The daily stake cap (positions.py) counts the stakes a player opened since the latest game day
start, so this file answers one question: "when did the current game day begin?". Lisbon time is
the time of the team and the class. The same zone also writes times in plain words in the messages
the server sends (for example "It opens again at 14:30 Lisbon time").

The function is pure: it takes the current time as an argument, so a test can say "it is 07:59".

Used by: exchange.py (the daily cap and the start of the game day), messages.py (times in words)
and the tests.
"""

import logging
from datetime import UTC, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

GAME_DAY_TIMEZONE_NAME = "Europe/Lisbon"
GAME_DAY_START_HOUR = 8
GAME_DAY_STARTS_TEXT = f"{GAME_DAY_START_HOUR:02d}:00 {GAME_DAY_TIMEZONE_NAME}"


def load_game_day_timezone() -> tzinfo:
    """The timezone of the game day (Lisbon). Falls back to UTC if the server has no tz data.

    Lisbon is on UTC+0 in winter, so UTC gives the same 08:00 from the end of October to the end
    of March, which covers the whole class game. Only in summer would the fallback be one hour off.
    """
    try:
        return ZoneInfo(GAME_DAY_TIMEZONE_NAME)
    except ZoneInfoNotFoundError:
        logger.warning("No timezone database on this server: the game day uses UTC.")
        return UTC


GAME_DAY_TIMEZONE = load_game_day_timezone()


def game_day_start(now: datetime) -> datetime:
    """The latest 08:00 Lisbon time that is not after `now`, as a UTC time."""
    local_now = now.astimezone(GAME_DAY_TIMEZONE)
    start = datetime.combine(local_now.date(), time(GAME_DAY_START_HOUR), tzinfo=GAME_DAY_TIMEZONE)
    if start > local_now:
        yesterday = local_now.date() - timedelta(days=1)
        start = datetime.combine(yesterday, time(GAME_DAY_START_HOUR), tzinfo=GAME_DAY_TIMEZONE)
    return start.astimezone(UTC)


def lisbon_time(moment: datetime) -> datetime:
    """The same moment on the Lisbon clock, for writing a time in plain words."""
    return moment.astimezone(GAME_DAY_TIMEZONE)
