"""Deterministic test-only planner built from production case and NPC rules.

Free routes and explicit partner orders produce two-seat deductions and a night ending in a solve.
The same decisions cover all 69 starting crews without autonomous partner actions.
"""

import asyncio
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from itertools import permutations
from uuid import UUID

from server.crews.seats import Seat, partner_seats
from server.game.board_rules import decide_pair, decide_pin
from server.game.building import level_one_cost
from server.game.building_catalogue import load_buildings
from server.game.case_accusation import decide_accusation
from server.game.case_clock import minute_of, minutes_until_open
from server.game.case_data import CaseData, Deduction, Light, Route
from server.game.case_rewards import solve_shares
from server.game.case_routes import decide_route
from server.game.case_snapshot import (
    Accusation,
    CaseSnapshot,
    Find,
    Formed,
    Order,
    Pin,
    Post,
    SeatState,
    Signal,
    Solver,
)
from server.game.finale_geometry import bearing_to, schooner_position
from server.game.finale_rules import (
    decide_nightfall,
    decide_post,
    decide_signal,
    parting_locks,
)
from server.game.npc_orders import busy_seconds, choose_route
from server.tests.npc_apply import NpcApplyFailure, apply_order, leave_post


class PlannerFailure(ValueError):
    """A planned step was refused. Diagnostics name the rule, never protected prose."""


@dataclass(frozen=True)
class CardProof:
    snapshot: CaseSnapshot
    finished_second: int = 0
    pair_seats: tuple[tuple[str, int, int], ...] = ()
    station_coins: int = 0
    station_timber: int = 0

    @property
    def coins_spent(self) -> int:
        return self.station_coins + sum(find.coins_paid for find in self.snapshot.finds)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise PlannerFailure(message)


def starting_snapshot(data: CaseData, kits: tuple[str, ...]) -> CaseSnapshot:
    """Mirror case_open's initial journal finds without counting them as extra actions."""
    _require(1 <= len(kits) <= 4, "This proof requires one to four player seats.")
    players = [
        Seat(number, str(UUID(int=number)), None, kit, f"Test captain {number}")
        for number, kit in enumerate(kits, start=1)
    ]
    seats = tuple(
        SeatState(seat.seat_no, seat.kit, seat.player_id, seat.npc_id, seat.name)
        for seat in (*players, *partner_seats(players))
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
    _require(seat.player_id is not None, "A search needs a player actor.")
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
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, find: Find, now: int
) -> tuple[CaseSnapshot, int]:
    """Mirror a landed player pin after the production decision accepts it."""
    _require(seat.player_id is not None, "A direct pin needs a player actor.")
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
    decision = decide_pin(data, snapshot, seat, find.card_id, pinned_second)
    _require(decision.accepted, "The production pin rule refused a planned step.")
    pin = Pin(seat.seat_no, find.card_id, pinned_second, pinned_second, seat.player_id)
    return replace(
        snapshot, pins=(*snapshot.pins, pin), write_revision=snapshot.write_revision + 1
    ), pinned_second


def apply_pair(
    data: CaseData, snapshot: CaseSnapshot, deduction: Deduction, actor: SeatState, now: int
) -> CaseSnapshot:
    """Mirror a formed deduction only after the production pair decision accepts it."""
    _require(actor.player_id is not None, "A pair needs a player actor.")
    decision = decide_pair(data, snapshot, *deduction.cards, now)
    _require(
        decision.accepted and decision.deduction_id == deduction.id,
        "The production pair rule refused a planned step.",
    )
    formed = Formed(deduction.id, now, actor.player_id, actor.seat_no)
    return replace(
        snapshot, formed=(*snapshot.formed, formed), write_revision=snapshot.write_revision + 1
    )


def _pair_candidate(
    data: CaseData, proof: CardProof, deduction: Deduction, left: SeatState, right: SeatState
) -> CardProof:
    snapshot, left_ready = _card_pin(
        data, proof.snapshot, left, deduction.cards[0], proof.finished_second
    )
    snapshot, right_ready = _card_pin(
        data, snapshot, right, deduction.cards[1], proof.finished_second
    )
    finished = max(proof.finished_second, left_ready, right_ready)
    actor = next(seat for seat in snapshot.seats if seat.player_id is not None)
    snapshot = apply_pair(data, snapshot, deduction, actor, finished)
    return CardProof(
        snapshot, finished, (*proof.pair_seats, (deduction.id, left.seat_no, right.seat_no))
    )


