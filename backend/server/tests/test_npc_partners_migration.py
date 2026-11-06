"""Frozen NPC migration contracts complement the executable scratch PostgreSQL checks."""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase/migrations/20261106130000_npc_partners.sql"
)
SIGNATURES = {
    "npc_begin": "uuid, uuid, text, smallint, text",
    "npc_next_order_no": "uuid",
    "npc_fetch_pin": (
        "uuid, uuid, text, smallint, text, text, text, text[], jsonb, integer, integer, "
        "integer, integer, text, integer, text"
    ),
    "npc_man_light": "uuid, uuid, text, smallint, text, text, integer, integer",
}


@pytest.fixture(scope="module")
def sql():
    return MIGRATION.read_text()


def test_phase4_adds_only_the_reserved_table_with_no_wallet_reasons_or_history_deletes(sql):
    assert set(re.findall(r"create table if not exists public\.(\w+)", sql)) == {"npc_orders"}
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", sql
    )
    assert not re.search(r"\bdelete\s+from\b", sql)
    assert "alter table public.npc_orders enable row level security;" in sql
    assert (
        "revoke all on table public.npc_orders from public, anon, authenticated, service_role;"
        in sql
    )
    assert "grant select, insert on table public.npc_orders to service_role;" in sql


@pytest.mark.parametrize("name", sorted(SIGNATURES))
def test_phase4_functions_run_with_caller_rights_and_only_server_execution(sql, name):
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


def test_only_positive_clue_rewards_can_move_wallets_and_paid_errands_fail(sql):
    calls = re.findall(r"perform public\.apply_wallet_transaction\((.*?)\);", sql, re.S)
    assert calls == ["p_player_id, p_reward_coins, 'clue_reward', p_reward_ref"]
    assert "raise exception 'paid_errands_off';" in sql
    assert "'clue_purchase'" not in sql


def test_order_receipts_are_exact_and_both_intents_record_the_action_uid(sql):
    assert "action_uid     text not null" in sql
    assert "unique (ordered_by, action_uid)" in sql
    inserts = re.findall(r"insert into public\.npc_orders \((.*?)\)\s*values \((.*?)\);", sql, re.S)
    assert len(inserts) == 2
    for columns, values in inserts:
        assert "action_uid" in columns and "p_action_uid" in values


def test_every_new_column_and_function_has_a_catalog_comment(sql):
    assert "comment on table public.npc_orders is" in sql
    definition = re.search(
        r"create table if not exists public\.npc_orders \((.*?)\n\);", sql, re.S
    ).group(1)
    columns = re.findall(
        r"^  ([a-z_]+)\s+(?:uuid|text|smallint|integer|timestamptz)\b", definition, re.M
    )
    for column in columns:
        assert f"comment on column public.npc_orders.{column} is" in sql
    assert "comment on column public.case_state.orders_count is" in sql
    for name, signature in SIGNATURES.items():
        assert f"comment on function public.{name}({signature}) is" in sql
