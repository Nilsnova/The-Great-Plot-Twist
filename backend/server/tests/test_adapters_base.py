"""Tests for adapters/base.py: the cached source and every one of its fallback steps.

Order of the steps: fresh cache, live fetch, stale value, recorded fallback, error.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

import pytest

from server.adapters.base import CachedSource, RecordedData, SourceResult, SourceUnavailable
from server.clock import Clock
from server.tests.helpers import FakeClock

TTL_SECONDS = 60
RECORDED = RecordedData(data={"price": 1}, recorded_at=datetime(2026, 10, 1, tzinfo=UTC))


class FakeService:
    """A pretend outside service. It counts calls and gives the prepared answers in order.

    An answer that is an Exception is raised instead of returned.
    """

    def __init__(self, *answers: Any) -> None:
        self.answers = list(answers)
        self.calls = 0

    async def fetch(self) -> Any:
        self.calls += 1
        await asyncio.sleep(0)  # let other waiting requests run, like a real network call
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def make_source(
    service: FakeService, clock: Clock, fallback: RecordedData | None = None
) -> CachedSource:
    return CachedSource(
        "test", service.fetch, ttl_seconds=TTL_SECONDS, fallback=fallback, clock=clock
    )


def get(source: CachedSource) -> SourceResult:
    """Run source.get() from a normal (not async) test."""
    return asyncio.run(source.get())


# --- step 1 and 2: cache and live ---


def test_first_call_fetches_live_data():
    clock = FakeClock()
    service = FakeService({"price": 5})

    result = get(make_source(service, clock))

    assert result.source == "live"
    assert result.data == {"price": 5}
    assert result.fetched_at == clock.now
    assert service.calls == 1


def test_second_call_inside_the_ttl_uses_the_cache_and_does_not_call_the_service():
    clock = FakeClock()
    service = FakeService({"price": 5})
    source = make_source(service, clock)
    first = get(source)

    clock.advance(TTL_SECONDS - 1)
    second = get(source)

    assert second.source == "cache"
    assert second.data == {"price": 5}
    assert second.fetched_at == first.fetched_at  # the time the data was fetched, not now
    assert service.calls == 1


def test_after_the_ttl_the_service_is_called_again():
    clock = FakeClock()
    service = FakeService({"price": 5}, {"price": 6})
    source = make_source(service, clock)
    get(source)

    clock.advance(TTL_SECONDS)
    result = get(source)

    assert result.source == "live"
    assert result.data == {"price": 6}
    assert service.calls == 2


# --- step 3 to 5: when the service fails ---


def test_failed_refresh_returns_the_last_good_data_marked_stale():
    clock = FakeClock()
    service = FakeService({"price": 5}, ConnectionError("down"))
    source = make_source(service, clock, fallback=RECORDED)
    first = get(source)

    clock.advance(TTL_SECONDS + 1)
    result = get(source)

    assert result.source == "stale"
    assert result.data == {"price": 5}
    assert result.fetched_at == first.fetched_at  # honest about how old the data is


def test_with_no_good_data_the_recorded_fallback_is_used():
    service = FakeService(ConnectionError("down"))

    result = get(make_source(service, FakeClock(), fallback=RECORDED))

    assert result.source == "fallback"
    assert result.data == {"price": 1}
    assert result.fetched_at == RECORDED.recorded_at


def test_with_nothing_at_all_a_clear_error_is_raised():
    service = FakeService(ConnectionError("down"))

    with pytest.raises(SourceUnavailable):
        get(make_source(service, FakeClock()))


def test_source_unavailable_is_a_503_in_the_standard_error_shape():
    error = SourceUnavailable("weather")

    assert error.status_code == 503
    assert error.code == "source_unavailable"
    assert "weather" in error.message


def test_a_call_that_takes_too_long_is_cut_off_by_the_timeout():
    async def slow_fetch() -> dict[str, int]:
        await asyncio.sleep(5)
        return {"price": 99}

    source = CachedSource(
        "slow",
        slow_fetch,
        ttl_seconds=TTL_SECONDS,
        timeout_seconds=0.01,
        fallback=RECORDED,
        clock=FakeClock(),
    )

    result = get(source)

    assert result.source == "fallback"


# --- at most one call per TTL ---


def test_after_a_failure_the_service_is_left_alone_until_the_ttl_has_passed():
    clock = FakeClock()
    service = FakeService(ConnectionError("down"), {"price": 7})
    source = make_source(service, clock, fallback=RECORDED)

    first = get(source)  # fails, so the fallback is used
    clock.advance(TTL_SECONDS - 1)
    second = get(source)  # still waiting: the service is not called again

    assert first.source == "fallback"
    assert second.source == "fallback"
    assert service.calls == 1

    clock.advance(1)
    third = get(source)  # one full TTL since the failure: try again

    assert third.source == "live"
    assert third.data == {"price": 7}
    assert service.calls == 2


def test_many_requests_at_the_same_moment_cause_only_one_call():
    service = FakeService({"price": 5})
    source = make_source(service, FakeClock())

    async def five_players_ask_at_once() -> list[SourceResult]:
        return await asyncio.gather(*[source.get() for _ in range(5)])

    results = asyncio.run(five_players_ask_at_once())

    assert service.calls == 1
    assert sorted(result.source for result in results) == ["cache"] * 4 + ["live"]


# --- safety ---


def test_logs_show_the_kind_of_error_but_never_its_text(caplog):
    # Error text can contain a web address with a secret key in it.
    service = FakeService(ValueError("https://api.example.com/prices?apikey=SUPER_SECRET"))

    with caplog.at_level(logging.WARNING):
        get(make_source(service, FakeClock(), fallback=RECORDED))

    assert "ValueError" in caplog.text
    assert "SUPER_SECRET" not in caplog.text


@pytest.mark.parametrize(
    ("ttl_seconds", "timeout_seconds"),
    [(0, 5), (-1, 5), (TTL_SECONDS, 0), (TTL_SECONDS, -1)],
)
def test_ttl_and_timeout_must_be_more_than_zero(ttl_seconds, timeout_seconds):
    with pytest.raises(ValueError, match="must be more than 0"):
        CachedSource(
            "test",
            FakeService().fetch,
            ttl_seconds=ttl_seconds,
            timeout_seconds=timeout_seconds,
        )
