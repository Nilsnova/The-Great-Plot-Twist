"""Static festival security boundaries supplement the executable PostgreSQL checks."""

import re
from pathlib import Path

import pytest

MIGRATION = Path(__file__).resolve().parents[3] / "supabase/migrations/20261106160000_festival.sql"
SIGNATURES = {
    "festival_phase": "",
    "festival_finish": "uuid, text, text, jsonb",
    "festival_begin": "uuid, text, text",
    "festival_ring_candidate": "uuid",
    "festival_claim": "uuid, text, text",
    "festival_ring_leave": "uuid, text",
    "festival_ring_join": "uuid, text, text[], uuid, text[], text, timestamptz",
}


def test_festival_adds_only_four_private_tables_without_rewards_or_changes_to_case_world():
    sql = MIGRATION.read_text()
    assert set(re.findall(r"create table if not exists public\.(\w+)", sql)) == {
        "festival_control",
        "festival_actions",
        "festival_claims",
        "festival_queue",
    }
    assert "create policy" not in sql
    assert "create sequence" not in sql
    assert not re.search(
        r"\b(?:update|insert into|delete from) public\.(?:world_state|wallet_reasons|"
        r"wallet_transactions|case_state)\b",
        sql,
    )
    assert "apply_wallet_transaction(" not in sql
    assert "public.duel_create(" in sql and "public.duel_answer(" in sql


@pytest.mark.parametrize("name,signature", SIGNATURES.items())
def test_every_function_is_private_invoker_with_empty_search_path(name, signature):
    sql = MIGRATION.read_text()
    header = re.search(rf"function public\.{name}\(.*?\bas \$\$", sql, re.S).group(0)
    assert "security invoker" in header and "set search_path = ''" in header
    assert (
        f"revoke all on function public.{name}({signature}) from public, anon, authenticated;"
        in sql
    )
    assert f"grant execute on function public.{name}({signature}) to service_role;" in sql
    assert f"comment on function public.{name}({signature}) is" in sql


def test_every_festival_table_and_column_has_catalog_comments():
    sql = MIGRATION.read_text()
    for table in ("festival_control", "festival_actions", "festival_claims", "festival_queue"):
        assert f"alter table public.{table} enable row level security;" in sql
        assert f"comment on table public.{table} is" in sql
        definition = re.search(
            rf"create table if not exists public\.{table} \((.*?)\n\);", sql, re.S
        ).group(1)
        columns = re.findall(
            r"^  ([a-z_]+)\s+(?:uuid|text|smallint|jsonb|timestamptz)\b", definition, re.M
        )
        for column in columns:
            assert f"comment on column public.{table}.{column} is" in sql
