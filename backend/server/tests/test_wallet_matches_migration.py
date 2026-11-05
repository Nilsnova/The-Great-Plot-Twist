"""Tests that the Python wallet rules and the SQL migrations say the same thing.

The wallet reasons with their direction, the starting balance, the longest ref and the
parameters of the money function are written down twice: in backend/server/wallet.py and in the
foundation migration. If someone changes only one of the two, a test here fails. A few tests
also check what the sign-up trigger does and does not do, because that follows from the
starting balance of 0.

These tests read the SQL files as plain text. They need no database.

The list of reasons is read from EVERY file in supabase/migrations/, in order, so a later
migration that adds a reason is picked up by itself. The reader accepts capital letters and extra
spaces. Two more tests make sure nothing slips past it: every INSERT into wallet_reasons must be
in a shape the reader understands, and no migration may update, delete or truncate the reasons.
The other facts are read from the foundation migration. When a LATER migration changes one of
those, point FOUNDATION at the newest file that defines it.

Used by: pytest (cd backend && uv run pytest).
"""

import asyncio
import json
import re
from pathlib import Path

import httpx

from server.tests.helpers import make_admin
from server.wallet import (
    DIRECTIONS,
    MAX_REF_LENGTH,
    STARTING_BALANCE,
    WALLET_REASONS,
    apply_transaction,
)

# The repo root is one level above backend/ (backend/server/tests/this_file.py).
REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql"))
FOUNDATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"

# One line of the list of reasons: ('reason', 'direction', 'description')
# It reads: a bracket, then three texts in single quotes separated by commas. Each text is
# anything except a quote (so write the descriptions in the migration without apostrophes). Any
# text is accepted on purpose: a reason with a capital letter in it is still read, and then
# fails the comparison with Python.
SEED_ROW = re.compile(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'")

# The whole INSERT that adds reasons. Every such INSERT must end with "on conflict do nothing",
# so that running a migration twice is harmless. \s+ means "one or more spaces or line breaks",
# (?:public\.)? means "the schema name may be left out", and IGNORECASE accepts INSERT as well as
# insert.
SEED_INSERT = re.compile(
    r"insert\s+into\s+(?:public\.)?wallet_reasons\s*\(reason,\s*direction,\s*description\)\s*values"
    r"(.*?)on\s+conflict\s*\(reason\)\s+do\s+nothing\s*;",
    re.DOTALL | re.IGNORECASE,
)

# ANY insert into wallet_reasons, whatever its shape. Counting these and comparing with
# SEED_INSERT shows an INSERT that SEED_INSERT cannot read.
ANY_INSERT = re.compile(r"insert\s+into\s+(?:public\.)?wallet_reasons\b", re.IGNORECASE)

# A statement that changes or removes the reasons that exist already. A reason is never renamed
# and its direction never changes, because ledger rows point at it.
CHANGE_STATEMENT = re.compile(
    r"\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?(?:public\.)?wallet_reasons\b",
    re.IGNORECASE,
)


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the foundation migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, FOUNDATION.read_text(), re.DOTALL)
    assert match, f"Could not find this in {FOUNDATION.name}: {pattern}. Did its layout change?"
    return match


def quoted_words(text: str) -> tuple[str, ...]:
    """The words written 'in single quotes', in the order they appear."""
    return tuple(re.findall(r"'([a-z_]+)'", text))


def seeded_rows() -> list[tuple[str, str, str]]:
    """Every (reason, direction, description) that the migrations insert, in file order."""
    rows = []
    for migration in MIGRATIONS:
        for values in SEED_INSERT.findall(migration.read_text()):
            rows.extend(SEED_ROW.findall(values))
    assert rows, "Could not find any INSERT INTO public.wallet_reasons in supabase/migrations/."
    return rows


def migrations_with_an_unreadable_insert() -> list[str]:
    """The migrations with an INSERT into wallet_reasons that SEED_INSERT cannot read."""
    names = []
    for migration in MIGRATIONS:
        text = migration.read_text()
        if len(ANY_INSERT.findall(text)) != len(SEED_INSERT.findall(text)):
            names.append(migration.name)
    return names


def migrations_that_change_a_reason() -> list[str]:
    """The migrations that update, delete or truncate wallet_reasons."""
    names = []
    for migration in MIGRATIONS:
        if CHANGE_STATEMENT.search(migration.read_text()):
            names.append(migration.name)
    return names


def money_function_parameters() -> str:
    """The text between the brackets of apply_wallet_transaction( ... ) in the migration."""
    return find_in_migration(
        r"create or replace function public\.apply_wallet_transaction\((.*?)\)\s+returns"
    ).group(1)


