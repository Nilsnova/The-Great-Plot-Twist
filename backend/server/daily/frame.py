"""The daily frame: the game day, the bulletin day and the harbor week around one moment.

Three clocks tick in the game, all on Lisbon time (lisbon_time.py has the details):

    game day       from 00:00 to 24:00. Daily caps count between `started_at` and `next_day_at`.
    bulletin day   from 08:00 to 08:00. The bulletin is published at `published_at`, and the Island
                   Exchange starts its market day then too.
    harbor week    from Monday 00:00. Weekly things reset at `next_harbor_week_at`.

A day can be 23 or 25 hours long on the two clock-change days of the year, so every boundary is
worked out on the Lisbon clock and given as a UTC time. All intervals are half open: at exactly
00:00, 08:00 or Monday 00:00 the new one has begun.

Which things reset is not here. It is a list in bulletin.json (`resets`), so the text can be
changed without touching code. The day seed, for loops that need a random choice per day, is
`int(day.strftime("%Y%m%d"))`, plus the player id where a loop needs one per player. It is defined
here and built by its first user (the driftline).

Pure function: no network, no clock of its own. The caller passes `now`.

Used by: routes/bulletin.py (the `day` object), daily/bulletin.py (which bulletin day it is) and
the tests.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from server.lisbon_time import (
    BULLETIN_HOUR,
    at_lisbon_hour,
    bulletin_day,
    game_day,
    harbor_week,
)

ONE_DAY = timedelta(days=1)
ONE_WEEK = timedelta(days=7)
MIDNIGHT = 0


@dataclass(frozen=True)
class DayFrame:
    """The day, the bulletin day and the harbor week that contain one moment."""

    day: date  # the id of the game day: the Lisbon date
    started_at: datetime  # 00:00 Lisbon time of that date, in UTC
    next_day_at: datetime
    bulletin_day: date  # the date of the latest 08:00 that is not after the moment
    published_at: datetime  # that 08:00, in UTC
    next_bulletin_at: datetime
    harbor_week: date  # the Monday of the Lisbon week
    next_harbor_week_at: datetime


def day_frame(now: datetime) -> DayFrame:
    """The frame around `now`. A time without a timezone is refused (ValueError)."""
    day = game_day(now)
    published = bulletin_day(now)
    week = harbor_week(now)
    return DayFrame(
        day=day,
        started_at=at_lisbon_hour(day, MIDNIGHT),
        next_day_at=at_lisbon_hour(day + ONE_DAY, MIDNIGHT),
        bulletin_day=published,
        published_at=at_lisbon_hour(published, BULLETIN_HOUR),
        next_bulletin_at=at_lisbon_hour(published + ONE_DAY, BULLETIN_HOUR),
        harbor_week=week,
        next_harbor_week_at=at_lisbon_hour(week + ONE_WEEK, MIDNIGHT),
    )
