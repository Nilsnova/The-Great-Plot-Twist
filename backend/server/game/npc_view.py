"""Project partner satchels, jobs and public-light duty using stored case seconds.

Used by case_view.py. Reading never settles an order or writes money, cards or pins.
Only the validated partner line bank supplies job text; card prose stays in the earned board.
"""

from server.game.case_data import CaseData
from server.game.case_routes import card_is_open
from server.game.case_snapshot import CaseSnapshot, SeatState
from server.game.finale_rules import post_holds
from server.game.npc_lines import LineBank, pick_line
from server.game.npc_orders import ERRAND_MINUTES, PIN_MINUTES, NpcOrder, order_stage

ORDER_CHOICES = (
    ("fetch", "Fetch and pin a card (15 min)"),
    ("man_light", "Man a light (10 min)"),
)


def order_view(order: NpcOrder) -> dict:
    """The accepted receipt DTO; no account ids, route or unreached result text is exposed."""
    return {
        "number": order.order_no,
        "seat": order.seat_no,
        "order": order.kind,
        "target": order.target,
        "orderedAt": order.ordered_second,
        "arriveAt": order.arrive_second,
        "foundAt": order.found_second,
        "pinAt": order.pin_second,
        "readyAt": order.ready_second,
        "price": order.price,
    }


def job_line(data: CaseData, order: NpcOrder, now: int, lines: LineBank | None) -> str | None:
    """Choose the latest event reached on the fixed timeline, with the stored order salt."""
    if lines is None:
        return None
    event = order_stage(order, now)
    if event in ("found_card", "pinned_card"):
        variant, values = order.result_card, {}
    elif event == "order_accepted":
        variant = (
            "man_light"
            if order.kind == "man_light"
            else ("pin" if order.route_id is None else "go")
        )
        minutes = PIN_MINUTES if variant == "pin" else ERRAND_MINUTES
        light = next((light.name for light in data.active_lights if light.id == order.target), "")
        values = {"minutes": minutes, "light": light}
    else:
        variant = "any"
        values = {
            "light": next(
                (light.name for light in data.active_lights if light.id == order.target), ""
            )
        }
    return pick_line(lines, event, variant, order.order_no, values)


def partner_job(data: CaseData, order: NpcOrder, now: int, lines: LineBank | None) -> dict:
    arrival = order.ready_second if order.kind == "man_light" else order.arrive_second
    return {
        "orderNo": order.order_no,
        "order": order.kind,
        "target": order.target,
        "total": order.ready_second - order.ordered_second,
        "remaining": max(0, order.ready_second - now),
        "done": now >= order.ready_second,
        "arrived": arrival is None or now >= arrival,
        "line": job_line(data, order, now, lines),
    }


def partner_satchel(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, now: int
) -> list[dict]:
    held = {
        find.card_id for find in snapshot.finds_for_seat(seat.seat_no) if find.ready_second <= now
    }
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


def partner_targets(data: CaseData, snapshot: CaseSnapshot, seat: SeatState) -> dict:
    formed = {row.deduction_id for row in snapshot.formed}
    reserved = {pin.card_id for pin in snapshot.pins if pin.seat_no == seat.seat_no}
    return {
        "fetch": [
            {"id": card.id, "label": card.title}
            for card in data.cards
            if card_is_open(card, formed) and card.id not in reserved
        ],
        "man_light": [
            {"id": light.id, "label": light.name}
            for light in data.active_lights
            if light.partners_may_man
        ],
    }


def partner_status(snapshot: CaseSnapshot, order: NpcOrder | None, now: int) -> str:
    if order is None:
        return "idle"
    if now < order.ready_second:
        return "busy"
    if order.kind == "man_light" and any(
        post.order_no == order.order_no
        and post.seat_no == order.seat_no
        and post.light_id == order.target
        and post_holds(snapshot, post)
        for post in snapshot.posts
    ):
        return "on_duty"
    return "idle"


def build_partners_view(
    data: CaseData, snapshot: CaseSnapshot, now: int, lines: LineBank | None = None
) -> list[dict]:
    partners = []
    for seat in sorted(snapshot.seats, key=lambda seat: seat.seat_no):
        if seat.npc_id is None or seat.player_id is not None:
            continue
        order = max(
            (
                row
                for row in snapshot.npc_orders
                if row.seat_no == seat.seat_no and row.npc_id == seat.npc_id
            ),
            key=lambda row: row.order_no,
            default=None,
        )
        status = partner_status(snapshot, order, now)
        partners.append(
            {
                "seat": seat.seat_no,
                "name": seat.name,
                "partnerId": seat.npc_id,
                "kit": seat.kit,
                "kitName": data.kit(seat.kit).name,
                "status": status,
                "canOrder": status != "busy",
                "orders": [{"id": kind, "label": label} for kind, label in ORDER_CHOICES],
                "targets": partner_targets(data, snapshot, seat),
                "satchel": partner_satchel(data, snapshot, seat, now),
                "job": None if order is None else partner_job(data, order, now, lines),
            }
        )
    return partners
