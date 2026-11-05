"""Tests that the Python wallet rules and the SQL migration say the same thing.

The wallet reasons, the direction of each reason, the starting balance, the longest ref and the
parameters of the money function are written down twice: in server/wallet.py and in the
foundation migration. If someone changes only one of the two, a test here fails.

These tests read the SQL file as plain text. They need no database.

When a LATER migration changes one of these rules, point MIGRATION at the newest file that
defines it.

Used by: pytest (uv run pytest).
"""

import asyncio
import json
import re
from pathlib import Path

import httpx

from server.tests.helpers import make_admin
from server.wallet import (
    EARN_REASONS,
    MAX_REF_LENGTH,
    REASONS,
    SPEND_REASONS,
    STARTING_BALANCE,
    apply_transaction,
)

# The repo root is one level above backend/ (backend/server/tests/this_file.py).
REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the migration that matches `pattern`. Fails with a clear message."""
    match = re.search(pattern, MIGRATION.read_text(), re.DOTALL)
    assert match, f"Could not find this in {MIGRATION.name}: {pattern}. Did its layout change?"
    return match


def quoted_words(text: str) -> tuple[str, ...]:
    """The words written 'in single quotes', in the order they appear."""
    return tuple(re.findall(r"'([a-z_]+)'", text))


# --- the reasons ---


def test_the_reasons_in_the_database_are_the_reasons_in_python_in_the_same_order():
    reason_list = find_in_migration(
        r"wallet_transactions_reason_allowed\s+check \(reason in \((.*?)\)\)"
    ).group(1)

    assert quoted_words(reason_list) == REASONS


def test_the_spend_reasons_in_the_database_are_the_spend_reasons_in_python():
    spend_list = find_in_migration(
        r"wallet_transactions_spend_takes_coins\s+check \(reason not in \((.*?)\)\s+or delta < 0\)"
    ).group(1)

    assert quoted_words(spend_list) == SPEND_REASONS


def test_the_earn_reasons_in_the_database_are_the_earn_reasons_in_python():
    earn_list = find_in_migration(
        r"wallet_transactions_earn_adds_coins\s+check \(reason not in \((.*?)\)\s+or delta > 0\)"
    ).group(1)

    assert quoted_words(earn_list) == EARN_REASONS


# --- the numbers ---


def test_a_new_wallet_in_the_database_starts_with_the_starting_balance_of_python():
    default_balance = find_in_migration(r"balance\s+bigint not null default (\d+)").group(1)

    assert int(default_balance) == STARTING_BALANCE


def test_the_longest_ref_in_the_database_is_the_longest_ref_in_python():
    longest_ref = find_in_migration(r"char_length\(ref\) <= (\d+)").group(1)

    assert int(longest_ref) == MAX_REF_LENGTH


# --- the money function ---


def test_the_ledger_accepts_each_player_reason_and_ref_only_once():
    # AlreadyApplied (server/supabase_admin.py) relies on this rule.
    find_in_migration(
        r"create unique index if not exists wallet_transactions_one_row_per_ref\s+"
        r"on public\.wallet_transactions \(player_id, reason, ref\)\s+"
        r"where ref is not null"
    )


def test_the_money_function_takes_the_parameters_that_wallet_py_sends():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=990))
    asyncio.run(apply_transaction("player-1", -10, "market_buy", "order-1", admin=admin))
    sent_names = list(json.loads(seen[0].content))

    parameter_text = find_in_migration(
        r"create or replace function public\.apply_wallet_transaction\((.*?)\)\s+returns"
    ).group(1)
    declared_names = [parameter.split()[0] for parameter in parameter_text.split(",")]

    assert declared_names == sent_names
