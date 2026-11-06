"""Tests for weather/open_meteo.py: asking Open-Meteo and reading its answer.

Every test uses a fake network (httpx.MockTransport), so nothing here talks to Open-Meteo for
real.
"""

import asyncio
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from server.tests.helpers import FakeReply, fail_with
from server.tests.weather_helpers import (
    CLEAR_HOUR,
    FOGGY_HOUR,
    ONE_HOUR,
    answer_with_hours,
    answer_with_sample,
    hourly_block,
    hours_of,
    load_recorded_file,
    load_sample_answer,
    make_transport,
)
from server.weather.mapping import HourReading, WeatherReading
from server.weather.open_meteo import (
    CURRENT_VARIABLES,
    EARLIEST_HOUR,
    FORECAST_DAYS,
    HOURLY_VARIABLES,
    LATEST_HOUR,
    MAX_HOURLY_ENTRIES,
    PAST_DAYS,
    Forecast,
    fetch_forecast,
    parse_forecast,
    parse_hours,
    parse_open_meteo_answer,
)


def answer_with_current(**current) -> dict:
    """A small Open-Meteo-shaped answer. The interval is the 15 minutes behind "current"."""
    return {"current": {"interval": 900, **current}}


# --- reading Open-Meteo's answer ---


def test_the_recorded_real_answer_is_read_into_a_reading():
    reading = parse_open_meteo_answer(load_recorded_file()["answer"])

    assert reading == WeatherReading(
        weather_code=3,
        cloud_cover_percent=100.0,
        precipitation_mm_per_hour=0.0,
        visibility_m=50000.0,
        wind_speed_kmh=13.7,
        is_day=False,
    )


def test_every_number_is_picked_out_of_the_current_block():
    answer = answer_with_current(
        weather_code=61,
        cloud_cover=90,
        precipitation=0.5,
        visibility=8000.0,
        wind_speed_10m=20.5,
        is_day=1,
    )

    assert parse_open_meteo_answer(answer) == WeatherReading(61, 90.0, 2.0, 8000.0, 20.5, True)


def test_precipitation_is_converted_from_the_interval_to_millimetres_per_hour():
    # 0.5 mm fell in the last 900 seconds (15 minutes): that is 2 mm per hour.
    reading = parse_open_meteo_answer(answer_with_current(weather_code=61, precipitation=0.5))

    assert reading.precipitation_mm_per_hour == 2.0


@pytest.mark.parametrize("interval", [None, 0, -900, "fifteen"])
def test_precipitation_counts_as_per_hour_when_the_interval_is_missing_or_odd(interval):
    answer = {"current": {"weather_code": 61, "precipitation": 3.0, "interval": interval}}

    assert parse_open_meteo_answer(answer).precipitation_mm_per_hour == 3.0


def test_fields_that_are_missing_or_null_become_none():
    answer = {"current": {"weather_code": 3, "cloud_cover": None, "visibility": None}}

    reading = parse_open_meteo_answer(answer)

    assert reading == WeatherReading(weather_code=3)


def test_values_that_are_not_numbers_become_none():
    answer = answer_with_current(
        weather_code="3",
        cloud_cover=True,
        precipitation=[1],
        visibility="far",
        wind_speed_10m=12.0,
        is_day="yes",
    )

    assert parse_open_meteo_answer(answer) == WeatherReading(wind_speed_kmh=12.0)


def test_nan_and_infinity_in_the_json_become_none():
    # Python's JSON reader accepts the words NaN and Infinity. The weather must not.
    text = '{"current": {"weather_code": NaN, "cloud_cover": Infinity, "wind_speed_10m": 5}}'

    assert parse_open_meteo_answer(json.loads(text)) == WeatherReading(wind_speed_kmh=5.0)


def test_a_whole_number_of_hundreds_of_digits_becomes_none_and_never_raises():
    # Python's JSON reader accepts such a number, but it does not fit a float.
    answer = answer_with_current(weather_code=3, wind_speed_10m=10**400, visibility=-(10**400))

    assert parse_open_meteo_answer(answer) == WeatherReading(weather_code=3)


