"""Shared helpers for the weather tests (the test_weather_*.py files). It holds no tests itself.

It loads the saved Open-Meteo answers from backend/content/weather/ and builds a fake
Open-Meteo, so no weather test ever uses the network. The name has no test_ at the start on
purpose: pytest only collects test_*.py files, and this one is not a test file.

Used by: test_weather_mapping.py, test_weather_open_meteo.py, test_weather_route.py,
test_weather_settings.py and test_weather_source.py.
"""

import asyncio
import json
from collections.abc import Mapping
from dataclasses import replace
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from server.tests.helpers import CONFIGURED_SETTINGS, FakeReply
from server.weather.mapping import HourReading
from server.weather.open_meteo import HOURLY_VARIABLES, parse_hours
from server.weather.state_rules import StateRules

# backend/ holds server/ (the code) and content/ (the saved weather answers).
BACKEND_ROOT = Path(__file__).resolve().parents[2]
WEATHER_CONTENT = BACKEND_ROOT / "content" / "weather"
SAMPLES_FOLDER = WEATHER_CONTENT / "samples"

# Settings for a made-up place, so a test can prove the coordinates come from the settings.
# (These are the real coordinates of Lisbon, the option the team may pick instead of the Faroes.)
LISBON_SETTINGS = replace(
    CONFIGURED_SETTINGS,
    weather_place_name="Lisbon, Portugal",
    weather_latitude=38.72,
    weather_longitude=-9.14,
)


# The state rules with the start values of the design (OPEN-WORLD.md 5.4): the same numbers as
# backend/content/weather_states.json. Tests that are not about the file use this copy, so a change
# to the file's numbers does not break tests that are about something else.
DESIGN_RULES = StateRules(
    storm_from_wind=0.8,
    fog_from_fog=0.5,
    rain_from_rain=0.4,
    night_starts_hour=18,
    night_ends_hour=6,
    hours_for_state=3,
    almanac_starts_on=date(2026, 11, 16),
)

# One hour of weather, as the numbers in Open-Meteo's hourly block. Each one maps to the state its
# name says (weather/states.py): CLEAR is calm, FOGGY is fog, RAINY is rain and STORMY is a storm.
CLEAR_HOUR = {
    "weather_code": 0,
    "precipitation": 0.0,
    "visibility": 24000.0,
    "wind_speed_10m": 8.0,
}
FOGGY_HOUR = {
    "weather_code": 45,
    "precipitation": 0.0,
    "visibility": 300.0,
    "wind_speed_10m": 6.0,
}
RAINY_HOUR = {
    "weather_code": 63,
    "precipitation": 3.5,
    "visibility": 9000.0,
    "wind_speed_10m": 18.0,
}
STORMY_HOUR = {
    "weather_code": 95,
    "precipitation": 6.0,
    "visibility": 7000.0,
    "wind_speed_10m": 55.0,
}

# The units line of a real hourly block. The server does not read it, but a real answer has it.
HOURLY_UNITS = {
    "time": "iso8601",
    "weather_code": "wmo code",
    "precipitation": "mm",
    "visibility": "m",
    "wind_speed_10m": "km/h",
}

ONE_HOUR = timedelta(hours=1)


def load_sample_answer(name: str) -> dict[str, Any]:
    """One saved Open-Meteo answer from content/weather/samples/, for example "rain"."""
    return json.loads((SAMPLES_FOLDER / f"{name}.json").read_text(encoding="utf-8"))


def sample_names() -> list[str]:
    """The names of all saved sample answers, in alphabetical order."""
    return sorted(path.stem for path in SAMPLES_FOLDER.glob("*.json"))


def load_recorded_file() -> dict[str, Any]:
    """The recorded fallback file as plain JSON data."""
    return json.loads((WEATHER_CONTENT / "recorded-fallback.json").read_text(encoding="utf-8"))


def answer_with_sample(name: str) -> FakeReply:
    """A fake Open-Meteo that answers every request with the saved answer called `name`."""
    return reply_with_answer(load_sample_answer(name))


def reply_with_answer(answer: dict[str, Any]) -> FakeReply:
    """A fake Open-Meteo that answers every request with this answer."""
    return lambda request: httpx.Response(200, json=answer)


def hourly_block(hours: Mapping[datetime, Mapping[str, float | None]]) -> dict[str, Any]:
    """An Open-Meteo "hourly" block. `hours` maps the start of each hour (UTC) to its numbers.

    The numbers are named like Open-Meteo's variables, for example CLEAR_HOUR. A variable that a
    hour does not name is written as null, like Open-Meteo does for a missing value.
    """
    starts = sorted(hours)
    block: dict[str, Any] = {"time": [start.strftime("%Y-%m-%dT%H:%M") for start in starts]}
    for name in HOURLY_VARIABLES:
        block[name] = [hours[start].get(name) for start in starts]
    return block


def answer_with_hours(sample: str, hours: Mapping[datetime, Mapping[str, float | None]]) -> dict:
    """The saved sample answer called `sample`, plus an hourly block for `hours`.

    The sample files stay as they are: the hourly block is built here, in code.
    """
    answer = load_sample_answer(sample)
    answer["hourly_units"] = HOURLY_UNITS
    answer["hourly"] = hourly_block(hours)
    return answer


def hour_readings(
    hours: Mapping[datetime, Mapping[str, float | None]],
) -> tuple[HourReading, ...]:
    """The same hours as `hourly_block` describes, read the way the server reads them."""
    return parse_hours({"utc_offset_seconds": 0, "hourly": hourly_block(hours)})


def hours_of(first: datetime, count: int, numbers: Mapping[str, float | None]) -> dict:
    """`count` hours in a row, from the hour that starts at `first`, all with the same weather."""
    return {first + ONE_HOUR * step: numbers for step in range(count)}


def make_transport(reply: FakeReply) -> tuple[httpx.MockTransport, list[httpx.Request]]:
    """A fake network for Open-Meteo. Returns the transport and a list of every request sent.

    `reply` gets each request and returns (or raises) the pretend answer.
    """
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply(request)

    return httpx.MockTransport(handler), seen


def make_slow_transport(reply: FakeReply) -> tuple[httpx.MockTransport, list[httpx.Request]]:
    """Like make_transport, but the fake Open-Meteo pauses for a moment before it answers.

    A real network call always gives other waiting tasks a turn while it waits for the answer.
    The pause (asyncio.sleep(0)) does the same. Without it, each fake call would finish before
    the next player's call even started, and a test about "many players at the same moment"
    would pass even if the code had no protection against it.
    """
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        await asyncio.sleep(0)
        return reply(request)

    return httpx.MockTransport(handler), seen


def replies_in_order(*replies: FakeReply) -> FakeReply:
    """A fake Open-Meteo that uses the first reply for the first request, the next reply for the
    next request, and so on. The last reply is used again and again.

    It lets a test say "Open-Meteo works once, then goes down".
    """
    remaining = list(replies)

    def reply(request: httpx.Request) -> httpx.Response:
        current = remaining.pop(0) if len(remaining) > 1 else remaining[0]
        return current(request)

    return reply
