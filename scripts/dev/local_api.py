"""Dev-only adapters. The deployed main:app never imports this module."""

import asyncio
import re
from typing import Any

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from server.app import create_app
from server.auth import Player, PlayerVerifier, unauthorized
from server.flags import default_flags
from server.settings import Settings
from server.supabase_admin import (
    AlreadyApplied,
    InsufficientFunds,
    SupabaseAdmin,
    SupabaseRejected,
)
from tools.seed.database import connect, require_marker
from tools.seed.demo import PLAYER_IDS


def fields(selection: str) -> list[str]:
    """Split the small PostgREST projection subset used by existing server stores."""
    result, start, depth = [], 0, 0
    for index, char in enumerate(selection):
        depth += (char == "(") - (char == ")")
        if char == "," and depth == 0:
            result.append(selection[start:index])
            start = index + 1
    result.append(selection[start:])
    return result


class LocalAdmin(SupabaseAdmin):
    """Use real migrated SQL functions, with a small local read adapter instead of PostgREST.

    Only the selection/filter/join forms used in this repository are supported.
    Unknown forms fail rather than silently return inaccurate demo data.
    """

    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def check_configured(self) -> None:
        pass  # The supervisor has checked the scratch connection and marker.

    async def call_function(self, name: str, params: dict[str, Any]) -> Any:
        return await asyncio.to_thread(self._call, name, params)

    def _call(self, name: str, params: dict[str, Any]) -> Any:
        arguments = sql.SQL(",").join(
            sql.SQL("{} => %s").format(sql.Identifier(key)) for key in params
        )
        values = [
            Jsonb(value) if isinstance(value, dict | list) else value for value in params.values()
        ]
        try:
            with connect(self.database_url, scratch=True) as conn:
                require_marker(conn)
                conn.execute("set local role service_role")
                return conn.execute(
                    sql.SQL("select public.{}({})").format(sql.Identifier(name), arguments), values
                ).fetchone()[0]
        except psycopg.errors.UniqueViolation as error:
            raise AlreadyApplied() from error
        except psycopg.Error as error:
            if error.diag.message_primary == "insufficient_funds":
                raise InsufficientFunds() from error
            raise SupabaseRejected("Local scratch database refused the operation.") from error

    async def select_rows(self, table: str, query: dict[str, str]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._select, table, query)

    def _select(self, table: str, query: dict[str, str]) -> list[dict[str, Any]]:
        with connect(self.database_url, scratch=True) as conn:
            require_marker(conn)
            conn.execute("set local role service_role")
            return self._rows(conn, table, query)

    def _rows(self, conn: psycopg.Connection, table: str, query: dict) -> list[dict]:
        statement = sql.SQL("select to_jsonb(t) from public.{} t").format(sql.Identifier(table))
        clauses, values = [], []
        for key, value in query.items():
            if key in {"select", "limit", "order"}:
                continue
            operator, operand = value.split(".", 1)
            if operator not in {"eq", "gte", "in"}:
                raise ValueError("Unsupported local read filter.")
            if operator == "in":
                if not operand.startswith("(") or not operand.endswith(")"):
                    raise ValueError("Unsupported local membership filter.")
                items = operand[1:-1].split(",")
                clauses.append(
                    sql.SQL("{} in ({})").format(
                        sql.Identifier(key), sql.SQL(",").join(sql.Placeholder() for _ in items)
                    )
                )
                values.extend(items)
                continue
            clauses.append(
                sql.SQL("{} {} %s").format(
                    sql.Identifier(key), sql.SQL("=" if operator == "eq" else ">=")
                )
            )
            values.append(operand)
        if clauses:
            statement += sql.SQL(" where ") + sql.SQL(" and ").join(clauses)
        if "order" in query:
            column, direction = query["order"].split(".")
            if direction not in {"asc", "desc"}:
                raise ValueError("Unsupported local sort.")
            statement += sql.SQL(" order by {} {}").format(
                sql.Identifier(column), sql.SQL(direction)
            )
        statement += sql.SQL(" limit %s")
        values.append(min(int(query.get("limit", "1000")), 1000))
        return [
            self._project(conn, table, row[0], query.get("select", "*"))
            for row in conn.execute(statement, values).fetchall()
        ]

    def _project(self, conn: psycopg.Connection, table: str, row: dict, selection: str) -> dict:
        if selection == "*":
            return row
        result = {}
        relationships = {
            ("crew_seats", "crews"): ("id", "crew_id", False),
            ("crew_seats", "profiles"): ("id", "player_id", False),
            ("crews", "crew_seats"): ("crew_id", "id", True),
        }
        for field in fields(selection):
            if "(" not in field:
                result[field] = row[field]
                continue
            related, nested = field.split("(", 1)
            target, source, many = relationships[(table, related)]
            matches = (
                []
                if row[source] is None
                else self._rows(
                    conn,
                    related,
                    {
                        "select": nested[:-1],
                        target: f"eq.{row[source]}",
                    },
                )
            )
            result[related] = matches if many else (matches[0] if matches else None)
        return result


class LocalVerifier(PlayerVerifier):
    def __init__(self, admin: LocalAdmin) -> None:
        self.admin = admin

    async def verify(self, token: str) -> Player:
        match = re.fullmatch(r"g22\.dev-player-(0[1-9]|1[0-9]|20)\.scratch", token)
        if match is None:
            raise unauthorized("Choose a local demo player.")
        player = str(PLAYER_IDS[int(match[1]) - 1])
        if not await self.admin.select_rows("profiles", {"select": "id", "id": f"eq.{player}"}):
            raise unauthorized("This demo player was deleted. Seed again with --reset.")
        return Player(player)


class LocalExchanger:
    def __init__(self, verifier: LocalVerifier) -> None:
        self.verifier = verifier

    async def exchange(self, code: str, code_verifier: str) -> str:
        token = f"g22.{code}.scratch"
        await self.verifier.verify(token)
        return token


def make_app(database_url: str):
    """Explicit settings: no settings_from_environment(), .env, real keys, or OAuth."""
    admin = LocalAdmin(database_url)
    verifier = LocalVerifier(admin)
    settings = Settings(demo_mode=True, flags=default_flags() | {"market": True})
    app = create_app(
        settings=settings, admin=admin, verifier=verifier, exchanger=LocalExchanger(verifier)
    )

    @app.get("/api/dev/players")
    async def players() -> list[dict]:
        profiles = await admin.select_rows("profiles", {"select": "id,display_name"})
        names = {row["id"]: row["display_name"] for row in profiles}
        return [
            {"code": f"dev-player-{i + 1:02d}", "name": names[str(player)]}
            for i, player in enumerate(PLAYER_IDS)
            if str(player) in names
        ]

    return app