@pytest.mark.parametrize(("code", "expected"), [(3, 3), (3.0, 3), (3.5, None), ("3", None)])
def test_a_weather_code_must_be_a_whole_number(code, expected):
    reading = parse_open_meteo_answer(answer_with_current(weather_code=code, wind_speed_10m=1))

    assert reading.weather_code == expected


@pytest.mark.parametrize(("flag", "expected"), [(1, True), (0, False), (None, None), (2, None)])
def test_is_day_is_one_for_day_zero_for_night_and_anything_else_is_unknown(flag, expected):
    reading = parse_open_meteo_answer(answer_with_current(weather_code=3, is_day=flag))

    assert reading.is_day is expected


@pytest.mark.parametrize(
    "answer",
    [
        None,
        "text",
        [],
        {},
        {"current": None},
        {"current": []},
        {"current": {}},
        {"current": {"time": "2026-11-05T17:00", "interval": 900}},
        {"current": {"weather_code": None, "wind_speed_10m": None, "is_day": 1}},
    ],
)
def test_an_answer_with_no_usable_weather_in_it_is_refused(answer):
    with pytest.raises(ValueError, match="Open-Meteo"):
        parse_open_meteo_answer(answer)


# --- asking Open-Meteo ---


def fetch(reply: FakeReply, latitude: float = 12.5, longitude: float = -45.25):
    """Run fetch_forecast on a fake network. Returns the forecast and the requests it sent."""
    transport, seen = make_transport(reply)
    return asyncio.run(fetch_forecast(latitude, longitude, transport)), seen


def test_the_request_goes_to_the_open_meteo_forecast_address_with_get():
    _, seen = fetch(answer_with_sample("rain"))

    assert len(seen) == 1
    assert seen[0].method == "GET"
    assert seen[0].url.scheme == "https"
    assert seen[0].url.host == "api.open-meteo.com"
    assert seen[0].url.path == "/v1/forecast"


def test_the_request_names_the_place_the_variables_and_the_units():
    _, seen = fetch(answer_with_sample("rain"), latitude=12.5, longitude=-45.25)

    params = seen[0].url.params
    assert params["latitude"] == "12.5"
    assert params["longitude"] == "-45.25"
    assert params["current"] == ",".join(CURRENT_VARIABLES)
    assert params["wind_speed_unit"] == "kmh"
    assert params["precipitation_unit"] == "mm"


def test_the_variables_asked_for_are_exactly_the_ones_the_parser_reads():
    assert CURRENT_VARIABLES == (
        "weather_code",
        "cloud_cover",
        "precipitation",
        "visibility",
        "wind_speed_10m",
        "is_day",
    )


def test_the_request_carries_no_key_and_no_login():
    _, seen = fetch(answer_with_sample("rain"))

    assert "authorization" not in seen[0].headers
    assert "apikey" not in seen[0].headers
    assert "key" not in seen[0].url.query.decode().lower()


def test_a_good_answer_becomes_a_forecast():
    forecast, _ = fetch(answer_with_sample("rain"))

    # The saved sample has no hourly block, so there are no hours.
    assert forecast == Forecast(parse_open_meteo_answer(load_sample_answer("rain")), ())


@pytest.mark.parametrize("status", [400, 429, 500, 503])
def test_an_error_status_from_open_meteo_is_raised(status):
    body = {"error": True, "reason": "pretend problem"}

    with pytest.raises(httpx.HTTPStatusError):
        fetch(lambda request: httpx.Response(status, json=body))


def test_an_answer_that_is_not_json_is_raised():
    with pytest.raises(ValueError):
        fetch(lambda request: httpx.Response(200, text="<html>Bad gateway</html>"))


def test_an_answer_without_weather_is_raised():
    with pytest.raises(ValueError, match="Open-Meteo"):
        fetch(lambda request: httpx.Response(200, json={"error": True, "reason": "odd"}))


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ConnectTimeout])
def test_a_network_failure_is_raised(error_class):
    with pytest.raises(error_class):
        fetch(fail_with(error_class))


# --- asking for hours: 31 days back, 3 days ahead, in UTC ---


