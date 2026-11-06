"""Pure fetch-and-pin and man-light decisions for the minimum partner orders.

Used by: the case service, partner view and deterministic case planner. Text comes from npc_lines.
"""

from math import ceil

from server.errors import ApiError
from server.game.case_clock import minute_of, minutes_until_open, window_open
from server.game.case_data import Card, CaseData
from server.game.case_routes import card_is_open
from server.game.case_snapshot import CaseSnapshot, Order, SeatState
from server.game.finale_rules import night_phase, valid_posts
from server.game.npc_types import OrderDecision, RouteChoice

ERRAND_MINUTES = 10
ARRIVE_AFTER_MINUTES = 4
PIN_MINUTES = 5
WAIT_MINUTES = 5
ORDER_KINDS = ("fetch", "man_light")
MINIMUM_REASONS = ("busy", "wrong_kit", "locked_window", "not_ready")


def latest_order(snapshot: CaseSnapshot, seat_no: int) -> Order | None:
    return max(
        (order for order in snapshot.orders if order.seat_no == seat_no),
        key=lambda order: order.order_no,
        default=None,
    )


def busy_seconds(snapshot: CaseSnapshot, seat_no: int, now: int) -> int:
    ready = max(
        (order.ready_second for order in snapshot.orders if order.seat_no == seat_no), default=0
    )
    return max(0, ready - now)


def order_refusal(raw_reason: str, minutes: int = 0) -> OrderDecision:
    reason = raw_reason if raw_reason in MINIMUM_REASONS else "not_ready"
    variant = "wrong_kit" if raw_reason == "light_not_for_partners" else reason
    return OrderDecision(
        False, reason, raw_reason, event="cannot_do_it", variant=variant, minutes=minutes
    )


def check_order_seats(
    snapshot: CaseSnapshot, actor: SeatState | None, partner: SeatState | None
) -> None:
    if actor is None or actor.player_id is None:
        raise ApiError(401, "unauthorized", "A player sign-in is required to give orders.")
    current_actor = snapshot.seat_for_player(actor.player_id)
    if current_actor is None or current_actor.seat_no != actor.seat_no:
        raise ApiError(404, "no_crew", "Join a crew before giving partner orders.")
    if snapshot.status != "active":
        code = "crew_finished" if snapshot.status == "finished" else "crew_not_started"
        raise ApiError(409, code, "This crew cannot take partner orders now.")
    if partner is None or partner.npc_id is None or partner.player_id is not None:
        raise ApiError(409, "not_a_partner", "That seat does not hold a partner.")
    current = next((seat for seat in snapshot.seats if seat.seat_no == partner.seat_no), None)
    if current is None or current.npc_id != partner.npc_id or current.player_id is not None:
        raise ApiError(409, "crew_busy", "That seat changed. Read the crew again.")


def choose_route(data: CaseData, card: Card, partner: SeatState, now: int) -> RouteChoice:
    candidates = [
        route
        for route in card.routes
        if not route.players_only
        and route.coins == 0
        and not (route.needs_profile or route.needs_share or route.needs_world or route.needs_flag)
        and (route.kind in ("open", "timed") or (route.kind == "kit" and route.kit == partner.kit))
    ]
    if not candidates:
        return RouteChoice(reason="wrong_kit")
    arrival = minute_of(now) + ARRIVE_AFTER_MINUTES
    available = [
        route
        for route in candidates
        if route.open_when == "always" or window_open(data.window(route.open_when), arrival)
    ]
    if available:
        return RouteChoice(route_id=min(available, key=lambda route: route.coins).id)
    wait = min(minutes_until_open(data.window(route.open_when), arrival) for route in candidates)
    return RouteChoice(reason="locked_window", minutes=wait)


def decide_order(
    data: CaseData,
    snapshot: CaseSnapshot,
    actor_seat: SeatState | None,
    partner_seat: SeatState | None,
    kind: str,
    target: str,
    now: int,
    allow_paid: bool = False,
) -> OrderDecision:
    if allow_paid:
        raise ApiError(422, "paid_errands_off", "Paid partner errands are not available.")
    if kind not in ORDER_KINDS:
        raise ApiError(422, "bad_order", "That partner order is not available.")
    check_order_seats(snapshot, actor_seat, partner_seat)
    items = data.cards if kind == "fetch" else data.night.lights
    if not any(item.id == target for item in items):
        code = "no_such_card" if kind == "fetch" else "no_such_light"
        raise ApiError(404, code, "That partner target is not in the case.")
    wait = busy_seconds(snapshot, partner_seat.seat_no, now)
    if wait:
        return order_refusal("busy", ceil(wait / 60))
    if kind == "fetch":
        return decide_fetch(data, snapshot, partner_seat, target, now)
    return decide_man_light(data, snapshot, partner_seat, target, now)


def decide_fetch(
    data: CaseData, snapshot: CaseSnapshot, partner: SeatState, card_id: str, now: int
) -> OrderDecision:
    card = data.card(card_id)
    if not card_is_open(card, (item.deduction_id for item in snapshot.formed)):
        return order_refusal("no_lead")
    if any(pin.seat_no == partner.seat_no and pin.card_id == card_id for pin in snapshot.pins):
        return order_refusal("already_have")
    held = any(find.card_id == card_id for find in snapshot.finds_for_seat(partner.seat_no))
    if held:
        return OrderDecision(
            True,
            variant="pin",
            minutes=PIN_MINUTES,
            result_card=card_id,
            pin_second=now + PIN_MINUTES * 60,
            ready_second=now + PIN_MINUTES * 60,
        )
    choice = choose_route(data, card, partner, now)
    if choice.reason:
        return order_refusal(choice.reason, choice.minutes)
    found = now + ERRAND_MINUTES * 60
    return OrderDecision(
        True,
        variant="fetch",
        minutes=ERRAND_MINUTES,
        route_id=choice.route_id,
        result_card=card_id,
        arrive_second=now + ARRIVE_AFTER_MINUTES * 60,
        found_second=found,
        pin_second=found + PIN_MINUTES * 60,
        ready_second=found + PIN_MINUTES * 60,
    )


def decide_man_light(
    data: CaseData, snapshot: CaseSnapshot, partner: SeatState, light_id: str, now: int
) -> OrderDecision:
    light = data.light(light_id)
    if not light.partners_may_man:
        return order_refusal("light_not_for_partners")
    if night_phase(data, snapshot, now) != "night":
        return order_refusal("not_nightfall")
    post = next((post for post in valid_posts(snapshot, now) if post.light_id == light_id), None)
    if post is not None:
        return order_refusal("already_have" if post.seat_no == partner.seat_no else "light_taken")
    return OrderDecision(
        True,
        variant="man_light",
        minutes=ERRAND_MINUTES,
        ready_second=now + ERRAND_MINUTES * 60,
    )
