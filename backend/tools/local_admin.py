"""Strict, local SupabaseAdmin port: real SQL functions and a small PostgREST read subset.

Unsupported tables, functions, relations or query syntax fail closed. This module never has a
network transport, Supabase address or credentials. SQL identifiers are validated and quoted;
values are bound parameters. It is a development tool, not a replacement Supabase service.
"""

import asyncio
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from server.supabase_admin import (
    AlreadyApplied,
    InsufficientFunds,
    SupabaseAdmin,
    SupabaseRejected,
    SupabaseUnavailable,
)

TABLES = frozenset(
    "profiles wallets saves entry_profiles captain_name_rerolls crews crew_seats "
    "islets islet_buildings "
    "exchange_positions exchange_events wallet_transactions wallet_reasons islets islet_buildings "
    "prediction_pools prediction_stakes duels duel_moves "
    "case_state case_finds case_deductions case_accusations case_solvers case_actions "
    "board_pins finale_posts finale_signals npc_orders "
    "world_state world_solves wall_of_lights "
    "festival_claims festival_queue festival_actions fixtures sports_stakes".split()
)
FUNCTIONS = frozenset(
    "assign_captain_name reroll_captain_name save_progress delete_player grant_entry_kit "
    "crew_create crew_find_by_code crew_take_seat crew_start "
    "exchange_open_position exchange_close_position exchange_close_used_up "
    "prediction_place_stake prediction_settle_pool duel_create duel_answer duel_void "
    "case_open case_start_route case_accuse case_clock_forward islet_build "
    "board_pin board_pair finale_nightfall finale_take_post finale_signal "
    "npc_fetch_pin npc_man_light "
    "festival_claim festival_ring_join festival_ring_leave festival_ring_candidate "
    "host_console_overview host_console_crews host_close_test_crew host_record_keepalive "
    "sports_place_stake sports_settle_fixture".split()
)
# (parent, embedded table): (parent key, embedded key, many)
RELATIONS = {
    ("crew_seats", "crews"): ("crew_id", "id", False),
    ("crew_seats", "profiles"): ("player_id", "id", False),
    ("crews", "crew_seats"): ("id", "crew_id", True),
    ("wall_of_lights", "profiles"): ("player_id", "id", False),
    **{
        ("crews", table): ("id", "crew_id", table != "case_state")
        for table in (
            "case_state",
            "case_finds",
            "case_deductions",
            "case_accusations",
            "case_solvers",
            "board_pins",
            "finale_posts",
            "finale_signals",
            "npc_orders",
        )
    },
}
IDENTIFIER = re.compile(r"[a-z][a-z0-9_]*\Z")


def selection(text):
    """Parse only column names, *, commas and explicit nested relations."""
    if not isinstance(text, str):
        raise SupabaseRejected()
    tokens = re.findall(r"[a-z][a-z0-9_]*|[*,():]", text)
    if "".join(tokens) != text or not tokens:
        raise SupabaseRejected()
    position = 0

    def fields(nested=False):
        nonlocal position
        result = []
        while position < len(tokens):
            name = tokens[position]
            if name != "*" and not IDENTIFIER.fullmatch(name):
                raise SupabaseRejected()
            position += 1
            table = name
            if position < len(tokens) and tokens[position] == ":":
                position += 1
                if position == len(tokens) or not IDENTIFIER.fullmatch(tokens[position]):
                    raise SupabaseRejected()
                table = tokens[position]
                position += 1
            children = None
            if position < len(tokens) and tokens[position] == "(":
                position += 1
                children = fields(True)
            if table != name and children is None:
                raise SupabaseRejected()
            result.append((name, table, children))
            if position == len(tokens):
                if nested:
                    raise SupabaseRejected()
                return result
            separator = tokens[position]
            position += 1
            if separator == ")" and nested:
                return result
            if separator != "," or position == len(tokens):
                raise SupabaseRejected()
        raise SupabaseRejected()

    result = fields()
    if position != len(tokens):
        raise SupabaseRejected()
    return result


def json_value(value):
    """Match the JSON types returned by PostgREST, including embedded records."""
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    return value


