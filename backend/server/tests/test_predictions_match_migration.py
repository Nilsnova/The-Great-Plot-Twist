"""Tests that the Python prediction desk and its SQL migration say the same thing.

The wallet reasons, the names of the arguments of the two database functions, the ledger refs, the
patterns of the ids, the four ways a pool can end and the limits are written down twice: in
backend/server/predictions/ and in supabase/migrations/20261106100000_prediction_desk.sql. If
someone changes only one of the two, a test here fails. The wallet reasons are also compared with
the Python list by test_wallet_matches_migration.py (it reads every migration in order).

These tests read the SQL file as plain text. They need no database. The behaviour of the SQL
itself is checked on a scratch Postgres (supabase/README.md, steps P1 to P16).

Used by: pytest (cd backend && uv run pytest).
"""

import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from server.predictions import desk, pools, questions, stake_rules, store, views
from server.predictions.pools import Payout
from server.routes.predictions import STAKE_ID_MAX_LENGTH, STAKE_ID_MIN_LENGTH
from server.tests.test_wallet_matches_migration import (
    MIGRATIONS,
    SEED_INSERT,
    SEED_ROW,
    migrations_that_change_a_reason,
    migrations_with_an_unreadable_insert,
)
from server.wallet import EARN, MAX_REF_LENGTH, SPEND, WALLET_REASONS

REPO_ROOT = Path(__file__).resolve().parents[3]
PREDICTION = REPO_ROOT / "supabase" / "migrations" / "20261106100000_prediction_desk.sql"
SQL = PREDICTION.read_text()

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def code_without_comments() -> str:
    """The SQL without comment lines and without the long comment-on statements."""
    text = re.sub(r"--[^\n]*", "", SQL)
    return re.sub(r"comment on .*?';", "", text, flags=re.DOTALL)


def function_text(name: str) -> str:
    """The whole text of one function: from its create line to the end of its body."""
    match = re.search(rf"create or replace function public\.{name}\(.*?\n\$\$;", SQL, re.DOTALL)
    assert match, f"Could not find the function {name} in {PREDICTION.name}."
    return match.group(0)


def declared_parameters(name: str) -> list[str]:
    """The parameter names of a function in the migration, in order."""
    signature = re.search(
        rf"create or replace function public\.{name}\((.*?)\)\s+returns", SQL, re.DOTALL
    )
    assert signature, f"Could not read the parameters of {name}."
    return [parameter.split()[0] for parameter in signature.group(1).split(",")]


def table_text(name: str) -> str:
    match = re.search(rf"create table if not exists public\.{name} \((.*?)\n\);", SQL, re.DOTALL)
    assert match, f"Could not find the table {name}."
    return match.group(1)


# --- the migration in its place ---


def test_the_prediction_migration_sorts_after_every_other_planned_migration():
    names = [path.name for path in MIGRATIONS]

    assert PREDICTION.name in names
    for earlier in ("20261106000000", "20261106010000", "20261106020000", "20261106030000"):
        assert PREDICTION.name > earlier
    for planned in ("20261106040000", "20261106050000", "20261106070000"):
        assert PREDICTION.name > planned


# --- the wallet reasons ---


def prediction_rows() -> list[tuple[str, str, str]]:
    rows = []
    for values in SEED_INSERT.findall(SQL):
        rows.extend(SEED_ROW.findall(values))
    return rows


def test_the_migration_adds_prediction_stake_and_prediction_payout_in_this_order():
    pairs = [(reason, direction) for reason, direction, _ in prediction_rows()]

    assert pairs == [("prediction_stake", "spend"), ("prediction_payout", "earn")]


def test_python_lists_the_two_prediction_reasons_together_after_the_market_reasons():
    names = [name for name, _ in WALLET_REASONS]
    first = names.index("prediction_stake")

    assert WALLET_REASONS[first : first + 2] == (
        ("prediction_stake", SPEND),
        ("prediction_payout", EARN),
    )
    assert first > names.index("market_fee")


def test_the_prediction_migration_does_not_touch_the_reasons_of_the_other_migrations():
    assert PREDICTION.name not in migrations_that_change_a_reason()
    assert PREDICTION.name not in migrations_with_an_unreadable_insert()


def test_the_reason_names_in_the_desk_are_the_ones_in_the_wallet_list():
    reasons = dict(WALLET_REASONS)

    assert reasons[desk.STAKE_REASON] == SPEND
    assert reasons[desk.PAYOUT_REASON] == EARN


# --- the arguments of the two functions ---


