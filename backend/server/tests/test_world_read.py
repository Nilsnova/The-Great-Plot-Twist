"""The world reader checks database shapes and returns only public coast state."""

import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest

from server.errors import ApiError
from server.game.case_data import load_case
from server.game.world_state import WorldReader, relit_check
from server.supabase_admin import SupabaseAdmin, SupabaseRejected, SupabaseUnavailable
from server.world_stage import DARK, RELIT, WorldStage

NOW = datetime(2026, 11, 20, 12, tzinfo=UTC)
PUBLIC_LINE = "The coast has a new light."


def state_row(*, relit=False):
    return {
        "stage": RELIT if relit else DARK,
        "relit_at": NOW.isoformat() if relit else None,
        "solves": 3 if relit else 0,
        "extra_lights": 2 if relit else 0,
    }


class Database:
    def __init__(self, *, relit=False):
        self.rows = [state_row(relit=relit)]
        self.wall = [
            {
                "solve_no": 1,
                "added_at": NOW.isoformat(),
                "profiles": {"display_name": "Brave Puffin 17"},
            }
        ]
        self.calls = []
        self.error = None

    async def select_rows(self, table, query):
        self.calls.append((table, query))
        if self.error is not None:
            raise self.error
        return self.rows if table == "world_state" else self.wall


def reader(database=None, **kwargs):
    return WorldReader(database, enabled=True, line_loader=lambda: PUBLIC_LINE, **kwargs)


