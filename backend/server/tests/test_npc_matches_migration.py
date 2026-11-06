"""Static contracts for accepted NPC orders and their server-only guarded intents.

Used by: the ordinary backend gate. P1 to P10 separately execute every migration,
time boundary, reward and takeover on disposable local PostgreSQL.
"""

import re
from pathlib import Path

import pytest

MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase/migrations/20261106130000_npc_partners.sql"
)
SQL = MIGRATION.read_text()
SIGNATURES = {
    "npc_begin": "uuid, uuid, text, smallint, text",
    "npc_next_order_no": "uuid",
    "npc_fetch_pin": (
        "uuid, uuid, text, smallint, text, text, text, text[], jsonb, "
        "integer, integer, integer, integer, text, integer, text"
    ),
    "npc_man_light": "uuid, uuid, text, smallint, text, text, integer, integer",
}
PARAMETERS = {
    "npc_begin": ("p_crew_id", "p_player_id", "p_action_uid", "p_seat_no", "p_npc_id"),
    "npc_next_order_no": ("p_crew_id",),
    "npc_fetch_pin": (
        "p_crew_id",
        "p_player_id",
        "p_action_uid",
        "p_seat_no",
        "p_npc_id",
        "p_card_id",
        "p_route_id",
        "p_needs_deductions",
        "p_window",
        "p_errand_seconds",
        "p_arrive_seconds",
        "p_pin_seconds",
        "p_price",
        "p_purchase_ref",
        "p_reward_coins",
        "p_reward_ref",
    ),
    "npc_man_light": (
        "p_crew_id",
        "p_player_id",
        "p_action_uid",
        "p_seat_no",
        "p_npc_id",
        "p_light_id",
        "p_travel_seconds",
        "p_night_seconds",
    ),
}


def body(name):
    match = re.search(
        rf"create or replace function public\.{name}\(.*?\bas \$\$(.*?)\n\$\$;", SQL, re.S
    )
    assert match is not None
    return match.group(1)


def test_phase4_uses_the_reserved_stamp_and_one_append_only_order_table():
    assert MIGRATION.name == "20261106130000_npc_partners.sql"
    assert re.findall(r"create table if not exists public\.(\w+)", SQL) == ["npc_orders"]
    assert "alter table public.case_state add column if not exists orders_count" in SQL
    assert "alter table public.npc_orders enable row level security;" in SQL
    assert (
        "revoke all on table public.npc_orders from public, anon, authenticated, service_role;"
        in SQL
    )
    assert re.findall(r"grant ([a-z, ]+) on table public\.npc_orders to (\w+);", SQL) == [
        ("select, insert", "service_role")
    ]
    assert not re.search(r"create policy .*? on public\.npc_orders\b", SQL, re.S)
    assert not re.search(r"\bsettled\s+boolean|create unique index", SQL)


@pytest.mark.parametrize("name", SIGNATURES)
def test_all_four_rpc_signatures_names_and_server_only_rights_match_the_spec(name):
    signature = SIGNATURES[name]
    assert (
        f"revoke all on function public.{name}({signature}) from public, anon, authenticated;"
        in SQL
    )
    assert f"grant execute on function public.{name}({signature}) to service_role;" in SQL
    header = re.search(rf"create or replace function public\.{name}\((.*?)\)\s+returns", SQL, re.S)
    assert header is not None
    parts = [part.strip().split() for part in header.group(1).split(",")]
    assert tuple(part[0] for part in parts) == PARAMETERS[name]
    assert ", ".join(part[1] for part in parts) == signature
    assert "security definer" not in SQL.lower()
    assert "set search_path = ''" in SQL


def test_npc_begin_returns_case_repeats_and_status_before_seat_or_busy_checks():
    text = body("npc_begin")
    begin = text.index("public.case_begin(")
    repeat = text.index("return v_begin;")
    seat = text.index("s.npc_id = p_npc_id")
    busy = text.index("select max(o.ready_second)")
    assert begin < repeat < seat < busy
    assert "v_now < v_busy_until" in text


@pytest.mark.parametrize("name", ["npc_fetch_pin", "npc_man_light"])
def test_order_intents_guard_before_allocation_writes_and_finish_once(name):
    text = body(name)
    assert text.index("public.npc_begin(") < text.index("public.npc_next_order_no(")
    first_write = re.search(r"insert into |update public\.|apply_wallet_transaction\(", text)
    assert first_write is not None
    assert text.index("public.npc_begin(") < first_write.start()
    assert "return v_begin;" in text
    assert text.count("public.case_finish(") == 1
    assert "public.finale_leave_post(" in text
    for reply in re.findall(r"return jsonb_build_object\((.*?)\);", text, re.S):
        if "'status', 'refused'" not in reply:
            assert "'revision', v_revision" in reply


def test_order_number_allocation_does_not_finish_the_case_or_run_before_the_guard():
    text = body("npc_next_order_no")
    assert "orders_count = orders_count + 1" in text
    assert "public.case_finish(" not in text
    assert "revision" not in text


@pytest.mark.parametrize("name", ["npc_fetch_pin", "npc_man_light"])
def test_order_receipts_store_the_exact_order_number_for_repeat_reconstruction(name):
    assert re.search(
        r"public\.case_finish\(p_crew_id, p_player_id, p_action_uid, 'order', v_order_no::text,",
        body(name),
    )


def test_fetch_stores_acceptance_credit_and_arrival_times_without_a_settle_job():
    text = body("npc_fetch_pin")
    assert "(v_now + p_arrive_seconds) / 60" in text
    assert "v_found_at := v_now + p_errand_seconds" in text
    assert "v_pin_at := v_found_at + p_pin_seconds" in text
    assert "v_pin_at := v_now + p_pin_seconds" in text
    assert "v_now, v_pin_at, p_player_id, true, v_order_no, v_paid" in text


def test_rewards_and_optional_paid_errands_touch_only_the_ordering_players_wallet():
    text = body("npc_fetch_pin")
    calls = re.findall(r"public\.apply_wallet_transaction\((.*?)\)", text, re.S)
    assert len(calls) == 2
    assert all(call.strip().startswith("p_player_id,") for call in calls)
    assert "if p_price > 0 then" in text
    assert "exception when unique_violation then" in text
    assert "v_paid := 0" in text
    assert "public.apply_wallet_transaction(" not in body("npc_man_light")


def test_npc_migration_never_changes_wallet_reasons_or_deletes_post_history():
    assert not re.search(
        r"(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?wallet_reasons", SQL
    )
    assert not re.search(r"delete\s+from\s+(?:public\.)?finale_posts\b", SQL)
    assert "raise unique_violation" not in SQL.lower()
