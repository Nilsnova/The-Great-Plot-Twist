"""Tests that the Python entry kit code and the entry profiles migration say the same thing.

The arguments that the server sends to grant_entry_kit, the kit ids, the decisions, the limits of
the move log and of the coins, and the rights of each role are written down twice: in Python
(backend/server/game/ and backend/content/entry_kits.json) and in
supabase/migrations/20261106030000_entry_profiles.sql. If someone changes only one of the two, a
test here fails.

These tests read the SQL file as plain text. They need no database. The behaviour of the function
(the first grant pays, a second one pays nothing, a bad kit id is refused, a player cannot call it)
is checked on a real Postgres in the manual test plan, steps K1 to K5 in supabase/README.md.

Used by: pytest (cd backend && uv run pytest).
"""

import re

import pytest

from server.game.entry_kits import DECISIONS, ID_PATTERN, load_entry_kits
from server.game.entry_profile_store import KIT_REASON, KIT_REF, grant_arguments
from server.game.referee import MAX_MOVES, Verdict, story_fingerprint
from server.tests.helpers import REPO_ROOT
from server.wallet import EARN, MAX_DELTA, find_direction

MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
ACCOUNTS = REPO_ROOT / "supabase" / "migrations" / "20261106020000_accounts.sql"
ENTRY_PROFILES = REPO_ROOT / "supabase" / "migrations" / "20261106030000_entry_profiles.sql"

# The types of the parameters of grant_entry_kit, in order.
FUNCTION_TYPES = "uuid, text, text, boolean, text, text, bigint, integer, text"

PLAYER_ID = "11111111-2222-3333-4444-555555555555"
KITS = load_entry_kits()

# What the server sends (the names are the parameter names in the SQL).
SENT_ARGUMENTS = grant_arguments(
    PLAYER_ID,
    Verdict(ending="ending_trapped", decision="warned", read_log=False, move_count=11),
    KITS.kits[1],
    story_fingerprint(),
)


def entry_sql() -> str:
    return ENTRY_PROFILES.read_text(encoding="utf-8")


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the entry profiles migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, entry_sql(), re.DOTALL)
    assert match, f"Could not find this in {ENTRY_PROFILES.name}: {pattern}. Did its layout change?"
    return match


def declared_parameters() -> list[str]:
    """The parameters of grant_entry_kit, each as 'name type', in order."""
    text = find_in_migration(
        r"create or replace function public\.grant_entry_kit\((.*?)\)\s+returns"
    ).group(1)
    return [" ".join(parameter.split()) for parameter in text.split(",")]


def function_body() -> str:
    """The text of grant_entry_kit between its first $$ and its closing $$;"""
    return find_in_migration(
        r"create or replace function public\.grant_entry_kit\(.*?\bas \$\$(.*?)\n\$\$;"
    ).group(1)


def function_header() -> str:
    """The text of grant_entry_kit from its name to the start of its body."""
    return find_in_migration(
        r"create or replace function public\.grant_entry_kit\(.*?\bas \$\$"
    ).group(0)


def quoted_words(text: str) -> tuple[str, ...]:
    """The words written 'in single quotes', in the order they appear."""
    return tuple(re.findall(r"'([a-z_]+)'", text))


def table_grants() -> list[tuple[str, str, str]]:
    """Every 'grant ... on table public.<table> to <role>' as (rights, table, role)."""
    return re.findall(r"grant ([a-z, ]+) on table public\.(\w+)\s+to (\w+);", entry_sql())


# --- where the file sits ---


def test_the_entry_profiles_migration_sorts_after_the_accounts_migration():
    assert MIGRATIONS.index(ENTRY_PROFILES) > MIGRATIONS.index(ACCOUNTS)


def test_the_entry_profiles_migration_has_the_agreed_name():
    assert ENTRY_PROFILES.name == "20261106030000_entry_profiles.sql"


# --- the function ---


def test_grant_entry_kit_takes_exactly_the_arguments_the_server_sends():
    declared_names = [parameter.split()[0] for parameter in declared_parameters()]

    assert declared_names == list(SENT_ARGUMENTS)
    assert len(declared_names) == 9


def test_grant_entry_kit_has_the_agreed_parameter_types():
    declared_types = [parameter.split()[1] for parameter in declared_parameters()]

    assert ", ".join(declared_types) == FUNCTION_TYPES


def test_no_parameter_has_a_default():
    # A call that leaves an argument out does not exist in the database.
    assert "default" not in " ".join(declared_parameters()).lower()


