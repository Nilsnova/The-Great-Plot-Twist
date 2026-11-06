"""Tests for weather/nights.py: when a night starts and ends, and which hours belong to which night.

Night N runs from 18:00 Lisbon time on date N to 06:00 on date N+1 (a start value of the design,
OPEN-WORLD.md 5.4). A daytime runs from 06:00 to 18:00. The summer tests need the timezone
database (see helpers.needs_lisbon_timezone). No network and no real clock.
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from server.tests.helpers import needs_lisbon_timezone
from server.tests.weather_helpers import (
    CLEAR_HOUR,
    DESIGN_RULES,
    FOGGY_HOUR,
    RAINY_HOUR,
    STORMY_HOUR,
    hour_readings,
    hours_of,
)
from server.weather import nights
from server.weather.nights import (
    daytime_window,
    night_for,
    night_window,
    period_states,
    sort_hours,
    states_by_daytime,
    states_by_night,
)
from server.weather.states import CALM, FOG, RAIN, STORM

RULES = DESIGN_RULES


def utc(*parts: int) -> datetime:
    """A UTC time. In the helpers below it is also the start of an hour."""
    return datetime(*parts, tzinfo=UTC)


# --- the windows ---


def test_a_winter_night_runs_from_18_00_to_06_00_utc():
    window = night_window(date(2026, 11, 5), RULES)

    assert window.date == date(2026, 11, 5)
    assert window.starts_at == utc(2026, 11, 5, 18, 0)
    assert window.ends_at == utc(2026, 11, 6, 6, 0)


@needs_lisbon_timezone
def test_a_summer_night_runs_from_17_00_to_05_00_utc():
    window = night_window(date(2027, 7, 1), RULES)

    assert window.starts_at == utc(2027, 7, 1, 17, 0)
    assert window.ends_at == utc(2027, 7, 2, 5, 0)


@needs_lisbon_timezone
def test_the_night_of_the_march_clock_change_has_eleven_hours():
    # The clocks go forward at 01:00 UTC on Sunday 28 March 2027, so that night is an hour short.
    window = night_window(date(2027, 3, 27), RULES)

    assert window.starts_at == utc(2027, 3, 27, 18, 0)
    assert window.ends_at == utc(2027, 3, 28, 5, 0)
    assert window.ends_at - window.starts_at == timedelta(hours=11)


@needs_lisbon_timezone
def test_the_night_of_the_october_clock_change_has_thirteen_hours():
    # The clocks go back at 01:00 UTC on Sunday 31 October 2027, so that night is an hour long.
    window = night_window(date(2027, 10, 30), RULES)

    assert window.starts_at == utc(2027, 10, 30, 17, 0)
    assert window.ends_at == utc(2027, 10, 31, 6, 0)
    assert window.ends_at - window.starts_at == timedelta(hours=13)


def test_a_daytime_runs_from_06_00_to_18_00():
    window = daytime_window(date(2026, 11, 5), RULES)

    assert window.date == date(2026, 11, 5)
    assert window.starts_at == utc(2026, 11, 5, 6, 0)
    assert window.ends_at == utc(2026, 11, 5, 18, 0)


def test_a_window_is_half_open_it_has_begun_at_its_start_and_is_over_at_its_end():
    window = night_window(date(2026, 11, 5), RULES)

    assert not window.contains(window.starts_at - timedelta(seconds=1))
    assert window.contains(window.starts_at)
    assert window.contains(window.ends_at - timedelta(seconds=1))
    assert not window.contains(window.ends_at)


# --- which night is "tonight" ---


def test_before_06_00_tonight_is_the_night_that_began_yesterday():
    window = night_for(utc(2026, 11, 6, 5, 59, 59), RULES)

    assert window.date == date(2026, 11, 5)


def test_from_06_00_tonight_is_the_coming_night():
    window = night_for(utc(2026, 11, 6, 6, 0, 0), RULES)

    assert window.date == date(2026, 11, 6)
    assert window.starts_at == utc(2026, 11, 6, 18, 0)


def test_at_18_00_the_night_has_begun():
    just_before = night_for(utc(2026, 11, 6, 17, 59, 59), RULES)
    at_the_start = night_for(utc(2026, 11, 6, 18, 0, 0), RULES)

    assert just_before.date == at_the_start.date == date(2026, 11, 6)
    assert not just_before.contains(utc(2026, 11, 6, 17, 59, 59))
    assert at_the_start.contains(utc(2026, 11, 6, 18, 0, 0))


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (utc(2026, 11, 6, 0, 0, 0), date(2026, 11, 5)),  # just after midnight
        (utc(2026, 11, 6, 12, 0, 0), date(2026, 11, 6)),  # noon: the coming night
        (utc(2026, 11, 6, 23, 59, 59), date(2026, 11, 6)),  # late evening: the night in progress
        (utc(2026, 12, 31, 3, 0, 0), date(2026, 12, 30)),  # the night across New Year
        (utc(2027, 1, 1, 3, 0, 0), date(2026, 12, 31)),
    ],
)
def test_tonight_is_found_for_every_time_of_the_day(now, expected):
    assert night_for(now, RULES).date == expected


@needs_lisbon_timezone
def test_in_summer_tonight_changes_at_05_00_utc():
    assert night_for(utc(2027, 7, 2, 4, 59, 59), RULES).date == date(2027, 7, 1)
    assert night_for(utc(2027, 7, 2, 5, 0, 0), RULES).date == date(2027, 7, 2)


# --- sorting the hours of a forecast into nights and daytimes ---


def test_hours_are_sorted_into_nights_and_days():
    hours = hour_readings(
        {
            utc(2026, 11, 6, 5): FOGGY_HOUR,  # the last hour of the night of 5 Nov
            utc(2026, 11, 6, 6): CLEAR_HOUR,  # the first hour of the day of 6 Nov
            utc(2026, 11, 6, 17): RAINY_HOUR,  # the last hour of the day of 6 Nov
            utc(2026, 11, 6, 18): STORMY_HOUR,  # the first hour of the night of 6 Nov
        }
    )

    nights, days = sort_hours(hours, RULES)

    assert nights == {date(2026, 11, 5): [FOG], date(2026, 11, 6): [STORM]}
    assert days == {date(2026, 11, 6): [CALM, RAIN]}


def test_every_hour_goes_to_exactly_one_night_or_daytime():
    hours = hour_readings(hours_of(utc(2026, 11, 5, 0), 48, CLEAR_HOUR))

    nights, days = sort_hours(hours, RULES)

    assert sum(len(states) for states in nights.values()) == 24  # 18:00 to 06:00, twice
    assert sum(len(states) for states in days.values()) == 24  # 06:00 to 18:00, twice


@needs_lisbon_timezone
def test_in_summer_the_hours_are_sorted_by_lisbon_time():
    hours = hour_readings(
        {
            utc(2027, 7, 1, 16): CLEAR_HOUR,  # 17:00 in Lisbon: still the day
            utc(2027, 7, 1, 17): FOGGY_HOUR,  # 18:00 in Lisbon: the night begins
            utc(2027, 7, 2, 4): FOGGY_HOUR,  # 05:00 in Lisbon: the last hour of the night
            utc(2027, 7, 2, 5): CLEAR_HOUR,  # 06:00 in Lisbon: the day
        }
    )

    nights, days = sort_hours(hours, RULES)

    assert nights == {date(2027, 7, 1): [FOG, FOG]}
    assert days == {date(2027, 7, 1): [CALM], date(2027, 7, 2): [CALM]}


@needs_lisbon_timezone
def test_the_night_of_the_march_clock_change_holds_its_eleven_hours():
    hours = hour_readings(hours_of(utc(2027, 3, 27, 12), 24, CLEAR_HOUR))

    nights, _ = sort_hours(hours, RULES)

    assert len(nights[date(2027, 3, 27)]) == 11


@needs_lisbon_timezone
def test_the_night_of_the_october_clock_change_holds_its_thirteen_hours():
    hours = hour_readings(hours_of(utc(2027, 10, 30, 12), 24, CLEAR_HOUR))

    nights, _ = sort_hours(hours, RULES)

    assert len(nights[date(2027, 10, 30)]) == 13


# --- the state of a whole night or daytime ---


def foggy_hours_in_the_night(count: int):
    """`count` foggy hours from 20:00 UTC on 5 Nov, and clear hours for the rest of the night."""
    night = hours_of(utc(2026, 11, 5, 18), 12, CLEAR_HOUR)
    return hour_readings({**night, **hours_of(utc(2026, 11, 5, 20), count, FOGGY_HOUR)})


@pytest.mark.parametrize(("foggy", "expected"), [(0, CALM), (2, CALM), (3, FOG), (10, FOG)])
def test_a_night_takes_fog_from_three_foggy_hours(foggy, expected):
    states = states_by_night(foggy_hours_in_the_night(foggy), RULES)

    assert states == {date(2026, 11, 5): expected}


def test_storm_wins_over_fog_in_a_night():
    night = hours_of(utc(2026, 11, 5, 18), 12, CLEAR_HOUR)
    stormy_and_foggy = {
        **night,
        **hours_of(utc(2026, 11, 5, 19), 3, FOGGY_HOUR),
        **hours_of(utc(2026, 11, 5, 23), 3, STORMY_HOUR),
    }

    states = states_by_night(hour_readings(stormy_and_foggy), RULES)

    assert states == {date(2026, 11, 5): STORM}


def test_a_night_with_no_hours_is_not_in_the_answer():
    hours = hour_readings(hours_of(utc(2026, 11, 5, 18), 3, FOGGY_HOUR))

    assert date(2026, 11, 4) not in states_by_night(hours, RULES)


def test_states_by_night_with_no_hours_at_all_is_empty():
    assert states_by_night((), RULES) == {}
    assert states_by_daytime((), RULES) == {}


def test_a_daytime_takes_its_state_the_same_way():
    day = hours_of(utc(2026, 11, 6, 6), 12, CLEAR_HOUR)
    rainy_day = {**day, **hours_of(utc(2026, 11, 6, 9), 3, RAINY_HOUR)}

    states = states_by_daytime(hour_readings(rainy_day), RULES)

    assert states == {date(2026, 11, 6): RAIN}


def test_a_night_and_the_day_after_it_are_judged_apart():
    foggy_night = hours_of(utc(2026, 11, 5, 18), 12, FOGGY_HOUR)
    clear_day = hours_of(utc(2026, 11, 6, 6), 12, CLEAR_HOUR)
    hours = hour_readings({**foggy_night, **clear_day})

    assert states_by_night(hours, RULES) == {date(2026, 11, 5): FOG}
    assert states_by_daytime(hours, RULES) == {date(2026, 11, 6): CALM}


def test_period_states_gives_the_nights_and_the_daytimes_in_one_answer():
    foggy_night = hours_of(utc(2026, 11, 5, 18), 12, FOGGY_HOUR)
    clear_day = hours_of(utc(2026, 11, 6, 6), 12, CLEAR_HOUR)
    hours = hour_readings({**foggy_night, **clear_day})

    night_states, daytime_states = period_states(hours, RULES)

    assert night_states == {date(2026, 11, 5): FOG}
    assert daytime_states == {date(2026, 11, 6): CALM}
    assert (night_states, daytime_states) == (
        states_by_night(hours, RULES),
        states_by_daytime(hours, RULES),
    )


def test_period_states_with_no_hours_at_all_is_empty():
    assert period_states((), RULES) == ({}, {})


def test_period_states_sorts_the_hours_only_once(monkeypatch):
    passes = []
    original = nights.sort_hours

    def counting_sort_hours(hours, rules):
        passes.append(len(hours))
        return original(hours, rules)

    monkeypatch.setattr(nights, "sort_hours", counting_sort_hours)
    hours = hour_readings(hours_of(utc(2026, 11, 5, 6), 24, CLEAR_HOUR))

    period_states(hours, RULES)

    assert passes == [24]
