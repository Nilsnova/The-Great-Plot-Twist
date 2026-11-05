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

The Island Exchange migration (20261106010000_island_exchange.sql) is checked in the last section
of this file: its three wallet reasons, the arguments that the Python code sends to its two
functions, and the limits that Python and SQL both know.

Used by: pytest (cd backend && uv run pytest).
"""

import asyncio
import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx

from server.market.companies import load_companies
from server.market.exchange import REF_PREFIX
from server.market.rules import Base
from server.market.store import save_arguments, trade_arguments
from server.market.trade_rules import TradeAmounts
from server.routes.market import ACTION_UID_MAX_LENGTH
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
EXCHANGE = REPO_ROOT / "supabase" / "migrations" / "20261106010000_island_exchange.sql"

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


# --- the Island Exchange migration ---


def find_in_exchange(pattern: str) -> re.Match:
    """The first place in the Island Exchange migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, EXCHANGE.read_text(), re.DOTALL)
    assert match, f"Could not find this in {EXCHANGE.name}: {pattern}. Did its layout change?"
    return match


def declared_parameters(function_name: str) -> list[str]:
    """The parameter names of a function in the Island Exchange migration, in order."""
    text = find_in_exchange(
        rf"create or replace function public\.{function_name}\((.*?)\)\s+returns"
    ).group(1)
    return [parameter.split()[0] for parameter in text.split(",")]


def exchange_rows() -> list[tuple[str, str, str]]:
    """The (reason, direction, description) rows that the Island Exchange migration inserts."""
    rows = []
    for values in SEED_INSERT.findall(EXCHANGE.read_text()):
        rows.extend(SEED_ROW.findall(values))
    return rows


def test_the_exchange_migration_sorts_after_the_foundation_so_the_reasons_keep_their_order():
    assert MIGRATIONS.index(EXCHANGE) > MIGRATIONS.index(FOUNDATION)


def test_the_exchange_migration_adds_market_buy_market_sell_and_market_fee_in_this_order():
    pairs = [(reason, direction) for reason, direction, _ in exchange_rows()]

    assert pairs == [("market_buy", "spend"), ("market_sell", "earn"), ("market_fee", "spend")]


def test_python_ends_its_list_of_reasons_with_the_three_market_reasons():
    assert WALLET_REASONS[-3:] == (
        ("market_buy", "spend"),
        ("market_sell", "earn"),
        ("market_fee", "spend"),
    )


def test_the_exchange_migration_does_not_touch_the_foundation_reasons():
    assert EXCHANGE.name not in migrations_that_change_a_reason()
    assert EXCHANGE.name not in migrations_with_an_unreadable_insert()


def test_market_trade_takes_exactly_the_arguments_that_the_server_sends():
    sent = trade_arguments(
        "player-1",
        "harbor-trust",
        "buy",
        5,
        Decimal("60.00"),
        TradeAmounts(gross=300, fee=6),
        "market:click-0001",
        datetime(2026, 11, 5, 8, 0, tzinfo=UTC),
    )

    assert declared_parameters("market_trade") == list(sent)


def test_market_set_base_takes_exactly_the_arguments_that_the_server_sends():
    base = Base(Decimal("60.00"), Decimal("50000"), datetime(2026, 11, 5, tzinfo=UTC), "live")

    sent = save_arguments("harbor-trust", base)

    assert declared_parameters("market_set_base") == list(sent)


def test_market_trade_has_no_default_for_the_ref_or_the_limits():
    # A call that leaves out the ref or a limit does not exist in the database.
    parameters = find_in_exchange(
        r"create or replace function public\.market_trade\((.*?)\)\s+returns"
    ).group(1)

    assert "default" not in parameters


def test_a_trade_ref_in_the_database_can_be_as_long_as_a_wallet_ref():
    longest = find_in_exchange(
        r"market_trades_ref_max_length\s+check \(char_length\(ref\) <= (\d+)\)"
    )

    assert int(longest.group(1)) == MAX_REF_LENGTH


def test_a_player_can_trade_with_a_ref_once_in_the_database():
    find_in_exchange(
        r"create unique index if not exists market_trades_one_row_per_ref\s+"
        r"on public\.market_trades \(player_id, ref\)\s*;"
    )


def test_the_actionuid_limit_of_the_route_fits_into_the_ref_with_its_prefix():
    assert len(REF_PREFIX) + ACTION_UID_MAX_LENGTH <= MAX_REF_LENGTH


def test_every_company_id_in_the_data_file_fits_the_pattern_of_the_database():
    pattern = find_in_exchange(r"market_bases_company_id_format\s+check \(company_id ~ '(.*?)'\)")
    expression = re.compile(pattern.group(1))

    for company in load_companies():
        assert expression.fullmatch(company.id), company.id


def test_the_three_tables_use_the_same_company_id_pattern():
    patterns = re.findall(r"check \(company_id ~ '(.*?)'\)", EXCHANGE.read_text())

    assert len(patterns) == 3
    assert len(set(patterns)) == 1


def test_every_new_table_has_row_level_security_and_no_write_policy():
    text = EXCHANGE.read_text()

    for table in ("market_bases", "market_positions", "market_trades"):
        assert f"alter table public.{table}" in text and "enable row level security" in text
    actions = re.findall(r'create policy "[^"]*"\s+on public\.\w+ for (\w+)', text)
    assert actions == ["select", "select", "select"]


def test_the_exchange_migration_takes_every_right_away_before_it_grants():
    text = EXCHANGE.read_text()

    revoke_at = text.index("revoke all on table")
    first_grant_at = text.index("grant select on table")

    assert revoke_at < first_grant_at
    assert "revoke all on sequence public.market_trades_id_seq" in text


def test_the_new_functions_are_for_the_server_only():
    text = EXCHANGE.read_text()

    for function_name in ("market_trade", "market_set_base"):
        start = rf"function public\.{function_name}\(.*?\)\s+"
        revoke = rf"revoke all on {start}from public, anon, authenticated;"
        grant = rf"grant execute on {start}to service_role;"
        assert re.search(revoke, text, re.DOTALL)
        assert re.search(grant, text, re.DOTALL)
    assert "security definer" not in text.lower().replace("not security definer", "")


def test_market_trade_takes_the_fee_rate_and_the_purchase_limit_as_arguments():
    parameters = declared_parameters("market_trade")

    assert parameters[-2:] == ["p_fee_basis_points", "p_max_buy_coins"]


def test_market_trade_recomputes_the_coins_from_the_units_and_the_price():
    text = EXCHANGE.read_text()

    assert "v_exact_gross := ceil(p_units * p_price)" in text  # a buy is rounded up
    assert "v_exact_gross := floor(p_units * p_price)" in text  # a sell is rounded down
    assert "p_gross::numeric * p_fee_basis_points / 10000" in text  # the fee is rounded up
    assert "p_gross <> v_exact_gross" in text


def test_market_trade_limits_a_purchase_but_not_a_sale():
    text = EXCHANGE.read_text()

    assert "if p_side = 'buy' and p_gross > p_max_buy_coins then" in text


def test_market_trade_refuses_a_company_without_a_base_and_a_market_day_in_the_future():
    text = EXCHANGE.read_text()

    assert "raise exception 'unknown_company'" in text
    assert "p_day_start > now() + interval '1 minute'" in text


def test_the_exchange_migration_removes_the_function_of_the_first_draft():
    # The first draft had 11 arguments. A project that ran it must not keep two versions.
    find_in_exchange(
        r"drop function if exists public\.market_trade\(uuid, text, text, bigint, numeric, "
        r"bigint, bigint, text, integer, bigint, timestamptz\);"
    )
