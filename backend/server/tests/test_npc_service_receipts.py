"""Historical NPC retries use the exact immutable order, even beyond the view's last forty."""

import asyncio
from dataclasses import replace

import pytest

from server.game.npc_lines import pick_line
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER
from server.tests.npc_service_helpers import call, scenario


def receipt_action(store):
    return {
        "status": "repeat",
        "crewId": store.current.crew_id,
        "kind": "order",
        "target": str(store.record.order_no),
        "outcome": store.record.kind,
    }


@pytest.mark.parametrize(
    "kind,pin_only,variant,minutes",
    [
        ("fetch", False, "fetch", 10),
        ("fetch", True, "pin", 5),
        ("man_light", False, "man_light", 10),
    ],
)
def test_repeated_orders_ignore_changed_input_and_rebuild_only_bank_text(
    kind, pin_only, variant, minutes
):
    service, store, sender, _, _ = scenario(kind, pin_only=pin_only)
    store.actions[(PLAYER, "order0001")] = receipt_action(store)
    store.current = replace(store.current, status="finished", orders_count=99, orders=())
    answer = asyncio.run(call(service, 1, "unknown", kind="pair", paid=True))
    values = {"minutes": minutes, "price": 0}
    if kind == "man_light":
        values["light"] = service.data.light(store.record.target).name
    assert (
        answer["message"]
        == answer["line"]
        == pick_line(service.lines, "order_accepted", variant, store.record.order_no, values)
    )
    assert set(answer) == {"accepted", "reason", "message", "line", "repeat", "case"}
    assert answer["accepted"] and answer["repeat"] and store.writes == [] and sender.events == []
    assert ("receipt", PLAYER, store.current.crew_id, 3) in store.trace


def test_a_pin_endpoint_with_an_old_order_uid_remembers_the_order_before_card_checks():
    service, store, sender, _, _ = scenario()
    store.actions[(PLAYER, "order0001")] = receipt_action(store)
    answer = asyncio.run(service.pin(None, PLAYER, "unknown", "order0001"))
    assert answer["accepted"] and answer["repeat"] and answer["line"] == answer["message"]
    assert store.writes == [] and sender.events == []


def test_repeat_can_return_the_original_line_after_current_membership_has_gone():
    service, store, sender, _, _ = scenario()
    store.actions[(PLAYER, "order0001")] = receipt_action(store)
    store.current = None
    answer = asyncio.run(call(service, 1, "unknown"))
    assert answer["accepted"] and answer["repeat"] and answer["case"] is None
    assert sender.events == []


def test_the_sql_lock_can_find_a_repeat_before_the_new_order_writes():
    service, store, sender, seat_no, target = scenario()
    store.replies = [receipt_action(store)]
    answer = asyncio.run(call(service, seat_no, target))
    assert answer["repeat"] and "order" not in answer and len(store.writes) == 1
    assert sender.events == []


@pytest.mark.parametrize("target", [None, "", "0", "-1", "03", "3.0", "٣", "99999999999"])
def test_malformed_numeric_receipts_are_private_database_errors(target):
    service, store, _, seat_no, card = scenario()
    store.actions[(PLAYER, "order0001")] = {**receipt_action(store), "target": target}
    with pytest.raises(SupabaseRejected):
        asyncio.run(call(service, seat_no, card))
    assert store.writes == []


@pytest.mark.parametrize("missing", [True, False])
def test_missing_or_other_player_receipts_cannot_be_returned(missing):
    service, store, _, seat_no, target = scenario()
    store.actions[(PLAYER, "order0001")] = receipt_action(store)
    store.records[3] = None if missing else replace(store.record, ordered_by="another-player")
    with pytest.raises(SupabaseRejected):
        asyncio.run(call(service, seat_no, target))
