"""Fixed-host sports API adapters. Used by the sports source; transports are injected in tests."""

from collections.abc import Callable
from typing import Any

import httpx

from server.settings import Settings
from server.sports.models import Match
from server.sports.parsing import basketball_match, football_match, positive_id


class SportsProvider:
    """One match per bounded request. No registration, redirects, retries or pagination."""

    def __init__(
        self, base_url: str, header: str, key: str, parser: Callable[[Any, int], Match],
        *, transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self.header = header
        self._key = key
        self.parse = parser
        self.transport = transport

    async def get_match(self, match_id: int) -> Match:
        """Only internal curated ids may reach this method; never forward player URLs."""
        positive_id(match_id)
        async with httpx.AsyncClient(
            timeout=5.0, transport=self.transport, follow_redirects=False,
        ) as client:
            response = await client.get(
                f"{self.base_url}/{match_id}", headers={self.header: self._key},
            )
            response.raise_for_status()
            return self.parse(response.json(), match_id)


def provider_from_settings(
    settings: Settings, *, transport: httpx.AsyncBaseTransport | None = None,
) -> SportsProvider | None:
    """None means recorded only, with no outgoing request even when a key was configured."""
    name = settings.sports_api_provider
    key = settings.sports_api_key.get_secret_value()
    if not settings.flags.get("sports", False) or settings.demo_mode or not name or not key:
        return None
    if name == "football-data.org":
        return SportsProvider(
            "https://api.football-data.org/v4/matches", "X-Auth-Token", key,
            football_match, transport=transport,
        )
    if name == "balldontlie":
        return SportsProvider(
            "https://api.balldontlie.io/nba/v1/games", "Authorization", key,
            basketball_match, transport=transport,
        )
    raise ValueError("Unsupported sports provider.")