def test_the_request_asks_for_hours_31_days_back_and_3_days_ahead_in_utc():
    _, seen = fetch(answer_with_sample("rain"))

    params = seen[0].url.params
    assert params["hourly"] == "weather_code,precipitation,visibility,wind_speed_10m"
    assert params["past_days"] == "31"
    assert params["forecast_days"] == "3"
    assert params["timezone"] == "GMT"


def test_the_hourly_variables_asked_for_are_exactly_the_ones_the_parser_reads():
    assert HOURLY_VARIABLES == ("weather_code", "precipitation", "visibility", "wind_speed_10m")


def test_the_days_asked_for_are_named_constants():
    assert (PAST_DAYS, FORECAST_DAYS) == (31, 3)


def test_the_request_counts_as_few_open_meteo_calls():
    # Open-Meteo counts a request as more than one call when it asks for more than 10 variables
    # or more than 14 days. We ask for 6 + 4 variables over 34 days: about 2.4 calls.
    _, seen = fetch(answer_with_sample("rain"))

    params = seen[0].url.params
    variables = len(params["current"].split(",")) + len(params["hourly"].split(","))
    days = int(params["past_days"]) + int(params["forecast_days"])
    assert variables <= 10
    assert days <= 35


# --- reading the hourly block ---

FIRST_HOUR = datetime(2026, 11, 5, 17, 0, tzinfo=UTC)


def body_with_hours(hours) -> dict:
    """The smallest answer parse_hours accepts: a UTC answer with an hourly block."""
    return {"utc_offset_seconds": 0, "hourly": hourly_block(hours)}


def test_the_hourly_block_becomes_hours_in_utc():
    body = {
        "utc_offset_seconds": 0,
        "hourly": {
            "time": ["2026-11-05T17:00", "2026-11-05T18:00"],
            "weather_code": [63, 45],
            "precipitation": [2.5, 0.0],
            "visibility": [8000.0, 300.0],
            "wind_speed_10m": [31.2, 6.0],
        },
    }

    assert parse_hours(body) == (
        HourReading(
            FIRST_HOUR,
            WeatherReading(
                weather_code=63,
                precipitation_mm_per_hour=2.5,
                visibility_m=8000.0,
                wind_speed_kmh=31.2,
            ),
        ),
        HourReading(
            FIRST_HOUR + timedelta(hours=1),
            WeatherReading(
                weather_code=45,
                precipitation_mm_per_hour=0.0,
                visibility_m=300.0,
                wind_speed_kmh=6.0,
            ),
        ),
    )


def test_every_hour_has_a_time_with_a_timezone():
    hours = parse_hours(body_with_hours(hours_of(FIRST_HOUR, 3, CLEAR_HOUR)))

    assert [hour.at.tzinfo for hour in hours] == [UTC, UTC, UTC]


def test_hourly_precipitation_is_already_per_hour():
    # Open-Meteo's hourly precipitation is the sum of the preceding hour: millimetres per hour.
    hours = parse_hours(body_with_hours({FIRST_HOUR: {"precipitation": 4.0, "weather_code": 63}}))

    assert hours[0].reading.precipitation_mm_per_hour == 4.0


def test_the_hours_come_in_the_order_of_the_block():
    body = body_with_hours(hours_of(FIRST_HOUR, 4, FOGGY_HOUR))

    assert [hour.at for hour in parse_hours(body)] == [
        FIRST_HOUR + timedelta(hours=step) for step in range(4)
    ]


def test_a_missing_hourly_block_gives_no_hours_and_keeps_the_weather_now():
    answer = load_sample_answer("rain")

    forecast = parse_forecast(answer)

    assert forecast.hours == ()
    assert forecast.now == parse_open_meteo_answer(answer)


def test_a_forecast_holds_the_weather_now_and_the_hours():
    answer = answer_with_hours("fog", hours_of(FIRST_HOUR, 2, FOGGY_HOUR))

    forecast = parse_forecast(answer)

    assert forecast.now == parse_open_meteo_answer(answer)
    assert len(forecast.hours) == 2


