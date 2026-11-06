"""Deterministic test-only card planner built from production case rules.

Phase 1 proves four-player free-route card access and two-seat deductions. Phase 2 adds the
real pin/pair decisions and lights; Phase 4 extends the seats and steps to NPC orders.
"""

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from itertools import permutations
from uuid import UUID

from server.game.case_board import deduction_for_pair, two_seats_pinned
from server.game.case_clock import minute_of, minutes_until_open
from server.game.case_data import CaseData, Deduction, Route
from server.game.case_routes import decide_route, held_cards
from server.game.case_snapshot import CaseSnapshot, Find, Formed, Pin, SeatState


class PlannerFailure(ValueError):
    """A planned step was refused. Diagnostics name the rule, never protected prose."""


@dataclass(frozen=True)
class CardProof:
    snapshot: CaseSnapshot
    finished_second: int = 0
    pair_seats: tuple[tuple[str, int, int], ...] = ()

    @property
    def coins_spent(self) -> int:
        return sum(find.coins_paid for find in self.snapshot.finds)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PlannerFailure(message)


def starting_snapshot(data: CaseData, kits: tuple[str, ...]) -> CaseSnapshot:
    """Mirror case_open's initial journal finds without counting them as extra actions."""
    _require(len(kits) == 4, "The Phase 1 proof requires four player seats.")
    seats = tuple(
        SeatState(number, kit, str(UUID(int=number)), name=f"Test captain {number}")
        for number, kit in enumerate(kits, start=1)
    )
    finds = tuple(
        Find(seat.seat_no, route.card_id, route.id, 0, 0)
        for seat in seats
        for route in data.active_routes
        if route.starts_in_journal and route.kit == seat.kit
    )
    return CaseSnapshot(
        str(UUID(int=1000)),
        "active",
        "crew",
        datetime(2026, 11, 13, tzinfo=UTC),
        seats,
        finds=finds,
    )


def _route_choices(data: CaseData, seat: SeatState, card_id: str) -> tuple[Route, ...]:
    routes = tuple(
        route for route in data.active_routes if route.card_id == card_id and route.coins == 0
    )
    for kind in ("kit", "open", "timed"):
        choices = tuple(
            route
            for route in routes
            if route.kind == kind and (kind != "kit" or route.kit == seat.kit)
        )
        if choices:
            return choices
    raise PlannerFailure("A seat has no free minimum route to a required card.")


def _start_second(data: CaseData, route: Route, now: int) -> int:
    window = None if route.open_when == "always" else data.window(route.open_when)
    minute = minute_of(now)
    wait = minutes_until_open(window, minute)
    return (minute + wait) * 60 if wait else now


def apply_search(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, route: Route, now: int
) -> tuple[CaseSnapshot, Find]:
    """Mirror the search insert only after the actual pure decision accepts it."""
    decision = decide_route(data, snapshot, seat, route.id, now)
    _require(decision.accepted, "The production search rule refused a planned step.")
    _require(route.coins == 0 and decision.price == 0, "A card proof must not buy a route.")
    find = Find(seat.seat_no, route.card_id, route.id, now, now + decision.ready_in, seat.player_id)
    return replace(
        snapshot, finds=(*snapshot.finds, find), write_revision=snapshot.write_revision + 1
    ), find


def _find_for_card(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, card_id: str, now: int
) -> tuple[CaseSnapshot, Find]:
    existing = next(
        (find for find in snapshot.finds_for_seat(seat.seat_no) if find.card_id == card_id), None
    )
    if existing is not None:
        return snapshot, existing
    routes = _route_choices(data, seat, card_id)
    route = min(
        routes, key=lambda item: (_start_second(data, item, now) + item.timer_minutes * 60, item.id)
    )
    return apply_search(data, snapshot, seat, route, _start_second(data, route, now))


def apply_pin(
    snapshot: CaseSnapshot, seat: SeatState, find: Find, now: int
) -> tuple[CaseSnapshot, int]:
    """Mirror an instant player pin; Phase 2 replaces the precheck with decide_pin."""
    existing = next(
        (
            pin
            for pin in snapshot.pins
            if pin.seat_no == seat.seat_no and pin.card_id == find.card_id
        ),
        None,
    )
    if existing is not None:
        return snapshot, existing.pinned_second
    pinned_second = max(now, find.ready_second)
    _require(
        find.card_id in held_cards((find,), pinned_second), "An unfinished find cannot be pinned."
    )
    pin = Pin(seat.seat_no, find.card_id, pinned_second, pinned_second, seat.player_id)
    return replace(
        snapshot, pins=(*snapshot.pins, pin), write_revision=snapshot.write_revision + 1
    ), pinned_second


def apply_pair(
    data: CaseData, snapshot: CaseSnapshot, deduction: Deduction, actor: SeatState, now: int
) -> CaseSnapshot:
    """Use production pair identity and two-seat eligibility before mirroring the write."""
    actual = deduction_for_pair(data, *deduction.cards)
    _require(
        actual is not None and actual.id == deduction.id,
        "The production pair rule refused a planned step.",
    )
    _require(
        two_seats_pinned(snapshot.pins, *deduction.cards, now),
        "A deduction needs two different seats.",
    )
    formed = Formed(deduction.id, now, actor.player_id, actor.seat_no)
    return replace(
        snapshot, formed=(*snapshot.formed, formed), write_revision=snapshot.write_revision + 1
    )


def _pair_candidate(
    data: CaseData, proof: CardProof, deduction: Deduction, left, right
) -> CardProof:
    snapshot, first = _find_for_card(
        data, proof.snapshot, left, deduction.cards[0], proof.finished_second
    )
    snapshot, second = _find_for_card(
        data, snapshot, right, deduction.cards[1], proof.finished_second
    )
    snapshot, left_ready = apply_pin(snapshot, left, first, proof.finished_second)
    snapshot, right_ready = apply_pin(snapshot, right, second, proof.finished_second)
    finished = max(proof.finished_second, left_ready, right_ready)
    snapshot = apply_pair(data, snapshot, deduction, left, finished)
    return CardProof(
        snapshot, finished, (*proof.pair_seats, (deduction.id, left.seat_no, right.seat_no))
    )


def find_cards_for_crew(data: CaseData, kits: tuple[str, ...]) -> CardProof:
    """Try all ordered seat pairs for each deduction and retain the earliest finish."""
    proof = CardProof(starting_snapshot(data, kits))
    for deduction in data.deductions:
        choices = (
            _pair_candidate(data, proof, deduction, left, right)
            for left, right in permutations(proof.snapshot.seats, 2)
        )
        proof = min(choices, key=lambda choice: (choice.finished_second, choice.pair_seats[-1][1:]))
    return proof
