"""The weather now at a player's place, for the Keeper's Lock: cached by rounded coordinates.

Each place gets its own CachedSource (server/adapters/base.py) around fetch_current() in
weather/open_meteo.py, with the same 10-minute TTL and 3-second timeout as GET /api/weather. The
key is the coordinates rounded to 0.1 degree (about 11 km), so a whole class in one city shares one
call per 10 minutes per server instance, and Open-Meteo never sees more than that rounded point.

    a reading at most 10 minutes old (live or cached)       ->  weather source "live"
    Open-Meteo fails, the last good reading is 6 h or newer  ->  weather source "cache"
    nothing usable                                           ->  None: the lock asks its riddle

At most MAX_PLACES places are remembered; the oldest is forgotten first. Demo mode
(DEMO_MODE=true) never calls Open-Meteo, so the lock always asks its riddle there.

Used by: app.py (one shared PlaceWeather) and routes/lock.py.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

import httpx

from server.adapters.base import CachedSource
from server.clock import Clock, utc_now
from server.errors import ApiError
from server.weather.mapping import WeatherReading
from server.weather.open_meteo import TIMEOUT_SECONDS, fetch_current
from server.weather.source import TTL_SECONDS

ROUND_DECIMALS = 1
MAX_PLACES = 256
MAX_CACHE_AGE = timedelta(hours=6)

WeatherKind = Literal["live", "cache"]


@dataclass(frozen=True)
class PlaceReading:
    reading: WeatherReading
    kind: WeatherKind
    fetched_at: datetime


def place_key(latitude: float, longitude: float) -> tuple[float, float]:
    return (round(latitude, ROUND_DECIMALS), round(longitude, ROUND_DECIMALS))


class PlaceWeather:
    """The weather now for any place, one cached source per rounded place."""

    def __init__(
        self,
        *,
        enabled: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
    ) -> None:
        self.enabled = enabled
        self.transport = transport  # tests pass a fake transport, so no network is used
        self.clock = clock
        self.sources: dict[tuple[float, float], CachedSource] = {}

    def source_for(self, key: tuple[float, float]) -> CachedSource:
        source = self.sources.get(key)
        if source is None:
            latitude, longitude = key

            async def fetch() -> WeatherReading:
                return await fetch_current(latitude, longitude, self.transport)

            source = CachedSource(
                "lock-weather",
                fetch,
                ttl_seconds=TTL_SECONDS,
                timeout_seconds=TIMEOUT_SECONDS,
                clock=self.clock,
            )
            self.sources[key] = source
            while len(self.sources) > MAX_PLACES:
                del self.sources[next(iter(self.sources))]
        return source

    async def reading(self, latitude: float, longitude: float) -> PlaceReading | None:
        """The weather now at this place, or None when there is no usable reading."""
        if not self.enabled:
            return None
        try:
            result = await self.source_for(place_key(latitude, longitude)).get()
        except ApiError:  # SourceUnavailable: no live reading and nothing older
            return None
        if result.source in ("live", "cache"):
            return PlaceReading(result.data, "live", result.fetched_at)
        if self.clock() - result.fetched_at <= MAX_CACHE_AGE:
            return PlaceReading(result.data, "cache", result.fetched_at)
        return None
