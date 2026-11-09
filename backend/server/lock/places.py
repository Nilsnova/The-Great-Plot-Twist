"""The "Change place" search: up to 5 places for a typed name, through Open-Meteo's geocoding API.

The server asks GET https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en
&format=json. Checked on 9 Nov 2026 in Open-Meteo's Geocoding API documentation
(https://open-meteo.com/en/docs/geocoding-api): free for non-commercial use, no key; each result
has name, latitude, longitude, country and admin1 (empty fields are left out); a bad parameter is
HTTP 400 with {"error": true, "reason": ...}; the location data is based on GeoNames, so the
answer carries ATTRIBUTION. The documentation shows no body for "nothing matched", so a missing
"results" list counts as no places.

Answers are cached for 24 hours per typed text (lowercase, spaces tidied), at most MAX_ENTRIES of
them, and only good answers are cached. The text a player typed is never logged. A failed call is a
503 places_unavailable, and the browser keeps the place it had.

Used by: app.py (one shared PlaceSearch) and routes/lock.py.
"""

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.lock.place import clean_name

logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
ATTRIBUTION = "Place search by Open-Meteo.com, data from GeoNames"
MAX_RESULTS = 5
TIMEOUT_SECONDS = 3.0
CACHE_TTL = timedelta(hours=24)
MAX_ENTRIES = 500


@dataclass(frozen=True)
class FoundPlace:
    name: str
    region: str | None
    country: str | None
    latitude: float
    longitude: float


def places_unavailable() -> ApiError:
    return ApiError(503, "places_unavailable", "The place search is not available. Try again soon.")


def degrees(value: Any, limit: float) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = float(value)
    return number if math.isfinite(number) and abs(number) <= limit else None


def optional_name(value: Any) -> str | None:
    return clean_name(value) if isinstance(value, str) else None


def parse_places(body: Any) -> tuple[FoundPlace, ...]:
    """The usable places in a geocoding answer, at most MAX_RESULTS. Odd entries are left out."""
    if not isinstance(body, dict):
        raise ValueError("The geocoding answer is not a JSON object.")
    results = body.get("results", [])
    if not isinstance(results, list):
        raise ValueError("The geocoding answer has an odd results list.")
    places = []
    for item in results:
        if not isinstance(item, dict):
            continue
        name = optional_name(item.get("name"))
        latitude = degrees(item.get("latitude"), 90)
        longitude = degrees(item.get("longitude"), 180)
        if name is None or latitude is None or longitude is None:
            continue
        places.append(
            FoundPlace(
                name=name,
                region=optional_name(item.get("admin1")),
                country=optional_name(item.get("country")),
                latitude=latitude,
                longitude=longitude,
            )
        )
        if len(places) == MAX_RESULTS:
            break
    return tuple(places)


def cache_key(query: str) -> str:
    return " ".join(query.split()).casefold()


class PlaceSearch:
    def __init__(
        self, *, transport: httpx.AsyncBaseTransport | None = None, clock: Clock = utc_now
    ) -> None:
        self.transport = transport  # tests pass a fake transport, so no network is used
        self.clock = clock
        self.cache: dict[str, tuple[datetime, tuple[FoundPlace, ...]]] = {}

    async def search(self, query: str) -> tuple[FoundPlace, ...]:
        key = cache_key(query)
        now = self.clock()
        hit = self.cache.get(key)
        if hit is not None and now - hit[0] < CACHE_TTL:
            return hit[1]
        places = await self.ask_open_meteo(key)
        self.cache[key] = (now, places)
        while len(self.cache) > MAX_ENTRIES:
            del self.cache[next(iter(self.cache))]
        return places

    async def ask_open_meteo(self, query: str) -> tuple[FoundPlace, ...]:
        params = {"name": query, "count": str(MAX_RESULTS), "language": "en", "format": "json"}
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=TIMEOUT_SECONDS
            ) as client:
                response = await client.get(GEOCODING_URL, params=params)
            response.raise_for_status()
            return parse_places(response.json())
        except (httpx.HTTPError, ValueError) as error:
            # The kind of error only: the address holds the text the player typed.
            logger.warning("Place search failed: %s", type(error).__name__)
            raise places_unavailable() from error
