"""Shared helpers for the bulletin tests (test_bulletin.py, test_chapter_two_hook.py and others).
It holds no tests itself.

It builds a whole test world for GET /api/bulletin: the app, a fake Open-Meteo, a fake clock, a
stage reader (dark or relit) and, when a test asks for it, an Island Exchange with a fake price
feed. Nothing here uses the network. The name has no test_ at the start on purpose: pytest only
collects test_*.py files.

Used by: test_bulletin.py, test_chapter_two_hook.py, test_daily_frame.py and test_content.py.
"""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient
from pydantic import SecretStr

from server.app import create_app
from server.errors import ApiError
from server.flags import default_flags
from server.market.companies import load_companies
from server.market.exchange import MarketService, market_from_settings
from server.settings import Settings
from server.tests.helpers import FakeClock, FakeReply
from server.tests.market_helpers import FakeBinance, good_binance_answer
from server.tests.weather_helpers import (
    LISBON_SETTINGS,
    answer_with_hours,
    load_sample_answer,
    make_transport,
    reply_with_answer,
)
from server.weather.source import CONTENT_FOLDER, make_weather_source
from server.world_stage import DARK, RELIT, WorldStage

URL = "/api/bulletin"

# Day 1 of the game (Monday 16 Nov 2026), 09:00 UTC: an hour after the first bulletin.
DAY_ONE_AT_9 = datetime(2026, 11, 16, 9, 0, tzinfo=UTC)

# The moment the first crew solves the case in most tests: Friday 20 Nov 2026, 21:30 UTC. Night 1
# after it is the night of 21 Nov, so the Chapter 2 hook can fire at 06:00 on 22 Nov at the
# earliest.
RELIT_AT = datetime(2026, 11, 20, 21, 30, tzinfo=UTC)

# The flag "market" is on, and the database is NOT set up: the Exchange then keeps its bases in
# memory, so a test needs no database and never reaches for the network.
MARKET_ON = replace(
    LISBON_SETTINGS,
    supabase_url="",
    supabase_secret_key=SecretStr(""),
    flags={**default_flags(), "market": True},
)

# Words that name the culprit or the case's answers. They must never appear in an open-world text,
# before or after the first solve (CASE-FILE 14.3, the spoiler rule).
SPOILER_WORDS = (
    "harbor master",
    "harbour master",
    "culprit",
    "schooner",
    "night clerk",
    "ledger",
    "twist",
)


def utc(*parts: int) -> datetime:
    return datetime(*parts, tzinfo=UTC)


def spoilers_in(*texts: str) -> list[str]:
    """The words of SPOILER_WORDS found in any of the texts (capitals do not matter)."""
    lowered = [text.lower() for text in texts]
    return [word for word in SPOILER_WORDS if any(word in text for text in lowered)]


class FixedStage:
    """A stage reader for tests: it answers with the stage it was given, or raises an error."""

    def __init__(self, stage: WorldStage | None = None, error: ApiError | None = None) -> None:
        self.stage = stage or WorldStage(DARK, None)
        self.error = error
        self.reads = 0

    async def read(self) -> WorldStage:
        self.reads += 1
        if self.error is not None:
            raise self.error
        return self.stage


def relit_at(moment: datetime = RELIT_AT) -> WorldStage:
    """A relit world, relit at this moment."""
    return WorldStage(RELIT, moment)


def make_market(clock: FakeClock, *, source: str = "live", failing: bool = False) -> MarketService:
    """A real v2 service with a fake Binance, never an outside price or database call."""
    prices = {company.symbol: "100" for company in load_companies() if company.symbol}
    good = good_binance_answer(prices)
    failure = httpx.ConnectError("pretend price outage")
    fake = FakeBinance(failure if failing else good, failure if source == "stale" else good)
    settings = replace(MARKET_ON, demo_mode=source == "replay")
    market = market_from_settings(settings, transport=httpx.MockTransport(fake), clock=clock)
    if source in ("cache", "stale"):
        asyncio.run(market.feed.read(60))
        clock.advance(30 if source == "cache" else 600)
    return market


class World:
    """One test world for the bulletin: the app and everything behind it.

    now        the moment on the fake clock
    hours      an hourly block to add to the fake Open-Meteo answer (see weather_helpers), or None
    sample     which saved answer the fake Open-Meteo sends
    reply      a ready-made fake Open-Meteo reply, which replaces `sample` and `hours`
    stage      the stage of the world; dark unless a test says otherwise
    market     an Island Exchange service, or None for the one create_app builds itself
    """

    def __init__(
        self,
        now: datetime = DAY_ONE_AT_9,
        hours: dict | None = None,
        sample: str = "rain",
        reply: FakeReply | None = None,
        settings: Settings = LISBON_SETTINGS,
        stage: FixedStage | WorldStage | None = None,
        market: MarketService | None = None,
        recorded_folder: Path = CONTENT_FOLDER,
    ) -> None:
        # These tests exercise the enabled service; deployment defaults stay off.
        settings = replace(settings, flags={**settings.flags, "bulletin": True})
        self.clock = FakeClock()
        self.clock.now = now
        self.stage = stage if isinstance(stage, FixedStage) else FixedStage(stage)
        answer = answer_with_hours(sample, hours) if hours else load_sample_answer(sample)
        transport, self.seen = make_transport(reply or reply_with_answer(answer))
        source = make_weather_source(settings, transport, self.clock, recorded_folder)
        self.app = create_app(
            settings,
            weather_source=source,
            market_service=market,
            world_stage=self.stage,
            clock=self.clock,
        )
        self.client = TestClient(self.app)

    def get(self, **options: Any) -> httpx.Response:
        return self.client.get(URL, **options)

    def body(self) -> dict:
        response = self.get()
        assert response.status_code == 200, response.text
        return response.json()

    def kinds(self) -> list[str]:
        """The kinds of the lines of the bulletin, in order."""
        return [line["kind"] for line in self.body()["lines"]]

    def texts(self) -> dict[str, str]:
        """The text of each line, by kind."""
        return {line["kind"]: line["text"] for line in self.body()["lines"]}
