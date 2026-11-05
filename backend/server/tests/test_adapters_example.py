"""Tests for adapters/example.py. They show how to test a real data source: no network."""

import asyncio

from server.adapters.example import (
    RECORDED_PRICES,
    example_source,
    fetch_example_prices,
    make_example_source,
)
from server.tests.helpers import FakeClock


def test_example_source_returns_the_made_up_prices_live():
    clock = FakeClock()

    result = asyncio.run(make_example_source(clock=clock).get())

    assert result.source == "live"
    assert result.data == {"BREW": 12.5, "TWST": 99.0}
    assert result.fetched_at == clock.now


def test_example_source_falls_back_to_the_recorded_prices_when_the_fetch_fails():
    async def broken_fetch() -> dict[str, float]:
        raise ConnectionError("pretend the outside service is down")

    source = make_example_source(fetch=broken_fetch, clock=FakeClock())

    result = asyncio.run(source.get())

    assert result.source == "fallback"
    assert result.data == RECORDED_PRICES.data
    assert result.fetched_at == RECORDED_PRICES.recorded_at


def test_the_example_fetch_function_needs_no_network():
    assert asyncio.run(fetch_example_prices()) == {"BREW": 12.5, "TWST": 99.0}


def test_the_shared_example_source_works():
    result = asyncio.run(example_source.get())

    assert result.data == {"BREW": 12.5, "TWST": 99.0}
    assert result.source in ("live", "cache")
