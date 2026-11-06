"""Build partner orders and carried cards from stored times and the canonical line bank.

Used by: the case view. Eligibility labels never expose a partner's route conditions.
"""

from math import ceil

from server.game.case_data import CaseData
from server.game.case_routes import card_is_open, held_cards
from server.game.case_snapshot import CaseSnapshot, Order, SeatState
from server.game.finale_rules import valid_posts
from server.game.npc_lines import LineBank, pick_line
from server.game.npc_orders import ERRAND_MINUTES, PIN_MINUTES, busy_seconds, latest_order


def _targets(data: CaseData, snapshot: CaseSnapshot, seat: SeatState) -> dict:
    formed = {row.deduction_id for row in snapshot.formed}
    pinned = {pin.card_id for pin in snapshot.pins if pin.seat_no == seat.seat_no}
    return {
        "fetch": [
            {"id": card.id, "label": card.title}
            for card in data.cards
            if card_is_open(card, formed) and card.id not in pinned
        ],
        "man_light": [
            {"id": light.id, "label": light.name}
            for light in data.night.lights
            if light.id in data.partners.may_man_lights
        ],
    }


def _satchel(data: CaseData, snapshot: CaseSnapshot, seat: SeatState, now: int) -> list[dict]:
    held = held_cards(snapshot.finds_for_seat(seat.seat_no), now)
    pinned = {
        pin.card_id
        for pin in snapshot.pins
        if pin.seat_no == seat.seat_no and pin.pinned_second <= now
    }
    return [
        {"id": card.id, "title": card.title, "pinned": card.id in pinned}
        for card in data.cards
        if card.id in held
    ]


def _on_duty(snapshot: CaseSnapshot, seat: SeatState, order: Order | None, now: int) -> bool:
    if order is None or order.kind != "man_light" or now < order.ready_second:
        return False
    return any(
        post.seat_no == seat.seat_no
        and post.light_id == order.target
        and post.on_post_second <= now
        for post in valid_posts(snapshot, now)
    )


def _report(data: CaseData, order: Order, now: int, lines: LineBank) -> str:
    if order.kind == "man_light":
        light = data.light(order.target).name
        event = "manning_light" if now >= order.ready_second else "order_accepted"
        variant = "any" if event == "manning_light" else "man_light"
        values = {"light": light, "minutes": ceil((order.ready_second - order.ordered_second) / 60)}
    elif order.pin_second is not None and now >= order.pin_second:
        event, variant, values = "pinned_card", order.result_card or order.target, None
    elif order.found_second is not None and now >= order.found_second:
        event, variant, values = "found_card", order.result_card or order.target, None
    elif order.arrive_second is not None and now >= order.arrive_second:
        event, variant, values = "arrived", "any", None
    else:
        event = "order_accepted"
        variant = "pin" if order.found_second is None else "fetch"
        end = order.found_second if order.found_second is not None else order.ready_second
        values = {"minutes": ceil((end - order.ordered_second) / 60)}
    return pick_line(lines, event, variant, order.order_no, values)


def _job(data: CaseData, order: Order | None, now: int, lines: LineBank) -> dict | None:
    if order is None:
        return None
    arrival = order.ready_second if order.kind == "man_light" else order.arrive_second
    return {
        "orderNo": order.order_no,
        "order": order.kind,
        "target": order.target,
        "total": order.ready_second - order.ordered_second,
        "remaining": max(0, order.ready_second - now),
        "done": now >= order.ready_second,
        "arrived": arrival is None or now >= arrival,
        "line": _report(data, order, now, lines),
    }


def _partner(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, now: int, lines: LineBank
) -> dict:
    order = latest_order(snapshot, seat.seat_no)
    busy = busy_seconds(snapshot, seat.seat_no, now) > 0
    duty = _on_duty(snapshot, seat, order, now)
    return {
        "seat": seat.seat_no,
        "name": seat.name,
        "partnerId": seat.npc_id,
        "kit": seat.kit,
        "kitName": data.kit(seat.kit).name,
        "status": "busy" if busy else "on_duty" if duty else "idle",
        "canOrder": not busy,
        "orders": [
            {"id": "fetch", "label": f"Fetch and pin a card ({ERRAND_MINUTES + PIN_MINUTES} min)"},
            {"id": "man_light", "label": f"Man a light ({ERRAND_MINUTES} min)"},
        ],
        "targets": _targets(data, snapshot, seat),
        "satchel": _satchel(data, snapshot, seat, now),
        "job": _job(data, order, now, lines),
    }


def npc_view(
    data: CaseData, snapshot: CaseSnapshot, viewer: str, now: int, lines: LineBank
) -> list[dict]:
    """Only a seated player receives the crew's current partner seats."""
    actor = snapshot.seat_for_player(viewer)
    if actor is None or actor.player_id is None:
        return []
    return [
        _partner(data, snapshot, seat, now, lines)
        for seat in sorted(snapshot.seats, key=lambda row: row.seat_no)
        if seat.npc_id is not None and seat.player_id is None
    ]
