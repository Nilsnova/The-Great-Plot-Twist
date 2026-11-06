"""Pure minimum partner orders: free fetch-and-pin and public-light duty.

Used by the partner service and view. Plans fix deadlines at acceptance; no settling,
wallet calls, clock reads or automatic partner actions happen here.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from server.errors import ApiError
from server.game.case_clock import minute_of, minutes_until_open
from server.game.case_data import Card, CaseData, Route
from server.game.case_routes import card_is_open
from server.game.case_snapshot import CaseSnapshot, SeatState
from server.game.finale_rules import light_for, live_post, night_phase

ERRAND_MINUTES = 10
ARRIVE_AFTER_MINUTES = 4
PIN_MINUTES = 5
WAIT_MINUTES = 5
MINIMUM_ORDER_KINDS = ("fetch", "man_light")


@dataclass(frozen=True)
class NpcOrder:
    order_no: int
    seat_no: int
    npc_id: str
    kind: str
    target: str
    ordered_second: int
    ready_second: int
    ordered_by: str | None = None
    route_id: str | None = None
    result_card: str | None = None
    price: int = 0
    arrive_second: int | None = None
    found_second: int | None = None
    pin_second: int | None = None
    action_uid: str | None = None


@dataclass(frozen=True, repr=False)
class RouteChoice:
    accepted: bool
    route: Route | None = None
    reason: str | None = None
    minutes: int = 0


@dataclass(frozen=True, repr=False)
class OrderDecision:
    accepted: bool
    reason: str | None = None
    raw_reason: str | None = None
    minutes: int = 0
    route: Route | None = None
    arrive_second: int | None = None
    found_second: int | None = None
    pin_second: int | None = None
    ready_second: int | None = None
    line_variant: str | None = None


def minimum_reason(reason: str) -> str:
    """Only four refusal groups are exposed by the minimum partner API."""
    if reason == "light_not_for_partners":
        return "wrong_kit"
    return reason if reason in ("busy", "wrong_kit", "locked_window") else "not_ready"


def refuse(reason: str, minutes: int = 0) -> OrderDecision:
    return OrderDecision(False, minimum_reason(reason), reason, minutes)


def require_partner(state: CaseSnapshot, seat: SeatState, allow_paid: bool) -> None:
    if allow_paid:
        raise ApiError(422, "paid_errands_off", "Paid partner errands are not available.")
    current = next((item for item in state.seats if item.seat_no == seat.seat_no), None)
    if current != seat or seat.npc_id is None or seat.player_id is not None:
        raise ApiError(409, "not_a_partner", "That seat is not held by a partner.")


def busy_minutes(orders: Sequence[NpcOrder], seat_no: int, now: int) -> int:
    ready = max((order.ready_second for order in orders if order.seat_no == seat_no), default=0)
    return max(0, ready - now + 59) // 60


def choose_route(data: CaseData, card: Card, seat: SeatState, now: int) -> RouteChoice:
    """First cheapest free route open at arrival; otherwise the smallest retry wait."""
    routes = tuple(
        route
        for route in card.routes
        if route.kind in ("open", "kit", "timed")
        and not route.players_only
        and route.coins == 0
        and (route.kind != "kit" or route.kit == seat.kit)
    )
    if not routes:
        return RouteChoice(False, reason="wrong_kit")
    waits = [
        minutes_until_open(
            None if route.open_when == "always" else data.window(route.open_when),
            minute_of(now),
            ARRIVE_AFTER_MINUTES,
        )
        for route in routes
    ]
    open_routes = [route for route, wait in zip(routes, waits, strict=True) if wait == 0]
    if not open_routes:
        return RouteChoice(False, reason="locked_window", minutes=min(waits))
    return RouteChoice(True, min(open_routes, key=lambda route: route.coins))


def decide_fetch(
    data: CaseData,
    state: CaseSnapshot,
    seat: SeatState,
    card_id: str,
    now: int,
    *,
    orders: Sequence[NpcOrder] = (),
    allow_paid: bool = False,
) -> OrderDecision:
    require_partner(state, seat, allow_paid)
    card = next((card for card in data.cards if card.id == card_id), None)
    if card is None:
        raise ApiError(404, "no_such_card", "That card is not available.")
    if wait := busy_minutes(orders, seat.seat_no, now):
        return refuse("busy", wait)
    if not card_is_open(card, (item.deduction_id for item in state.formed)):
        return refuse("no_lead")
    if any(pin.card_id == card_id and pin.seat_no == seat.seat_no for pin in state.pins):
        return refuse("already_have")
    held = [find for find in state.finds_for_seat(seat.seat_no) if find.card_id == card_id]
    if held:
        if any(find.ready_second > now for find in held):
            return refuse("not_carrying")
        return OrderDecision(
            True,
            pin_second=now + PIN_MINUTES * 60,
            ready_second=now + PIN_MINUTES * 60,
            line_variant="pin",
        )
    choice = choose_route(data, card, seat, now)
    if not choice.accepted:
        return refuse(choice.reason, choice.minutes)
    return OrderDecision(
        True,
        route=choice.route,
        arrive_second=now + ARRIVE_AFTER_MINUTES * 60,
        found_second=now + ERRAND_MINUTES * 60,
        pin_second=now + (ERRAND_MINUTES + PIN_MINUTES) * 60,
        ready_second=now + (ERRAND_MINUTES + PIN_MINUTES) * 60,
        line_variant="go",
    )


def decide_man_light(
    data: CaseData,
    state: CaseSnapshot,
    seat: SeatState,
    light_id: str,
    now: int,
    *,
    orders: Sequence[NpcOrder] = (),
    allow_paid: bool = False,
) -> OrderDecision:
    require_partner(state, seat, allow_paid)
    light = light_for(data, light_id)
    if wait := busy_minutes(orders, seat.seat_no, now):
        return refuse("busy", wait)
    if not light.partners_may_man:
        return refuse("light_not_for_partners")
    if night_phase(data, state, now) != "night":
        return refuse("not_nightfall")
    post = live_post(state, light_id)
    if post is not None:
        return refuse("already_have" if post.seat_no == seat.seat_no else "light_taken")
    return OrderDecision(True, ready_second=now + ERRAND_MINUTES * 60, line_variant="man_light")


def order_stage(order: NpcOrder, now: int) -> str:
    """The latest scripted event whose stored deadline has passed; reads never settle."""
    if order.kind == "man_light":
        return "manning_light" if now >= order.ready_second else "order_accepted"
    if order.pin_second is not None and now >= order.pin_second:
        return "pinned_card"
    if order.found_second is not None and now >= order.found_second:
        return "found_card"
    if order.arrive_second is not None and now >= order.arrive_second:
        return "arrived"
    return "order_accepted"