def _card_pin(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, card_id: str, now: int
) -> tuple[CaseSnapshot, int]:
    if seat.player_id is not None:
        snapshot, find = _find_for_card(data, snapshot, seat, card_id, now)
        return apply_pin(data, snapshot, seat, find, now)
    existing = next(
        (pin for pin in snapshot.pins if pin.card_id == card_id and pin.seat_no == seat.seat_no),
        None,
    )
    if existing is not None:
        return snapshot, existing.pinned_second
    now += busy_seconds(snapshot, seat.seat_no, now)
    held = any(find.card_id == card_id for find in snapshot.finds_for_seat(seat.seat_no))
    if not held:
        choice = choose_route(data, data.card(card_id), seat, now)
        _require(choice.reason != "wrong_kit", "A partner has no free minimum route.")
        now += choice.minutes * 60
    snapshot, order = apply_partner_order(data, snapshot, seat, "fetch", card_id, now)
    return snapshot, order.ready_second


def apply_partner_order(
    data: CaseData, snapshot: CaseSnapshot, partner: SeatState, kind: str, target: str, now: int
) -> tuple[CaseSnapshot, Order]:
    actor = next(seat for seat in snapshot.seats if seat.player_id is not None)
    try:
        return apply_order(data, snapshot, actor, partner, kind, target, now)
    except NpcApplyFailure as error:
        raise PlannerFailure(str(error)) from None


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


class PlannerStations:
    """The station port fake owns one affordable station and never calls a database."""

    def __init__(self, owner: str, timber: int):
        self.owner = owner
        self.starter_timber = timber

    async def players_with_signal_station(self, admin, player_ids) -> frozenset[str]:
        return frozenset({self.owner}) if self.owner in player_ids else frozenset()

    async def timber(self, admin, player_id: str) -> int | None:
        return self.starter_timber if player_id == self.owner else None


def _build_station(data: CaseData, proof: CardProof) -> CardProof:
    catalogue = load_buildings()
    cost = level_one_cost(catalogue)
    owner = proof.snapshot.seats[0]
    stations = PlannerStations(owner.player_id, catalogue.starter_timber)
    timber = asyncio.run(stations.timber(None, owner.player_id))
    _require(
        cost.coins <= data.kit(owner.kit).start_coins and cost.timber <= timber,
        "The L2 station price exceeds the starting materials.",
    )
    players = [seat.player_id for seat in proof.snapshot.seats if seat.player_id is not None]
    built = asyncio.run(stations.players_with_signal_station(None, players))
    snapshot = replace(
        proof.snapshot,
        station_players=built,
        coins=data.kit(owner.kit).start_coins - cost.coins,
        timber=timber - cost.timber,
    )
    return replace(proof, snapshot=snapshot, station_coins=cost.coins, station_timber=cost.timber)


def apply_nightfall(data: CaseData, snapshot: CaseSnapshot, now: int) -> CaseSnapshot:
    _require(snapshot.seats[0].player_id is not None, "Nightfall needs a player actor.")
    decision = decide_nightfall(data, snapshot, now)
    _require(decision.accepted, "The production nightfall rule refused a planned step.")
    return replace(
        snapshot,
        night_no=snapshot.night_no + 1,
        night_started_second=now,
        night_called_by=snapshot.seats[0].player_id,
        write_revision=snapshot.write_revision + 1,
    )


def apply_post(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, light_id: str, now: int
) -> CaseSnapshot:
    _require(seat.player_id is not None, "A direct post needs a player actor.")
    decision = decide_post(data, snapshot, seat, light_id, now)
    _require(decision.accepted, "The production post rule refused a planned step.")
    old = next(
        (
            post
            for post in snapshot.posts
            if post.light_id == light_id and post.ended_second is None
        ),
        None,
    )
    if old is not None:
        snapshot = leave_post(snapshot, old.seat_no, now)
    snapshot = leave_post(snapshot, seat.seat_no, now)
    post = Post(
        light_id,
        seat.seat_no,
        now,
        now + decision.seconds,
        player_id=seat.player_id,
        id=max((post.id for post in snapshot.posts), default=0) + 1,
    )
    return replace(
        snapshot, posts=(*snapshot.posts, post), write_revision=snapshot.write_revision + 1
    )


