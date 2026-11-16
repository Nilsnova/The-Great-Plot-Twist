"""Weekly and all-time rankings (T7, T45) with fake database reads; no network or live SQL."""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from server.flags import parse_flags
from server.island import leaderboard
from server.supabase_admin import SupabaseRejected
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
    """Answers one bounded runs function, public names, and the captains of each run."""

    def __init__(self, pages, crews=None):
        self.pages, self.calls, self.crews = iter(pages), [], crews or {}

    async def call_function(self, name, params):
        self.calls.append(("rpc", name, params))
        assert name == "leaderboard_best_runs"
        return next(self.pages)

    async def select_rows(self, table, query):
        self.calls.append((table, query))
        if table == "profiles":
            ids = query["id"].removeprefix("in.(").removesuffix(")").split(",")
            return [{"id": i, "display_name": "Captain " + str(UUID(i).int)} for i in ids]
        if table == "wave_participants":
            ids = query["wave_id"].removeprefix("in.(").removesuffix(")").split(",")
            return [
                {"wave_id": i, "player_id": str(UUID(int=n + 1))}
                for i in ids
                for n in range(self.crews.get(i, 1))
            ]
        raise AssertionError(f"Unexpected table read: {table}")


def test_service_maps_equal_rpc_waves_to_competition_ranks():
    admin = Database([[row(1, 30), row(2, 30), row(3, 12)]])
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
    assert admin.calls[0] == (
        "rpc",
        "leaderboard_best_runs",
        {"p_cutoff": NOW.isoformat(), "p_window_start": START, "p_window_end": END},
    )


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


def test_repeated_wins_beyond_old_scan_cap_still_return_top_ten_islands():
    """The service uses the bounded RPC even when history exceeds its former scan limit."""
    class CrowdedHistory(Database):
        def __init__(self):
            self.history = [row(1, 99)] * 2001 + [
                row(owner, 90 - owner) for owner in range(2, 12)
            ]
            self.calls, self.crews = [], {}
            self.best_runs = [row(1, 99)] + [
                row(owner, 90 - owner) for owner in range(2, 11)
            ]

        async def call_function(self, name, params):
            self.calls.append(("rpc", name, params))
            return self.best_runs

        async def select_rows(self, table, query):
            if table == "wave_runs":
                self.calls.append((table, query))
                start = int(query["offset"])
                return self.history[start : start + int(query["limit"])]
            return await super().select_rows(table, query)

    admin = CrowdedHistory()
    result = run(admin)
    assert len(admin.history) > 2000
    assert [(entry.name, entry.wave) for entry in result.entries] == [
        ("Captain 1", 99), *[(f"Captain {owner}", 90 - owner) for owner in range(2, 11)]
    ]
    assert [call[0] for call in admin.calls] == ["rpc", "profiles", "wave_participants"]


def test_service_rejects_more_than_ten_rows_from_database_function():
    admin = Database([[row(owner, 100 - owner) for owner in range(1, 12)]])
    with pytest.raises(SupabaseRejected):
        run(admin)


def test_malformed_database_result_fails_closed():
    with pytest.raises(SupabaseRejected):
        run(Database([[{"id": run_id(1, 30), "island_owner": "not-an-id", "wave": 30}]]))
    with pytest.raises(SupabaseRejected):
        run(Database([[{"island_owner": str(UUID(int=1)), "wave": 30}]]))


def test_service_maps_rpc_best_weekly_win():
    result = run(Database([[row(1, 45)]]))
    assert len(result.entries) == 1
    assert result.entries[0].wave == 45


def test_all_time_reads_the_whole_run_history_and_never_resets():
    """T45: the all-time board has no week window, only the request's cutoff."""
    admin = Database([[row(4, 60), row(1, 45)]])
    result = run_all(admin)
    assert result.scope == "all"
    assert result.weekStart is None and result.weekEnd is None
    assert [(e.rank, e.name, e.wave) for e in result.entries] == [
        (1, "Captain 4", 60),
        (2, "Captain 1", 45),
    ]
    assert admin.calls[0] == (
        "rpc",
        "leaderboard_best_runs",
        {"p_cutoff": NOW.isoformat(), "p_window_start": None, "p_window_end": None},
    )


def test_service_maps_rpc_best_all_time_win():
    """The database supplies the best all-time run after filtering the history."""
    result = run_all(Database([[row(1, 70)]]))
    assert [(e.rank, e.wave) for e in result.entries] == [(1, 70)]


def test_crew_counts_the_captains_of_the_scoring_run_only():
    """Solo and crew share one ranking; the card shows how many captains won that wave."""
    crews = {run_id(1, 30): 3, run_id(2, 28): 1}
    admin = Database([[row(1, 30), row(2, 28)]], crews)
    result = run(admin)
    assert [(e.name, e.crew) for e in result.entries] == [("Captain 1", 3), ("Captain 2", 1)]
    asked = [call[1]["wave_id"] for call in admin.calls if call[0] == "wave_participants"]
    assert asked == [f"in.({run_id(1, 30)},{run_id(2, 28)})"]
    assert [call[1]["select"] for call in admin.calls if call[0] == "wave_participants"] == [
        "wave_id,player_id"
    ]


def test_a_board_costs_one_runs_page_plus_two_batched_reads():
    """Ten rows used to cost 1 + 10 + 10 reads; now the extras are one names and one crews read."""
    owners = range(1, 11)
    admin = Database([[row(i, 100 - i) for i in owners]])
    result = run(admin)
    assert [call[0] for call in admin.calls] == ["rpc", "profiles", "wave_participants"]
    assert [(e.rank, e.name, e.wave, e.crew) for e in result.entries] == [
        (i, f"Captain {i}", 100 - i, 1) for i in owners
    ]
    assert admin.calls[1][1]["id"] == "in.(" + ",".join(str(UUID(int=i)) for i in owners) + ")"


def test_an_empty_board_reads_nothing_more():
    admin = Database([[]])
    assert run(admin).entries == []
    assert [call[0] for call in admin.calls] == ["rpc"]


def test_a_missing_profile_fails_closed():
    class NoProfiles(Database):
        async def select_rows(self, table, query):
            if table == "profiles":
                return []
            return await super().select_rows(table, query)

    with pytest.raises(SupabaseRejected):
        run(NoProfiles([[row(1, 30)]]))


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


def test_crew_is_capped_at_ten():
    """A run whose participant list outgrew a full room (joined and left) shows at most 10."""
    admin = Database([[row(1, 30)]], {run_id(1, 30): 13})
    assert run(admin).entries[0].crew == leaderboard.MAX_CREW == 10