def test_prediction_place_stake_takes_exactly_the_arguments_the_server_sends():
    sent = store.place_stake_arguments("p", "q-one", "yes", 5, "stake-0001", NOW, NOW)

    assert declared_parameters("prediction_place_stake") == list(sent)


def test_prediction_settle_pool_takes_exactly_the_arguments_the_server_sends():
    sent = store.settle_arguments("q-one", "yes", NOW, [Payout(1, "p", 5)], "host")

    assert declared_parameters("prediction_settle_pool") == list(sent)


@pytest.mark.parametrize("name", ["prediction_place_stake", "prediction_settle_pool"])
def test_neither_function_has_a_default_for_any_argument(name):
    signature = re.search(
        rf"create or replace function public\.{name}\((.*?)\)\s+returns", SQL, re.DOTALL
    )

    assert "default" not in signature.group(1)


def test_the_limits_are_arguments_and_not_numbers_inside_the_sql():
    assert {"p_max_stake", "p_daily_cap", "p_day_start"} <= set(
        declared_parameters("prediction_place_stake")
    )
    assert "p_cut_percent" in declared_parameters("prediction_settle_pool")
    code = code_without_comments()
    for number in (stake_rules.MAX_STAKE, stake_rules.DAILY_STAKE_CAP):
        assert not re.search(rf"\b{number}\b", code), f"the limit {number} is written into the SQL"
    assert stake_rules.POOL_CUT_PERCENT == 5
    assert not re.search(r"p_cut_percent\s*=\s*5\b|cut_percent\s*:?=\s*5\b", code)


def test_the_payout_list_is_a_json_list_of_stake_row_ids_and_coins():
    arguments = store.settle_arguments("q", "yes", NOW, [Payout(12, "p", 34)], "host")

    assert arguments["p_payouts"] == [{"stakeRowId": 12, "coins": 34}]
    assert "'stakeRowId'" in function_text("prediction_settle_pool")
    assert "'coins'" in function_text("prediction_settle_pool")


# --- the refs of the ledger ---


def test_the_ref_of_a_stake_is_stake_colon_the_stake_id_in_both_languages():
    text = function_text("prediction_place_stake")

    assert desk.STAKE_REF_PREFIX == "stake:"
    assert "'stake:' || p_stake_id" in text
    assert "ref = 'stake:' || stake_id" in SQL  # the table rule agrees


def test_the_ref_of_a_payout_is_pool_colon_the_question_id_in_both_languages():
    assert desk.POOL_REF_PREFIX == "pool:"
    assert "'pool:' || p_question_id" in function_text("prediction_settle_pool")


def test_the_two_refs_fit_into_a_wallet_ref_with_the_longest_ids():
    assert len(desk.STAKE_REF_PREFIX) + STAKE_ID_MAX_LENGTH <= MAX_REF_LENGTH
    assert len(desk.POOL_REF_PREFIX) + 40 <= MAX_REF_LENGTH


def test_the_functions_use_the_wallet_function_with_the_right_reasons():
    place = function_text("prediction_place_stake")
    settle = function_text("prediction_settle_pool")

    assert "public.apply_wallet_transaction(" in place and "'prediction_stake'" in place
    assert "public.apply_wallet_transaction(" in settle and "'prediction_payout'" in settle
    assert "update public.wallets" not in place + settle  # never a direct write to a balance


# --- the patterns of the ids ---


def test_the_question_id_pattern_is_the_same_everywhere():
    sql_patterns = set(re.findall(r"'(\^\[a-z0-9-\]\{2,40\}\$)'", SQL))

    assert sql_patterns == {"^[a-z0-9-]{2,40}$"}
    assert store.QUESTION_ID.pattern == "[a-z0-9-]{2,40}"
    assert questions.ID_CHARACTERS == set("abcdefghijklmnopqrstuvwxyz0123456789-")


def test_every_question_id_of_the_real_file_fits_the_pattern_of_the_database():
    expression = re.compile(r"[a-z0-9-]{2,40}")

    for question in questions.load_questions():
        assert expression.fullmatch(question.id), question.id


def test_the_stake_id_pattern_of_the_database_is_the_one_of_the_route_and_the_store():
    assert "'^[A-Za-z0-9_-]{8,64}$'" in SQL
    assert (STAKE_ID_MIN_LENGTH, STAKE_ID_MAX_LENGTH) == (8, 64)
    assert store.STAKE_ID.pattern == "[A-Za-z0-9_-]{8,64}"


# --- the four ways a pool can end, and the sides ---


