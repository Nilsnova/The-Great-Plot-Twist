"""Weather source: the latest weather for the game, cached, with a recorded answer as backup.

make_weather_source() builds a CachedSource (see server/adapters/base.py) around the Open-Meteo
call in open_meteo.py. Each get() tries these steps in order and stops at the first that works:

    1. cache      an answer fetched less than 10 minutes ago              -> source "cache"
    2. live       ask Open-Meteo (cut off after 3 seconds)                -> source "live"
    3. stale      the last good answer, however old                       -> source "stale"
    4. fallback   the recorded real answer in backend/content/weather/    -> source "fallback"
    5. nothing    raise SourceUnavailable (HTTP 503)

After a failed call the source waits 10 minutes before it asks Open-Meteo again. So however
many players ask, this server instance calls Open-Meteo at most once per 10 minutes. That is
far below the free limits (see open_meteo.py), although Open-Meteo warns that hosts such as
Vercel may be limited earlier. Vercel may run several instances at once, and a cold start begins
with an empty cache, so "once per 10 minutes" holds per instance only.

The data in the cache is a PlaceReading: the weather now and the weather hour by hour, together
with the name of the place they belong to. The recorded answer carries its own place name, so the
name always matches the weather even if the team changes the place in the settings. One request
brings everything, so the hours are cached together with the weather now and are as old as it.

Demo mode (DEMO_MODE=true): Open-Meteo is never called. The source is a RecordedOnlySource, which
goes straight to step 4 and answers with the recorded answer, labelled "fallback". It makes no
failed call, so the log stays quiet.

Used by: app.py (builds the one shared source at start-up), routes/weather.py (asks it for the
weather) and the tests.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import httpx

from server.adapters.base import CachedSource, RecordedData
from server.clock import Clock, utc_now
from server.settings import Settings
from server.weather.mapping import HourReading, WeatherReading
from server.weather.open_meteo import TIMEOUT_SECONDS, fetch_forecast, parse_forecast

logger = logging.getLogger(__name__)

# How long an answer counts as fresh: 10 minutes. The browser asks for the weather every
# 10 minutes too (frontend/src/net/weather.js).
TTL_SECONDS = 600

# The credit text that Open-Meteo's licence (CC BY 4.0, https://open-meteo.com/en/licence) asks
# for. The licence has three conditions, and the page must meet all of them next to the weather:
#   1. give credit, with a link to Open-Meteo     -> these words, linked to https://open-meteo.com/
#   2. give a link to the licence                 -> the name "CC BY 4.0", linked to
#                                                    https://creativecommons.org/licenses/by/4.0/
#   3. say that the data was changed              -> "adapted for the game" (we turn the numbers
#                                                    into four sliders, see mapping.py)
# This text covers 1 and 3 and travels with every answer. The browser adds the licence name and
# both links: weatherAttribution() in frontend/src/net/weather.js.
ATTRIBUTION = "Weather data by Open-Meteo.com, adapted for the game"

# Where the recorded real answer is. The folder is inside backend/, so it ships with the API.
CONTENT_FOLDER = Path(__file__).resolve().parents[2] / "content" / "weather"
RECORDED_FILE_NAME = "recorded-fallback.json"


@dataclass(frozen=True)
class PlaceReading:
    """The weather now, the weather hour by hour, and the name of the place they belong to.

    `hours` is empty when the answer had no hourly block: the recorded answer of 5 Nov 2026 was
    saved before we asked for hours, so a fallback has none.
    """

    place: str
    reading: WeatherReading
    hours: tuple[HourReading, ...] = ()


class RecordedOnlySource(CachedSource):
    """The source for demo mode: it never asks Open-Meteo, so it always answers "fallback".

    CachedSource asks can_call_outside() before every live call. Answering "no" here sends each
    get() straight to the recorded answer, with no failed call and no warning in the log.
    """

    def can_call_outside(self) -> bool:
        return False


def read_recorded_file(folder: Path) -> RecordedData:
    """Read recorded-fallback.json. Raises an error if the file or anything in it is bad."""
    saved = json.loads((folder / RECORDED_FILE_NAME).read_text(encoding="utf-8"))
    place = saved["place"]
    if not isinstance(place, str) or not place.strip():
        raise ValueError("The recorded weather has no place name.")
    recorded_at = datetime.fromisoformat(saved["recordedAt"])
    if recorded_at.tzinfo is None:
        raise ValueError("The recorded weather time has no timezone.")
    forecast = parse_forecast(saved["answer"])
    return RecordedData(
        data=PlaceReading(place, forecast.now, forecast.hours), recorded_at=recorded_at
    )


def load_recorded_weather(folder: Path = CONTENT_FOLDER) -> RecordedData | None:
    """The recorded real answer, or None if the file is missing or broken.

    A broken file must not stop the whole API from starting, so the problem is logged and the
    weather route alone answers 503 when Open-Meteo is down. A test checks that the real file
    loads, so a broken file is caught before it is merged.
    """
    try:
        return read_recorded_file(folder)
    except (OSError, ValueError, KeyError, TypeError) as error:
        logger.warning("The recorded weather file could not be used: %s", type(error).__name__)
        return None


def make_weather_source(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
    recorded_folder: Path = CONTENT_FOLDER,
) -> CachedSource:
    """Build the weather source for this server. Tests pass a fake transport and clock."""

    async def fetch() -> PlaceReading:
        forecast = await fetch_forecast(
            settings.weather_latitude, settings.weather_longitude, transport
        )
        return PlaceReading(settings.weather_place_name, forecast.now, forecast.hours)

    if settings.demo_mode:
        logger.info("Demo mode: the weather route uses the recorded answer only.")
        source_class = RecordedOnlySource
    else:
        source_class = CachedSource

    return source_class(
        "weather",
        fetch,
        ttl_seconds=TTL_SECONDS,
        timeout_seconds=TIMEOUT_SECONDS,
        fallback=load_recorded_weather(recorded_folder),
        clock=clock,
    )