def test_a_server_without_a_database_returns_the_dark_world():
    world = reader()

    assert asyncio.run(world.read()) == WorldStage(DARK, None)
    assert asyncio.run(world.view()) == {
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


def test_the_unconfigured_admin_created_by_app_startup_is_also_a_dark_world():
    world = reader(SupabaseAdmin("", ""))

    assert asyncio.run(world.read()) == WorldStage(DARK, None)
    assert asyncio.run(world.view())["stage"] == DARK
    assert not asyncio.run(world.relit_check(world.admin))


def test_a_closed_case_flag_reads_no_world_table_or_content():
    database = Database(relit=True)

    def unavailable_line():
        pytest.fail("A closed case read public case content.")

    world = WorldReader(database, enabled=False, line_loader=unavailable_line)

    assert asyncio.run(world.read()) == WorldStage(DARK, None)
    assert asyncio.run(world.view())["stage"] == DARK
    assert not asyncio.run(world.relit_check(database))
    assert not asyncio.run(relit_check(database))
    assert database.calls == []


def test_the_public_view_contains_only_coast_state_names_and_order():
    database = Database(relit=True)
    result = asyncio.run(reader(database).view())

    assert result == {
        "stage": "relit",
        "lightsOn": True,
        "fogBankGone": True,
        "gullsRestOpen": True,
        "extraLights": 2,
        "solves": 3,
        "relitAt": "2026-11-20T12:00:00Z",
        "wall": [{"name": "Brave Puffin 17", "order": 1}],
        "line": PUBLIC_LINE,
    }
    assert database.calls == [
        (
            "world_state",
            {"select": "stage,relit_at,solves,extra_lights", "id": "eq.1", "limit": "1"},
        ),
        (
            "wall_of_lights",
            {
                "select": "solve_no,added_at,profiles(display_name)",
                "order": "solve_no.asc,added_at.asc",
                "limit": "200",
            },
        ),
    ]


@pytest.mark.parametrize(
    "rows",
    [
        None,
        [],
        [None],
        [state_row(), state_row()],
        [{**state_row(), "stage": "unknown"}],
        [{**state_row(), "solves": True}],
        [{**state_row(), "solves": -1}],
        [{**state_row(), "extra_lights": 13}],
        [{**state_row(), "relit_at": NOW.isoformat()}],
        [{**state_row(relit=True), "relit_at": None}],
        [{**state_row(relit=True), "relit_at": "2026-11-20T12:00:00"}],
        [{**state_row(relit=True), "relit_at": "unreadable"}],
    ],
)
def test_malformed_world_rows_are_private_generic_database_errors(rows):
    database = Database()
    database.rows = rows

    with pytest.raises(ApiError) as problem:
        asyncio.run(reader(database).view())
    assert problem.value.status_code == 503
    assert problem.value.code == "database_unavailable"
    assert problem.value.headers == {"Cache-Control": "private, no-store"}
    assert "unreadable" not in problem.value.message


@pytest.mark.parametrize(
    "wall",
    [
        None,
        [None],
        [{"solve_no": True}],
        [{"solve_no": 1, "added_at": NOW.isoformat(), "profiles": None}],
        [{"solve_no": 1, "added_at": "invalid", "profiles": {"display_name": "Name"}}],
        [{"solve_no": 1, "added_at": NOW.isoformat(), "profiles": {"display_name": ""}}],
    ],
)
def test_malformed_wall_rows_are_private_database_errors(wall):
    database = Database(relit=True)
    database.wall = wall

    with pytest.raises(ApiError) as problem:
        asyncio.run(reader(database).view())
    assert problem.value.status_code == 503
    assert problem.value.headers == {"Cache-Control": "private, no-store"}


@pytest.mark.parametrize("error", [SupabaseRejected(), SupabaseUnavailable()])
def test_database_failures_are_503_instead_of_a_dark_world(error):
    database = Database()
    database.error = error

    with pytest.raises(ApiError) as problem:
        asyncio.run(reader(database).view())
    assert problem.value.status_code == 503
    assert problem.value.code == "database_unavailable"


def test_public_case_content_is_read_only_after_the_world_is_relit():
    database = Database()
    world = WorldReader(database, enabled=True, line_loader=lambda: pytest.fail("Unearned line."))
    assert asyncio.run(world.view())["line"] is None
    assert [table for table, _ in database.calls] == ["world_state"]


def test_the_world_stage_cache_expires_at_thirty_seconds_and_never_serves_stale_errors():
    database = Database()
    moment = [NOW]
    world = reader(database, clock=lambda: moment[0])
    assert asyncio.run(world.read()).stage == DARK
    database.rows = [state_row(relit=True)]
    moment[0] += timedelta(seconds=29)
    assert asyncio.run(world.read()).stage == DARK
    assert len(database.calls) == 1
    moment[0] += timedelta(seconds=1)
    assert asyncio.run(world.read()) == WorldStage(RELIT, NOW)
    assert len(database.calls) == 2
    moment[0] += timedelta(seconds=30)
    database.error = SupabaseUnavailable()
    with pytest.raises(ApiError):
        asyncio.run(world.read())


def test_a_clock_that_moves_backwards_refreshes_the_cache():
    database = Database()
    moment = [NOW]
    world = reader(database, clock=lambda: moment[0])
    asyncio.run(world.read())
    moment[0] -= timedelta(seconds=1)
    asyncio.run(world.read())
    assert len(database.calls) == 2


def test_wall_reads_stay_fresh_while_the_stage_uses_its_short_cache():
    database = Database(relit=True)
    world = reader(database, clock=lambda: NOW)
    asyncio.run(world.view())
    database.wall = []

    assert asyncio.run(world.view())["wall"] == []
    assert [table for table, _ in database.calls] == [
        "world_state",
        "wall_of_lights",
        "wall_of_lights",
    ]


def test_the_real_public_line_exposes_no_culprit_or_reveal_text():
    data = load_case()
    view = asyncio.run(WorldReader(Database(relit=True), enabled=True).view())
    encoded = json.dumps(view)
    protected = (
        *(line.text for line in data.reveal.lines),
        *(line.text for line in data.reveal.closing_lines.values()),
        data.reveal.log_reader_line.text,
        data.reveal.last_beat.text,
    )

    if data.accusation.culprit in encoded or any(text in encoded for text in protected):
        pytest.fail("The public world exposed protected case content.", pytrace=False)
    if view["line"] != data.raw["relighting"]["spoiler_rule"]["everyone_else_sees"]:
        pytest.fail("The public world did not use its approved public line.", pytrace=False)


def test_broken_public_content_is_a_private_503():
    def broken_line():
        raise ValueError("Do not expose a content diagnostic.")

    world = WorldReader(Database(relit=True), enabled=True, line_loader=broken_line)
    with pytest.raises(ApiError) as problem:
        asyncio.run(world.view())
    assert problem.value.status_code == 503
    assert problem.value.headers == {"Cache-Control": "private, no-store"}
    assert "diagnostic" not in problem.value.message
