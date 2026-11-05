"""Tests that the Python account code and the accounts migration say the same thing.

The arguments that the server sends to the four database functions, the rule for an actionUid, the
one re-roll per player and the rights of each role are written down twice: in Python (backend/
server/account/ and routes/captain_name.py) and in supabase/migrations/20261106020000_accounts.sql.
If someone changes only one of the two, a test here fails.

These tests read the SQL file as plain text. They need no database. The behaviour of the functions
(a repeat, a stale save, the handover of a crew) is checked on a real Postgres in the manual test
plan, steps N1 to N6 in supabase/README.md.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from pathlib import Path

import pytest

from server.account.deletion import delete_arguments
from server.account.name_store import assign_arguments, reroll_arguments
from server.account.names import MAX_REROLLS
from server.account.saves import write_arguments
from server.routes.captain_name import (
    ACTION_UID_MAX_LENGTH,
    ACTION_UID_MIN_LENGTH,
    ACTION_UID_PATTERN,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
EXCHANGE = REPO_ROOT / "supabase" / "migrations" / "20261106010000_island_exchange.sql"
ACCOUNTS = REPO_ROOT / "supabase" / "migrations" / "20261106020000_accounts.sql"

# The four functions of the migration, with the types of their parameters in order.
SIGNATURES = {
    "assign_captain_name": "uuid, text, text",
    "reroll_captain_name": "uuid, text, text, text",
    "save_progress": "uuid, integer, jsonb",
    "delete_player": "uuid",
}

PLAYER_ID = "11111111-2222-3333-4444-555555555555"

# What the server sends to each function (the names are the parameter names in the SQL).
SENT_ARGUMENTS = {
    "assign_captain_name": assign_arguments(PLAYER_ID, "Captain-111111", "Brave Puffin 17"),
    "reroll_captain_name": reroll_arguments(
        PLAYER_ID, "Captain-111111", "Calm Gannet 42", "r8x2k9m4"
    ),
    "save_progress": write_arguments(PLAYER_ID, 3, {"intro": {}}),
    "delete_player": delete_arguments(PLAYER_ID),
}


def accounts_sql() -> str:
    return ACCOUNTS.read_text(encoding="utf-8")


def find_in_accounts(pattern: str) -> re.Match:
    """The first place in the accounts migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, accounts_sql(), re.DOTALL)
    assert match, f"Could not find this in {ACCOUNTS.name}: {pattern}. Did its layout change?"
    return match


def declared_parameters(function_name: str) -> list[str]:
    """The parameters of a function in the accounts migration, each as 'name type', in order."""
    text = find_in_accounts(
        rf"create or replace function public\.{function_name}\((.*?)\)\s+returns"
    ).group(1)
    return [" ".join(parameter.split()) for parameter in text.split(",")]


def function_headers() -> dict[str, str]:
    """For each function of the migration: the text from its name to the start of its body."""
    pattern = re.compile(r"create or replace function public\.(\w+)\((.*?)\bas \$\$", re.DOTALL)
    return {match.group(1): match.group(0) for match in pattern.finditer(accounts_sql())}


def function_body(function_name: str) -> str:
    """The text of a function between its first $$ and its closing $$;"""
    return find_in_accounts(
        rf"create or replace function public\.{function_name}\(.*?\bas \$\$(.*?)\n\$\$;"
    ).group(1)


def table_grants() -> list[tuple[str, str, str]]:
    """Every 'grant ... on table public.<table> to <role>' as (rights, table, role)."""
    pattern = r"grant ([a-z, ]+) on table public\.(\w+)\s+to (\w+);"
    return re.findall(pattern, accounts_sql())


# --- where the file sits ---


def test_the_accounts_migration_sorts_after_the_exchange():
    assert MIGRATIONS.index(ACCOUNTS) > MIGRATIONS.index(EXCHANGE)


def test_the_accounts_migration_is_the_last_file_for_now_and_has_the_agreed_name():
    assert ACCOUNTS.name == "20261106020000_accounts.sql"


# --- the four functions ---


def test_the_migration_has_exactly_the_four_functions():
    assert set(function_headers()) == set(SIGNATURES)


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_each_function_takes_exactly_the_arguments_the_server_sends(function_name):
    declared_names = [parameter.split()[0] for parameter in declared_parameters(function_name)]

    assert declared_names == list(SENT_ARGUMENTS[function_name])


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_each_function_has_the_agreed_parameter_types(function_name):
    declared_types = [parameter.split()[1] for parameter in declared_parameters(function_name)]

    assert ", ".join(declared_types) == SIGNATURES[function_name]


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_no_parameter_has_a_default(function_name):
    # A call that leaves an argument out does not exist in the database.
    assert "default" not in " ".join(declared_parameters(function_name)).lower()


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_every_new_function_is_for_the_server_only(function_name):
    types = SIGNATURES[function_name]
    start = rf"function public\.{function_name}\({re.escape(types)}\)\s+"
    revoke = rf"revoke all on {start}from public, anon, authenticated;"
    grant = rf"grant execute on {start}to service_role;"

    assert re.search(revoke, accounts_sql(), re.DOTALL)
    assert re.search(grant, accounts_sql(), re.DOTALL)


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_every_function_starts_with_an_empty_search_path(function_name):
    assert "set search_path = ''" in function_headers()[function_name]


@pytest.mark.parametrize("function_name", sorted(SIGNATURES))
def test_every_function_has_a_comment(function_name):
    types = SIGNATURES[function_name]

    assert re.search(
        rf"comment on function public\.{function_name}\({re.escape(types)}\) is\s+'", accounts_sql()
    )


