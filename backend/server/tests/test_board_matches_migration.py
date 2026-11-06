"""Check the Phase 2 schema and server-only RPC contracts without a database.

Used by: the ordinary backend test suite. Actual state transitions and privileges are
also checked by the opt-in PostgreSQL N1 to N15 tests.
"""

import re
from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[3] / "supabase/migrations"
MIGRATION = MIGRATIONS / "20261106080000_case_board_and_night.sql"
SQL = MIGRATION.read_text()
TABLES = ("board_pins", "finale_posts", "finale_signals")
SIGNATURES = {
    "finale_post_holds": "uuid, text, smallint",
    "finale_leave_post": "uuid, smallint, integer, integer",
    "board_pin": "uuid, uuid, text, text, integer, text",
    "board_pair": "uuid, uuid, text, text, text, text, integer, integer, text",
    "finale_nightfall": "uuid, uuid, text, text, integer, integer",
    "finale_take_post": "uuid, uuid, text, text, boolean, integer, integer",
    "finale_signal": "uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer",
}
INTENTS = tuple(
    name for name in SIGNATURES if name not in ("finale_post_holds", "finale_leave_post")
)


def body(name):
    match = re.search(
        rf"create or replace function public\.{name}\(.*?\bas \$\$(.*?)\n\$\$;", SQL, re.S
    )
    assert match is not None
    return match.group(1)


def test_phase2_uses_the_reserved_migration_and_only_three_new_history_tables():
    assert MIGRATION.name == "20261106080000_case_board_and_night.sql"
    assert set(re.findall(r"create table if not exists public\.(\w+)", SQL)) == set(TABLES)


@pytest.mark.parametrize("table", TABLES)
def test_history_tables_have_rls_and_only_server_select_insert_grants(table):
    assert f"alter table public.{table} enable row level security;" in SQL
    assert (
        f"revoke all on table public.{table} from public, anon, authenticated, service_role;" in SQL
    )
    assert re.findall(rf"grant ([a-z, ]+) on table public\.{table} to (\w+);", SQL) == [
        ("select, insert", "service_role")
    ]
    assert not re.search(rf"create policy .*? on public\.{table}\b", SQL, re.S)


def test_only_duty_end_and_parted_columns_can_be_updated():
    assert re.findall(r"grant update \((.*?)\) on table public\.(\w+) to (\w+);", SQL) == [
        ("ended_second", "finale_posts", "service_role"),
        ("ended_second, parted", "finale_signals", "service_role"),
    ]
    for table in ("finale_posts", "finale_signals"):
        assert (
            f"revoke all on sequence public.{table}_id_seq "
            "from public, anon, authenticated, service_role;"
        ) in SQL


@pytest.mark.parametrize("name", SIGNATURES)
def test_all_seven_functions_are_server_only_and_use_caller_rights(name):
    signature = SIGNATURES[name]
    assert (
        f"revoke all on function public.{name}({signature}) from public, anon, authenticated;"
        in SQL
    )
    assert f"grant execute on function public.{name}({signature}) to service_role;" in SQL
    assert "security definer" not in SQL.lower()
    header = re.search(rf"create or replace function public\.{name}\(.*?\bas \$", SQL, re.S)
    assert header is not None
    assert "set search_path = ''" in header.group(0)


@pytest.mark.parametrize("name", INTENTS)
def test_each_intent_locks_before_writes_and_returns_the_finished_revision(name):
    text = body(name)
    first_write = re.search(r"insert into |update public\.|apply_wallet_transaction\(", text)
    assert first_write is not None
    assert text.index("public.case_begin(") < first_write.start()
    assert "return v_begin;" in text
    assert re.search(r"v_revision\s*:=\s*public\.case_finish\(", text)
    for reply in re.findall(r"return jsonb_build_object\((.*?)\);", text, re.S):
        if "'status', 'refused'" not in reply:
            assert "'revision', v_revision" in reply


@pytest.mark.parametrize("name", ["board_pin", "board_pair"])
def test_wallet_duplicates_pay_zero_without_refusing_the_board_change(name):
    text = body(name)
    reward = text.index("public.apply_wallet_transaction(")
    assert text.rfind("begin", 0, reward) >= 0
    assert "exception when unique_violation then" in text[reward:]
    assert "v_paid := 0" in text[reward:]


def test_partner_credit_uses_the_order_second_while_pairing_waits_for_arrival():
    text = body("board_pair")
    assert "a.pinned_second <= v_now and b.pinned_second <= v_now" in text
    rewards = text.split("for v_player in", 1)[1].split("loop", 1)[0]
    assert "b.ordered_second <= v_now" in rewards
    assert "pinned_second" not in rewards


def test_no_migration_deletes_post_history_or_adds_case_wallet_reasons():
    for migration in MIGRATIONS.glob("*.sql"):
        assert not re.search(r"delete\s+from\s+(?:public\.)?finale_posts\b", migration.read_text())
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", SQL
    )


def test_state_changing_refusals_have_replayable_receipts():
    assert "'wrong_pair', v_now" in body("board_pair")
    assert "'off_target', v_now" in body("finale_signal")
    assert "raise unique_violation" not in SQL.lower()
