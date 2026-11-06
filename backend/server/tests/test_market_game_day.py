"""Tests for market/game_day.py: the game day of the Island Exchange starts at 08:00 Lisbon time.

These are the day-start tests of v1 (they tested market_day_start in rules.py), moved together with
the function. The daily stake cap counts the stakes opened since the latest game day start.

No network, no real clock. The "now" of every test is written out.
"""

import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfoNotFoundError

import pytest

from server.market import game_day
from server.market.game_day import game_day_start

# Thursday 5 Nov 2026, 12:00 UTC. Lisbon is on winter time (UTC+0), so it is 12:00 there too and
# the game day began at 08:00 today.
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
TODAY_08 = datetime(2026, 11, 5, 8, 0, tzinfo=UTC)

needs_timezone_data = pytest.mark.skipif(
    game_day.GAME_DAY_TIMEZONE is UTC, reason="this computer has no timezone database"
)


def test_the_game_day_starts_at_08_00_lisbon_time():
    assert game_day.GAME_DAY_TIMEZONE_NAME == "Europe/Lisbon"
    assert game_day.GAME_DAY_START_HOUR == 8
    assert game_day.GAME_DAY_STARTS_TEXT == "08:00 Europe/Lisbon"


def test_the_game_day_of_noon_began_at_08_00_the_same_day():
    assert game_day_start(NOW) == TODAY_08


def test_the_game_day_of_07_59_began_at_08_00_the_day_before():
    now = datetime(2026, 11, 5, 7, 59, tzinfo=UTC)

    assert game_day_start(now) == datetime(2026, 11, 4, 8, 0, tzinfo=UTC)


def test_the_game_day_that_starts_exactly_now_is_the_new_day():
    assert game_day_start(TODAY_08) == TODAY_08


@needs_timezone_data
def test_a_time_given_in_another_timezone_gives_the_same_answer():
    same_moment = NOW.astimezone(game_day.ZoneInfo("America/New_York"))

    assert game_day_start(same_moment) == TODAY_08


@needs_timezone_data
def test_in_summer_lisbon_is_one_hour_ahead_of_utc_so_08_00_there_is_07_00_utc():
    now = datetime(2027, 7, 1, 12, 0, tzinfo=UTC)

    assert game_day_start(now) == datetime(2027, 7, 1, 7, 0, tzinfo=UTC)


@needs_timezone_data
def test_the_day_the_clocks_go_forward_still_starts_at_08_00_local_time():
    # In 2027 Portugal changes to summer time on Sunday 28 March, at 01:00 UTC.
    before_change = datetime(2027, 3, 27, 12, 0, tzinfo=UTC)
    after_change = datetime(2027, 3, 28, 12, 0, tzinfo=UTC)

    assert game_day_start(before_change) == datetime(2027, 3, 27, 8, 0, tzinfo=UTC)
    assert game_day_start(after_change) == datetime(2027, 3, 28, 7, 0, tzinfo=UTC)


def test_a_server_without_timezone_data_uses_utc_and_says_so(monkeypatch, caplog):
    def no_such_zone(name):
        raise ZoneInfoNotFoundError(name)

    monkeypatch.setattr(game_day, "ZoneInfo", no_such_zone)

    with caplog.at_level(logging.WARNING):
        zone = game_day.load_game_day_timezone()

    assert zone is UTC
    assert "timezone database" in caplog.text


def test_lisbon_time_is_the_zone_used_to_write_times_in_plain_words():
    assert game_day.lisbon_time(NOW).hour == 12
    assert game_day.lisbon_time(NOW).tzinfo is game_day.GAME_DAY_TIMEZONE
