"""Static contracts for the Phase 1 case schema and its guarded write functions.

Used alongside the real PostgreSQL checks. The data file supplies story facts at runtime;
the migration carries only structural guards and never adds wallet reasons.
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase/migrations/20261106060000_case_rules.sql"
)
SQL = MIGRATION.read_text()
TABLES = {
    "case_state",
    "case_finds",
    "case_deductions",
    "case_accusations",
    "case_solvers",
    "case_actions",
}
SIGNATURES = {
    "case_window_open": "integer, integer, integer, integer",
    "case_begin": "uuid, uuid, text",
    "case_finish": "uuid, uuid, text, text, text, text, integer",
    "case_open": "uuid, text, jsonb",
    "case_start_route": "uuid, uuid, text, text, text, text[], jsonb, integer, integer, text",
    "case_after_solve": "uuid, boolean, uuid[]",
    "case_accuse": (
        "uuid, uuid, text, text, text, text[], integer, integer, integer, text, "
        "jsonb, bigint, integer, boolean"
    ),
    "case_clock_forward": "uuid, uuid, text, integer",
}
INTENTS = ("case_start_route", "case_accuse", "case_clock_forward")


def body(name):
    match = re.search(
        rf"create or replace function public\.{name}\(.*?\bas \$\$(.*?)\n\$\$;", SQL, re.S
    )
    assert match is not None, f"Missing specified function {name}."
    return match.group(1)


def test_phase1_uses_the_reserved_name_and_declares_exactly_six_server_tables():
    assert MIGRATION.name == "20261106060000_case_rules.sql"
    assert set(re.findall(r"create table if not exists public\.(\w+)", SQL)) == TABLES


@pytest.mark.parametrize("table", sorted(TABLES))
def test_each_case_table_has_rls_no_player_grants_and_no_delete_grant(table):
    assert f"alter table public.{table} enable row level security;" in SQL
    assert (
        f"revoke all on table public.{table} from public, anon, authenticated, service_role;" in SQL
    )
    rights = re.findall(rf"grant ([a-z, ]+) on table public\.{table} to (\w+);", SQL)
    expected = "select, insert, update" if table == "case_state" else "select, insert"
    assert rights == [(expected, "service_role")]
    assert not re.search(rf"create policy .*? on public\.{table}\b", SQL, re.S)


@pytest.mark.parametrize("name", sorted(SIGNATURES))
def test_functions_have_server_only_execution_empty_search_path_and_caller_rights(name):
    signature = SIGNATURES[name]
    assert (
        f"revoke all on function public.{name}({signature}) from public, anon, authenticated;"
        in SQL
    )
    assert f"grant execute on function public.{name}({signature}) to service_role;" in SQL
    assert "security definer" not in SQL.lower()
    header = re.search(rf"create (?:or replace )?function public\.{name}\(.*?\bas \$", SQL, re.S)
    assert header is not None
    assert "set search_path = ''" in header.group(0)


@pytest.mark.parametrize("name", INTENTS)
def test_intents_lock_and_validate_before_their_first_write(name):
    text = body(name)
    first_write = re.search(r"insert into |update public\.|apply_wallet_transaction\(", text)
    assert first_write is not None
    assert text.index("public.case_begin(") < first_write.start()
    assert re.search(r"v_revision\s*:=\s*public\.case_finish\(", text)
    assert not re.search(r"v_revision\s*:=\s*(?!public\.case_finish\()\S", text)


@pytest.mark.parametrize("name", INTENTS)
def test_successful_intent_replies_carry_the_finished_revision(name):
    for reply in re.findall(r"return jsonb_build_object\((.*?)\);", body(name), re.S):
        if "'status', 'refused'" not in reply:
            assert "'revision', v_revision" in reply


def test_solve_rewards_catch_duplicate_wallet_refs_without_refusing_the_solve():
    text = body("case_accuse")
    reward = text.index("public.apply_wallet_transaction(")
    assert text.rfind("begin", 0, reward) >= 0
    assert "exception when unique_violation then" in text[reward:]
    assert "v_paid := 0" in text[reward:]


def test_phase1_creates_the_solve_hook_only_if_missing():
    guard = SQL.index(
        "if to_regprocedure('public.case_after_solve(uuid, boolean, uuid[])') is null then"
    )
    creation = SQL.index("create function public.case_after_solve(")
    assert guard < creation < SQL.index("end if;", creation)
    assert "20261106120000_relighting.sql" in SQL


def test_case_migration_does_not_change_wallet_reasons_or_embed_a_culprit():
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", SQL
    )
    # The culprit is a server-supplied argument, never a case-specific SQL literal.
    assert "p_culprit text" in SQL


def test_rpc_argument_names_match_the_sql_parameters():
    from server.game.case_data import load_case
    from server.game.case_store import (
        accuse_arguments,
        clock_arguments,
        open_arguments,
        start_arguments,
    )
    from server.tests.case_rule_helpers import PLAYER, snapshot

    data = load_case()
    crew = snapshot()
    arguments = {
        "case_open": open_arguments(crew.crew_id, data),
        "case_start_route": start_arguments(
            crew.crew_id, data, PLAYER, "search0001", "C1.notice_board"
        ),
        "case_accuse": accuse_arguments(
            crew, data, PLAYER, "accuse0001", "replaceable_suspect", False
        ),
        "case_clock_forward": clock_arguments(crew.crew_id, PLAYER, "clock0001", 60),
    }
    for name, params in arguments.items():
        match = re.search(
            rf"create or replace function public\.{name}\((.*?)\)\s+returns", SQL, re.S
        )
        assert match is not None
        declared = [part.strip().split()[0] for part in match.group(1).split(",")]
        assert list(params) == declared


def test_the_store_only_calls_intent_functions():
    import asyncio

    from server.game.case_store import INTENT_FUNCTIONS, run_function

    assert set(INTENT_FUNCTIONS) == {
        "case_open",
        "case_start_route",
        "case_accuse",
        "case_clock_forward",
        "board_pin",
        "board_pair",
        "finale_nightfall",
        "finale_take_post",
        "finale_signal",
    }

    class NoCalls:
        async def call_function(self, name, params):
            pytest.fail("A private helper must not be sent to the database port.")

    with pytest.raises(ValueError):
        asyncio.run(run_function(NoCalls(), "case_begin", {}))
