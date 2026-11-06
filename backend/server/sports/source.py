"""Bounded current sports readings. Recorded results never authorize coin writes.

Used by the sports service. No upstream errors, payloads or secret headers enter logs.
"""

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.settings import Settings
from server.sports.models import Match
from server.sports.providers import provider_from_settings
from server.sports.recorded import load_recorded_matches

CACHE_SECONDS = 60
FIXTURE_ID = re.compile(r"(fd|bdl)-([1-9][0-9]{0,14})\Z")
ATTRIBUTIONS = {
    "football-data.org": "Football data provided by the Football-Data.org API",
    "balldontlie": "Basketball data provided by BALLDONTLIE",
    "recorded": "Historical football results: OpenFootball football.json, CC0 1.0",
}


def unavailable() -> ApiError:
    return ApiError(
        503, "sports_unavailable", "Current sports results are not available right now."
    )


@dataclass(frozen=True)
class SportsReading:
    match: Match
    provider: str
    source: str
    fetched_at: datetime


@dataclass(frozen=True)
class SportsBoard:
    matches: tuple[Match, ...]
    provider: str
    source: str
    fetched_at: datetime
    attribution: str


class SportsSource:
    def __init__(
        self,
        settings: Settings,
        *,
        clock: Clock = utc_now,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.clock = clock
        self.provider = provider_from_settings(settings, transport=transport)
        self.provider_name = settings.sports_api_provider
        self.demo = settings.demo_mode
        self.calls: list[datetime] = []
        self.cached_board: SportsBoard | None = None
        self.cached_matches: dict[str, SportsReading] = {}
        self.lock = asyncio.Lock()

    def require_live(self) -> None:
        if self.provider is None:
            raise unavailable()

    def claim_request(self) -> None:
        now = self.clock()
        self.calls = [moment for moment in self.calls if moment > now - timedelta(minutes=1)]
        limit = 10 if self.provider_name == "football-data.org" else 5
        if len(self.calls) >= limit:
            raise unavailable()
        self.calls.append(now)

    def recent(self, fetched: datetime) -> bool:
        age = (self.clock() - fetched).total_seconds()
        return 0 <= age < CACHE_SECONDS

    async def board(self) -> SportsBoard:
        if self.demo:
            return SportsBoard(
                load_recorded_matches(),
                "recorded",
                "recorded",
                self.clock(),
                ATTRIBUTIONS["recorded"],
            )
        self.require_live()
        async with self.lock:
            if self.cached_board is not None and self.recent(self.cached_board.fetched_at):
                return self.cached_board
            self.claim_request()
            now = self.clock()
            try:
                matches = await self.provider.get_matches(
                    now.date(), (now + timedelta(days=7)).date()
                )
            except (httpx.HTTPError, ValueError, TypeError, KeyError):
                raise unavailable() from None
            prefix = "fd" if self.provider_name == "football-data.org" else "bdl"
            if any(
                FIXTURE_ID.fullmatch(match.id) is None or not match.id.startswith(prefix + "-")
                for match in matches
            ):
                raise unavailable()
            self.cached_board = SportsBoard(
                matches, self.provider_name, "live", now, ATTRIBUTIONS[self.provider_name]
            )
            for match in matches:
                self.cached_matches[match.id] = SportsReading(
                    match, self.provider_name, "live", now
                )
            return self.cached_board

    async def match(self, fixture_id: str, *, fresh: bool = False) -> SportsReading:
        self.require_live()
        identity = FIXTURE_ID.fullmatch(fixture_id)
        prefix = "fd" if self.provider_name == "football-data.org" else "bdl"
        if identity is None or identity.group(1) != prefix:
            raise ApiError(404, "no_such_fixture", "That fixture is not available.")
        async with self.lock:
            cached = self.cached_matches.get(fixture_id)
            if not fresh and cached is not None and self.recent(cached.fetched_at):
                return cached
            self.claim_request()
            try:
                match = await self.provider.get_match(int(identity.group(2)))
            except (httpx.HTTPError, ValueError, TypeError, KeyError):
                raise unavailable() from None
            reading = SportsReading(match, self.provider_name, "live", self.clock())
            self.cached_matches[fixture_id] = reading
            if len(self.cached_matches) > 100:
                self.cached_matches = {
                    key: value
                    for key, value in self.cached_matches.items()
                    if self.recent(value.fetched_at)
                }
            return reading
