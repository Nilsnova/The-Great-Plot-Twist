"""Live discovery, request budgets and fresh settlement reads use synthetic HTTP only."""

import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from server.errors import ApiError
from server.sports.source import SportsSource
from server.tests.helpers import FakeClock
from server.tests.test_sports_providers import configured, football_answer


def upcoming():
    row = football_answer()
    row.update(utcDate="2026-11-07T15:00:00Z", status="TIMED")
    row["score"] = {"duration": "REGULAR", "fullTime": {"home": None, "away": None}}
    return row


def clock():
    value = FakeClock()
    value.now = datetime(2026, 11, 6, 12, tzinfo=UTC)
    return value


def test_real_fixed_league_discovery_is_cached_and_individual_fresh_read_bypasses_cache():
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(
            200,
            json={"matches": [upcoming()]} if "competitions" in request.url.path else upcoming(),
        )

    timer = clock()
    source = SportsSource(configured(), clock=timer, transport=httpx.MockTransport(reply))
    first = asyncio.run(source.board())
    assert first.source == "live" and first.matches[0].id == "fd-101"
    assert asyncio.run(source.board()) == first and len(seen) == 1
    assert seen[0].url.host == "api.football-data.org"
    assert seen[0].url.path == "/v4/competitions/PL/matches"
    assert seen[0].url.params["dateFrom"] == "2026-11-06"
    assert asyncio.run(source.match("fd-101")).match == first.matches[0] and len(seen) == 1
    asyncio.run(source.match("fd-101", fresh=True))
    assert len(seen) == 2 and seen[-1].url.path == "/v4/matches/101"
    timer.advance(60)
    asyncio.run(source.board())
    assert len(seen) == 3


def test_provider_outage_never_falls_back_to_a_cached_final_for_settlement():
    replies = [httpx.Response(200, json=upcoming()), httpx.Response(503)]
    source = SportsSource(
        configured(), clock=clock(), transport=httpx.MockTransport(lambda _request: replies.pop(0))
    )
    asyncio.run(source.match("fd-101"))
    with pytest.raises(ApiError) as failure:
        asyncio.run(source.match("fd-101", fresh=True))
    assert failure.value.code == "sports_unavailable"


def test_provider_request_budget_is_bounded_and_recovers_after_a_minute():
    timer, seen = clock(), []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, json=upcoming())

    source = SportsSource(configured(), clock=timer, transport=httpx.MockTransport(reply))
    for _ in range(10):
        asyncio.run(source.match("fd-101", fresh=True))
    with pytest.raises(ApiError):
        asyncio.run(source.match("fd-101", fresh=True))
    assert len(seen) == 10
    timer.advance(60)
    asyncio.run(source.match("fd-101", fresh=True))
    assert len(seen) == 11


@pytest.mark.parametrize(
    "fixture", ["bdl-101", "fd-0", "fd-01", "https://example.org/101", "fd-1/../101"]
)
def test_unapproved_ids_never_leave_the_server(fixture):
    def forbidden(_request):
        pytest.fail("An unapproved identity reached the provider.")

    source = SportsSource(configured(), transport=httpx.MockTransport(forbidden))
    with pytest.raises(ApiError) as failure:
        asyncio.run(source.match(fixture, fresh=True))
    assert failure.value.status_code == 404


def test_missing_credentials_are_unavailable_and_demo_recordings_remain_historical_and_readonly():
    from dataclasses import replace

    from pydantic import SecretStr

    settings = replace(configured(), sports_api_key=SecretStr(""))
    source = SportsSource(settings)
    with pytest.raises(ApiError) as failure:
        asyncio.run(source.board())
    assert failure.value.code == "sports_unavailable"
    demo = SportsSource(replace(configured(), demo_mode=True), clock=clock())
    board = asyncio.run(demo.board())
    assert board.source == "recorded" and all(match.kickoff.year == 2023 for match in board.matches)
    assert all(match.status == "finished" for match in board.matches)
    with pytest.raises(ApiError):
        asyncio.run(demo.match("fd-101", fresh=True))


@pytest.mark.parametrize("change", ["wrong_dates", "duplicates", "too_many", "bad_body", "cup"])
def test_discovery_rejects_unbounded_or_mismatched_provider_lists(change):
    row = upcoming()
    payload = {"matches": [row]}
    if change == "wrong_dates":
        row["utcDate"] = "2027-01-01T12:00:00Z"
    elif change == "duplicates":
        payload["matches"] *= 2
    elif change == "too_many":
        payload["matches"] *= 101
    elif change == "bad_body":
        payload = []
    else:
        row["competition"]["type"] = "CUP"
    source = SportsSource(
        configured(),
        clock=clock(),
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=payload)),
    )
    with pytest.raises(ApiError) as failure:
        asyncio.run(source.board())
    assert failure.value.code == "sports_unavailable"
