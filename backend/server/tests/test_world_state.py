"""Shared coast parsing, safe projection and database ports using stand-in reads only."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from server.game.world_state import (
    DatabaseWorldStage,
    WallName,
    WorldSnapshot,
    build_world_view,
    read_world,
    relit_check,
    wall_from_rows,
    world_from_row,
)
from server.supabase_admin import (
    SupabaseAdmin,
    SupabaseRejected,
    SupabaseUnavailable,
)

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)
ROW = {"stage": "relit", "relit_at": NOW.isoformat(), "solves": 3, "extra_lights": 2}


class MemoryAdmin:
    def __init__(self, state=None, wall=None):
        self.state = [ROW] if state is None else state
        self.wall = [] if wall is None else wall
        self.calls = []
        self.error = None

    async def select_rows(self, table, query):
        self.calls.append((table, query))
        if self.error:
            raise self.error
        return self.state if table == "world_state" else self.wall


def test_dark_world_has_no_flags_names_or_line():
    view = build_world_view(WorldSnapshot(), "public line")
    assert view == {
        "stage": "dark",
        "lightsOn": False,
        "fogBankGone": False,
        "gullsRestOpen": False,
        "extraLights": 0,
        "solves": 0,
        "relitAt": None,
        "wall": [],
        "line": None,
    }


def test_the_wall_shows_names_and_order_only():
    state = WorldSnapshot("relit", NOW, 3, 2, (WallName("Brave Puffin 17", 1),))
    view = build_world_view(state, "public line")
    assert view["wall"] == [{"name": "Brave Puffin 17", "order": 1}]
    assert view["line"] == "public line" and view["lightsOn"]
    assert set(view) == {
        "stage",
        "lightsOn",
        "fogBankGone",
        "gullsRestOpen",
        "extraLights",
        "solves",
        "relitAt",
        "wall",
        "line",
    }


@pytest.mark.parametrize(
    "changes",
    [
        {"stage": "unknown"},
        {"relit_at": None},
        {"relit_at": "2026-11-20T12:00:00"},
        {"solves": True},
        {"solves": -1},
        {"solves": 0},
        {"extra_lights": 13},
        {"extra_lights": False},
        {"relit_at": 4},
    ],
)
def test_malformed_world_is_refused(changes):
    with pytest.raises(SupabaseRejected):
        world_from_row(ROW | changes)


@pytest.mark.parametrize(
    "row",
    [
        {},
        {"profiles": None, "solve_no": 1},
        {"profiles": {"display_name": "A"}, "solve_no": True},
        {"profiles": {"display_name": "A"}, "solve_no": 0},
    ],
)
def test_malformed_wall_is_refused(row):
    with pytest.raises(SupabaseRejected):
        wall_from_rows([row])


def test_world_reads_only_the_shared_state_and_public_wall_projection():
    wall = [
        {
            "solve_no": 2,
            "added_at": NOW.isoformat(),
            "profiles": {"display_name": "Quiet Gull 8"},
            "player_id": "discarded",
        }
    ]
    admin = MemoryAdmin(wall=wall)
    state = asyncio.run(read_world(admin))
    assert state.wall == (WallName("Quiet Gull 8", 2),)
    assert admin.calls == [
        (
            "world_state",
            {"select": "stage,relit_at,solves,extra_lights", "id": "eq.1", "limit": "1"},
        ),
        (
            "wall_of_lights",
            {
                "select": "solve_no,added_at,profiles(display_name)",
                "order": "solve_no.asc,added_at.asc,player_id.asc",
                "limit": "200",
            },
        ),
    ]


def test_dark_world_skips_wall_and_unconfigured_laptop_is_dark():
    admin = MemoryAdmin(state=[{"stage": "dark", "relit_at": None, "solves": 0, "extra_lights": 0}])
    assert asyncio.run(read_world(admin)) == WorldSnapshot()
    assert len(admin.calls) == 1
    assert asyncio.run(read_world(SupabaseAdmin("", ""))) == WorldSnapshot()


def test_empty_world_row_and_database_failure_do_not_silently_become_dark():
    with pytest.raises(SupabaseRejected):
        asyncio.run(read_world(MemoryAdmin(state=[])))
    admin = MemoryAdmin()
    admin.error = SupabaseUnavailable()
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(read_world(admin))


def test_stage_reader_caches_for_30_seconds_and_exchange_reads_the_same_state():
    admin = MemoryAdmin()
    clock = [NOW]
    reader = DatabaseWorldStage(admin, clock=lambda: clock[0])
    assert asyncio.run(reader.read()).stage == "relit"
    clock[0] += timedelta(seconds=29)
    assert asyncio.run(reader.read()).relit_at == NOW
    assert len(admin.calls) == 1
    clock[0] += timedelta(seconds=1)
    asyncio.run(reader.read())
    assert len(admin.calls) == 2
    assert asyncio.run(relit_check(admin)) is True
    assert len(admin.calls) == 3


def test_stage_reader_does_not_cache_failures():
    admin = MemoryAdmin()
    reader = DatabaseWorldStage(admin, clock=lambda: NOW)
    admin.error = SupabaseUnavailable()
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(reader.read())
    admin.error = None
    assert asyncio.run(reader.read()).stage == "relit"
    assert len(admin.calls) == 2


@pytest.mark.parametrize("outcome", ["locked", "relit", "added"])
def test_every_solver_gets_the_world_outcome_even_without_a_share(outcome):
    from dataclasses import replace

    from server.game.case_data import load_case
    from server.game.case_snapshot import Solver
    from server.game.case_view import build_case_view
    from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot

    current = replace(
        snapshot(),
        status="finished",
        solved_second=500,
        world_outcome=outcome,
        solvers=(
            Solver(PLAYER, 1, "informant", True, 700, 700, 500),
            Solver(FRIEND, 3, "true_keeper", False, 0, 0, 500),
        ),
    )
    for viewer in (PLAYER, FRIEND):
        reveal = build_case_view(load_case(), current, viewer, 500)["reveal"]
        assert reveal["available"] is True and reveal["world"] == outcome