def apply_signal(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, light_id: str, bearing: float, now: int
) -> CaseSnapshot:
    _require(seat.player_id is not None, "A signal needs a player actor.")
    decision = decide_signal(data, snapshot, seat, light_id, bearing, now)
    _require(decision.accepted, "The production signal rule refused a planned step.")
    post = next(
        post for post in snapshot.posts if post.light_id == light_id and post.ended_second is None
    )
    signals = tuple(
        replace(signal, ended_second=now)
        if signal.light_id == light_id
        and signal.night_no == snapshot.night_no
        and signal.on_target
        and signal.ended_second is None
        and signal.holds_until_second is not None
        and signal.holds_until_second > now
        else signal
        for signal in snapshot.signals
    )
    signal = Signal(
        light_id,
        post.seat_no,
        seat.player_id,
        seat.seat_no,
        decision.bearing,
        True,
        now,
        now + decision.seconds,
        night_no=snapshot.night_no,
        id=max((signal.id for signal in signals), default=0) + 1,
    )
    snapshot = replace(
        snapshot, signals=(*signals, signal), write_revision=snapshot.write_revision + 1
    )
    locks = parting_locks(data, snapshot, now)
    if locks:
        snapshot = replace(
            snapshot,
            schooner_found_second=now,
            signals=tuple(
                replace(row, parted=True) if row in locks else row for row in snapshot.signals
            ),
            parted_players=frozenset(row.aimed_by for row in locks if row.aimed_by is not None),
        )
    return snapshot


def apply_accusation(
    data: CaseData, snapshot: CaseSnapshot, actor: SeatState, now: int
) -> CaseSnapshot:
    _require(actor.player_id is not None, "An accusation needs a player actor.")
    decision = decide_accusation(data, snapshot, data.accusation.culprit, now)
    _require(decision.accepted, "The production accusation rule refused a planned step.")
    accusation = Accusation(data.accusation.culprit, True, now, actor.player_id, actor.seat_no)
    snapshot = replace(snapshot, accusations=(*snapshot.accusations, accusation))
    solvers = tuple(
        Solver(row.player_id, row.seat_no, row.kit, row.contributor, row.share, row.share, now)
        for row in solve_shares(data, snapshot)
    )
    return replace(
        snapshot,
        status="finished",
        solved_second=now,
        solved_by=actor.player_id,
        solvers=solvers,
        write_revision=snapshot.write_revision + 1,
    )


def solve_for_crew(data: CaseData, kits: tuple[str, ...]) -> CardProof:
    """Use all production decisions through three exact locks and an accepted accusation."""
    proof = _build_station(data, find_cards_for_crew(data, kits))
    now = proof.finished_second
    snapshot = apply_nightfall(data, proof.snapshot, now)
    lights = tuple(light for light in data.night.lights if light.tier == "must")
    _require(len(lights) == data.night.lights_needed, "The minimum needs its three lights.")
    snapshot = _man_lights(data, snapshot, lights, now)
    now = max(post.on_post_second for post in snapshot.posts)
    target = schooner_position(snapshot.crew_id, data.night.chart)
    for offset, light in enumerate(lights):
        post = next(
            post
            for post in snapshot.posts
            if post.light_id == light.id and post.ended_second is None
        )
        seat = snapshot.seat_for_player(post.player_id) if post.player_id else snapshot.seats[0]
        snapshot = apply_signal(
            data, snapshot, seat, light.id, bearing_to(light.chart_xy, target), now + offset * 10
        )
    now = snapshot.signals[-1].case_second
    snapshot = apply_accusation(data, snapshot, snapshot.seats[0], now)
    return replace(proof, snapshot=snapshot, finished_second=now)


def _man_lights(
    data: CaseData, snapshot: CaseSnapshot, lights: tuple[Light, ...], now: int
) -> CaseSnapshot:
    players = [seat for seat in snapshot.seats if seat.player_id is not None]
    partners = [seat for seat in snapshot.seats if seat.npc_id is not None]
    public_holders = iter((*partners, *players[1:]))
    for light in lights:
        seat = next(public_holders) if light.partners_may_man else players[0]
        if seat.player_id is not None:
            snapshot = apply_post(data, snapshot, seat, light.id, now)
        else:
            snapshot, _ = apply_partner_order(data, snapshot, seat, "man_light", light.id, now)
    return snapshot
