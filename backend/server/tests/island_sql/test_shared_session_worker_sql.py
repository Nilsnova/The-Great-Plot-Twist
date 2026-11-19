"""The actual standalone worker cycle against real canonical SQL and preparation.

Only local disposable PostgreSQL is used. The adapter below replaces HTTP
transport, not membership, authority, snapshots, roots or any domain helper.
"""

import asyncio
from decimal import Decimal

import pytest

pytest.importorskip("psycopg")

from psycopg import sql  # noqa: E402
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.rules import weather_for  # noqa: E402
from server.island.shared_session_worker import run_once  # noqa: E402
from server.settings import Settings  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner  # noqa: E402
from server.tests.island_sql.test_shared_session_close_sql import close  # noqa: E402
from server.tests.island_sql.test_shared_session_pacing_sql import settings  # noqa: E402
from server.tests.island_sql.test_shared_session_wave_sql import bell, live_room  # noqa: E402


class SQLAdmin:
    def __init__(self, database):
        self.database = database

    async def call_function(self, name, arguments):
        self.database.execute("set local role service_role")
        query = sql.SQL("select public.{}({})").format(
            sql.Identifier(name),
            sql.SQL(",").join(sql.SQL("{} => %s").format(sql.Identifier(key)) for key in arguments),
        )
        values = [
            Jsonb(value)
            if isinstance(value, dict)
            else Decimal(str(value))
            if isinstance(value, float)
            else value
            for value in arguments.values()
        ]
        return self.database.execute(query, values).fetchone()[0]

    async def select_rows(self, table, query):
        assert table == "island_recovery_state" and query["select"] == "revision"
        owner = query["island_owner"].removeprefix("eq.")
        rows = self.database.execute(
            "select revision from public.island_recovery_state where island_owner=%s", (owner,)
        ).fetchall()
        return [{"revision": row[0]} for row in rows]


def test_standalone_cycle_prepares_and_accepts_real_auto_bell_then_is_idle(database):
    room = live_room(database)
    settings(database, room, autoNext=True)
    started = bell(database, room)
    close(database, started)
    as_owner(database)
    database.execute(
        "update public.shared_session_settings set next_bell_at=clock_timestamp() "
        "where island_owner=%s",
        (room[0],),
    )
    catalogue = load_island()
    admin = SQLAdmin(database)
    first = asyncio.run(run_once(admin, catalogue, Settings(), weather_for(catalogue, None)))
    assert first["started"] >= 1
    again = asyncio.run(run_once(admin, catalogue, Settings(), weather_for(catalogue, None)))
    assert again["started"] == 0
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.wave_runs where island_owner=%s", (room[0],)
        ).fetchone()[0]
        == 2
    )


def test_standalone_cycle_closes_silent_room_without_any_browser_call(database):
    room = live_room(database)
    started = bell(database, room)
    as_owner(database)
    database.execute(
        "update public.shared_session_controls set "
        "last_seen=clock_timestamp()-interval '61 seconds',"
        "connected_until=clock_timestamp()-interval '46 seconds' where island_owner=%s",
        (room[0],),
    )
    catalogue = load_island()
    result = asyncio.run(
        run_once(SQLAdmin(database), catalogue, Settings(), weather_for(catalogue, None))
    )
    assert result["closed"] >= 1 and result["started"] == 0
    as_owner(database)
    assert (
        database.execute(
            "select outcome from public.island_wave_closures where wave_id=%s", (started["waveId"],)
        ).fetchone()[0]
        == "abandoned"
    )
