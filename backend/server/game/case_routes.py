"""Pure decisions for starting a case search, in the shared refusal order.

Used by: the case service and the search eligibility shown in the case view.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from server.errors import ApiError
from server.game.case_clock import minute_of, minutes_until_open
from server.game.case_data import Card, CaseData
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot, Find, SeatState


@dataclass(frozen=True, repr=False)
class RouteDecision:
    accepted: bool
    reason: str | None = None
    message: str = ""
    minutes: int = 0
    price: int = 0
    ready_in: int = 0


def card_is_open(card: Card, formed: Iterable[str]) -> bool:
    return set(card.opens_after).issubset(formed)


def held_cards(finds: Iterable[Find], now: int) -> frozenset[str]:
    return frozenset(find.card_id for find in finds if find.ready_second <= now)


def decide_route(
    data: CaseData,
    snapshot: CaseSnapshot,
    seat: SeatState,
    route_id: str,
    now: int,
    *,
    paid_confirmed: bool = False,
    expected_price: int | None = None,
    minimum: bool = True,
) -> RouteDecision:
    routes = data.active_routes if minimum else data.routes
    route = next((route for route in routes if route.id == route_id), None)
    if route is None:
        raise ApiError(404, "no_such_route", "That search route is not available.")
    card = data.card(route.card_id)
    if not card_is_open(card, (item.deduction_id for item in snapshot.formed)):
        return RouteDecision(False, "lead_locked", card.closed_line or "")
    if any(find.card_id == card.id for find in snapshot.finds_for_seat(seat.seat_no)):
        return RouteDecision(False, "already_have", UI_MESSAGES["already_have"])
    if route.kind == "kit" and route.kit != seat.kit:
        message = UI_MESSAGES["wrong_kit"].format(kit=data.kit(route.kit).name)
        return RouteDecision(False, "wrong_kit", message)
    if not minimum:
        refusal = full_route_refusal(route, seat, snapshot.coins, paid_confirmed, expected_price)
        if refusal is not None:
            return refusal
    window = None if route.open_when == "always" else data.window(route.open_when)
    wait = minutes_until_open(window, minute_of(now))
    if wait:
        assert window is not None
        return RouteDecision(False, "locked_window", window.closed_line.format(minutes=wait), wait)
    if not minimum and snapshot.coins < route.coins:
        return RouteDecision(False, "no_coins", "You do not have enough coins.", price=route.coins)
    ready_in = route.timer_minutes * 60
    message = (
        route.found_line
        if ready_in == 0
        else UI_MESSAGES["started"].format(minutes=route.timer_minutes)
    )
    return RouteDecision(True, message=message, price=route.coins, ready_in=ready_in)


def full_route_refusal(route, seat, coins: int, paid_confirmed: bool, expected_price: int | None):
    """Later route kinds stay unavailable until their real profile, market and world ports exist."""
    for requirement, reason in (
        (route.needs_profile and not seat.read_log, "log_required"),
        (route.needs_share, "share_route_unavailable"),
        (route.needs_world, "world_route_unavailable"),
    ):
        if requirement:
            return RouteDecision(False, reason, "That route is not available yet.")
    if route.coins and not paid_confirmed:
        return RouteDecision(
            False, "payment_confirmation_required", "Confirm the price first.", price=route.coins
        )
    if route.coins and expected_price != route.coins:
        return RouteDecision(False, "price_changed", "The route price changed.", price=route.coins)
    return None
