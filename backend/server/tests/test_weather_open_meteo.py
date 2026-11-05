"""Tests for weather/open_meteo.py: asking Open-Meteo and reading its answer.

Every test uses a fake network (httpx.MockTransport), so nothing here talks to Open-Meteo for
real.
"""

import asyncio
import json

import httpx
import pytest

from server.tests.helpers import FakeReply, fail_with
from server.tests.weather_helpers import (
    answer_with_sample,
    load_recorded_file,
    load_sample_answer,
    make_transport,
)
from server.weather.mapping import WeatherReading
from server.weather.open_meteo import CURRENT_VARIABLES, fetch_reading, parse_open_meteo_answer


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
    """Run fetch_reading on a fake network. Returns the reading and the requests it sent."""
    transport, seen = make_transport(reply)
    return asyncio.run(fetch_reading(latitude, longitude, transport)), seen


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


def test_a_good_answer_becomes_a_reading():
    reading, _ = fetch(answer_with_sample("rain"))

    assert reading == parse_open_meteo_answer(load_sample_answer("rain"))


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
