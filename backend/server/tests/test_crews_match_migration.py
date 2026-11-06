"""Tests that the crew code in Python and the crew migration in SQL say the same thing.

The migration 20261106040000_crew_codes.sql adds the crew code, the guards on seats and four
database functions. Python knows the same facts: the alphabet of a crew code, the kit ids, the
partner ids and the arguments of each function. If someone changes only one side, a test here
fails. The tests read the SQL as plain text, so they need no database. What the functions DO is
checked on a real Postgres by hand (the steps C1 to C8 in supabase/README.md).

A second group of tests reads the ORDER of the steps inside each function, because the safety of
crews rests on that order: the guess limit is checked before the code is looked up, a lock is
taken before anything is read, and every refusal comes before the first change. A copy of a
function with two steps swapped would pass every other test of the project, so these tests look
at the steps themselves (with the comments cut out). They do not replace the checks on a real
Postgres. They make sure that a change which breaks the order cannot pass the tests unnoticed.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from itertools import pairwise
from pathlib import Path

import pytest

from server.crews.codes import (
    CODE_ALPHABET,
    CODE_LENGTH,
    MAX_WRONG_CODES,
    WRONG_CODE_WINDOW_SECONDS,
)
from server.crews.seats import KITS, PARTNERS
from server.crews.store import (
    create_arguments,
    find_arguments,
    start_arguments,
    take_arguments,
)

# The repo root is one level above backend/ (backend/server/tests/this_file.py).
REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
FOUNDATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"
EXCHANGE = REPO_ROOT / "supabase" / "migrations" / "20261106010000_island_exchange.sql"
CREW_CODES = REPO_ROOT / "supabase" / "migrations" / "20261106040000_crew_codes.sql"

FUNCTIONS = {
    "crew_create": "uuid, text, text",
    "crew_find_by_code": "uuid, text, integer, integer",
    "crew_take_seat": "uuid, uuid, integer, text, integer",
    "crew_start": "uuid, uuid, jsonb, integer",
}

# The files this package ships. None of them may hold an em dash or an en dash. The two marks are
# built from their numbers, so that this file holds neither of them either.
EM_DASH = chr(0x2014)
EN_DASH = chr(0x2013)
PACKAGE_FILES = [
    CREW_CODES,
    *sorted((REPO_ROOT / "backend" / "server" / "crews").glob("*.py")),
    REPO_ROOT / "backend" / "server" / "routes" / "crews.py",
]


def migration_text() -> str:
    return CREW_CODES.read_text()


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the crew migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, migration_text(), re.DOTALL)
    assert match, f"Could not find this in {CREW_CODES.name}: {pattern}. Did its layout change?"
    return match


def declared_parameters(function_name: str) -> list[str]:
    """The parameter names of a function in the crew migration, in order."""
    text = find_in_migration(
        rf"create or replace function public\.{function_name}\((.*?)\)\s+returns"
    ).group(1)
    return [parameter.split()[0] for parameter in text.split(",")]


# --- reading the steps of a function ---
# The tests near the end of this file look at the statements inside the four functions, in the
# order in which they run. These helpers cut a function out of the file and tidy it up.

# A statement that changes a table (insert, update or delete), with the name of the table.
WRITES = re.compile(r"\b(?:insert into|update|delete from)\s+(public\.\w+)")


def strip_comments(sql: str) -> str:
    """The SQL without its `--` comments (from `--` to the end of the line).

    A comment may name a step ("Delete the draft") and would fool a test that looks for the real
    statement. None of the four functions has a `--` inside a quoted text, so cutting from `--`
    to the end of the line only ever cuts comments.
    """
    return re.sub(r"--[^\n]*", "", sql)


def function_body(name: str) -> str:
    """One crew function: from `create or replace function public.<name>(` to its closing `$$;`.

    The comments are cut out and every run of spaces and line breaks becomes one space, so a test
    sees the statements that run, in the order they run, and does not care about the layout.
    """
    match = re.search(
        rf"create or replace function public\.{name}\(.*?\$\$;", migration_text(), re.DOTALL
    )
    assert match, f"Could not find the function {name} in {CREW_CODES.name}. Did its layout change?"
    return " ".join(strip_comments(match.group(0)).split())


def assert_contains(body: str, text: str) -> None:
    """The function holds this statement. A failure names the statement, not the whole function."""
    assert text in body, f"Could not find this in the function: {text}"


def assert_in_this_order(body: str, *steps: str) -> None:
    """Every step is in the function, and each one comes before the next."""
    for step in steps:
        assert_contains(body, step)
    for step, next_step in pairwise(steps):
        assert body.index(step) < body.index(next_step), (
            f"This must come first:\n  {step}\nbut it comes after:\n  {next_step}"
        )


def first_write(body: str) -> int:
    """Where the function first changes a table (an insert, an update or a delete)."""
    match = WRITES.search(body)
    assert match, "The function never changes a table. Did its layout change?"
    return match.start()


# --- where the file sits ---


def test_the_crew_codes_migration_sorts_after_the_exchange():
    assert MIGRATIONS.index(CREW_CODES) > MIGRATIONS.index(EXCHANGE)


# --- the arguments the server sends ---


def test_crew_create_takes_exactly_the_arguments_the_server_sends():
    sent = create_arguments("player-1", "K7QF2M", "witness")

    assert declared_parameters("crew_create") == list(sent)


def test_crew_find_by_code_takes_exactly_the_arguments_the_server_sends():
    sent = find_arguments("player-1", "K7QF2M")

    assert declared_parameters("crew_find_by_code") == list(sent)


def test_crew_take_seat_takes_exactly_the_arguments_the_server_sends():
    sent = take_arguments("crew-1", "player-1", 2, "witness", 1)

    assert declared_parameters("crew_take_seat") == list(sent)


def test_crew_start_takes_exactly_the_arguments_the_server_sends():
    sent = start_arguments("crew-1", "player-1", [], 1)

    assert declared_parameters("crew_start") == list(sent)


def test_the_guess_limit_is_handed_to_the_database_from_python():
    sent = find_arguments("player-1", "K7QF2M")

    assert sent["p_max_wrong_codes"] == MAX_WRONG_CODES == 10
    assert sent["p_window_seconds"] == WRONG_CODE_WINDOW_SECONDS == 600


@pytest.mark.parametrize("name", FUNCTIONS)
def test_no_function_has_a_default_for_an_argument(name):
    # A call that leaves out an argument does not exist in the database.
    parameters = find_in_migration(
        rf"create or replace function public\.{name}\((.*?)\)\s+returns"
    ).group(1)

    assert "default" not in parameters.lower()


# --- the facts Python and SQL both know ---


def test_the_sql_code_rule_is_the_alphabet_and_the_length_of_python():
    rule = find_in_migration(r"crews_code_format\s+check \(code ~ '\^\[(.*?)\]\{(\d+)\}\$'\)")

    assert rule.group(1) == CODE_ALPHABET
    assert int(rule.group(2)) == CODE_LENGTH


def test_the_sql_kit_ids_are_the_kit_ids_of_python():
    rule = find_in_migration(
        r"crew_seats_kit_allowed\s+check \(kit is not null and kit in \((.*?)\)\)"
    )

    assert tuple(re.findall(r"'([a-z_]+)'", rule.group(1))) == KITS


def test_the_partner_ids_fit_the_npc_id_rule_of_the_foundation():
    foundation = FOUNDATION.read_text()
    rule = re.search(
        r"crew_seats_npc_id_format\s+check \(npc_id ~ '(.*?)'\)", foundation, re.DOTALL
    )
    assert rule, "Could not find the npc_id rule in the foundation migration."

    pattern = re.compile(rule.group(1))

    assert all(pattern.fullmatch(npc_id) for npc_id, _ in PARTNERS.values())


def test_the_partner_ids_are_different_so_no_partner_sits_twice():
    npc_ids = [npc_id for npc_id, _ in PARTNERS.values()]

    assert len(set(npc_ids)) == len(npc_ids) == 4


def test_the_kit_rule_leaves_old_rows_alone():
    # "not valid": the rule holds for every new or changed row, and the rows written before the
    # migration (only test rows) are not checked again, so the file cannot fail on old test data.
    find_in_migration(r"crew_seats_kit_allowed\s+check \(.*?\)\) not valid;")


def test_a_code_is_unique_and_a_crew_without_a_code_is_allowed():
    find_in_migration(
        r"create unique index if not exists crews_code_unique\s+on public\.crews \(code\)\s*;"
    )
    assert "alter column code set not null" not in migration_text()


def test_one_player_cannot_hold_two_seats_of_one_crew():
    find_in_migration(
        r"create unique index if not exists crew_seats_one_seat_per_player\s+"
        r"on public\.crew_seats \(crew_id, player_id\) where player_id is not null\s*;"
    )


def test_one_partner_cannot_sit_twice_in_one_crew():
    find_in_migration(
        r"create unique index if not exists crew_seats_one_seat_per_partner\s+"
        r"on public\.crew_seats \(crew_id, npc_id\) where npc_id is not null\s*;"
    )


def test_a_crew_has_a_version_that_starts_at_1_and_never_drops_below_it():
    find_in_migration(r"add column if not exists version integer not null default 1")
    find_in_migration(r"crews_version_positive\s+check \(version >= 1\)")


def test_a_crew_remembers_when_it_sailed():
    find_in_migration(r"add column if not exists started_at timestamptz;")


# --- the table that counts wrong codes ---


def test_crew_join_failures_has_row_level_security_and_no_policy_at_all():
    text = migration_text()

    assert "alter table public.crew_join_failures enable row level security;" in text
    assert "on public.crew_join_failures for" not in text


def test_no_policy_in_the_migration_lets_a_player_write():
    actions = re.findall(r'create policy "[^"]*"\s+on public\.\w+ for (\w+)', migration_text())

    assert all(action == "select" for action in actions)


def test_crew_join_failures_gives_no_right_to_players_or_visitors():
    text = migration_text()

    revoke_all = "revoke all on table public.crew_join_failures"
    assert f"{revoke_all} from public, anon, authenticated, service_role;" in text
    assert (
        "grant select, insert, delete on table public.crew_join_failures to service_role;" in text
    )
    assert "public.crew_join_failures to authenticated" not in text
    assert "public.crew_join_failures to anon" not in text


def test_every_right_is_revoked_before_it_is_granted_including_the_counter():
    text = migration_text()

    revoke_at = text.index("revoke all on table public.crew_join_failures")
    grant_at = text.index("grant select, insert, delete on table public.crew_join_failures")

    assert revoke_at < grant_at
    assert "revoke all on sequence public.crew_join_failures_id_seq" in text
    assert text.index("revoke all on sequence public.crew_join_failures_id_seq") < grant_at


def test_a_wrong_code_row_holds_a_player_and_a_time_and_goes_with_its_player():
    find_in_migration(
        r"player_id\s+uuid not null references public\.profiles \(id\) on delete cascade"
    )
    find_in_migration(r"attempted_at timestamptz not null default now\(\)")


# --- the functions ---


@pytest.mark.parametrize(("name", "types"), FUNCTIONS.items())
def test_each_function_is_for_the_server_only(name, types):
    text = migration_text()
    revoke = (
        rf"revoke all on function public\.{name}\({types}\)\s+from public, anon, authenticated;"
    )
    grant = rf"grant execute on function public\.{name}\({types}\)\s+to service_role;"

    assert re.search(revoke, text)
    assert re.search(grant, text)


def test_no_function_is_security_definer():
    # They run with the rights of the caller, so a player is stopped by the table rights even if
    # a function were granted by mistake. The words may appear only as "not SECURITY DEFINER".
    text = migration_text().lower().replace("not security definer", "")

    assert "security definer" not in text


def test_every_function_starts_with_an_empty_search_path():
    text = migration_text()

    assert text.count("set search_path = ''") == len(FUNCTIONS)


@pytest.mark.parametrize(("name", "types"), FUNCTIONS.items())
def test_each_function_has_a_comment(name, types):
    assert f"comment on function public.{name}({types}) is" in migration_text()


def test_the_migration_adds_no_wallet_reason_and_moves_no_coins():
    text = migration_text()

    assert "wallet_reasons" not in text
    assert "apply_wallet_transaction" not in text


def test_the_table_and_the_functions_can_be_created_twice():
    text = migration_text()

    assert "create table if not exists public.crew_join_failures" in text
    assert text.count("create or replace function public.") == len(FUNCTIONS)


@pytest.mark.parametrize(
    "constraint", ["crews_code_format", "crews_version_positive", "crew_seats_kit_allowed"]
)
def test_a_constraint_is_dropped_before_it_is_added_so_the_file_can_run_twice(constraint):
    assert f"drop constraint if exists {constraint};" in migration_text()


# --- the order of the steps inside each function ---
# The top of this file says why the order is tested. A test here fails when somebody swaps two
# steps, drops one, or loosens one of them (for example ">=" to ">").

LOCK_THE_PLAYER = "perform 1 from public.profiles where id = p_player_id for update;"
CHECK_THE_VERSION = (
    "if v_version <> p_expected_version then "
    "return jsonb_build_object('status', 'refused', 'reason', 'changed'); end if;"
)


@pytest.mark.parametrize("name", FUNCTIONS)
def test_the_helper_reads_one_whole_function_without_its_comments(name):
    # This guards the other tests of this group: if the helper cut out too little or too much,
    # they would look at the wrong text and could pass without checking anything.
    body = function_body(name)

    assert body.startswith(f"create or replace function public.{name}(")
    assert body.endswith("$$;")
    assert body.count("create or replace function") == 1
    assert "--" not in body


def test_find_by_code_refuses_too_many_before_it_looks_at_the_code():
    # After too many wrong codes even a RIGHT code must be refused. If the crew were looked up
    # first, a guesser could tell a hit from a miss, and the limit would protect nothing.
    body = function_body("crew_find_by_code")

    assert_in_this_order(
        body,
        "delete from public.crew_join_failures",  # forget the wrong codes older than the window
        "into v_failures, v_oldest",  # count the wrong codes that are left
        "'too_many_attempts'",  # refuse a player who is over the limit
        "where c.code = p_code",  # only now look the crew up
        "insert into public.crew_join_failures",  # and count a miss
    )


def test_find_by_code_refuses_at_the_limit_and_not_one_guess_later():
    # "Greater than" instead of "greater than or equal" would let an eleventh wrong code through.
    body = function_body("crew_find_by_code")

    assert_contains(body, "if v_failures >= p_max_wrong_codes then")


def test_a_wrong_code_adds_one_failure_row_and_changes_nothing_else():
    # The only table that crew_find_by_code changes is the one that counts wrong codes, so a
    # wrong code leaves every crew and every seat as it was.
    body = function_body("crew_find_by_code")

    assert set(WRITES.findall(body)) == {"public.crew_join_failures"}
    assert_contains(
        body,
        "if v_found is null then insert into public.crew_join_failures (player_id) "
        "values (p_player_id); return jsonb_build_object('status', 'refused', "
        "'reason', 'wrong_code'); end if;",
    )


@pytest.mark.parametrize("name", ["crew_create", "crew_find_by_code", "crew_take_seat"])
def test_the_player_functions_lock_the_profile_first(name):
    # The lock makes one player's requests run one at a time: a double click cannot start two
    # crews, and a burst of parallel guesses is counted exactly. It must come before the function
    # looks at any crew table. (The text before `begin` is only the declarations.)
    body = function_body(name)
    begin = re.search(r"\bbegin\b", body)
    assert begin, f"Could not find where the function {name} begins."

    assert_contains(body, LOCK_THE_PLAYER)
    assert body.index(LOCK_THE_PLAYER) < body.index("public.crew", begin.end())


def test_start_locks_the_crew_before_it_changes_anything():
    # Two players pressing "sail" at the same moment must not both seat partners.
    body = function_body("crew_start")
    lock = "from public.crews where id = p_crew_id for update;"

    assert_contains(body, lock)
    assert body.index(lock) < first_write(body)


def test_take_seat_locks_both_crews_in_id_order():
    # The target crew and the draft are locked in the order of their ids. Two friends who join
    # each other's drafts at the same moment then never wait for each other in a circle.
    body = function_body("crew_take_seat")
    lock = (
        "perform 1 from public.crews where id = p_crew_id or id = v_draft_id "
        "order by id for update;"
    )

    assert_contains(body, lock)
    assert body.index(lock) < first_write(body)


def test_take_seat_refuses_everything_before_its_first_write():
    # A function that RETURNS keeps every change it made so far, and only an error undoes them.
    # So all refusals must come before the first change. If one came after the draft was
    # deleted, a refused join would still cost the player their draft.
    body = function_body("crew_take_seat")
    last_refusal = body.rfind("'status', 'refused'")

    assert last_refusal != -1
    assert last_refusal < first_write(body)


def test_take_seat_never_takes_a_seat_that_a_player_holds():
    # A seat held by a player means somebody else joined first. Taking it would throw that player
    # out of the crew, so the function says "changed" and the server reads the crew again.
    body = function_body("crew_take_seat")
    guard = (
        "if v_seat_found and v_seat_player is not null then "
        "return jsonb_build_object('status', 'refused', 'reason', 'changed'); end if;"
    )

    assert_contains(body, guard)
    assert body.index(guard) < first_write(body)


@pytest.mark.parametrize("name", ["crew_take_seat", "crew_start"])
def test_take_seat_and_start_check_the_version_before_writing(name):
    # The version says "the crew is still as the server read it". Without the check, a join that
    # was decided on an old picture of the crew could replace the wrong partner, and the muster
    # could seat partners twice.
    body = function_body(name)

    assert_contains(body, CHECK_THE_VERSION)
    assert body.index(CHECK_THE_VERSION) < first_write(body)


def test_start_needs_exactly_four_seats():
    # The case always runs with four seats. A list of partners that fills fewer or more raises an
    # error, which cancels the partners that were just inserted. The check has to sit between
    # seating the partners and sailing.
    body = function_body("crew_start")

    assert_in_this_order(
        body,
        "insert into public.crew_seats",
        "if v_seats <> 4 then raise exception 'bad_muster'; end if;",
        "update public.crews set status = 'active'",
    )


def test_no_crew_function_is_granted_to_anyone_but_the_server():
    # Every `grant` in the file names service_role and nobody else. The whole file is checked, so
    # an extra grant to authenticated, anon or public on a function, the table or the counter is
    # found wherever it sits. The five grants are the four functions and the one table.
    text = " ".join(strip_comments(migration_text()).lower().split())
    grants = re.findall(r"\bgrant\b[^;]*;", text)

    assert len(grants) == len(FUNCTIONS) + 1, grants
    assert all(grant.endswith(" to service_role;") for grant in grants), grants


# --- no em dash and no en dash ---


@pytest.mark.parametrize("path", PACKAGE_FILES, ids=lambda path: path.name)
def test_the_migration_and_the_package_hold_no_em_dash_and_no_en_dash(path):
    text = path.read_text()

    assert EM_DASH not in text
    assert EN_DASH not in text