def test_delete_player_is_the_only_security_definer_function_here():
    definers = [
        name for name, header in function_headers().items() if "security definer" in header.lower()
    ]

    assert definers == ["delete_player"]


def test_the_other_three_functions_run_with_the_rights_of_their_caller():
    # Not SECURITY DEFINER on purpose: a player, who has no right to write these tables, would be
    # stopped even if a function were granted to them by mistake.
    headers = function_headers()

    for name in ("assign_captain_name", "reroll_captain_name", "save_progress"):
        assert "security" not in headers[name].lower()


# --- what the functions do (the parts Python relies on) ---


def test_assign_captain_name_writes_only_while_the_placeholder_is_there():
    body = function_body("assign_captain_name")

    assert re.search(r"where id = p_player_id\s+and display_name = p_placeholder", body)


def test_reroll_captain_name_locks_the_profile_first():
    body = function_body("reroll_captain_name")

    assert re.search(r"from public\.profiles\s+where id = p_player_id\s+for no key update", body)


def test_the_profile_lock_lets_foreign_key_checks_through():
    # FOR UPDATE would make every new row that points at the profile (a ledger row, a trade, a
    # seat) wait for the re-roll. FOR NO KEY UPDATE still makes two re-rolls run one after the
    # other, but it does not block those foreign-key checks.
    code = re.sub(r"--[^\n]*", "", accounts_sql())  # the comments talk about FOR UPDATE too

    assert not re.search(r"\bfor update\b", code)


def test_reroll_captain_name_answers_with_the_reasons_the_server_understands():
    from server.account.name_store import REFUSAL_REASONS

    body = function_body("reroll_captain_name")

    for reason in REFUSAL_REASONS:
        assert f"'{reason}'" in body


def test_save_progress_writes_only_the_expected_version_and_adds_one():
    body = function_body("save_progress")

    assert re.search(r"where player_id = p_player_id\s+and version = p_expected_version", body)
    assert "version = version + 1" in body


def test_save_progress_answers_with_the_statuses_the_server_understands():
    body = function_body("save_progress")

    for status in ("saved", "stale", "too_big", "missing"):
        assert f"'{status}'" in body


def test_delete_player_hands_a_crew_over_before_it_deletes_the_login():
    body = function_body("delete_player")

    assert body.index("update public.crews") < body.index("delete from auth.users")
    # The player in the LOWEST seat gets the crew: ascending order, and only the first row.
    # ("order by s.seat_no desc limit 1" would hand the crew to the highest seat.)
    assert re.search(r"order by s\.seat_no\s+limit 1", body)
    assert "s.player_id <> p_player_id" in body  # never the player who is being deleted


def test_delete_player_answers_with_the_statuses_the_server_understands():
    body = function_body("delete_player")

    assert "'deleted'" in body
    assert "'not_found'" in body


# --- A2 moves no coins ---


def test_the_migration_never_touches_the_wallet_or_the_list_of_reasons():
    # Deleting a player removes the ledger by cascade. No function here calls the wallet function,
    # and the migration adds no wallet reason.
    text = accounts_sql()

    assert "apply_wallet_transaction" not in text
    assert "wallet_reasons" not in text


# --- the table captain_name_rerolls ---


def test_one_reroll_per_player_is_the_primary_key():
    # MAX_REROLLS is the number of re-rolls Python allows, and the primary key on player_id is the
    # database's own guard for the same rule.
    assert MAX_REROLLS == 1
    find_in_accounts(
        r"create table if not exists public\.captain_name_rerolls \(\s+"
        r"player_id\s+uuid primary key references public\.profiles \(id\) on delete cascade,"
    )


def test_the_action_uid_rule_in_sql_matches_the_route():
    sql_pattern = find_in_accounts(r"check \(action_uid ~ '(.*?)'\)").group(1)

    # The route says "one or more of these characters". The database says how many.
    assert ACTION_UID_PATTERN.endswith("+$")
    quantity = f"{{{ACTION_UID_MIN_LENGTH},{ACTION_UID_MAX_LENGTH}}}$"
    assert sql_pattern == ACTION_UID_PATTERN.removesuffix("+$") + quantity


def test_the_rerolls_table_has_rls_and_one_read_policy():
    text = accounts_sql()

    assert "alter table public.captain_name_rerolls enable row level security" in text
    policies = re.findall(r'create policy "[^"]*"\s+on public\.(\w+) for (\w+)', text)
    assert policies == [("captain_name_rerolls", "select")]
    assert "using (player_id = (select auth.uid()))" in text


def test_the_rerolls_table_takes_every_right_away_before_it_grants():
    text = accounts_sql()

    revoke_at = text.index("revoke all on table public.captain_name_rerolls")
    first_grant_at = text.index("grant select on table public.captain_name_rerolls")

    assert revoke_at < first_grant_at
    assert "from public, anon, authenticated, service_role;" in text[revoke_at:first_grant_at]


def test_players_can_only_read_the_rerolls_table_and_the_server_can_only_read_and_add():
    grants = table_grants()

    assert grants == [
        ("select", "captain_name_rerolls", "authenticated"),
        ("select, insert", "captain_name_rerolls", "service_role"),
    ]


def test_the_rerolls_table_has_no_counter_that_needs_a_revoke():
    # The primary key is the player id, not an identity column, so there is no sequence.
    assert "generated always as identity" not in accounts_sql()


def test_the_migration_is_safe_to_run_twice():
    text = accounts_sql()

    assert "create table if not exists public.captain_name_rerolls" in text
    assert 'drop policy if exists "Players can read their own name re-roll"' in text
    assert len(re.findall(r"create or replace function", text)) == 4
    assert "create function" not in text.replace("create or replace function", "")
