"""Tests for weather/outlook.py: tonight and tomorrow, put together from the hours of a forecast.

The weather route and the bulletin both show this outlook, so it is built in one place. The "now" of
every test is written out, and no test uses the network.
"""

from datetime import UTC, date, datetime

from server.tests.weather_helpers import (
    CLEAR_HOUR,
    DESIGN_RULES,
    FOGGY_HOUR,
    RAINY_HOUR,
    hour_readings,
    hours_of,
)
from server.weather.fog_nights import ALMANAC, REAL, FogNight
from server.weather.outlook import make_outlook
from server.weather.states import CALM, FOG, RAIN

RULES = DESIGN_RULES


def utc(*parts: int) -> datetime:
    return datetime(*parts, tzinfo=UTC)


NOON_5_NOV = utc(2026, 11, 5, 12, 0)
AT_2_AM_6_NOV = utc(2026, 11, 6, 2, 0)


def test_in_the_daytime_tonight_is_the_coming_night_and_is_not_in_progress():
    outlook = make_outlook(NOON_5_NOV, (), RULES)

    assert outlook.tonight.window.date == date(2026, 11, 5)
    assert outlook.tonight.window.starts_at == utc(2026, 11, 5, 18, 0)
    assert outlook.tonight.window.ends_at == utc(2026, 11, 6, 6, 0)
    assert outlook.tonight.is_now is False


def test_after_midnight_tonight_is_the_night_in_progress():
    outlook = make_outlook(AT_2_AM_6_NOV, (), RULES)

    assert outlook.tonight.window.date == date(2026, 11, 5)
    assert outlook.tonight.is_now is True


def test_at_18_00_the_night_is_in_progress_and_at_06_00_it_is_over():
    at_the_start = make_outlook(utc(2026, 11, 5, 18, 0), (), RULES)
    at_the_end = make_outlook(utc(2026, 11, 6, 6, 0), (), RULES)

    assert at_the_start.tonight.is_now is True
    assert at_the_end.tonight.is_now is False
    assert at_the_end.tonight.window.date == date(2026, 11, 6)


def test_tomorrow_is_the_daytime_after_tonight():
    outlook = make_outlook(NOON_5_NOV, (), RULES)

    assert outlook.tomorrow.window.date == date(2026, 11, 6)
    assert outlook.tomorrow.window.starts_at == utc(2026, 11, 6, 6, 0)
    assert outlook.tomorrow.window.ends_at == utc(2026, 11, 6, 18, 0)


def test_while_the_night_is_in_progress_tomorrow_is_the_daytime_that_follows_it():
    outlook = make_outlook(AT_2_AM_6_NOV, (), RULES)

    assert outlook.tomorrow.window.starts_at == outlook.tonight.window.ends_at
    assert outlook.tomorrow.window.date == date(2026, 11, 6)


def test_the_state_of_tonight_and_tomorrow_come_from_the_hours():
    hours = hour_readings(
        {
            **hours_of(utc(2026, 11, 5, 18), 12, FOGGY_HOUR),
            **hours_of(utc(2026, 11, 6, 6), 12, RAINY_HOUR),
        }
    )

    outlook = make_outlook(NOON_5_NOV, hours, RULES)

    assert outlook.tonight.state == FOG
    assert outlook.tomorrow.state == RAIN


def test_a_clear_night_and_day_are_calm():
    hours = hour_readings(hours_of(utc(2026, 11, 5, 6), 36, CLEAR_HOUR))

    outlook = make_outlook(NOON_5_NOV, hours, RULES)

    assert outlook.tonight.state == CALM
    assert outlook.tomorrow.state == CALM


def test_without_hours_both_states_are_unknown_and_the_almanac_decides_the_fog_night():
    on_an_almanac_night = make_outlook(utc(2026, 11, 16, 12, 0), (), RULES)
    on_another_night = make_outlook(utc(2026, 11, 17, 12, 0), (), RULES)

    assert on_an_almanac_night.tonight.state is None
    assert on_an_almanac_night.tomorrow.state is None
    assert on_an_almanac_night.tonight.fog_night == FogNight(date(2026, 11, 16), True, ALMANAC)
    assert on_another_night.tonight.fog_night == FogNight(date(2026, 11, 17), False, None)


def test_three_foggy_night_hours_make_tonight_a_real_fog_night():
    hours = hour_readings(hours_of(utc(2026, 11, 5, 21), 3, FOGGY_HOUR))

    outlook = make_outlook(NOON_5_NOV, hours, RULES)

    assert outlook.tonight.fog_night == FogNight(date(2026, 11, 5), True, REAL)


def test_the_hours_of_other_nights_do_not_change_tonight():
    hours = hour_readings(hours_of(utc(2026, 11, 8, 21), 3, FOGGY_HOUR))

    outlook = make_outlook(NOON_5_NOV, hours, RULES)

    assert outlook.tonight.state is None


def test_the_outlook_keeps_the_state_of_every_night_that_has_hours():
    hours = hour_readings(
        {
            **hours_of(utc(2026, 11, 4, 18), 12, RAINY_HOUR),
            **hours_of(utc(2026, 11, 5, 18), 12, FOGGY_HOUR),
        }
    )

    outlook = make_outlook(NOON_5_NOV, hours, RULES)

    assert outlook.night_states == {date(2026, 11, 4): RAIN, date(2026, 11, 5): FOG}
    assert outlook.tonight.state == outlook.night_states[date(2026, 11, 5)]


def test_the_outlook_of_a_forecast_without_hours_has_no_night_states():
    assert make_outlook(NOON_5_NOV, (), RULES).night_states == {}