def test_the_function_is_for_the_server_only_and_not_security_definer():
    start = rf"function public\.grant_entry_kit\({re.escape(FUNCTION_TYPES)}\)\s+"
    revoke = rf"revoke all on {start}from public, anon, authenticated;"
    grant = rf"grant execute on {start}to service_role;"

    assert re.search(revoke, entry_sql(), re.DOTALL)
    assert re.search(grant, entry_sql(), re.DOTALL)
    # It runs with the rights of its caller, so a player (who may write nothing) is stopped even if
    # the function were granted to them by mistake.
    assert "security" not in function_header().lower()


def test_the_function_starts_with_an_empty_search_path_and_has_a_comment():
    assert "set search_path = ''" in function_header()
    assert re.search(
        rf"comment on function public\.grant_entry_kit\({re.escape(FUNCTION_TYPES)}\) is\s+'",
        entry_sql(),
    )


def test_the_migration_has_exactly_one_function():
    assert len(re.findall(r"create or replace function", entry_sql())) == 1
    assert "create function" not in entry_sql().replace("create or replace function", "")


def test_the_function_locks_the_profile_before_it_looks_for_an_entry_profile():
    # One grant per player at a time: the second request waits for the lock and then finds the
    # profile of the first.
    body = function_body()

    lock = re.search(r"from public\.profiles\s+where id = p_player_id\s+for no key update", body)
    assert lock
    assert lock.start() < body.index("from public.entry_profiles")


def test_the_profile_lock_lets_foreign_key_checks_through():
    # The function locks the profile first and the wallet second (inside the wallet function),
    # while market_trade() locks the wallet first and then adds rows that point at the profile.
    # FOR UPDATE would block those foreign-key checks, and the two could wait for each other in a
    # circle (a deadlock). FOR NO KEY UPDATE still makes two grants run one after the other.
    code = re.sub(r"--[^\n]*", "", entry_sql())  # the comments talk about FOR UPDATE too

    assert not re.search(r"\bfor update\b", code)


def test_the_function_pays_only_when_it_stores_a_new_profile():
    body = function_body()

    insert_at = body.index("insert into public.entry_profiles")
    pay_at = body.index("apply_wallet_transaction")
    assert insert_at < pay_at
    assert body.count("apply_wallet_transaction") == 1
    assert "'granted'" in body[insert_at:] and "'stored'" in body[:insert_at]


def test_the_function_answers_with_the_statuses_the_server_understands():
    body = function_body()

    for status in ("granted", "stored", "missing"):
        assert f"'{status}'" in body


def test_the_function_answers_with_the_keys_the_server_reads():
    body = function_body()

    for key in ("status", "paid", "ending", "decision", "readLog", "kit", "startPlace", "kitCoins"):
        assert f"'{key}'" in body


# --- the kit is paid inside the function, once ---


def test_the_kit_is_paid_with_kit_grant_and_the_fixed_ref_kit():
    assert (KIT_REASON, KIT_REF) == ("kit_grant", "kit")
    assert "public.apply_wallet_transaction(p_player_id, p_kit_coins, 'kit_grant', 'kit')" in (
        function_body()
    )


def test_a_ledger_row_that_exists_already_stops_the_payment_but_not_the_profile():
    # Only test users from the manual plan, who were paid the kit by hand, have such a row. The
    # function must not fail on them: the ledger refuses a second kit_grant with the ref kit.
    body = function_body()

    assert re.search(
        r"if not exists \(\s*select 1\s+from public\.wallet_transactions\s+"
        r"where player_id = p_player_id\s+and reason = 'kit_grant'\s+and ref = 'kit'\s*\) then",
        body,
    )


def test_kit_grant_is_an_earn_reason_and_this_migration_adds_none():
    assert find_direction(KIT_REASON) == EARN
    text = entry_sql()
    # The wallet test (test_wallet_matches_migration.py) reads every migration for these.
    assert not re.search(r"insert\s+into\s+(?:public\.)?wallet_reasons", text, re.IGNORECASE)
    assert not re.search(
        r"\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?(?:public\.)?wallet_reasons\b",
        text,
        re.IGNORECASE,
    )


# --- the table entry_profiles ---


def test_one_entry_profile_per_player_is_the_primary_key():
    find_in_migration(
        r"create table if not exists public\.entry_profiles \(\s+"
        r"player_id\s+uuid primary key references public\.profiles \(id\) on delete cascade,"
    )


def test_the_kit_ids_in_sql_are_the_kit_ids_in_entry_kits_json():
    allowed = find_in_migration(r"entry_profiles_kit_allowed\s+check \(kit in \((.*?)\)\)").group(1)

    assert quoted_words(allowed) == tuple(kit.id for kit in KITS.kits)