def test_a_forecast_without_weather_now_is_refused_even_with_hours():
    answer = {"utc_offset_seconds": 0, "hourly": hourly_block(hours_of(FIRST_HOUR, 2, CLEAR_HOUR))}

    with pytest.raises(ValueError, match="Open-Meteo"):
        parse_forecast(answer)


def test_hourly_lists_of_different_lengths_are_ignored():
    body = body_with_hours(hours_of(FIRST_HOUR, 3, CLEAR_HOUR))
    body["hourly"]["wind_speed_10m"] = [8.0, 8.0]

    assert parse_hours(body) == ()


@pytest.mark.parametrize("offset", [3600, -3600, 1, None, "0", True])
def test_an_hourly_block_in_another_timezone_is_ignored(offset):
    body = body_with_hours(hours_of(FIRST_HOUR, 3, CLEAR_HOUR))
    body["utc_offset_seconds"] = offset

    assert parse_hours(body) == ()


def test_an_hourly_block_without_the_utc_offset_is_ignored():
    body = body_with_hours(hours_of(FIRST_HOUR, 3, CLEAR_HOUR))
    del body["utc_offset_seconds"]

    assert parse_hours(body) == ()


def test_an_hour_without_any_weather_number_is_left_out():
    second = FIRST_HOUR + timedelta(hours=1)
    nothing = {"weather_code": None, "precipitation": None, "visibility": None}
    body = body_with_hours({FIRST_HOUR: CLEAR_HOUR, second: nothing})

    assert [hour.at for hour in parse_hours(body)] == [FIRST_HOUR]


def test_an_hour_with_only_one_weather_number_is_kept():
    body = body_with_hours({FIRST_HOUR: {"wind_speed_10m": 12.0}})

    assert parse_hours(body)[0].reading == WeatherReading(wind_speed_kmh=12.0)


def test_an_hour_with_a_time_we_cannot_read_is_left_out():
    body = body_with_hours(hours_of(FIRST_HOUR, 2, CLEAR_HOUR))
    body["hourly"]["time"][0] = "five o'clock"

    assert [hour.at for hour in parse_hours(body)] == [FIRST_HOUR + timedelta(hours=1)]


@pytest.mark.parametrize("text", ["0001-01-01T00:00:00+05:00", "9999-12-31T23:00:00-05:00"])
def test_an_hour_too_close_to_the_edge_of_the_calendar_is_left_out_and_never_raises(text):
    body = body_with_hours(hours_of(FIRST_HOUR, 1, CLEAR_HOUR))
    body["hourly"]["time"] = [text]

    assert parse_hours(body) == ()


@pytest.mark.parametrize(
    "text",
    [
        "0001-01-01T00:00",
        "0001-01-01T05:00",
        "1999-12-31T23:00",
        "9000-01-01T01:00",
        "9999-12-31T23:00",
    ],
)
def test_an_hour_outside_the_years_a_forecast_can_have_is_left_out(text):
    # Without the limits an hour in the year 1 got through, and then the date arithmetic of the
    # nights (weather/nights.py) failed on it with an OverflowError.
    body = body_with_hours(hours_of(FIRST_HOUR, 1, CLEAR_HOUR))
    body["hourly"]["time"] = [text]

    assert parse_hours(body) == ()


def test_an_hour_in_the_year_1_is_left_out_and_the_other_hours_are_kept():
    body = body_with_hours(hours_of(FIRST_HOUR, 2, CLEAR_HOUR))
    body["hourly"]["time"][0] = "0001-01-01T00:00"

    assert [hour.at for hour in parse_hours(body)] == [FIRST_HOUR + ONE_HOUR]


@pytest.mark.parametrize("edge", [EARLIEST_HOUR, LATEST_HOUR])
def test_the_first_and_the_last_hour_of_the_allowed_range_are_read(edge):
    body = body_with_hours({edge: CLEAR_HOUR})

    assert [hour.at for hour in parse_hours(body)] == [edge]


