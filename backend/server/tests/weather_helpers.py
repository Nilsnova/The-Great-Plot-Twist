"""Shared helpers for the weather tests (the test_weather_*.py files). It holds no tests itself.

It loads the saved Open-Meteo answers from backend/content/weather/ and builds a fake
Open-Meteo, so no weather test ever uses the network. The name has no test_ at the start on
purpose: pytest only collects test_*.py files, and this one is not a test file.

Used by: test_weather_mapping.py, test_weather_open_meteo.py, test_weather_route.py,
test_weather_settings.py and test_weather_source.py.
"""

import asyncio
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx

from server.tests.helpers import CONFIGURED_SETTINGS, FakeReply

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
    answer = load_sample_answer(name)
    return lambda request: httpx.Response(200, json=answer)


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
