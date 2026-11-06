"""Tests for lisbon_time.py: the game day, the bulletin day and the harbor week.

No network and no real clock: the "now" of every test is written out. Lisbon changes its clocks on
Sunday 28 March 2027 at 01:00 UTC (winter to summer time) and on Sunday 31 October 2027 at 01:00
UTC (summer to winter time). Tests that depend on the summer time are skipped on a computer
without a timezone database (the server then uses UTC and says so).
"""

import logging
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from server import lisbon_time
from server.lisbon_time import (
    BULLETIN_HOUR,
    at_lisbon_hour,
    bulletin_day,
    game_day,
    harbor_week,
    load_lisbon_zone,
    to_lisbon,
)
from server.market.game_day import game_day_start as market_day_start
from server.tests.helpers import needs_lisbon_timezone


def utc(*parts: int) -> datetime:
    """A UTC time: utc(2026, 11, 5, 12, 0) is 12:00 UTC on 5 Nov 2026."""
    return datetime(*parts, tzinfo=UTC)


# --- the game day: the Lisbon date ---


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2026, 11, 5, 23, 59, 59), date(2026, 11, 5)),
        (utc(2026, 11, 6, 0, 0, 0), date(2026, 11, 6)),
    ],
)
def test_a_winter_moment_has_the_same_date_in_lisbon_and_utc(moment, expected):
    assert game_day(moment) == expected


@needs_lisbon_timezone
@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2027, 7, 1, 22, 59, 59), date(2027, 7, 1)),
        (utc(2027, 7, 1, 23, 30, 0), date(2027, 7, 2)),
    ],
)
def test_in_summer_23_30_utc_is_already_the_next_day(moment, expected):
    assert game_day(moment) == expected


@needs_lisbon_timezone
def test_caps_reset_at_lisbon_midnight():
    # The day the clocks go forward (28 Mar 2027) runs from 00:00 UTC to 23:00 UTC: 23 hours.
    starts = at_lisbon_hour(date(2027, 3, 28), 0)
    ends = at_lisbon_hour(date(2027, 3, 29), 0)

    assert starts == utc(2027, 3, 28, 0, 0)
    assert ends == utc(2027, 3, 28, 23, 0)
    assert ends - starts == timedelta(hours=23)
    assert game_day(ends - timedelta(seconds=1)) == date(2027, 3, 28)
    assert game_day(ends) == date(2027, 3, 29)


@needs_lisbon_timezone
def test_the_october_clock_change_day_lasts_25_hours():
    starts = at_lisbon_hour(date(2027, 10, 31), 0)
    ends = at_lisbon_hour(date(2027, 11, 1), 0)

    assert starts == utc(2027, 10, 30, 23, 0)
    assert ends == utc(2027, 11, 1, 0, 0)
    assert ends - starts == timedelta(hours=25)


@pytest.mark.parametrize(
    ("day", "hour", "expected"),
    [
        (date(2026, 11, 5), 8, utc(2026, 11, 5, 8, 0)),
        (date(2026, 11, 5), 0, utc(2026, 11, 5, 0, 0)),
        (date(2026, 11, 5), 18, utc(2026, 11, 5, 18, 0)),
    ],
)
def test_a_winter_hour_in_lisbon_is_the_same_hour_in_utc(day, hour, expected):
    assert at_lisbon_hour(day, hour) == expected


@needs_lisbon_timezone
def test_a_summer_hour_in_lisbon_is_one_hour_earlier_in_utc():
    assert at_lisbon_hour(date(2027, 7, 1), 18) == utc(2027, 7, 1, 17, 0)


def test_at_lisbon_hour_gives_an_aware_utc_time():
    result = at_lisbon_hour(date(2026, 11, 5), 8)

    assert result.tzinfo is UTC


# --- the bulletin day: from 08:00 Lisbon time ---


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2026, 11, 5, 7, 59, 59), date(2026, 11, 4)),
        (utc(2026, 11, 5, 8, 0, 0), date(2026, 11, 5)),
        (utc(2026, 11, 5, 23, 59, 59), date(2026, 11, 5)),
        (utc(2026, 11, 6, 0, 0, 0), date(2026, 11, 5)),
    ],
)
def test_the_bulletin_day_changes_at_08_00_lisbon(moment, expected):
    assert bulletin_day(moment) == expected


