"""Stake rules: the numbers of the prediction desk and its small pure checks.

Pure Python: no network, no database, no clock of its own. The tests check every rule with fixed
numbers (backend/server/tests/test_prediction_stake_rules.py).

The rules, in plain words
  * One stake is 1 to 50 whole coins. A captain stakes once per question, and at most 200 coins
    per day. The day starts at midnight Lisbon time.
  * 5 % of the losing side of a pool leaves the game (pools.py).
  * Every question has its own closing time. It is at least 60 minutes before the moment that
    decides the question (checked when the list of questions is loaded). A question closes
    earlier if Manifold closes it or decides it. The earliest of all the closing times we know
    counts. The database keeps the closing time it was given at the first stake and never
    changes it, so a stored closing time never moves later; at every stake the earlier of that
    and the one the server knows at that moment counts.
  * A stake needs a real reading of Manifold. A reading that is older than 15 minutes and only
    "stale" (the last good answer, because Manifold cannot be reached) is still shown, but nobody
    may stake on it: the market may have been decided since, and a captain who had read the news
    would know more than the desk does.

Who enforces what: this file works out the numbers and checks one stake before the database is
asked. The rules that depend on earlier stakes (one per question, the daily cap) and on a pool that
changes at the same moment are checked by the database function prediction_place_stake() in the
same step that moves the coins. It is given the limits below as arguments, so the numbers live in
one place: here.

The time zone loader has the same fallback as market/rules.py, but this file keeps its own copy:
the Island Exchange is being reworked, so nothing is imported from market/.

Used by: desk.py (checks a stake and works out the day), questions.py (the 60 minutes), store.py
(the limits it passes to the database) and the tests.
"""

import logging
from datetime import UTC, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from server.errors import ApiError

logger = logging.getLogger(__name__)

# --- The numbers that make the rules. Change them here and nowhere else. ---

MIN_STAKE = 1  # coins
MAX_STAKE = 50  # coins on one question
DAILY_STAKE_CAP = 200  # coins per Lisbon day, counted from prediction_stakes
POOL_CUT_PERCENT = 5  # of the LOSING side of a pool (chosen here, see D025)
MIN_MINUTES_BEFORE_EVENT = 60  # a question closes at least this long before it is decided
SETTLE_GRACE_MINUTES = 60  # automatic settlement only (after the minimum): wait this long
STALE_LIMIT_FOR_STAKE = timedelta(minutes=15)  # oldest "stale" reading a stake may use (see D025)
DESK_TIMEZONE_NAME = "Europe/Lisbon"


class StakeRefused(ApiError):
    """A stake the rules do not allow. Nothing was changed."""


def load_desk_timezone(name: str = DESK_TIMEZONE_NAME) -> tzinfo:
    """The time zone of the desk day (Lisbon). Falls back to UTC if the server has no tz data.

    Lisbon is on UTC+0 in winter, so UTC gives the same midnight from the end of October to the
    end of March, which covers the whole class game. Only in summer would the fallback be an hour
    off.
    """
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        logger.warning("No timezone database on this server: the prediction desk day uses UTC.")
        return UTC


DESK_TIMEZONE = load_desk_timezone()


def check_stake_amount(amount: int) -> None:
    """A stake is from MIN_STAKE to MAX_STAKE whole coins. Raises a 422 StakeRefused if not."""
    if amount < MIN_STAKE:
        raise StakeRefused(422, "stake_too_small", f"A stake must be at least {MIN_STAKE} coin.")
    if amount > MAX_STAKE:
        raise StakeRefused(
            422, "stake_too_big", f"You can stake at most {MAX_STAKE} coins on one question."
        )


def desk_day_start(now: datetime, desk_timezone: tzinfo = DESK_TIMEZONE) -> datetime:
    """The latest 00:00 in Lisbon, as a UTC time. The daily cap counts stakes from here on."""
    local_now = now.astimezone(desk_timezone)
    local_midnight = datetime.combine(local_now.date(), time(0, 0), tzinfo=desk_timezone)
    return local_midnight.astimezone(UTC)


def effective_closes_at(*times: datetime | None) -> datetime:
    """The earliest of the closing times that are known. A time that is None is left out."""
    known = [moment for moment in times if moment is not None]
    if not known:
        raise ValueError("effective_closes_at needs at least one closing time.")
    return min(known)


def is_staking_open(closes_at: datetime, now: datetime) -> bool:
    """True before the closing time. At exactly the closing time staking is closed."""
    return now < closes_at


def coins_left_today(staked_today: int) -> int:
    """The coins a captain may still stake today. Never below 0."""
    return max(0, DAILY_STAKE_CAP - staked_today)
