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

The Island Exchange migration (20261106090000_exchange_leverage.sql, version 2) is checked in the
last section of this file: its two wallet reasons, the arguments that the Python code sends to its
three functions, the limits that Python and SQL both know, and that it removes the first Exchange
(20261106010000_island_exchange.sql, which was merged but never applied and is never edited).

Used by: pytest (cd backend && uv run pytest).
"""

import asyncio
import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from server.market import positions
from server.market.companies import ID_PATTERN, load_companies
from server.market.positions import Closing
from server.market.states import SweepPrice
from server.market.store import EVENT_KINDS, PRICE_MODES, STATUSES
from server.market.store_calls import (
    CLOSE_REF_PREFIX,
    OPEN_REF_PREFIX,
    ZERO_REF_PREFIX,
    close_arguments,
    open_arguments,
    sweep_arguments,
)
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
EXCHANGE_V1 = REPO_ROOT / "supabase" / "migrations" / "20261106010000_island_exchange.sql"
EXCHANGE = REPO_ROOT / "supabase" / "migrations" / "20261106090000_exchange_leverage.sql"

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


# --- the Island Exchange migration, version 2 ---


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


def words_in_check(constraint: str) -> tuple[str, ...]:
    """The words of `check (column in ('a', 'b'))` of a named constraint in the new migration."""
    text = find_in_exchange(rf"constraint {constraint}\s+check \(\w+ in \((.*?)\)\)").group(1)
    return quoted_words(text)


def function_sql(function_name: str) -> str:
    """The text of one function of the new migration, from its header to its closing $$;"""
    return find_in_exchange(
        rf"create or replace function public\.{function_name}\(.*?\n\$\$;"
    ).group(0)


# --- the reasons ---


def test_the_new_migration_sorts_after_the_foundation_and_the_first_exchange_file():
    assert MIGRATIONS.index(EXCHANGE) > MIGRATIONS.index(EXCHANGE_V1)
    assert MIGRATIONS.index(EXCHANGE_V1) > MIGRATIONS.index(FOUNDATION)


def test_the_new_migration_adds_market_stake_and_market_payout_in_this_order():
    pairs = [(reason, direction) for reason, direction, _ in exchange_rows()]

    assert pairs == [("market_stake", "spend"), ("market_payout", "earn")]


def test_python_lists_the_market_reasons_of_both_exchange_files_after_the_first_eight():
    assert WALLET_REASONS[8:13] == (
        ("market_buy", "spend"),
        ("market_sell", "earn"),
        ("market_fee", "spend"),
        ("market_stake", "spend"),
        ("market_payout", "earn"),
    )


def test_the_new_migration_does_not_touch_the_existing_reasons():
    assert EXCHANGE.name not in migrations_that_change_a_reason()
    assert EXCHANGE.name not in migrations_with_an_unreadable_insert()


def test_the_first_exchange_file_keeps_its_three_reasons_because_a_reason_is_never_removed():
    text = EXCHANGE_V1.read_text()

    for reason in ("market_buy", "market_sell", "market_fee"):
        assert f"'{reason}'" in text


def test_the_ledger_rows_of_an_opening_use_the_reasons_stake_and_fee_and_a_closing_payout_and_fee():
    text = function_sql("exchange_open_position")
    assert "'market_stake'" in text and "'market_fee'" in text
    text = function_sql("exchange_close_position")
    assert "'market_payout'" in text and "'market_fee'" in text


# --- the functions and what Python sends ---


def test_exchange_open_position_takes_exactly_the_arguments_that_the_server_sends():
    sent = open_arguments(
        "player-1",
        "harbor-trust",
        "rising",
        "live",
        Decimal("76159.21"),
        100,
        2,
        200,
        "market:open:click-0001",
        datetime(2026, 11, 6, 8, 0, tzinfo=UTC),
    )

    assert declared_parameters("exchange_open_position") == list(sent)


def test_exchange_close_position_takes_exactly_the_arguments_that_the_server_sends():
    sent = close_arguments(
        "player-1",
        "position-1",
        "live",
        Decimal("76159.21"),
        Closing(value=115, fee=2, coins_change=113, used_up=False),
        200,
        "market:close:click-0001",
    )

    assert declared_parameters("exchange_close_position") == list(sent)


def test_exchange_close_used_up_takes_exactly_the_arguments_that_the_server_sends():
    sent = sweep_arguments(
        [SweepPrice("harbor-trust", Decimal("1"), datetime(2026, 11, 6, tzinfo=UTC), "live")], None
    )

    assert declared_parameters("exchange_close_used_up") == list(sent)


def test_the_sweep_list_has_the_four_keys_the_function_reads():
    (item,) = sweep_arguments(
        [SweepPrice("harbor-trust", Decimal("1"), datetime(2026, 11, 6, tzinfo=UTC), "live")], None
    )["p_prices"]
    sql = function_sql("exchange_close_used_up")

    assert list(item) == ["company_id", "price", "quoted_at", "mode"]
    assert "array['company_id', 'price', 'quoted_at', 'mode']" in sql
    assert "as q(company_id text, price numeric, quoted_at timestamptz, mode text)" in sql


@pytest.mark.parametrize(
    "function_name",
    ["exchange_open_position", "exchange_close_position", "exchange_close_used_up"],
)
def test_no_parameter_of_the_three_functions_has_a_default(function_name):
    parameters = find_in_exchange(
        rf"create or replace function public\.{function_name}\((.*?)\)\s+returns"
    ).group(1)

    assert "default" not in parameters
    assert "=" not in parameters


def test_the_three_functions_are_for_the_server_only():
    text = EXCHANGE.read_text()

    for function_name in (
        "exchange_open_position",
        "exchange_close_position",
        "exchange_close_used_up",
    ):
        start = rf"function public\.{function_name}\(.*?\)\s+"
        revoke = rf"revoke all on {start}from public, anon, authenticated;"
        grant = rf"grant execute on {start}to service_role;"
        assert re.search(revoke, text, re.DOTALL), function_name
        assert re.search(grant, text, re.DOTALL), function_name
    assert "security definer" not in text.lower().replace("not security definer", "")


def test_every_function_starts_with_an_empty_search_path_and_has_a_comment():
    text = EXCHANGE.read_text()

    assert text.count("set search_path = ''") == 3
    assert len(re.findall(r"comment on function public\.exchange_\w+\(", text)) == 3


def test_the_functions_return_json_and_nothing_is_a_security_definer():
    for function_name in (
        "exchange_open_position",
        "exchange_close_position",
        "exchange_close_used_up",
    ):
        assert re.search(r"\)\s+returns jsonb\s+language plpgsql", function_sql(function_name))


# --- the numbers that Python and SQL both know ---


def test_the_leverage_of_the_table_check_and_the_function_is_the_leverage_of_python():
    table = find_in_exchange(r"exchange_positions_leverage_is_10\s+check \(leverage = (\d+)\)")
    function = find_in_exchange(r"p_leverage <> (\d+)")

    assert int(table.group(1)) == int(function.group(1)) == positions.LEVERAGE


def test_the_fee_rates_the_functions_allow_are_the_two_rates_of_python():
    open_rates = find_in_exchange(r"p_fee_basis_points not in \((.*?)\)").group(1)
    close_text = function_sql("exchange_close_position")
    close_rates = re.search(r"p_fee_basis_points not in \((.*?)\)", close_text).group(1)

    allowed = sorted([positions.FEE_BASIS_POINTS, positions.RELIT_FEE_BASIS_POINTS])
    assert sorted(int(n) for n in open_rates.split(",")) == allowed
    assert sorted(int(n) for n in close_rates.split(",")) == allowed


def test_the_fee_is_worked_out_the_same_way_in_sql_and_in_python():
    text = EXCHANGE.read_text()

    assert "p_fee <> ceil(p_stake::numeric * p_fee_basis_points / 10000)" in text
    assert "least(ceil(v_position.stake::numeric * p_fee_basis_points / 10000), v_value)" in text
    assert positions.BASIS_POINTS_IN_WHOLE == 10000


def test_the_value_is_worked_out_the_same_way_in_sql_and_in_python():
    sql = function_sql("exchange_close_position")

    assert (
        "v_position.entry_price + v_position.leverage * (p_close_price - v_position.entry_price)"
        in sql
    )
    assert (
        "v_position.entry_price - v_position.leverage * (p_close_price - v_position.entry_price)"
        in sql
    )
    assert "if v_top_part <= 0 then" in sql  # the stake is used up: the value is 0
    assert (
        "div(v_top_part, v_position.entry_price)" in sql
    )  # the whole-number part, once, at the end
    cap = re.search(r"least\(div\(v_top_part, v_position\.entry_price\), (\d+)\)", sql)
    assert int(cap.group(1)) == positions.MAX_VALUE_COINS


def test_the_zero_point_is_worked_out_the_same_way_in_sql_and_in_python():
    sql = function_sql("exchange_open_position")

    assert "v_zero_price := round(p_entry_price, 10) * (p_leverage - 1) / p_leverage;" in sql
    assert "v_zero_price := round(p_entry_price, 10) * (p_leverage + 1) / p_leverage;" in sql


def test_the_zero_point_division_keeps_a_decimal_more_than_a_price_has():
    # entry x 9 / 10 and entry x 11 / 10 have one decimal more than the entry. Postgres keeps at
    # least as many decimals as the top part of a division has, so the entry is rounded to the
    # decimals of the column first. Without it the answer for a price above about 100 million is
    # cut to 8 decimals and the check rule of the table refuses the row (a 502 on every open).
    column_decimals = int(
        re.search(r"zero_price\s+numeric\(28, (\d+)\)", EXCHANGE.read_text()).group(1)
    )
    rounded = re.findall(r"round\(p_entry_price, (\d+)\) \* \(p_leverage", EXCHANGE.read_text())

    assert rounded == [str(column_decimals)] * 2  # once for rising, once for falling
    assert column_decimals >= positions.MAX_PRICE_DECIMALS + 1


def test_the_words_the_tables_allow_are_the_words_of_python():
    assert words_in_check("exchange_positions_side_allowed") == positions.SIDES
    assert words_in_check("exchange_positions_price_mode_allowed") == tuple(PRICE_MODES)
    assert words_in_check("exchange_positions_status_allowed") == tuple(STATUSES)
    assert words_in_check("exchange_events_kind_allowed") == tuple(EVENT_KINDS)
    assert words_in_check("exchange_events_side_allowed") == positions.SIDES


def test_the_stake_range_check_of_the_table_is_wide_enough_for_every_stake_python_allows():
    low, high = re.search(r"check \(stake between (\d+) and (\d+)\)", EXCHANGE.read_text()).groups()

    assert int(low) <= positions.MIN_STAKE_COINS
    assert int(high) >= positions.MAX_STAKE_COINS


def test_the_prices_have_at_most_the_decimals_python_allows():
    text = EXCHANGE.read_text()

    assert f"round(entry_price, {positions.MAX_PRICE_DECIMALS})" in text
    assert f"round(p_entry_price, {positions.MAX_PRICE_DECIMALS})" in text
    assert f"round(p_close_price, {positions.MAX_PRICE_DECIMALS})" in text
    assert f"round(price, {positions.MAX_PRICE_DECIMALS})" in text


# --- the refs ---


def test_a_ref_in_the_database_can_be_as_long_as_a_wallet_ref():
    lengths = re.findall(
        r"char_length\((?:open_ref|close_ref|ref)\) <= (\d+)", EXCHANGE.read_text()
    )

    assert len(lengths) == 3
    assert {int(length) for length in lengths} == {MAX_REF_LENGTH}


def test_the_refs_with_their_prefixes_fit_into_a_wallet_ref():
    for prefix in (OPEN_REF_PREFIX, CLOSE_REF_PREFIX):
        assert len(prefix) + ACTION_UID_MAX_LENGTH <= MAX_REF_LENGTH
    assert len(ZERO_REF_PREFIX) + len("7b3e5f20-1111-4222-8333-444455556666") <= MAX_REF_LENGTH


def test_the_refs_of_an_opening_and_a_closing_are_apart_even_for_one_action_uid():
    assert OPEN_REF_PREFIX != CLOSE_REF_PREFIX
    assert OPEN_REF_PREFIX == "market:open:" and CLOSE_REF_PREFIX == "market:close:"


def test_the_automatic_close_writes_the_zero_ref_python_knows():
    assert f"'{ZERO_REF_PREFIX}' || p.id::text" in function_sql("exchange_close_used_up")


def test_a_player_can_act_with_a_ref_only_once_in_the_database():
    find_in_exchange(
        r"create unique index if not exists exchange_events_one_row_per_ref\s+"
        r"on public\.exchange_events \(player_id, ref\)\s*;"
    )
    find_in_exchange(
        r"create unique index if not exists exchange_positions_one_row_per_open_ref\s+"
        r"on public\.exchange_positions \(player_id, open_ref\)\s*;"
    )


def test_a_repeated_ref_is_answered_with_the_unique_violation_code_the_server_maps():
    text = EXCHANGE.read_text()

    assert text.count("raise exception 'already_applied' using errcode = '23505';") == 2


# --- the company ids ---


def test_the_company_id_pattern_is_the_same_in_both_tables_the_functions_and_python():
    patterns = re.findall(r"check \(company_id ~ '(.*?)'\)", EXCHANGE.read_text())
    function_patterns = re.findall(r"company_id !~ '(.*?)'", EXCHANGE.read_text())

    assert len(patterns) == 2
    assert len(function_patterns) == 2
    assert set(patterns) == set(function_patterns) == {f"^{ID_PATTERN.pattern}$"}


def test_every_company_id_in_the_data_file_fits_the_pattern_of_the_database():
    pattern = find_in_exchange(
        r"exchange_positions_company_id_format\s+check \(company_id ~ '(.*?)'\)"
    )
    expression = re.compile(pattern.group(1))

    for company in load_companies():
        assert expression.fullmatch(company.id), company.id


# --- who may do what ---


def test_both_new_tables_have_row_level_security_and_only_read_policies():
    text = EXCHANGE.read_text()

    for table in ("exchange_positions", "exchange_events"):
        assert f"alter table public.{table}" in text
    assert text.count("enable row level security") == 2
    actions = re.findall(r'create policy "[^"]*"\s+on public\.\w+ for (\w+)', text)
    assert actions == ["select", "select"]
    policies = re.findall(r'create policy "([^"]*)"', text)
    assert policies == [
        "Players can read their own exchange positions",
        "Players can read their own exchange events",
    ]
    assert text.count("using (player_id = (select auth.uid()))") == 2


def test_the_new_migration_takes_every_right_away_before_it_grants():
    text = EXCHANGE.read_text()

    revoke_at = text.index("revoke all on table")
    first_grant_at = text.index("grant select on table")

    assert revoke_at < first_grant_at
    assert "revoke all on sequence public.exchange_events_id_seq" in text
    assert "from public, anon, authenticated, service_role;" in text[revoke_at:first_grant_at]


def test_the_server_can_read_insert_and_update_positions_and_only_read_and_insert_events():
    text = EXCHANGE.read_text()

    assert (
        "grant select, insert, update on table public.exchange_positions to service_role;" in text
    )
    assert "grant select, insert on table public.exchange_events to service_role;" in text
    assert "to authenticated;" in text
    assert not re.search(r"grant [^;]*delete[^;]*exchange_", text)
    assert not re.search(r"grant [^;]*\bto (public|anon)\b", text)


def test_nobody_gets_a_right_on_the_event_counter():
    text = EXCHANGE.read_text()

    assert not re.search(r"grant [^;]*sequence", text)


# --- removing the first Exchange ---


def test_the_guard_comes_before_the_first_drop():
    text = EXCHANGE.read_text()

    assert text.index("v1_market_data_present") < text.index("drop function")
    assert text.index("v1_market_data_present") < text.index("drop table")


def test_the_guard_looks_into_the_old_trades_only_when_the_table_exists():
    text = EXCHANGE.read_text()

    assert "if to_regclass('public.market_trades') is not null then" in text
    assert "if exists (select 1 from public.market_trades) then" in text
    assert text.index("to_regclass('public.market_trades')") < text.index(
        "select 1 from public.market_trades"
    )


def test_the_new_migration_drops_every_table_and_function_of_the_first_exchange_file():
    old = EXCHANGE_V1.read_text()
    new = EXCHANGE.read_text()
    old_tables = re.findall(r"create table if not exists public\.(\w+)", old)
    old_functions = re.findall(r"create or replace function public\.(\w+)\(", old)

    assert sorted(old_tables) == ["market_bases", "market_positions", "market_trades"]
    assert sorted(old_functions) == ["market_set_base", "market_trade"]
    for table in old_tables:
        assert f"drop table if exists public.{table};" in new
    for function_name in old_functions:
        assert f"drop function if exists public.{function_name}(" in new


def test_the_drops_cover_both_signatures_of_market_trade_that_the_first_file_knew():
    new = EXCHANGE.read_text()
    old = EXCHANGE_V1.read_text()

    assert new.count("drop function if exists public.market_trade(") == 2
    # the 13-argument version the first file creates, and the 11-argument draft it removes
    assert "integer, bigint);" in new
    assert "bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz);" in new
    draft = (
        "uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz);"
    )
    assert f"market_trade({draft}" in old


def test_the_first_exchange_file_is_not_edited_it_still_creates_what_the_new_file_drops():
    text = EXCHANGE_V1.read_text()

    assert "create table if not exists public.market_trades" in text
    assert "20261106090000" not in text


def test_the_new_tables_have_new_names_so_dropping_an_old_name_never_touches_new_data():
    new = EXCHANGE.read_text()
    created = re.findall(r"create table if not exists public\.(\w+)", new)

    assert created == ["exchange_positions", "exchange_events"]
    assert not any(name.startswith("market_") for name in created)


def test_every_table_and_every_column_of_the_new_tables_has_a_comment():
    text = EXCHANGE.read_text()
    columns = {
        "exchange_positions": re.findall(
            r"create table if not exists public\.exchange_positions \((.*?)\n\);", text, re.DOTALL
        )[0],
        "exchange_events": re.findall(
            r"create table if not exists public\.exchange_events \((.*?)\n\);", text, re.DOTALL
        )[0],
    }

    for table, body in columns.items():
        assert f"comment on table public.{table} is" in text
        names = re.findall(
            r"^  (\w+)\s+(?:uuid|text|integer|bigint|numeric|timestamptz)", body, re.M
        )
        assert names, table
        for name in names:
            assert f"comment on column public.{table}.{name} is" in text, f"{table}.{name}"
