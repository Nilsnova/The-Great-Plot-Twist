"""NPC service accepts only bank-backed, player-scoped orders and returns stored DB timing."""

import asyncio
from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.npc_lines import pick_line
from server.tests.case_rule_helpers import PLAYER
from server.tests.npc_service_helpers import call, scenario


@pytest.mark.parametrize(
    "kind,pin_only,variant,minutes",
    [
        ("fetch", False, "fetch", 10),
        ("fetch", True, "pin", 5),
        ("man_light", False, "man_light", 10),
    ],
)
def test_acceptance_uses_exact_receipt_timing_variant_salt_and_one_hint(
    kind, pin_only, variant, minutes
):
    service, store, sender, seat_no, target = scenario(kind, pin_only=pin_only)
    answer = asyncio.run(call(service, seat_no, target, kind=kind))
    values = {"minutes": minutes, "price": 0}
    if kind == "man_light":
        values["light"] = service.data.light(target).name
    expected = pick_line(service.lines, "order_accepted", variant, store.record.order_no, values)
    assert answer["accepted"] and answer["reason"] is None
    assert answer["message"] == answer["line"] == expected
    assert answer["order"] == {
        "number": 3,
        "seat": seat_no,
        "order": kind,
        "target": target,
        "orderedAt": 11,
        "arriveAt": store.record.arrive_second,
        "foundAt": store.record.found_second,
        "pinAt": store.record.pin_second,
        "readyAt": store.record.ready_second,
        "price": 0,
    }
    assert answer["case"] == {"ordersCount": 3, "writeRevision": 7}
    assert store.trace[:3] == ["lookup", "snapshot", "write"]
    assert len(store.writes) == 1 and store.writes[0][1:6] == (
        PLAYER,
        "order0001",
        seat_no,
        kind,
        target,
    )
    assert sender.events == [(store.current.crew_id, "partner_changed", {"version": 7})]
    if kind == "fetch":
        assert answer["coinsPaid"] == 50
    else:
        assert "coinsPaid" not in answer


def test_busy_refusal_uses_the_current_count_salt_without_any_write():
    service, store, sender, seat_no, target = scenario()
    store.current = replace(store.current, orders=(store.record,), orders_count=4)
    answer = asyncio.run(call(service, seat_no, target))
    expected = pick_line(service.lines, "cannot_do_it", "busy", 4, {"minutes": 16, "price": 0})
    assert not answer["accepted"] and answer["reason"] == "busy" and answer["minutes"] == 16
    assert answer["line"] == answer["message"] == expected
    assert store.writes == [] and sender.events == []


@pytest.mark.parametrize("kind", ["fetch", "man_light"])
def test_allow_paid_is_refused_before_snapshot_or_write(kind):
    service, store, sender, seat_no, target = scenario(kind)
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target, kind=kind, paid=True))
    assert error.value.status_code == 422 and error.value.code == "paid_errands_off"
    assert store.trace == ["lookup"] and store.writes == [] and sender.events == []


def test_non_minimum_order_kinds_are_refused_without_a_snapshot_or_write():
    service, store, _, seat_no, target = scenario()
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target, kind="pair"))
    assert error.value.status_code == 422 and store.trace == ["lookup"]


def test_a_direct_service_without_a_bank_refuses_npc_writes():
    service, store, sender, seat_no, target = scenario()
    service.lines = None
    with pytest.raises(ApiError) as error:
        asyncio.run(call(service, seat_no, target))
    assert error.value.status_code == 503 and error.value.code == "case_unavailable"
    assert store.trace == ["lookup"] and sender.events == []


def test_a_partner_home_light_refusal_uses_not_ready_with_the_wrong_kit_bank_group():
    service, store, sender, seat_no, _ = scenario("man_light")
    light = next(light for light in service.data.active_lights if not light.partners_may_man)
    answer = asyncio.run(call(service, seat_no, light.id, kind="man_light"))
    expected = pick_line(
        service.lines,
        "cannot_do_it",
        "wrong_kit",
        0,
        {"minutes": 0, "price": 0, "light": light.name},
    )
    assert not answer["accepted"] and answer["reason"] == "not_ready"
    assert answer["line"] == expected and store.writes == [] and sender.events == []
