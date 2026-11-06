"""Fail-closed query planning for the local case, partner and world adapter.

Used by: the ordinary backend gate. These checks need no optional PostgreSQL packages;
the companion opt-in module proves the same shapes against actual migrations.
"""

import asyncio

import pytest

from server.supabase_admin import SupabaseRejected
from tools.local_admin import FUNCTIONS, RELATIONS, TABLES, LocalAdmin, selection

SCHEMA = {
    "crews": {"id", "updated_at"},
    "case_state": {"crew_id", "revision"},
    "board_pins": {"crew_id", "card_id"},
    "finale_posts": {"crew_id", "ended_second", "id"},
    "finale_signals": {"crew_id", "id"},
    "npc_orders": {"crew_id", "ordered_by", "order_no"},
    "wall_of_lights": {"player_id", "solve_no", "added_at"},
    "profiles": {"id", "display_name"},
}


@pytest.fixture
def admin(monkeypatch):
    port = LocalAdmin(None)
    monkeypatch.setattr(port, "_columns", lambda connection, table: SCHEMA[table])
    monkeypatch.setattr(port, "_raw", lambda *args, **kwargs: [])
    return port


def test_only_required_case_world_and_exchange_operations_are_added():
    assert {
        "board_pins",
        "finale_posts",
        "finale_signals",
        "npc_orders",
        "world_state",
        "wall_of_lights",
    } <= TABLES
    assert {
        "board_pin",
        "board_pair",
        "finale_nightfall",
        "finale_take_post",
        "finale_signal",
        "npc_fetch_pin",
        "npc_man_light",
        "exchange_open_position",
        "exchange_close_position",
        "exchange_close_used_up",
    } <= FUNCTIONS
    assert "world_solves" not in TABLES
    assert RELATIONS[("crews", "case_state")] == ("id", "crew_id", False)
    assert RELATIONS[("wall_of_lights", "profiles")] == ("player_id", "id", False)


@pytest.mark.parametrize(
    "name",
    [
        "npc_begin",
        "npc_next_order_no",
        "case_begin",
        "case_finish",
        "case_after_solve",
        "apply_wallet_transaction",
    ],
)
def test_private_helpers_remain_outside_the_rpc_allowlist(name):
    with pytest.raises(SupabaseRejected):
        asyncio.run(LocalAdmin(None).call_function(name, {}))


def test_valid_child_options_are_accepted_even_when_the_parent_has_no_rows(admin):
    text = "id,case_state(*),board_pins(*),finale_posts(*),finale_signals(*),npc_orders(*)"
    rows = admin._select(
        None,
        "crews",
        {
            "select": text,
            "id": "eq.missing",
            "limit": "1",
            "finale_posts.ended_second": "is.null",
            "finale_signals.order": "id.desc",
            "finale_signals.limit": "40",
            "npc_orders.order": "order_no.desc",
            "npc_orders.limit": "40",
        },
        selection(text),
    )
    assert rows == []


@pytest.mark.parametrize(
    "option,value",
    [
        ("finale_posts.ended_second", None),
        ("finale_posts.ended_second", "is.not_null"),
        ("finale_posts.unknown", "is.null"),
        ("finale_posts.crew_id", "eq.other"),
        ("finale_posts.offset", "1"),
        ("finale_posts.order", None),
        ("finale_posts.order", "unknown.desc"),
        ("finale_posts.limit", None),
        ("finale_posts.limit", "0"),
        ("finale_posts.limit", True),
        ("finale_posts.limit", "40;select"),
        ("npc_orders.order_no", "eq.1"),
        ("npc_orders.order", "order_no.desc;select"),
        ("npc_orders.limit", "10001"),
        ("case_state.order", "revision.desc"),
        ("case_state.unknown", None),
        ("missing.ended_second", "is.null"),
        ("finale_posts.profiles.id", "eq.value"),
    ],
)
def test_unknown_or_null_child_options_fail_before_an_empty_parent_hides_them(admin, option, value):
    text = "id,case_state(*),finale_posts(*),npc_orders(*)"
    with pytest.raises(SupabaseRejected):
        admin._select(None, "crews", {"select": text, option: value}, selection(text))


def test_child_options_require_the_relation_to_be_selected(admin):
    with pytest.raises(SupabaseRejected):
        admin._select(None, "crews", {"select": "id", "npc_orders.limit": "40"}, selection("id"))


def test_wall_multi_column_order_is_validated_before_an_empty_wall_hides_bad_syntax(admin):
    fields = selection("solve_no,profiles(display_name)")
    assert (
        admin._select(
            None,
            "wall_of_lights",
            {
                "select": "solve_no,profiles(display_name)",
                "order": "solve_no.asc,added_at.asc",
                "limit": "200",
            },
            fields,
        )
        == []
    )
    for order in (None, "solve_no.asc,missing.asc", "solve_no.asc,added_at", "solve_no.asc,"):
        with pytest.raises(SupabaseRejected):
            admin._select(
                None,
                "wall_of_lights",
                {"select": "solve_no", "order": order},
                selection("solve_no"),
            )