def sign_up_function() -> str:
    """The text of handle_new_user(), the function that runs when someone signs up."""
    function_start = r"create or replace function public\.handle_new_user\(\)"
    return find_in_migration(function_start + r".*?\n\$\$;").group(0)


# --- the reasons ---


def test_the_reasons_in_the_database_are_the_reasons_in_python_in_the_same_order():
    seeded_pairs = []
    for reason, direction, _description in seeded_rows():
        seeded_pairs.append((reason, direction))

    assert tuple(seeded_pairs) == WALLET_REASONS


def test_every_insert_into_wallet_reasons_is_read_by_these_tests():
    # If a migration adds a reason in some other shape, this test fails. Without it, the reason
    # would slip past the comparison above.
    assert migrations_with_an_unreadable_insert() == []


def test_no_migration_changes_or_removes_a_reason():
    # Words in SQL comments count too, so do not write "update wallet_reasons" in a comment.
    assert migrations_that_change_a_reason() == []


def test_every_reason_in_the_database_has_a_description():
    seeded_descriptions = []
    for _reason, _direction, description in seeded_rows():
        seeded_descriptions.append(description.strip())

    assert len(seeded_descriptions) == len(WALLET_REASONS)
    assert "" not in seeded_descriptions


def test_the_directions_the_database_allows_are_the_directions_in_python():
    allowed_list = find_in_migration(
        r"wallet_reasons_direction_allowed\s+check \(direction in \((.*?)\)\)"
    ).group(1)

    assert quoted_words(allowed_list) == DIRECTIONS


def test_the_ledger_only_accepts_reasons_that_are_in_the_list_of_reasons():
    find_in_migration(
        r"constraint wallet_transactions_reason_fkey\s+"
        r"foreign key \(reason\) references public\.wallet_reasons \(reason\)"
    )


# --- the numbers ---


def test_a_new_wallet_in_the_database_starts_with_the_starting_balance_of_python():
    default_balance = find_in_migration(r"balance\s+bigint not null default (\d+)").group(1)

    assert int(default_balance) == STARTING_BALANCE


def test_the_longest_ref_in_the_database_is_the_longest_ref_in_python():
    longest_ref = find_in_migration(r"char_length\(ref\) <= (\d+)").group(1)

    assert int(longest_ref) == MAX_REF_LENGTH


# --- the money function ---


def test_the_ledger_accepts_each_player_reason_and_ref_only_once():
    # AlreadyApplied (backend/server/supabase_admin.py) relies on this rule. The index has no
    # "where" part: every row has a ref, so the rule covers every row.
    find_in_migration(
        r"create unique index if not exists wallet_transactions_one_row_per_ref\s+"
        r"on public\.wallet_transactions \(player_id, reason, ref\)\s*;"
    )


def test_the_ledger_refuses_a_missing_ref():
    # Without a ref, the rule above could not tell a repeat from a new payment.
    find_in_migration(r"\n\s+ref\s+text not null,")


def test_the_ledger_refuses_a_blank_ref():
    find_in_migration(
        r"constraint wallet_transactions_ref_not_blank\s+"
        r"check \(char_length\(btrim\(ref\)\) > 0\)"
    )


def test_the_money_function_takes_the_parameters_that_wallet_py_sends():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=90))
    asyncio.run(apply_transaction("player-1", -10, "clue_purchase", "order-1", admin=admin))
    sent_names = list(json.loads(seen[0].content))

    parameter_text = money_function_parameters()
    declared_names = [parameter.split()[0] for parameter in parameter_text.split(",")]

    assert declared_names == sent_names


def test_the_money_function_cannot_be_called_without_a_ref():
    # No default for p_ref, so a call with only three arguments does not exist in the database.
    assert "default" not in money_function_parameters()


# --- the sign-up trigger ---


def test_the_sign_up_trigger_writes_no_ledger_row_because_the_starting_balance_is_zero():
    assert STARTING_BALANCE == 0
    assert "insert into public.wallet_transactions" not in sign_up_function()


def test_the_sign_up_trigger_gives_a_neutral_placeholder_name():
    assert "'Captain-' || left(new.id::text, c_id_length)" in sign_up_function()


def test_the_sign_up_trigger_never_reads_the_login_details():
    # Names appear on a projector. A player controls their own login details.
    body = sign_up_function()

    assert "raw_user_meta_data" not in body
    assert "raw_app_meta_data" not in body
    assert "email" not in body