def test_the_four_settlements_are_the_same_words_in_python_and_in_sql():
    allowed = re.search(
        r"prediction_pools_settlement_allowed\s+check \(settlement is null or "
        r"settlement in\s+\((.*?)\)\)",
        SQL,
        re.DOTALL,
    )
    sql_names = tuple(re.findall(r"'([a-z_]+)'", allowed.group(1)))

    assert sql_names == (
        pools.WINNERS,
        pools.REFUND_VOID,
        pools.REFUND_NO_WINNERS,
        pools.REFUND_ONE_SIDED,
    )


def test_the_sql_function_decides_the_settlement_with_the_same_names_in_the_same_order():
    body = function_text("prediction_settle_pool")
    positions = [
        body.index(f"'{name}'")
        for name in (
            pools.REFUND_VOID,
            pools.REFUND_NO_WINNERS,
            pools.REFUND_ONE_SIDED,
            pools.WINNERS,
        )
    ]

    assert positions == sorted(positions)


def test_the_outcomes_and_the_sides_are_the_same_in_python_and_in_sql():
    outcomes = re.search(
        r"prediction_pools_outcome_allowed\s+check \(outcome is null or outcome in \((.*?)\)\)", SQL
    )
    sides = re.search(r"prediction_stakes_side_allowed\s+check \(side in \((.*?)\)\)", SQL)

    assert tuple(re.findall(r"'(\w+)'", outcomes.group(1))) == ("yes", "no", pools.VOID)
    assert tuple(re.findall(r"'(\w+)'", sides.group(1))) == views.SIDES


def test_the_cut_is_rounded_down_by_whole_number_division_in_sql_as_in_python():
    assert "(v_losing * p_cut_percent) / 100" in function_text("prediction_settle_pool")
    assert pools.cut_for(199, 5) == 9  # 9.95 rounded down, as integer division gives


# --- the tables, the view and the rights ---


def test_both_new_tables_have_row_level_security_and_only_read_policies():
    for table in ("prediction_pools", "prediction_stakes"):
        assert f"alter table public.{table}" in SQL
    assert SQL.count("enable row level security") == 2
    actions = re.findall(r'create policy "[^"]*"\s+on public\.\w+ for (\w+)', SQL)
    assert actions == ["select", "select"]


def test_the_migration_takes_every_right_away_before_it_grants_any():
    revoke_at = SQL.index("revoke all on table")
    first_grant_at = SQL.index("grant select on table")

    assert revoke_at < first_grant_at
    assert re.search(
        r"revoke all on table\s+public\.prediction_pools,\s+public\.prediction_stakes,\s+"
        r"public\.prediction_pool_sides\s+from public, anon, authenticated, service_role;",
        SQL,
    )
    assert "revoke all on sequence public.prediction_stakes_id_seq" in SQL


def grants_to(role: str) -> list[tuple[str, str]]:
    """Every "grant <rights> on table <tables> to <role>" of the migration, with spaces tidied."""
    pattern = rf"grant\s+([^;]+?)\s+on table\s+([^;]+?)\s+to\s+{role};"
    return [
        (" ".join(rights.split()), " ".join(tables.split()))
        for rights, tables in re.findall(pattern, SQL)
    ]


def test_the_server_gets_no_delete_right_and_only_column_updates():
    server_rights = grants_to("service_role")

    assert server_rights == [
        ("select, insert", "public.prediction_pools"),
        (
            "update (status, outcome, settlement, settled_by, settled_at, cut_coins, paid_coins)",
            "public.prediction_pools",
        ),
        ("select, insert", "public.prediction_stakes"),
        ("update (payout)", "public.prediction_stakes"),
        ("select", "public.prediction_pool_sides"),
    ]
    assert not any("delete" in rights for rights, _ in server_rights)


def test_a_signed_in_player_can_only_read_the_two_tables_and_not_the_view():
    assert grants_to("authenticated") == [
        ("select", "public.prediction_pools, public.prediction_stakes")
    ]


def test_nobody_who_is_not_signed_in_gets_any_right_on_anything_new():
    assert grants_to("anon") == []
    assert grants_to("public") == []


def test_the_view_uses_the_rights_of_the_reader():
    assert re.search(
        r"create or replace view public\.prediction_pool_sides\s+with \(security_invoker = true\)",
        SQL,
    )


@pytest.mark.parametrize("name", ["prediction_place_stake", "prediction_settle_pool"])
def test_each_function_is_for_the_server_only_and_runs_with_the_rights_of_its_caller(name):
    revoke = rf"revoke all on function public\.{name}\(.*?\)\s+from public, anon, authenticated;"
    grant = rf"grant execute on function public\.{name}\(.*?\)\s+to service_role;"

    assert re.search(revoke, SQL, re.DOTALL)
    assert re.search(grant, SQL, re.DOTALL)
    assert "security definer" not in function_text(name).lower().replace("not security definer", "")
    assert "set search_path = ''" in function_text(name)