def test_the_decisions_in_sql_are_warned_trusted_none():
    allowed = find_in_migration(
        r"entry_profiles_decision_allowed\s+check \(decision in \((.*?)\)\)"
    ).group(1)

    assert quoted_words(allowed) == DECISIONS == ("warned", "trusted", "none")


def test_the_move_limit_in_sql_is_max_moves():
    limits = find_in_migration(
        r"entry_profiles_move_count_range\s+check \(move_count between (\d+) and (\d+)\)"
    )

    assert (int(limits.group(1)), int(limits.group(2))) == (1, MAX_MOVES)


def test_the_coin_limit_in_sql_is_max_delta():
    limits = find_in_migration(
        r"entry_profiles_kit_coins_range\s+check \(kit_coins between (\d+) and (\d+)\)"
    )

    assert (int(limits.group(1)), int(limits.group(2))) == (1, MAX_DELTA)


def test_the_id_patterns_in_sql_are_the_id_pattern_of_the_kits_file():
    ending = find_in_migration(r"entry_profiles_ending_format\s+check \(ending ~ '(.*?)'\)")
    place = find_in_migration(
        r"entry_profiles_start_place_format\s+check \(start_place ~ '(.*?)'\)"
    )

    assert ending.group(1) == place.group(1) == f"^{ID_PATTERN}$"


def test_every_ending_and_start_place_in_the_kits_file_fits_the_database_rule():
    pattern = re.compile(ID_PATTERN)

    for kit in KITS.kits:
        assert pattern.fullmatch(kit.ending), kit.ending
        assert pattern.fullmatch(kit.start_place), kit.start_place


def test_the_story_hash_rule_in_sql_accepts_the_fingerprint_of_the_story_file():
    pattern = find_in_migration(
        r"entry_profiles_story_sha256_format\s+check \(story_sha256 ~ '(.*?)'\)"
    ).group(1)

    assert re.fullmatch(pattern, story_fingerprint())


def test_the_table_columns_are_the_ones_the_function_and_the_reads_use():
    columns = re.findall(
        r"^  (\w+)\s+(?:uuid|text|boolean|bigint|integer|timestamptz)\b",
        find_in_migration(r"create table if not exists public\.entry_profiles \((.*?)\n\);").group(
            1
        ),
        re.MULTILINE,
    )

    assert columns == [
        "player_id",
        "ending",
        "decision",
        "read_log",
        "kit",
        "start_place",
        "kit_coins",
        "move_count",
        "story_sha256",
        "created_at",
    ]


# --- who may do what ---


def test_entry_profiles_has_rls_one_read_policy_and_no_write_grant_for_players():
    text = entry_sql()

    assert "alter table public.entry_profiles enable row level security" in text
    policies = re.findall(r'create policy "[^"]*"\s+on public\.(\w+) for (\w+)', text)
    assert policies == [("entry_profiles", "select")]
    assert "using (player_id = (select auth.uid()))" in text
    assert ("select", "entry_profiles", "authenticated") in table_grants()


def test_players_can_only_read_and_the_server_can_only_read_and_add():
    # Write once: the first ending counts, so nobody gets update or delete. The row goes only with
    # its player, by cascade.
    assert table_grants() == [
        ("select", "entry_profiles", "authenticated"),
        ("select, insert", "entry_profiles", "service_role"),
    ]


def test_the_table_takes_every_right_away_before_it_grants():
    text = entry_sql()

    revoke_at = text.index("revoke all on table public.entry_profiles")
    first_grant_at = text.index("grant select on table public.entry_profiles")

    assert revoke_at < first_grant_at
    assert "from public, anon, authenticated, service_role;" in text[revoke_at:first_grant_at]


def test_the_table_has_no_counter_that_needs_a_revoke():
    # The primary key is the player id, not an identity column, so there is no sequence.
    assert "generated always as identity" not in entry_sql()


def test_the_table_and_every_column_has_a_comment():
    text = entry_sql()

    assert "comment on table public.entry_profiles is" in text
    for column in (
        "player_id",
        "ending",
        "decision",
        "read_log",
        "kit",
        "start_place",
        "kit_coins",
        "move_count",
        "story_sha256",
        "created_at",
    ):
        assert f"comment on column public.entry_profiles.{column} is" in text, column


def test_the_migration_is_safe_to_run_twice():
    text = entry_sql()

    assert "create table if not exists public.entry_profiles" in text
    assert 'drop policy if exists "Players can read their own entry profile"' in text


@pytest.mark.parametrize("dash", ["\u2014", "\u2013"], ids=["em dash", "en dash"])
def test_the_migration_has_no_em_or_en_dash(dash):
    assert dash not in entry_sql()
