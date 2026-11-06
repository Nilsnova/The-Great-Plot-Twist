"""Fixed-host sports API adapters. Used by the sports source; transports are injected in tests."""

from collections.abc import Callable
from datetime import date
from typing import Any

import httpx

from server.settings import Settings
from server.sports.models import Match
from server.sports.parsing import basketball_match, football_match, positive_id


class SportsProvider:
    """One match per bounded request. No registration, redirects, retries or pagination."""

    def __init__(
        self,
        base_url: str,
        header: str,
        key: str,
        parser: Callable[[Any, int], Match],
        *,
        transport: httpx.AsyncBaseTransport | None = None,
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
            timeout=5.0,
            transport=self.transport,
            follow_redirects=False,
        ) as client:
            response = await client.get(
                f"{self.base_url}/{match_id}",
                headers={self.header: self._key},
            )
            response.raise_for_status()
            return self.parse(response.json(), match_id)

    async def get_matches(self, start: date, end: date) -> tuple[Match, ...]:
        """One fixed league and bounded page; no player-selected league or remote address."""
        football = self.base_url == "https://api.football-data.org/v4/matches"
        url = (
            "https://api.football-data.org/v4/competitions/PL/matches"
            if football
            else "https://api.balldontlie.io/nba/v1/games"
        )
        params = (
            {"dateFrom": start.isoformat(), "dateTo": end.isoformat()}
            if football
            else {"start_date": start.isoformat(), "end_date": end.isoformat(), "per_page": "25"}
        )
        async with httpx.AsyncClient(
            timeout=5.0, transport=self.transport, follow_redirects=False
        ) as client:
            response = await client.get(url, params=params, headers={self.header: self._key})
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("The fixture list could not be read.")
        rows = payload.get("matches" if football else "data")
        if not isinstance(rows, list) or len(rows) > 100:
            raise ValueError("The fixture list is not bounded.")
        matches = []
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("The fixture list could not be read.")
            match = self.parse(row if football else {"data": row}, positive_id(row.get("id")))
            if not start <= match.kickoff.date() <= end:
                raise ValueError("The fixture is outside the requested dates.")
            matches.append(match)
        if len({match.id for match in matches}) != len(matches):
            raise ValueError("The fixture list repeats a match.")
        return tuple(sorted(matches, key=lambda match: (match.kickoff, match.id))[:20])


def provider_from_settings(
    settings: Settings,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> SportsProvider | None:
    """None disables live requests; only explicit demo mode displays historical recordings."""
    name = settings.sports_api_provider
    key = settings.sports_api_key.get_secret_value()
    if not settings.flags.get("sports", False) or settings.demo_mode or not name or not key:
        return None
    if name == "football-data.org":
        return SportsProvider(
            "https://api.football-data.org/v4/matches",
            "X-Auth-Token",
            key,
            football_match,
            transport=transport,
        )
    if name == "balldontlie":
        return SportsProvider(
            "https://api.balldontlie.io/nba/v1/games",
            "Authorization",
            key,
            basketball_match,
            transport=transport,
        )
    raise ValueError("Unsupported sports provider.")