def test_every_table_and_column_and_the_view_and_the_policies_and_the_functions_are_commented():
    for table in ("prediction_pools", "prediction_stakes"):
        assert f"comment on table public.{table} is" in SQL
        columns = re.findall(
            r"^  ([a-z_]+)\s+(?:text|bigint|uuid|timestamptz|integer)\b",
            table_text(table),
            re.MULTILINE,
        )
        assert len(columns) >= 9
        for column in columns:
            assert f"comment on column public.{table}.{column} is" in SQL, f"{table}.{column}"
    assert "comment on view public.prediction_pool_sides is" in SQL
    for column in ("question_id", "side", "players", "coins"):
        assert f"comment on column public.prediction_pool_sides.{column} is" in SQL
    assert SQL.count("comment on policy") == 2
    # the two functions that stake and settle, and the trigger function that keeps a pool final
    assert SQL.count("comment on function public.prediction_") == 3
    assert "comment on function public.prediction_pools_keep_settled() is" in SQL


# --- a settled pool is final ---


def test_a_trigger_function_refuses_every_change_to_a_settled_pool_with_pool_settled():
    text = function_text("prediction_pools_keep_settled")

    assert re.search(r"returns trigger\s+language plpgsql", text)
    assert "if old.status = 'settled' then" in text
    assert "raise exception 'pool_settled';" in text
    assert "return new;" in text
    assert "set search_path = ''" in text


def test_the_trigger_runs_before_every_update_of_a_pool_row():
    assert re.search(
        r"create or replace trigger prediction_pools_keep_settled\s+"
        r"before update on public\.prediction_pools\s+"
        r"for each row execute function public\.prediction_pools_keep_settled\(\);",
        SQL,
    )
    assert SQL.count("create or replace trigger") == 1


def test_nobody_may_run_the_trigger_function_by_hand():
    assert re.search(
        r"revoke all on function public\.prediction_pools_keep_settled\(\)\s+"
        r"from public, anon, authenticated, service_role;",
        SQL,
    )
    assert "grant execute on function public.prediction_pools_keep_settled" not in SQL


def test_the_trigger_comes_after_the_table_and_before_the_two_functions():
    table = SQL.index("create table if not exists public.prediction_pools")
    trigger = SQL.index("create or replace trigger prediction_pools_keep_settled")
    stake = SQL.index("create or replace function public.prediction_place_stake")
    settle = SQL.index("create or replace function public.prediction_settle_pool")

    assert table < trigger < stake < settle


def test_the_settlement_refuses_a_settled_pool_before_it_updates_the_pool_row():
    # So the trigger only ever sees the update of an OPEN pool from the settlement function.
    text = function_text("prediction_settle_pool")

    assert text.index("v_status = 'settled'") < text.index("update public.prediction_pools")
    assert "set status = 'settled'" in text


# --- the order of the locks ---


def test_a_stake_locks_the_pool_before_the_wallet():
    text = function_text("prediction_place_stake")

    pool_lock = text.index("from public.prediction_pools")
    wallet_lock = text.index("from public.wallets where player_id = p_player_id for update")

    assert pool_lock < wallet_lock
    assert "for update" in text[pool_lock:wallet_lock]


def test_a_settlement_locks_the_pool_before_it_pays_and_pays_in_player_id_order():
    text = function_text("prediction_settle_pool")

    pool_lock = text.index(
        "from public.prediction_pools\n   where question_id = p_question_id\n     for update"
    )
    first_payment = text.index("apply_wallet_transaction")

    assert pool_lock < first_payment
    assert "order by s.player_id, s.id" in text


def test_a_stake_checks_the_repeat_before_the_pool_is_open_and_one_per_question_before_the_cap():
    text = function_text("prediction_place_stake")
    order = [
        text.index("raise exception 'already_applied' using errcode = '23505'"),
        text.index("'pool_closed'"),
        text.index("'already_staked'"),
        text.index("'daily_cap'"),
        text.index("apply_wallet_transaction("),
        text.index("insert into public.prediction_stakes"),
    ]

    assert order == sorted(order)


def test_a_settlement_refuses_a_second_settlement_before_anything_else_is_read():
    text = function_text("prediction_settle_pool")

    assert (
        text.index("v_status = 'settled'")
        < text.index("'pool_open'")
        < text.index("'stakes_changed'")
    )
    assert text.index("'stakes_changed'") < text.index("apply_wallet_transaction")
