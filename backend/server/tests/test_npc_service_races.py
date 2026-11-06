"""NPC guard races use authoritative waits and refreshed salts without changing receipts."""

import asyncio
from dataclasses import replace
from datetime import timedelta

import pytest

from server.errors import ApiError
from server.game.case_clock import minutes_until_open
from server.game.case_snapshot import SeatState
from server.game.npc_lines import pick_line
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import START
from server.tests.npc_service_helpers import call, scenario


def test_sql_busy_uses_seconds_and_a_refreshed_counter_for_the_bank_salt():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "busy", "seconds": 61}]
    store.after_reply = lambda crew: replace(crew, orders_count=9)
    answer = asyncio.run(call(service, seat_no, target))
    expected = pick_line(service.lines, "cannot_do_it", "busy", 9, {"minutes": 2, "price": 0})
    assert answer["reason"] == "busy" and answer["minutes"] == 2
    assert answer["line"] == answer["message"] == expected
    assert len(store.writes) == 1 and sender.events == []


def test_sql_window_refusal_uses_arrival_at_the_database_minute():
    service, store, sender, seat_no, _ = scenario()
    card, route = next(
        (card, route)
        for card in service.data.cards
        for route in card.routes
        if route.kind == "timed"
    )
    service.data = replace(
        service.data,
        cards=tuple(
            replace(item, routes=(route,)) if item.id == card.id else item
            for item in service.data.cards
        ),
    )
    window = service.data.window(route.open_when)
    service.clock.now = START + timedelta(minutes=(window.from_minute - 4) % window.every_minutes)
    database_minute = (window.from_minute + window.open_minutes - 4) % window.every_minutes
    store.replies = [{"status": "refused", "reason": "locked_window", "minute": database_minute}]
    answer = asyncio.run(call(service, seat_no, card.id))
    minutes = minutes_until_open(window, database_minute + 4)
    assert minutes > 0 and answer["reason"] == "locked_window" and answer["minutes"] == minutes
    assert len(store.writes) == 1 and sender.events == []


@pytest.mark.parametrize(
    "raw", ["already_have", "no_lead", "not_nightfall", "light_taken", "internal_guard"]
)
def test_other_sql_refusals_use_only_the_minimum_public_reason_and_bank_group(raw):
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": raw}]
    answer = asyncio.run(call(service, seat_no, target))
    expected = pick_line(service.lines, "cannot_do_it", "not_ready", 0, {"minutes": 0, "price": 0})
    assert not answer["accepted"] and answer["reason"] == "not_ready"
    assert answer["line"] == expected and "raw_reason" not in answer and sender.events == []


def test_case_open_is_retried_once_and_acceptance_still_notifies_once():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "case_not_open"}]
    answer = asyncio.run(call(service, seat_no, target))
    assert answer["accepted"] and store.trace.count("open") == 1
    assert len(store.writes) == 2 and len(sender.events) == 1


def test_a_second_case_open_refusal_is_a_private_error_without_a_hint():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "case_not_open"}] * 2
    with pytest.raises(SupabaseRejected):
        asyncio.run(call(service, seat_no, target))
    assert store.trace.count("open") == 1 and len(store.writes) == 2 and sender.events == []


def test_a_takeover_during_case_open_cannot_redirect_an_order_to_the_new_holder():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "case_not_open"}]
    store.on_open = lambda crew: replace(
        crew,
        seats=tuple(
            SeatState(seat_no, seat.kit, player_id="33333333-3333-4333-8333-333333333333")
            if seat.seat_no == seat_no
            else seat
            for seat in crew.seats
        ),
    )
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.code == "crew_busy" and len(store.writes) == 1 and sender.events == []


def test_rules_are_checked_again_after_case_open_before_a_second_rpc():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "case_not_open"}]
    store.on_open = lambda crew: replace(crew, orders=(store.record,), orders_count=3)
    answer = asyncio.run(call(service, seat_no, target))
    assert not answer["accepted"] and answer["reason"] == "busy"
    assert len(store.writes) == 1 and sender.events == []


def test_sql_seat_changes_are_crew_busy_and_send_no_hint():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "seat_changed"}]
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.code == "crew_busy" and sender.events == []


def test_losing_membership_after_a_sql_refusal_returns_no_old_crew_view():
    service, store, sender, seat_no, target = scenario()
    store.replies = [{"status": "refused", "reason": "already_have"}]
    store.after_reply = lambda crew: None
    answer = asyncio.run(call(service, seat_no, target))
    assert not answer["accepted"] and answer["case"] is None and sender.events == []
