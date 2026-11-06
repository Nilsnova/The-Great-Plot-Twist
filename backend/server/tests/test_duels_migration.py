"""Tests that the Python duel code and the Lantern Duels migration say the same thing.

The migration (supabase/migrations/20261106110000_lantern_duels.sql) and the server
(backend/server/duels/) write down the same facts twice: the two wallet reasons, the arguments of
the three functions, the allowed numbers, and the words the functions answer with. If someone
changes only one of the two, a test here fails. The locks (who may read or write what) are checked
from the text of the file too.

These tests read the SQL file as plain text. They need no database. The real behaviour of the SQL
(balances, refusals, the race) is proven on a real Postgres: supabase/README.md, steps D1 to D12.
"""

import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from server.duels import rules
from server.duels.refusals import REFUSALS
from server.duels.store import answer_arguments, create_arguments, void_arguments
from server.routes.duels import (
    ACTION_UID_MAX_LENGTH,
    ACTION_UID_MIN_LENGTH,
    ACTION_UID_PATTERN,
)
from server.tests.test_wallet_matches_migration import (
    MIGRATIONS,
    migrations_that_change_a_reason,
    migrations_with_an_unreadable_insert,
)
from server.wallet import MAX_REF_LENGTH, WALLET_REASONS

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261106110000_lantern_duels.sql"
EXCHANGE = REPO_ROOT / "supabase" / "migrations" / "20261106010000_island_exchange.sql"
TEXT = MIGRATION.read_text()