class LocalAdmin(SupabaseAdmin):
    def __init__(self, database):
        # Deliberately no base client, address, secret key or network fallback.
        self.database = database

    def check_configured(self):
        if self.database.uri is None:
            raise SupabaseUnavailable()

    def _run(self, operation, *, read_only=False):
        import psycopg

        self.check_configured()
        try:
            with self.database.connect() as connection:
                if read_only:
                    # Embedded reads share the snapshot of one PostgREST SQL statement.
                    connection.execute("set transaction isolation level repeatable read read only")
                connection.execute("set local role service_role")
                return json_value(operation(connection))
        except psycopg.Error as error:
            if error.sqlstate == "23505":
                raise AlreadyApplied() from None
            if error.sqlstate == "P0001" and error.diag.message_primary == "insufficient_funds":
                raise InsufficientFunds() from None
            if isinstance(error, psycopg.OperationalError):
                raise SupabaseUnavailable() from None
            # Database errors can contain private rows; do not log or repeat them.
            raise SupabaseRejected() from None

    async def call_function(self, name, params):
        if name not in FUNCTIONS:
            raise SupabaseRejected()
        return await asyncio.to_thread(
            self._run, lambda connection: self._call(connection, name, params)
        )

    def _call(self, connection, name, params):
        from psycopg import sql
        from psycopg.types.json import Jsonb

        signatures = connection.execute(
            "select proargnames, oidvectortypes(proargtypes) from pg_proc "
            "where pronamespace = 'public'::regnamespace and proname = %s",
            (name,),
        ).fetchall()
        if len(signatures) != 1:
            raise SupabaseRejected()
        names, types_text = signatures[0]
        names = names or []
        kinds = types_text.split(", ") if types_text else []
        if len(names) != len(kinds):
            raise SupabaseRejected()
        types = dict(zip(names, kinds, strict=True))
        if (
            not isinstance(params, dict)
            or (not params and names)
            or not params.keys() <= types.keys()
        ):
            raise SupabaseRejected()
        arguments, values = [], []
        for key, value in params.items():
            kind = types[key]
            # These type spellings come only from PostgreSQL's catalog.
            arguments.append(sql.SQL("{} => %s::{}").format(sql.Identifier(key), sql.SQL(kind)))
            values.append(
                Jsonb(value) if kind in ("json", "jsonb") and value is not None else value
            )
        statement = sql.SQL("select public.{}({})").format(
            sql.Identifier(name), sql.SQL(", ").join(arguments)
        )
        return connection.execute(statement, values).fetchone()[0]

    async def select_rows(self, table, query):
        if table not in TABLES or "select" not in query:
            raise SupabaseRejected()
        fields = selection(query["select"])
        return await asyncio.to_thread(
            self._run,
            lambda connection: self._select(connection, table, query, fields),
            read_only=True,
        )

    def _columns(self, connection, table):
        return {
            row[0]
            for row in connection.execute(
                "select attname from pg_attribute where attrelid = %s::regclass "
                "and attnum > 0 and not attisdropped",
                (f"public.{table}",),
            )
        }

    def _raw(self, connection, table, filters, order=None):
        from psycopg import sql
        from psycopg.rows import dict_row

        columns = self._columns(connection, table)
        clauses, values = [], []
        for column, expression in filters.items():
            if not isinstance(expression, str):
                raise SupabaseRejected()
            operator, separator, value = expression.partition(".")
            if column not in columns or not separator:
                raise SupabaseRejected()
            if operator == "is" and value == "null":
                clauses.append(sql.SQL("{} is null").format(sql.Identifier(column)))
                continue
            if operator == "in" and value.startswith("(") and value.endswith(")"):
                members = value[1:-1].split(",")
                if not 1 <= len(members) <= 200 or not all(members):
                    raise SupabaseRejected()
                clauses.append(
                    sql.SQL("{} in ({})").format(
                        sql.Identifier(column),
                        sql.SQL(", ").join(sql.Placeholder() for _ in members),
                    )
                )
                values.extend(members)
                continue
            symbols = {"eq": "=", "gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}
            symbol = symbols.get(operator)
            if symbol is None:
                raise SupabaseRejected()
            clauses.append(sql.SQL("{} {} %s").format(sql.Identifier(column), sql.SQL(symbol)))
            values.append(value)
        statement = sql.SQL("select * from public.{}").format(sql.Identifier(table))
        if clauses:
            statement += sql.SQL(" where ") + sql.SQL(" and ").join(clauses)
        if order:
            orders = []
            for part in order.split(","):
                column, separator, direction = part.partition(".")
                if column not in columns or not separator or direction not in ("asc", "desc"):
                    raise SupabaseRejected()
                orders.append(sql.SQL("{} {}").format(sql.Identifier(column), sql.SQL(direction)))
            statement += sql.SQL(" order by ") + sql.SQL(", ").join(orders)
        with connection.cursor(row_factory=dict_row) as cursor:
            return cursor.execute(statement, values).fetchall()

    def _project(self, connection, table, row, fields, query):
        result = {}
        for name, related_table, children in fields:
            if children is None:
                if name == "*":
                    result.update(row)
                elif name in row:
                    result[name] = row[name]
                else:
                    raise SupabaseRejected()
                continue
            relation = RELATIONS.get((table, related_table))
            if relation is None:
                raise SupabaseRejected()
            source, destination, many = relation
            nested = {
                key.removeprefix(f"{name}."): value
                for key, value in query.items()
                if key.startswith(f"{name}.")
            }
            if row[source] is None:
                projected = []
            else:
                nested[destination] = f"eq.{row[source]}"
                projected = self._select(connection, related_table, nested, children)
            if not many and len(projected) > 1:
                raise SupabaseRejected()
            result[name] = projected if many else (projected[0] if projected else None)
        return result

    def _select(self, connection, table, query, fields):
        self._validate_fields(connection, table, fields)
        relations = {name for name, _, children in fields if children is not None}
        for key in query:
            if "." in key and key.split(".", 1)[0] not in relations:
                raise SupabaseRejected()
        filters = {
            key: value
            for key, value in query.items()
            if key not in ("select", "order", "limit") and "." not in key
        }
        order = query.get("order")
        nested_order = order == "crews(updated_at).desc" and table == "crew_seats"
        rows = self._raw(connection, table, filters, None if nested_order else order)
        if nested_order:

            def updated(row):
                return self._raw(connection, "crews", {"id": f"eq.{row['crew_id']}"})[0][
                    "updated_at"
                ]

            rows.sort(key=updated, reverse=True)
        try:
            limit = int(query.get("limit", "10000"))
        except (ValueError, TypeError):
            raise SupabaseRejected() from None
        if not 1 <= limit <= 10000:
            raise SupabaseRejected()
        return [self._project(connection, table, row, fields, query) for row in rows[:limit]]

    def _validate_fields(self, connection, table, fields):
        columns = self._columns(connection, table)
        for name, related_table, children in fields:
            if children is None:
                if name != "*" and name not in columns:
                    raise SupabaseRejected()
            else:
                if (table, related_table) not in RELATIONS:
                    raise SupabaseRejected()
                self._validate_fields(connection, related_table, children)
