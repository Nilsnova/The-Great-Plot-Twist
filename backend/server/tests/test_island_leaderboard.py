"""Weekly and all-time rankings (T7, T45) with fake database reads; no network or live SQL."""

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


def run_all(admin, now=NOW):
    return asyncio.run(leaderboard.all_time(admin, now))


def run_id(owner, wave):
    """A readable fake run id: owner 3 winning wave 45 is run 3045."""
    return str(UUID(int=owner * 1000 + wave))


def row(owner, wave):
    return {"id": run_id(owner, wave), "island_owner": str(UUID(int=owner)), "wave": wave}


class Database:
    """Answers wave_runs pages in order, public names, and the captains of each run."""

    def __init__(self, pages, crews=None):
        self.pages, self.calls, self.crews = iter(pages), [], crews or {}

    async def select_rows(self, table, query):
        self.calls.append((table, query))
        if table == "profiles":
            return [{"display_name": "Captain " + str(UUID(query["id"][3:]).int)}]
        if table == "wave_participants":
            count = self.crews.get(query["wave_id"][3:], 1)
            return [{"player_id": str(UUID(int=n + 1))} for n in range(count)]
        return next(self.pages)


def test_shared_island_appears_once_and_equal_waves_share_rank():
    admin = Database([[row(1, 30), row(2, 30), row(1, 20), row(3, 12)]])
    result = run(admin)
    assert [(e.rank, e.name, e.wave) for e in result.entries] == [
        (1, "Captain 1", 30),
        (1, "Captain 2", 30),
        (3, "Captain 3", 12),
    ]
    assert result.scope == "week"
    assert result.weekStart.isoformat() == START
    assert result.weekEnd.isoformat() == END
    assert set(result.entries[0].model_dump()) == {"rank", "name", "wave", "crew"}
    query = admin.calls[0][1]
    assert query["place"] == "eq.island"
    assert query["survived"] == "eq.true" and query["expired"] == "eq.false"
    assert query["and"] == (
        f"(finished_at.gte.{START},finished_at.lt.{END},finished_at.lte.{NOW.isoformat()})"
    )


def test_equal_waves_are_listed_by_who_reached_them_first():
    """T45 tie rule: same rank number; the earlier finish is read (and listed) first."""
    admin = Database([[]])
    run(admin)
    assert admin.calls[0][1]["order"] == "wave.desc,finished_at.asc,id.asc"
    assert admin.calls[0][1]["select"] == "id,island_owner,wave"


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
    with pytest.raises(ApiError):
        run_all(Database([[row(1, 90)], [row(1, 80)]]))


def test_malformed_database_result_fails_closed():
    with pytest.raises(ApiError):
        run(Database([[{"id": run_id(1, 30), "island_owner": "not-an-id", "wave": 30}]]))
    with pytest.raises(ApiError):
        run(Database([[{"island_owner": str(UUID(int=1)), "wave": 30}]]))


def test_restart_at_a_lower_wave_keeps_the_highest_win_this_week():
    result = run(Database([[row(1, 45), row(1, 1)]]))
    assert len(result.entries) == 1
    assert result.entries[0].wave == 45


def test_all_time_reads_the_whole_run_history_and_never_resets():
    """T45: the all-time board has no week window, only the request's cutoff."""
    admin = Database([[row(4, 60), row(1, 45), row(4, 12)]])
    result = run_all(admin)
    assert result.scope == "all"
    assert result.weekStart is None and result.weekEnd is None
    assert [(e.rank, e.name, e.wave) for e in result.entries] == [
        (1, "Captain 4", 60),
        (2, "Captain 1", 45),
    ]
    query = admin.calls[0][1]
    assert query["place"] == "eq.island"
    assert query["survived"] == "eq.true" and query["expired"] == "eq.false"
    assert query["finished_at"] == f"lte.{NOW.isoformat()}"
    assert "and" not in query


def test_a_later_reset_or_lower_wave_cannot_lower_an_all_time_score():
    """Scores come from finished winning runs, so a lower later win changes nothing."""
    result = run_all(Database([[row(1, 70), row(1, 3), row(1, 1)]]))
    assert [(e.rank, e.wave) for e in result.entries] == [(1, 70)]


def test_crew_counts_the_captains_of_the_scoring_run_only():
    """Solo and crew share one ranking; the card shows how many captains won that wave."""
    crews = {run_id(1, 30): 3, run_id(2, 28): 1}
    admin = Database([[row(1, 30), row(2, 28), row(1, 10)]], crews)
    result = run(admin)
    assert [(e.name, e.crew) for e in result.entries] == [("Captain 1", 3), ("Captain 2", 1)]
    asked = [q["wave_id"] for t, q in admin.calls if t == "wave_participants"]
    assert asked == [f"eq.{run_id(1, 30)}", f"eq.{run_id(2, 28)}"]
    assert [q["select"] for t, q in admin.calls if t == "wave_participants"] == ["player_id"] * 2


def test_a_run_without_recorded_captains_still_counts_one():
    """Every run has its bell-ringer as participant (backfilled); a gap never shows zero."""
    admin = Database([[row(1, 30)]], {run_id(1, 30): 0})
    assert run(admin).entries[0].crew == 1


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
    assert response.json()["scope"] == "week"


def test_route_scope_chooses_the_board_and_refuses_unknown_scopes(monkeypatch):
    world = World()
    weekly = AsyncMock(return_value=run(Database([[]])))
    every = AsyncMock(return_value=run_all(Database([[]])))
    monkeypatch.setattr(leaderboard, "weekly", weekly)
    monkeypatch.setattr(leaderboard, "all_time", every)
    response = world.client.get("/api/island/leaderboard?scope=all", headers=PLAYER)
    assert response.status_code == 200
    assert response.json() == {"scope": "all", "weekStart": None, "weekEnd": None, "entries": []}
    every.assert_awaited_once()
    assert world.client.get("/api/island/leaderboard?scope=week", headers=PLAYER).status_code == 200
    weekly.assert_awaited_once()
    assert world.client.get("/api/island/leaderboard?scope=ever", headers=PLAYER).status_code == 422