# One line of the list of reasons: ('reason', 'direction', 'description')
SEED_ROW = re.compile(r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'")
SEED_INSERT = re.compile(
    r"insert\s+into\s+(?:public\.)?wallet_reasons\s*\(reason,\s*direction,\s*description\)\s*values"
    r"(.*?)on\s+conflict\s*\(reason\)\s+do\s+nothing\s*;",
    re.DOTALL | re.IGNORECASE,
)

DUELS_COLUMNS = [
    "id",
    "challenger_id",
    "opponent_id",
    "is_open",
    "rounds",
    "stake",
    "cut_percent",
    "status",
    "outcome",
    "round_results",
    "create_uid",
    "created_at",
    "expires_at",
    "answered_at",
    "closed_at",
]
DUEL_MOVES_COLUMNS = ["duel_id", "player_id", "round_no", "signal", "action_uid", "sealed_at"]
FUNCTIONS = ["duel_create", "duel_answer", "duel_void"]

NOW = datetime(2026, 11, 6, 10, 0, tzinfo=UTC)
SIGNALS_5 = ("flash", "shade", "shade", "mirror", "shade")


def find_in_migration(pattern: str) -> re.Match:
    """The first place in the Lantern Duels migration that matches `pattern`. Fails clearly."""
    match = re.search(pattern, TEXT, re.DOTALL)
    assert match, f"Could not find this in {MIGRATION.name}: {pattern}. Did its layout change?"
    return match


def function_text(name: str) -> str:
    """The whole text of one function, from its create line to the closing $$;"""
    return find_in_migration(rf"create or replace function public\.{name}\(.*?\n\$\$;").group(0)


def function_code(name: str) -> str:
    """One function without its -- comments, so a word inside a comment cannot fool a test."""
    lines = function_text(name).splitlines()
    return "\n".join(re.sub(r"--.*$", "", line) for line in lines)


def declared_parameters(name: str) -> list[str]:
    """The parameter names of one function, in order."""
    text = find_in_migration(
        rf"create or replace function public\.{name}\((.*?)\)\s+returns"
    ).group(1)
    return [parameter.split()[0] for parameter in text.split(",")]


def migration_rows() -> list[tuple[str, str, str]]:
    """The (reason, direction, description) rows that the migration inserts."""
    rows = []
    for values in SEED_INSERT.findall(TEXT):
        rows.extend(SEED_ROW.findall(values))
    return rows


def quoted_words(text: str) -> tuple[str, ...]:
    """The words written 'in single quotes', in the order they appear."""
    return tuple(re.findall(r"'([a-z_]+)'", text))


# --- the file as a whole ---


def test_the_lantern_duels_migration_sorts_after_the_exchange_so_the_reasons_keep_their_order():
    assert MIGRATIONS.index(MIGRATION) > MIGRATIONS.index(EXCHANGE)


def test_the_migration_starts_with_a_header_box():
    assert TEXT.startswith("-- =====")


@pytest.mark.parametrize(
    "heading", ["WHAT IT DOES", "WHO USES IT", "SAFE TO RUN TWICE", "WHAT IT NEEDS"]
)
def test_the_header_says_what_the_migration_does_who_uses_it_and_that_it_is_safe_twice(heading):
    assert heading in TEXT


def test_the_migration_has_no_em_dash_and_no_en_dash():
    assert chr(0x2014) not in TEXT
    assert chr(0x2013) not in TEXT


def test_everything_in_the_migration_is_safe_to_run_twice():
    assert re.findall(r"create table (?!if not exists)", TEXT) == []
    assert re.findall(r"create (?:unique )?index (?!if not exists)", TEXT) == []
    assert re.findall(r"create function", TEXT) == []
    assert TEXT.count("drop policy if exists") == TEXT.count("create policy")
    assert "on conflict (reason) do nothing" in TEXT


# --- the wallet reasons ---


def test_the_migration_adds_arena_stake_and_arena_payout_in_this_order():
    pairs = [(reason, direction) for reason, direction, _ in migration_rows()]

    assert pairs == [("arena_stake", "spend"), ("arena_payout", "earn")]


def test_python_has_the_arena_reasons_after_the_reasons_of_the_earlier_migrations():
    # The position is pinned, not "the end of the list": recipe 4.7 appends every new reason at
    # the end, so a test that pinned these two to the end would break for the next package that
    # adds one (the same trap as the market reasons). 8 reasons of the foundation + 3 of the market.
    names = [name for name, _ in WALLET_REASONS]
    first = names.index("arena_stake")
    assert WALLET_REASONS[first : first + 2] == (("arena_stake", "spend"), ("arena_payout", "earn"))
    assert first > names.index("prediction_payout") > names.index("market_fee")


def test_the_migration_does_not_touch_the_reasons_that_exist_already():
    assert MIGRATION.name not in migrations_that_change_a_reason()
    assert MIGRATION.name not in migrations_with_an_unreadable_insert()


def test_the_descriptions_of_the_reasons_have_no_apostrophe_and_are_not_empty():
    descriptions = [description for _reason, _direction, description in migration_rows()]

    assert len(descriptions) == 2
    assert [description for description in descriptions if "'" in description] == []
    assert [description for description in descriptions if not description.strip()] == []


def test_the_functions_use_no_ledger_reason_but_the_two_arena_reasons():
    used = set(re.findall(r"'(arena_\w+)'", TEXT))

    assert used == {"arena_stake", "arena_payout"}


def test_the_cut_has_no_ledger_row_of_its_own():
    assert "arena_cut" not in TEXT
    assert "arena_fee" not in TEXT


# --- the functions and the arguments the server sends ---


def test_duel_create_takes_exactly_the_arguments_that_the_server_sends():
    sent = create_arguments("player", "Name", 5, 100, SIGNALS_5, "q7x2k9m4ab")

    assert declared_parameters("duel_create") == list(sent)


def test_duel_answer_takes_exactly_the_arguments_that_the_server_sends():
    resolution = rules.resolve(SIGNALS_5, SIGNALS_5)

    sent = answer_arguments("duel", "player", SIGNALS_5, "z81kq0p3dd", resolution, NOW)

    assert declared_parameters("duel_answer") == list(sent)


def test_duel_void_takes_exactly_the_arguments_that_the_server_sends():
    sent = void_arguments("duel", "player", "withdrawn")

    assert declared_parameters("duel_void") == list(sent)


@pytest.mark.parametrize("name", FUNCTIONS)
def test_a_function_has_no_default_for_any_argument(name):
    parameters = find_in_migration(
        rf"create or replace function public\.{name}\((.*?)\)\s+returns"
    ).group(1)

    assert "default" not in parameters.lower()
    assert "=" not in parameters


@pytest.mark.parametrize("name", FUNCTIONS)
def test_a_function_is_for_the_server_only(name):
    start = rf"function public\.{name}\(.*?\)\s+"
    revoke = rf"revoke all on {start}from public, anon, authenticated;"
    grant = rf"grant execute on {start}to service_role;"

    assert re.search(revoke, TEXT, re.DOTALL)
    assert re.search(grant, TEXT, re.DOTALL)
    assert TEXT.index("revoke all on function public." + name) < TEXT.index(
        "grant execute on function public." + name
    )


def code_without_comments() -> str:
    """The SQL without its -- comments (the comments say that the functions are NOT definer)."""
    return "\n".join(re.sub(r"--.*$", "", line) for line in TEXT.splitlines())


def test_no_function_is_security_definer():
    assert "security definer" not in code_without_comments().lower()


@pytest.mark.parametrize("name", FUNCTIONS)
def test_a_function_has_an_empty_search_path_and_returns_json(name):
    text = function_text(name)

    assert "set search_path = ''" in text
    assert re.search(r"returns jsonb", text)


@pytest.mark.parametrize("name", FUNCTIONS)
def test_a_function_has_a_comment(name):
    assert re.search(rf"comment on function public\.{name}\(", TEXT)


def test_every_reason_a_function_refuses_with_is_a_reason_the_server_knows():
    refusals = set(re.findall(r"'refused', 'reason', '(\w+)'", TEXT))

    assert refusals - {"not_expired"} <= set(REFUSALS)
    assert "not_expired" in refusals  # only the clean-up of expired challenges sees this one


def test_a_repeat_is_raised_as_already_applied_with_the_unique_violation_code():
    assert TEXT.count("raise exception 'already_applied' using errcode = '23505'") == 3


def test_the_functions_raise_only_errors_the_server_knows():
    raised = set(re.findall(r"raise exception '(\w+)'", TEXT))

    assert raised == {"bad_duel", "wallet_not_found", "already_applied"}


# --- locks: who may read or write what ---


def test_row_level_security_is_on_for_both_tables_and_there_is_one_select_policy():
    assert "alter table public.duels      enable row level security;" in TEXT
    assert "alter table public.duel_moves enable row level security;" in TEXT
    policies = re.findall(r'create policy "[^"]*"\s+on public\.(\w+) for (\w+) to (\w+)', TEXT)

    assert policies == [("duels", "select", "authenticated")]


def test_the_policy_lets_a_player_read_only_the_duels_they_take_part_in():
    policy = find_in_migration(r"create policy .*?;").group(0)

    assert "challenger_id = (select auth.uid())" in policy
    assert "opponent_id = (select auth.uid())" in policy
    assert " or " in policy


def test_duel_moves_has_no_policy_and_no_grant_for_a_player():
    assert "on public.duel_moves for" not in TEXT
    assert re.findall(r"grant [^;]*public\.duel_moves[^;]*to authenticated", TEXT) == []
    assert re.findall(r"grant [^;]*public\.duel_moves[^;]*to anon", TEXT) == []


def test_the_server_may_only_select_and_insert_on_duel_moves():
    grants = re.findall(r"grant ([a-z, ]+) on table public\.duel_moves to (\w+);", TEXT)

    assert grants == [("select, insert", "service_role")]


def test_a_player_may_only_select_duels_and_the_server_may_not_delete_one():
    grants = re.findall(r"grant ([a-z, ]+) on table public\.duels to (\w+);", TEXT)

    assert grants == [("select", "authenticated"), ("select, insert, update", "service_role")]


def test_the_migration_takes_every_right_away_before_it_grants():
    revoke = re.search(
        r"revoke all on table\s+public\.duels,\s+public\.duel_moves\s+"
        r"from public, anon, authenticated, service_role;",
        TEXT,
    )

    assert revoke
    assert revoke.start() < TEXT.index("grant select on table public.duels")


def test_there_is_no_identity_column_so_there_is_no_counter_to_lock():
    assert "generated always as identity" not in TEXT
    assert "_seq" not in TEXT


def test_the_captain_foreign_key_of_duel_moves_has_an_index_of_its_own():
    # The primary key starts with duel_id, so only this index serves the cascade from profiles.
    index = (
        r"create index if not exists duel_moves_player_id_idx\s+"
        r"on public\.duel_moves \(player_id\);"
    )

    assert re.search(index, TEXT)


def test_the_stakes_are_locked_in_player_id_order_after_the_duel_row():
    text = function_text("duel_answer")

    duel_lock = text.index("from public.duels where id = p_duel_id for update")
    wallet_lock = re.search(r"order by player_id\s+for update", text)

    assert wallet_lock
    assert duel_lock < wallet_lock.start()


def test_the_other_functions_lock_only_the_challenger_wallet():
    create_text = function_text("duel_create")
    void_text = function_text("duel_void")

    assert "from public.wallets where player_id = p_challenger_id for update" in create_text
    assert "public.duels where id" not in create_text
    assert "from public.wallets where player_id = v_duel.challenger_id for update" in void_text
    assert void_text.index("public.duels where id = p_duel_id for update") < void_text.index(
        "public.wallets where player_id"
    )


def test_duel_create_refuses_a_repeat_before_every_other_rule():
    text = function_text("duel_create")

    assert text.index("raise exception 'already_applied'") < text.index("'no_such_captain'")
    assert text.index("raise exception 'already_applied'") < text.index("'too_many_waiting'")
    assert text.index("'wallet_not_found'") < text.index("raise exception 'already_applied'")


def test_duel_answer_refuses_a_repeat_before_every_other_rule():
    text = function_text("duel_answer")

    assert text.index("raise exception 'already_applied'") < text.index("'duel_taken'")
    assert text.index("'no_such_duel'") < text.index("raise exception 'already_applied'")


def test_the_pair_limit_counts_decided_staked_duels_of_the_two_captains_both_ways_round():
    text = function_text("duel_answer")

    assert "status = 'finished' and stake > 0 and answered_at >= p_day_start" in text
    assert "challenger_id = v_duel.challenger_id and opponent_id = p_player_id" in text
    assert "challenger_id = p_player_id and opponent_id = v_duel.challenger_id" in text


def test_the_day_cannot_start_in_the_future():
    assert "p_day_start > now() + interval '1 minute'" in function_text("duel_answer")


# --- a refusal comes before any write ---


def test_duel_void_refuses_a_closed_duel_before_it_refunds():
    """A refusal returns normally, so a coin moved before it would be saved together with it."""
    code = function_code("duel_void")
    closed = re.search(
        r"if v_duel\.status <> 'open' then.*?"
        r"return jsonb_build_object\('status', 'refused', 'reason', 'duel_closed'\);\s*end if;",
        code,
        re.DOTALL,
    )

    assert closed, "duel_void must refuse a duel that is not open with duel_closed"
    assert closed.end() < code.index("apply_wallet_transaction")


@pytest.mark.parametrize(
    "reason",
    ["no_such_duel", "duel_taken", "duel_closed", "duel_expired", "daily_pair_limit"],
)
def test_duel_answer_refuses_before_it_takes_the_stake(reason):
    """Every refusal of duel_answer comes before the answerer's stake is taken."""
    code = function_code("duel_answer")
    places = [m.start() for m in re.finditer(rf"'refused', 'reason', '{reason}'", code)]

    assert places, f"duel_answer must be able to refuse with {reason}"
    assert max(places) < code.index("'arena_stake'")


# --- money: the payout rounds down and keeps the cut ---


def test_the_payout_text_rounds_down_and_keeps_the_cut():
    text = function_text("duel_answer")

    assert "(2 * v_duel.stake * (100 - v_duel.cut_percent)) / 100" in text


@pytest.mark.parametrize("stake", rules.STAKE_CHOICES)
@pytest.mark.parametrize("cut", [0, 5, 20])
def test_python_pays_what_the_sql_expression_pays(stake, cut):
    # In SQL, integer divided by integer rounds toward zero, which is down for positive numbers.
    sql_result = (2 * stake * (100 - cut)) // 100

    assert rules.winner_takes(stake, cut) == sql_result


def test_a_draw_returns_each_stake_and_a_win_pays_one_captain():
    text = function_text("duel_answer")

    assert "v_duel.stake > 0 and p_outcome = 'draw'" in text
    assert text.count("'arena_payout'") == 4  # a draw twice, a win twice (one per winner)
    assert text.count("'arena_stake'") == 1


def test_a_refund_goes_to_the_challenger_only_and_uses_the_payout_reason():
    text = function_text("duel_void")

    assert text.count("'arena_payout'") == 1
    assert "v_duel.challenger_id, v_duel.stake, 'arena_payout'" in text


def test_every_ledger_ref_is_the_duel_ref_of_the_rules():
    refs = re.findall(r"'(duel:)' \|\| (?:v_duel_id|p_duel_id)::text", TEXT)

    assert set(refs) == {rules.REF_PREFIX}
    assert len(rules.duel_ref("6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44")) <= MAX_REF_LENGTH


def test_the_stake_is_taken_after_the_duel_and_the_envelope_so_a_failure_leaves_nothing():
    text = function_text("duel_create")

    assert text.index("insert into public.duels") < text.index("'arena_stake'")
    assert text.index("insert into public.duel_moves") < text.index("'arena_stake'")


def test_the_cut_is_a_number_on_the_duel_fixed_at_creation():
    assert "cut_percent   smallint not null" in TEXT
    assert "p_cut_percent" in function_text("duel_create")
    assert "v_duel.cut_percent" in function_text("duel_answer")


# --- the database's checks fit the numbers of Python ---


def test_the_rounds_the_database_allows_are_the_rounds_in_python():
    allowed = find_in_migration(r"duels_rounds_allowed\s+check \(rounds in \((.*?)\)\)").group(1)

    assert tuple(int(number) for number in allowed.split(",")) == rules.ROUND_CHOICES


def test_the_functions_check_the_same_rounds_as_the_table():
    assert "p_rounds not in (3, 5)" in function_text("duel_create")


def test_the_stake_the_database_allows_is_the_range_of_the_agreed_stakes():
    low, high = find_in_migration(
        r"duels_stake_range\s+check \(stake between (\d+) and (\d+)\)"
    ).groups()

    assert (int(low), int(high)) == (min(rules.STAKE_CHOICES), max(rules.STAKE_CHOICES))
    assert "p_stake < 0 or p_stake > 100" in function_text("duel_create")


def test_the_cut_the_database_allows_includes_the_cut_of_the_rules():
    low, high = find_in_migration(
        r"duels_cut_percent_range\s+check \(cut_percent between (\d+) and (\d+)\)"
    ).groups()

    assert int(low) <= rules.CUT_PERCENT <= int(high)


def test_the_answer_window_the_database_allows_includes_the_window_of_the_rules():
    assert "p_answer_hours < 1 or p_answer_hours > 72" in function_text("duel_create")
    assert 1 <= rules.ANSWER_HOURS <= 72


def test_the_waiting_cap_is_an_argument_so_it_lives_in_python_only():
    assert "p_max_waiting" in function_text("duel_create")
    assert "v_waiting >= p_max_waiting" in function_text("duel_create")


def test_the_signals_the_database_allows_are_the_signals_in_python():
    allowed = find_in_migration(r"duel_moves_signal_allowed\s+check \(signal in \((.*?)\)\)").group(
        1
    )

    assert quoted_words(allowed) == rules.SIGNALS


def test_the_round_numbers_the_database_allows_run_from_1_to_the_most_rounds():
    low, high = find_in_migration(
        r"duel_moves_round_no_range\s+check \(round_no between (\d+) and (\d+)\)"
    ).groups()

    assert (int(low), int(high)) == (1, max(rules.ROUND_CHOICES))


def test_the_statuses_the_database_allows_are_the_statuses_in_python():
    allowed = find_in_migration(r"duels_status_allowed\s+check \(status in \((.*?)\)\)").group(1)

    assert quoted_words(allowed) == rules.STATUSES


def test_the_outcomes_and_round_results_use_the_words_of_the_rules():
    outcomes = find_in_migration(r"duels_outcome_allowed\s+check \(outcome in \((.*?)\)\)").group(1)
    results = find_in_migration(r"round_results <@ array\[(.*?)\]").group(1)

    assert quoted_words(outcomes) == (rules.CHALLENGER, rules.OPPONENT, rules.DRAW)
    assert quoted_words(results) == (rules.CHALLENGER, rules.OPPONENT, rules.EVEN)


def test_the_action_uid_pattern_of_the_database_is_the_one_of_the_routes():
    patterns = re.findall(r"check \((?:create_uid|action_uid) ~ '(.*?)'\)", TEXT)
    length = f"{{{ACTION_UID_MIN_LENGTH},{ACTION_UID_MAX_LENGTH}}}"
    route_characters = ACTION_UID_PATTERN.removeprefix("^").removesuffix("+$")

    assert len(patterns) == 2
    assert set(patterns) == {f"^{route_characters}{length}$"}


@pytest.mark.parametrize("uid", ["q7x2k9m4ab", "a" * 64, "z81kq0p3dd", "a-b_c-d_e"])
def test_an_action_uid_of_the_database_fits_the_pattern_of_the_routes(uid):
    database_pattern = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
    route_pattern = re.compile(ACTION_UID_PATTERN)

    assert database_pattern.fullmatch(uid)
    assert route_pattern.fullmatch(uid)


# --- the comments ---


@pytest.mark.parametrize("table", ["duels", "duel_moves"])
def test_every_table_has_a_comment(table):
    assert f"comment on table public.{table} is" in TEXT


@pytest.mark.parametrize("column", DUELS_COLUMNS)
def test_every_column_of_duels_has_a_comment(column):
    assert f"comment on column public.duels.{column} is" in TEXT


@pytest.mark.parametrize("column", DUEL_MOVES_COLUMNS)
def test_every_column_of_duel_moves_has_a_comment(column):
    assert f"comment on column public.duel_moves.{column} is" in TEXT


def test_the_policy_has_a_comment():
    assert (
        'comment on policy "Players can read the duels they take part in" on public.duels is'
        in TEXT
    )


def test_every_comment_is_one_plain_text_without_an_apostrophe_inside():
    comments = re.findall(r"^comment on [^;]*? is\s+'([^']*)';", TEXT, re.MULTILINE)

    assert len(comments) == len(re.findall(r"^comment on ", TEXT, re.MULTILINE))
    assert len(comments) == 2 + len(DUELS_COLUMNS) + len(DUEL_MOVES_COLUMNS) + 1 + 3


def missing_columns(create_statement: str, columns: list[str]) -> list[str]:
    """The columns that the create statement does not define."""
    body = find_in_migration(create_statement).group(1)
    return [name for name in columns if not re.search(rf"^\s+{name}\s", body, re.MULTILINE)]


def test_every_column_with_a_comment_exists_in_the_create_statements():
    duels = r"create table if not exists public\.duels \((.*?)\n\);"
    moves = r"create table if not exists public\.duel_moves \((.*?)\n\);"

    assert missing_columns(duels, DUELS_COLUMNS) == []
    assert missing_columns(moves, DUEL_MOVES_COLUMNS) == []