@pytest.mark.parametrize("outside", [EARLIEST_HOUR - ONE_HOUR, LATEST_HOUR + ONE_HOUR])
def test_the_hour_just_outside_the_allowed_range_is_left_out(outside):
    body = body_with_hours({outside: CLEAR_HOUR})

    assert parse_hours(body) == ()


def test_an_hour_with_an_offset_in_its_time_is_turned_into_utc():
    body = body_with_hours(hours_of(FIRST_HOUR, 1, CLEAR_HOUR))
    body["hourly"]["time"] = ["2026-11-05T18:00+01:00"]

    assert parse_hours(body)[0].at == FIRST_HOUR


def test_values_that_are_not_numbers_in_the_hourly_block_become_none():
    body = body_with_hours({FIRST_HOUR: {"weather_code": 63}})
    body["hourly"]["visibility"] = ["far"]
    body["hourly"]["wind_speed_10m"] = [True]

    assert parse_hours(body)[0].reading == WeatherReading(weather_code=63)


def test_a_whole_number_of_hundreds_of_digits_in_the_hourly_block_leaves_out_only_that_number():
    body = body_with_hours({FIRST_HOUR: {"weather_code": 63}})
    body["hourly"]["wind_speed_10m"] = [10**400]

    assert parse_hours(body)[0].reading == WeatherReading(weather_code=63)


def test_a_huge_number_in_the_hourly_block_does_not_lose_the_good_weather_now():
    # Before the fix the OverflowError failed the whole fetch, and the source fell back to older
    # data, so the good weather now was lost together with the hours.
    answer = answer_with_hours("rain", hours_of(FIRST_HOUR, 2, CLEAR_HOUR))
    answer["hourly"]["wind_speed_10m"] = [10**400, 8.0]

    forecast, _ = fetch(lambda request: httpx.Response(200, json=answer))

    assert forecast.now == parse_open_meteo_answer(load_sample_answer("rain"))
    assert len(forecast.hours) == 2


def test_an_hourly_block_with_the_most_entries_allowed_is_read():
    first = FIRST_HOUR - timedelta(days=PAST_DAYS)
    body = body_with_hours(hours_of(first, MAX_HOURLY_ENTRIES, CLEAR_HOUR))

    assert len(parse_hours(body)) == MAX_HOURLY_ENTRIES


def test_an_hourly_block_that_is_too_long_is_ignored():
    first = FIRST_HOUR - timedelta(days=PAST_DAYS)
    body = body_with_hours(hours_of(first, MAX_HOURLY_ENTRIES + 1, CLEAR_HOUR))

    assert parse_hours(body) == ()


def test_the_most_entries_allowed_cover_the_days_asked_for_plus_two_spare_days():
    assert MAX_HOURLY_ENTRIES == (PAST_DAYS + FORECAST_DAYS) * 24 + 48


@pytest.mark.parametrize(
    "body",
    [
        None,
        "text",
        42,
        [],
        {},
        {"utc_offset_seconds": 0},
        {"utc_offset_seconds": 0, "hourly": None},
        {"utc_offset_seconds": 0, "hourly": []},
        {"utc_offset_seconds": 0, "hourly": {}},
        {"utc_offset_seconds": 0, "hourly": {"time": "2026-11-05T17:00"}},
        {"utc_offset_seconds": 0, "hourly": {"time": [1, 2], "weather_code": [1, 2]}},
        {"utc_offset_seconds": 0, "hourly": {"time": [None], "weather_code": [None]}},
        {"utc_offset_seconds": 0, "hourly": {"time": ["2026-11-05T17:00"]}},
        {"utc_offset_seconds": 0, "hourly": {"time": ["2026-11-05T17:00"], "weather_code": 3}},
    ],
)
def test_an_odd_hourly_block_gives_no_hours_and_never_raises(body):
    assert parse_hours(body) == ()


def test_a_good_hourly_block_reaches_the_forecast_through_the_fake_network():
    reply = answer_with_hours("rain", hours_of(FIRST_HOUR, 5, FOGGY_HOUR))
    forecast, _ = fetch(lambda request: httpx.Response(200, json=reply))

    assert len(forecast.hours) == 5
    assert forecast.hours[0].reading.weather_code == 45