@needs_lisbon_timezone
@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2027, 7, 1, 6, 59, 59), date(2027, 6, 30)),
        (utc(2027, 7, 1, 7, 0, 0), date(2027, 7, 1)),
    ],
)
def test_in_summer_the_bulletin_day_changes_at_07_00_utc(moment, expected):
    assert bulletin_day(moment) == expected


def test_the_bulletin_hour_is_8():
    assert BULLETIN_HOUR == 8


@pytest.mark.parametrize(
    "moment",
    [
        utc(2026, 11, 4, 7, 59, 59),
        utc(2026, 11, 4, 8, 0, 0),
        utc(2026, 11, 5, 12, 0, 0),
        utc(2026, 11, 5, 23, 59, 59),
        utc(2027, 3, 27, 7, 59, 59),
        utc(2027, 3, 27, 8, 0, 0),
        utc(2027, 3, 28, 0, 59, 59),
        utc(2027, 3, 28, 6, 59, 59),
        utc(2027, 3, 28, 7, 0, 0),
        utc(2027, 3, 28, 12, 0, 0),
        utc(2027, 7, 1, 6, 59, 59),
        utc(2027, 7, 1, 7, 0, 0),
        utc(2027, 10, 30, 6, 59, 59),
        utc(2027, 10, 30, 7, 0, 0),
        utc(2027, 10, 31, 0, 30, 0),
        utc(2027, 10, 31, 7, 59, 59),
        utc(2027, 10, 31, 8, 0, 0),
        utc(2027, 11, 1, 7, 59, 59),
    ],
)
def test_the_bulletin_day_is_the_exchange_market_day(moment):
    # The Exchange starts its market day at 08:00 Lisbon time (market/game_day.py). The bulletin
    # day must start at exactly the same moment, also on the two clock-change days.
    assert at_lisbon_hour(bulletin_day(moment), BULLETIN_HOUR) == game_day_start(moment)


# --- the harbor week: from Monday 00:00 Lisbon time ---


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2026, 11, 22, 23, 59, 59), date(2026, 11, 16)),  # Sunday
        (utc(2026, 11, 23, 0, 0, 0), date(2026, 11, 23)),  # Monday, just begun
        (utc(2026, 11, 16, 0, 0, 0), date(2026, 11, 16)),  # day 1 is a Monday
        (utc(2026, 11, 18, 12, 0, 0), date(2026, 11, 16)),  # Wednesday
    ],
)
def test_the_harbor_week_starts_on_monday_00_00_lisbon(moment, expected):
    assert harbor_week(moment) == expected


@needs_lisbon_timezone
@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (utc(2027, 7, 4, 22, 59, 59), date(2027, 6, 28)),
        (utc(2027, 7, 4, 23, 30, 0), date(2027, 7, 5)),  # already Monday 00:30 in Lisbon
    ],
)
def test_in_summer_a_sunday_evening_in_utc_can_already_be_monday_in_lisbon(moment, expected):
    assert harbor_week(moment) == expected


# --- time zones ---


@pytest.mark.parametrize("offset_hours", [-5, 0, 9, 14])
def test_a_moment_in_another_timezone_gives_the_same_day(offset_hours):
    moment = utc(2026, 11, 5, 7, 59, 59)
    elsewhere = moment.astimezone(timezone(timedelta(hours=offset_hours)))

    assert game_day(elsewhere) == game_day(moment)
    assert bulletin_day(elsewhere) == bulletin_day(moment)
    assert harbor_week(elsewhere) == harbor_week(moment)


@pytest.mark.parametrize("function", [to_lisbon, game_day, bulletin_day, harbor_week])
def test_a_time_without_a_timezone_is_refused(function):
    with pytest.raises(ValueError, match="timezone"):
        function(datetime(2026, 11, 5, 12, 0))


def test_to_lisbon_keeps_the_moment():
    moment = utc(2026, 11, 5, 12, 0)

    assert to_lisbon(moment) == moment


def test_a_server_without_timezone_data_uses_utc_and_says_so(monkeypatch, caplog):
    def no_such_zone(name):
        raise lisbon_time.ZoneInfoNotFoundError(name)

    monkeypatch.setattr(lisbon_time, "ZoneInfo", no_such_zone)

    with caplog.at_level(logging.WARNING):
        zone = load_lisbon_zone()

    assert zone is UTC
    assert "timezone database" in caplog.text
