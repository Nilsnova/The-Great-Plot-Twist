"""Phase 2 migration boundaries, alongside executable disposable-Postgres checks.

Used by: normal backend checks before the board and finale SQL can reach production.
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20261106080000_case_board_and_night.sql"
)
SIGNATURES = {
    "finale_post_holds": "uuid, text, smallint",
    "finale_leave_post": "uuid, smallint, integer, integer",
    "board_pin": "uuid, uuid, text, text, integer, text",
    "board_pair": "uuid, uuid, text, text, text, text, integer, integer, text",
    "finale_nightfall": "uuid, uuid, text, text, integer, integer",
    "finale_take_post": "uuid, uuid, text, text, boolean, integer, integer",
    "finale_signal": "uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer",
}


@pytest.fixture(scope="module")
def sql():
    return MIGRATION.read_text()


def test_phase2_only_adds_the_three_reserved_tables_and_no_wallet_reasons(sql):
    assert set(re.findall(r"create table if not exists public\.(\w+)", sql)) == {
        "board_pins",
        "finale_posts",
        "finale_signals",
    }
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", sql
    )
    assert not re.search(r"\bdelete\s+from\b", sql)


@pytest.mark.parametrize("name", sorted(SIGNATURES))
def test_phase2_functions_are_only_callable_with_server_rights(sql, name):
    signature = SIGNATURES[name]
    assert (
        f"revoke all on function public.{name}({signature}) from public, anon, authenticated;"
        in sql
    )
    assert f"grant execute on function public.{name}({signature}) to service_role;" in sql
    header = re.search(rf"function public\.{name}\(.*?\bas \$\$", sql, re.S)
    assert header is not None
    assert "security invoker" in header.group(0)
    assert "set search_path = ''" in header.group(0)


def test_deduction_wallets_are_locked_in_a_stable_order(sql):
    # Different crews can reward overlapping players, so their wallet lock order must agree.
    pair = sql.split("create or replace function public.board_pair(", 1)[1]
    reward_loop = pair.split("for v_player in", 1)[1].split("loop", 1)[0]
    assert "select distinct b.pinned_by" in reward_loop
    assert "order by b.pinned_by" in reward_loop


def test_every_phase2_table_and_column_has_a_catalog_comment(sql):
    for table in ("board_pins", "finale_posts", "finale_signals"):
        assert f"comment on table public.{table} is" in sql
        definition = re.search(
            rf"create table if not exists public\.{table} \((.*?)\n\);", sql, re.S
        ).group(1)
        columns = re.findall(
            r"^  ([a-z_]+)\s+(?:uuid|text|smallint|integer|bigint|boolean|numeric|timestamptz)\b",
            definition,
            re.M,
        )
        for column in columns:
            assert f"comment on column public.{table}.{column} is" in sql
