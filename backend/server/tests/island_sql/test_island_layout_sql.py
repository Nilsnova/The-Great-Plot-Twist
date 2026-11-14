"""Real SQL checks for 20261114110000_island_layout.sql (T36, D041): island_move() stores a cell,
refuses while a wave runs, refuses busy when the rows changed since the server checked them, and
the table keeps the browser out and rejects unknown spots.

Opt-in, like the other island_sql checks, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import json

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    call,
    open_island,
    start,
)


def move(database, plot, x_half, z_half, seen):
    return call(
        database,
        "select public.island_move(%s, %s, %s, %s, %s, %s::jsonb)",
        OWNER,
        OWNER,
        plot,
        x_half,
        z_half,
        json.dumps(seen),
    )


def rows(database):
    as_owner(database)
    return database.execute(
        "select plot, x_half, z_half from public.island_layout where island_owner = %s"
        " order by plot collate \"C\"",
        (OWNER,),
    ).fetchall()


def ready(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")


def test_a_move_is_stored_and_a_second_move_compares_the_rows_it_saw(database):
    ready(database)
    assert move(database, "cannon_1", -20, -21, []) == {"status": "done"}
    assert rows(database) == [("cannon_1", -20, -21)]
    seen = [{"plot": "cannon_1", "x_half": -20, "z_half": -21}]
    assert move(database, "wall_10", -18, -2, seen) == {"status": "done"}
    assert rows(database) == [("cannon_1", -20, -21), ("wall_10", -18, -2)]


def test_a_move_against_rows_that_changed_is_refused_busy_and_changes_nothing(database):
    ready(database)
    assert move(database, "cannon_1", -20, -21, [])["status"] == "done"
    assert move(database, "wall_1", -34, -8, []) == {"status": "refused", "reason": "busy"}
    assert rows(database) == [("cannon_1", -20, -21)]


def test_no_move_while_a_wave_runs_on_the_island(database):
    ready(database)
    start(database, OWNER, "bell-0001", owner=OWNER)
    assert move(database, "cannon_1", -20, -21, []) == {
        "status": "refused",
        "reason": "wave_running",
    }
    assert rows(database) == []


def test_the_table_rejects_an_unknown_spot_and_the_browser_gets_nothing(database):
    ready(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        move(database, "cabin", 0, 0, [])
    database.rollback()
    as_owner(database)
    assert database.execute(
        "select has_table_privilege('authenticated', 'public.island_layout', 'select'),"
        " has_function_privilege('authenticated',"
        " 'public.island_move(uuid, uuid, text, integer, integer, jsonb)', 'execute')"
    ).fetchone() == (False, False)
