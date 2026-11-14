"""Weekly ranking with fake database reads; no network or live SQL evidence."""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from server.errors import ApiError
from server.flags import parse_flags
from server.island import leaderboard
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, World

NOW = datetime(2026, 11, 13, 12, tzinfo=UTC)
START = "2026-11-09T00:00:00+00:00"
END = "2026-11-16T00:00:00+00:00"


def run(admin, now=NOW):
    return asyncio.run(leaderboard.weekly(admin, now))


def row(owner, wave):
    return {"island_owner": str(UUID(int=owner)), "wave": wave}


class Database:
    def __init__(self, pages):
        self.pages, self.calls = iter(pages), []

    async def select_rows(self, table, query):
        self.calls.append((table, query))
        if table == "profiles":
            return [{"display_name": "Captain " + str(UUID(query["id"][3:]).int)}]
        return next(self.pages)


def test_shared_island_appears_once_and_equal_waves_share_rank():
    admin = Database([[row(1, 30), row(2, 30), row(1, 20), row(3, 12)]])
    result = run(admin)
    assert [(e.rank, e.name, e.wave) for e in result.entries] == [
        (1, "Captain 1", 30),
        (1, "Captain 2", 30),
        (3, "Captain 3", 12),
    ]
    assert result.weekStart.isoformat() == START
    assert result.weekEnd.isoformat() == END
    assert set(result.entries[0].model_dump()) == {"rank", "name", "wave"}
    query = admin.calls[0][1]
    assert query["place"] == "eq.island"
    assert query["survived"] == "eq.true" and query["expired"] == "eq.false"
    assert query["and"] == (
        f"(finished_at.gte.{START},finished_at.lt.{END},finished_at.lte.{NOW.isoformat()})"
    )
    assert query["order"] == "wave.desc,island_owner.asc,id.asc"


@pytest.mark.parametrize(
    "now, expected",
    [
        (datetime(2026, 11, 15, 23, 59, 59, tzinfo=UTC), START),
        (datetime(2026, 11, 16, tzinfo=UTC), END),
        (datetime(2027, 1, 1, tzinfo=UTC), "2026-12-28T00:00:00+00:00"),
    ],
)
def test_utc_week_boundaries(now, expected):
    result = run(Database([[]]), now)
    assert result.weekStart.isoformat() == expected
    assert result.entries == []


def test_paginates_runs_before_cutting_off_at_ten_distinct_islands(monkeypatch):
    monkeypatch.setattr(leaderboard, "PAGE_SIZE", 10)
    admin = Database([[row(1, 99)] * 10, [row(i, 80 - i) for i in range(2, 12)]])
    result = run(admin)
    assert len(result.entries) == 10
    assert result.entries[-1].wave == 70
    assert [q["offset"] for t, q in admin.calls if t == "wave_runs"] == ["0", "10"]


def test_scan_limit_is_an_error_not_a_partial_ranking(monkeypatch):
    monkeypatch.setattr(leaderboard, "PAGE_SIZE", 1)
    monkeypatch.setattr(leaderboard, "MAX_PAGES", 2)
    with pytest.raises(ApiError):
        run(Database([[row(1, 90)], [row(1, 80)]]))


def test_malformed_database_result_fails_closed():
    with pytest.raises(ApiError):
        run(Database([[{"island_owner": "not-an-id", "wave": 30}]]))


def test_route_uses_login_flag_and_private_no_store(monkeypatch):
    world = World()
    answer = run(Database([[]]))
    stub = AsyncMock(return_value=answer)
    monkeypatch.setattr(leaderboard, "weekly", stub)
    assert world.client.get("/api/island/leaderboard").status_code == 401
    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    assert off.client.get("/api/island/leaderboard", headers=PLAYER).status_code == 404
    stub.assert_not_awaited()
    response = world.client.get("/api/island/leaderboard", headers=PLAYER)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["entries"] == []


def test_restart_at_a_lower_wave_keeps_the_highest_win_this_week():
    result = run(Database([[row(1, 45), row(1, 1)]]))
    assert len(result.entries) == 1
    assert result.entries[0].wave == 45
