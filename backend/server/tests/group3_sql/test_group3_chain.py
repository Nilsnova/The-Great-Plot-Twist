"""Verify the merged database schema, wallet directions and server-only RPC grants.

The fixture applies all ten actual migrations twice. These tests inspect that resulting schema.
"""

import os

import pytest

from server.wallet import WALLET_REASONS

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]


def test_the_complete_chain_has_the_reviewed_objects_and_rls(group3_database):
    database = group3_database
    tables, secured = database.execute(
        "select count(*), bool_and(c.relrowsecurity) from pg_class c "
        "join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r'"
    ).fetchone()
    assert (tables, secured) == (18, True)
    assert database.execute(
        "select count(*) from pg_views where schemaname = 'public'"
    ).fetchone() == (1,)
    assert database.execute(
        "select schemaname, count(*) from pg_policies "
        "where schemaname in ('public', 'realtime') group by schemaname order by schemaname"
    ).fetchall() == [("public", 16), ("realtime", 5)]
    assert database.execute(
        "select count(*) from pg_proc where pronamespace = 'public'::regnamespace"
    ).fetchone() == (24,)


def test_the_database_wallet_reasons_equal_the_exact_python_pairs(group3_database):
    database = group3_database
    rows = database.execute("select reason, direction from public.wallet_reasons").fetchall()
    assert len(rows) == 17
    assert dict(rows) == dict(WALLET_REASONS)
    # The old reasons stay in the ledger vocabulary after v2 removes the old trading tables.
    assert dict(rows)["market_buy"] == "spend"
    assert dict(rows)["market_sell"] == "earn"
    assert database.execute("select to_regclass('public.market_trades')").fetchone() == (None,)
    assert database.execute("select to_regclass('public.market_positions')").fetchone() == (None,)


def test_group3_intents_keep_server_only_rights_and_empty_search_paths(group3_database):
    database = group3_database
    functions = database.execute(
        "select oid::regprocedure::text, prosecdef, proconfig from pg_proc "
        "where pronamespace = 'public'::regnamespace "
        "and proname in ('exchange_open_position', 'exchange_close_position', "
        "'exchange_close_used_up', 'prediction_place_stake', 'prediction_settle_pool', "
        "'duel_create', 'duel_answer', 'duel_void')"
    ).fetchall()
    assert len(functions) == 8
    for function, definer, settings in functions:
        assert definer is False
        assert settings == ['search_path=""']
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_function_privilege(%s, %s, 'execute')", (role, function)
            ).fetchone() == (False,)
        assert database.execute(
            "select has_function_privilege('service_role', %s, 'execute')", (function,)
        ).fetchone() == (True,)
