"""Narrow no-network SupabaseAdmin adapter for disposable-Postgres route tests.

It deliberately supports only the island tables and recovery/demolition RPCs needed by those
checks. The test passes its existing scratch-database connection, so fixture seeding, HTTP handlers
and SQL
transactions share one rollbackable database transaction.
"""

import asyncio
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from psycopg import Error, sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from server.supabase_admin import SupabaseAdmin, SupabaseRejected

TABLES = frozenset(
    {
        "islands",
        "island_members",
        "island_layout",
        "island_recovery_state",
        "islet_buildings",
        "island_research",
        "islets",
        "wallets",
        "wallet_transactions",
        "profiles",
        "structure_repair_receipts",
        "wave_runs",
    }
)
FUNCTIONS = frozenset(
    {
        "island_open",
        "islet_build",
        "island_economy_context",
        "island_lifecycle_actor_status",
        "personal_captain_context",
        "wave_rules_keep",
        "structure_recovery_read_state",
        "island_structure_repair",
        "island_demolish",
        "recovery_wave_start",
        "recovery_wave_join",
        "recovery_wave_current",
        "recovery_wave_inputs",
        "recovery_wave_events_page",
        "recovery_wave_report_health",
        "recovery_wave_finish",
        "recovery_wave_recover_rewards",
        "recovery_wave_revive",
        "wave_revive",
    }
)
IDENTIFIER = re.compile(r"[a-z][a-z0-9_]*\Z")


def _json_value(value):
    """Return the JSON scalar spellings a PostgREST row would expose."""
    if isinstance(value, (UUID, date, datetime)):
        return value.isoformat() if isinstance(value, (date, datetime)) else str(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


class ScratchRecoveryAdmin(SupabaseAdmin):
    """Use the provided disposable connection; never create a network client or read env."""

    def __init__(self, connection):
        self.connection = connection
        self.last_database_error = None

    async def call_function(self, name, params):
        if name not in FUNCTIONS or not isinstance(params, dict):
            raise SupabaseRejected()
        try:
            return await asyncio.to_thread(self._call, name, params)
        except Error as error:
            # Synthetic scratch data only; retain the SQLSTATE and primary label for assertions.
            self.last_database_error = (name, error.sqlstate, error.diag.message_primary)
            raise

    def _call(self, name, params):
        self.connection.execute("set local role service_role")
        signatures = self.connection.execute(
            "select proargnames, oidvectortypes(proargtypes) from pg_proc "
            "where pronamespace = 'public'::regnamespace and proname = %s",
            (name,),
        ).fetchall()
        # Like PostgREST: an overloaded function is chosen by the named arguments of the call.
        signatures = [row for row in signatures if set(row[0] or []) == set(params)] or signatures
        if len(signatures) != 1:
            raise SupabaseRejected()
        names, types_text = signatures[0]
        names = names or []
        kinds = types_text.split(", ") if types_text else []
        if len(names) != len(kinds) or not params.keys() <= set(names):
            raise SupabaseRejected()
        arguments, values = [], []
        for key, value in params.items():
            if not IDENTIFIER.fullmatch(key):
                raise SupabaseRejected()
            kind = kinds[names.index(key)]
            arguments.append(sql.SQL("{} => %s::{}").format(sql.Identifier(key), sql.SQL(kind)))
            values.append(
                Jsonb(value) if kind in {"json", "jsonb"} and value is not None else value
            )
        statement = sql.SQL("select public.{}({})").format(
            sql.Identifier(name), sql.SQL(", ").join(arguments)
        )
        return self.connection.execute(statement, values).fetchone()[0]

    async def select_rows(self, table, query):
        if table not in TABLES or not isinstance(query, dict):
            raise SupabaseRejected()
        return await asyncio.to_thread(self._select, table, query)

    def _select(self, table, query):
        columns = query.get("select", "*").split(",")
        if not columns or any(not IDENTIFIER.fullmatch(column) for column in columns):
            raise SupabaseRejected()
        clauses, values = [], []
        for key, value in query.items():
            if key in {"select", "limit", "order"}:
                continue
            if not IDENTIFIER.fullmatch(key):
                raise SupabaseRejected()
            if value == "is.null":
                clauses.append(sql.SQL("{} is null").format(sql.Identifier(key)))
            elif isinstance(value, str) and value.startswith("eq."):
                clauses.append(sql.SQL("{} = %s").format(sql.Identifier(key)))
                values.append(value[3:])
            else:
                raise SupabaseRejected()
        statement = sql.SQL("select {} from public.{}").format(
            sql.SQL(", ").join(sql.Identifier(column) for column in columns),
            sql.Identifier(table),
        )
        if clauses:
            statement += sql.SQL(" where ") + sql.SQL(" and ").join(clauses)
        order = query.get("order")
        if order:
            parts = order.split(",")
            ordering = []
            for part in parts:
                name, _, direction = part.partition(".")
                if not IDENTIFIER.fullmatch(name) or direction not in {"asc", "desc"}:
                    raise SupabaseRejected()
                ordering.append(sql.SQL("{} {}").format(sql.Identifier(name), sql.SQL(direction)))
            statement += sql.SQL(" order by ") + sql.SQL(", ").join(ordering)
        limit = query.get("limit")
        if limit is not None:
            if not limit.isdigit():
                raise SupabaseRejected()
            statement += sql.SQL(" limit %s")
            values.append(int(limit))
        self.connection.execute("set local role service_role")
        with self.connection.cursor(row_factory=dict_row) as cursor:
            rows = cursor.execute(statement, values).fetchall()
        return [{key: _json_value(value) for key, value in row.items()} for row in rows]
