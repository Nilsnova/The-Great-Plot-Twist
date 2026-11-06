"""Bounded test-only playthrough for human crews with production-filled partner seats.

Used by test_case_npc_solvability.py. Only accepted production decisions create records;
the records mirror committed SQL inserts, including future partner finds and pins.
"""

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from itertools import permutations
from uuid import UUID

from server.crews.seats import Seat, partner_seats
from server.game.building import check_build, missing_for
from server.game.building_catalogue import SIGNAL_STATION, SIGNAL_STATION_PLOT, load_buildings
from server.game.case_accusation import decide_accusation
from server.game.case_data import CaseData
from server.game.case_snapshot import CaseSnapshot, Find, Pin, Post, SeatState, Signal
from server.game.finale_geometry import bearing_to, normalize_bearing, schooner_position
from server.game.finale_rules import decide_nightfall, decide_post, decide_signal, parting_locks
from server.game.npc_orders import NpcOrder, decide_fetch, decide_man_light
from server.tests import case_playthrough
from server.tests.case_playthrough import PlannerFailure, apply_pair, apply_pin


def require(condition: bool, message: str) -> None:
    if not condition:
        raise PlannerFailure(message)


@dataclass(frozen=True)
class CrewProof:
    state: CaseSnapshot
    now: int = 0
    orders: tuple[NpcOrder, ...] = ()
    pairs: tuple[tuple[str, int, int], ...] = ()
    station_owner: str | None = None
    station_coins: int = 0
    station_timber: int = 0
    night_started: int | None = None


def starting_crew(data: CaseData, kits: tuple[str, ...]) -> CrewProof:
    require(1 <= len(kits) <= 4, "The proof requires one to four human seats.")
    humans = [
        Seat(number, str(UUID(int=number)), None, kit, f"Test captain {number}")
        for number, kit in enumerate(kits, 1)
    ]
    seats = tuple(
        SeatState(seat.seat_no, seat.kit, seat.player_id, seat.npc_id, seat.name)
        for seat in (*humans, *partner_seats(humans))
    )
    finds = tuple(
        Find(seat.seat_no, route.card_id, route.id, 0, 0)
        for seat in seats
        for route in data.active_routes
        if route.starts_in_journal and route.kit == seat.kit
    )
    return CrewProof(
        CaseSnapshot(
            str(UUID(int=1000)),
            "active",
            "solo" if len(kits) == 1 else "crew",
            datetime(2026, 11, 13, tzinfo=UTC),
            seats,
            finds=finds,
        )
    )


def human(proof: CrewProof) -> SeatState:
    return next(seat for seat in proof.state.seats if seat.player_id is not None)


def fetch_and_pin(data: CaseData, proof: CrewProof, seat: SeatState, card: str) -> CrewProof:
    """A human orders a partner; wait only for a reported busy/window refusal."""
    now = proof.now
    for _ in range(3):
        decision = decide_fetch(data, proof.state, seat, card, now, orders=proof.orders)
        if decision.accepted:
            break
        require(
            decision.reason in ("busy", "locked_window") and decision.minutes > 0,
            "The production fetch rule refused a planned step.",
        )
        now += decision.minutes * 60
    else:
        raise PlannerFailure("The production fetch rule exceeded the bounded retry plan.")
    require(decision.pin_second is not None, "An accepted fetch must include its pin deadline.")
    actor, route = human(proof), decision.route
    if route is not None:
        require(
            route.coins == 0 and route.kind in ("kit", "open", "timed") and not route.players_only,
            "A partner proof must use a free minimum route.",
        )
    order = NpcOrder(
        len(proof.orders) + 1,
        seat.seat_no,
        seat.npc_id,
        "fetch",
        card,
        now,
        decision.ready_second,
        ordered_by=actor.player_id,
        route_id=None if route is None else route.id,
        result_card=card,
        arrive_second=decision.arrive_second,
        found_second=decision.found_second,
        pin_second=decision.pin_second,
    )
    state = proof.state
    if route is not None:
        find = Find(
            seat.seat_no,
            card,
            route.id,
            now,
            decision.found_second,
            actor.player_id,
            True,
            order.order_no,
        )
        state = replace(state, finds=(*state.finds, find))
    pin = Pin(seat.seat_no, card, decision.pin_second, now, actor.player_id, True)
    state = replace(state, pins=(*state.pins, pin), write_revision=state.write_revision + 1)
    return replace(proof, state=state, now=decision.ready_second, orders=(*proof.orders, order))


def acquire_card(data: CaseData, proof: CrewProof, seat: SeatState, card: str) -> CrewProof:
    if any(pin.seat_no == seat.seat_no and pin.card_id == card for pin in proof.state.pins):
        return proof
    if seat.npc_id is not None:
        return fetch_and_pin(data, proof, seat, card)
    state, find = case_playthrough._find_for_card(data, proof.state, seat, card, proof.now)
    state, now = apply_pin(data, state, seat, find, max(proof.now, find.started_second))
    return replace(proof, state=state, now=now)


def pin_all_cards(data: CaseData, kits: tuple[str, ...]) -> CrewProof:
    """At most twelve seat pairs per deduction; prefer actually exercising partners."""
    proof = starting_crew(data, kits)
    for deduction in data.deductions:
        choices = []
        for left, right in permutations(proof.state.seats, 2):
            try:
                candidate = acquire_card(data, proof, left, deduction.cards[0])
                candidate = acquire_card(data, candidate, right, deduction.cards[1])
                state = apply_pair(
                    data, candidate.state, deduction, human(candidate), candidate.now
                )
                candidate = replace(
                    candidate,
                    state=state,
                    pairs=(*candidate.pairs, (deduction.id, left.seat_no, right.seat_no)),
                )
                partners = int(left.npc_id is not None) + int(right.npc_id is not None)
                choices.append((-partners, candidate.now, left.seat_no, right.seat_no, candidate))
            except PlannerFailure:
                continue
        require(bool(choices), "The production card rules admit no bounded two-seat plan.")
        proof = min(choices, key=lambda choice: choice[:4])[-1]
    return proof


def build_station(data: CaseData, proof: CrewProof) -> CrewProof:
    """Require starting coins alone: no market, card reward or world event is needed."""
    catalogue = load_buildings()
    _, cost = check_build(catalogue, SIGNAL_STATION_PLOT, SIGNAL_STATION)
    owner = next(
        (
            seat
            for seat in proof.state.seats
            if seat.player_id is not None
            and not missing_for(cost, data.kit(seat.kit).start_coins, catalogue.starter_timber)
        ),
        None,
    )
    require(owner is not None, "Starting resources cannot fund the one required station.")
    return replace(
        proof,
        state=replace(proof.state, station_ready=True),
        station_owner=owner.player_id,
        station_coins=cost.coins,
        station_timber=cost.timber,
    )


def man_lights(data: CaseData, proof: CrewProof) -> CrewProof:
    require(
        decide_nightfall(data, proof.state, proof.now).accepted,
        "The production nightfall rule refused a planned step.",
    )
    state = replace(proof.state, night_no=1, night_started_second=proof.now)
    proof = replace(proof, state=state, night_started=proof.now)
    public = [light for light in data.active_lights if light.partners_may_man]
    partners = [seat for seat in state.seats if seat.npc_id is not None][: len(public)]
    humans = [seat for seat in state.seats if seat.player_id is not None]
    home = next(light for light in data.active_lights if light.id == SIGNAL_STATION_PLOT)
    duties = [(home, humans[0]), *zip(public[: len(partners)], partners, strict=True)]
    duties += list(zip(public[len(partners) :], humans[1:], strict=False))
    require(len(duties) == data.night.lights_needed, "The proof must staff three distinct lights.")
    for light, seat in duties:
        proof = take_duty(data, proof, seat, light.id)
    return replace(proof, now=max(post.on_post_second for post in proof.state.posts))


def take_duty(data: CaseData, proof: CrewProof, seat: SeatState, light_id: str) -> CrewProof:
    state, now = proof.state, proof.now
    orders = proof.orders
    if seat.npc_id is not None:
        decision = decide_man_light(data, state, seat, light_id, now, orders=orders)
        require(decision.accepted, "The production man_light rule refused a planned step.")
        ready = decision.ready_second
        order = NpcOrder(
            len(orders) + 1,
            seat.seat_no,
            seat.npc_id,
            "man_light",
            light_id,
            now,
            ready,
            ordered_by=human(proof).player_id,
        )
        orders = (*orders, order)
    else:
        decision = decide_post(data, state, seat, light_id, now, station_ready=state.station_ready)
        require(decision.accepted, "The production post rule refused a planned step.")
        ready = now + data.night.climb_minutes * 60
    post = Post(
        len(state.posts) + 1,
        light_id,
        seat.seat_no,
        now,
        ready,
        player_id=seat.player_id,
        npc_id=seat.npc_id,
        order_no=None if seat.npc_id is None else orders[-1].order_no,
    )
    return replace(proof, state=replace(state, posts=(*state.posts, post)), orders=orders)


def solve_case(data: CaseData, kits: tuple[str, ...]) -> CrewProof:
    proof = man_lights(data, build_station(data, pin_all_cards(data, kits)))
    target = schooner_position(proof.state.crew_id, data.night.chart)
    for index, post in enumerate(proof.state.posts):
        now = proof.now + 1
        actor = (
            human(proof) if post.npc_id is not None else proof.state.seat_for_player(post.player_id)
        )
        bearing = normalize_bearing(bearing_to(data.light(post.light_id).chart_xy, target))
        require(
            decide_signal(data, proof.state, actor, post.light_id, bearing, now).accepted,
            "The production signal rule refused a planned step.",
        )
        signal = Signal(
            index + 1,
            proof.state.night_no,
            post.light_id,
            post.seat_no,
            actor.seat_no,
            bearing,
            True,
            now,
            now + data.night.lock_seconds,
            aimed_by=actor.player_id,
        )
        state = replace(proof.state, signals=(*proof.state.signals, signal))
        locks = parting_locks(data, state, now)
        require(
            bool(locks) == (index == data.night.lights_needed - 1),
            "The production parting rule did not require three overlapping duties.",
        )
        if locks:
            state = replace(
                state,
                schooner_found_second=now,
                signals=tuple(replace(item, parted=True) for item in locks),
                parted_players=frozenset(item.aimed_by for item in locks),
            )
        proof = replace(proof, state=state, now=now)
    require(human(proof).player_id is not None, "Only a human may accuse.")
    require(
        decide_accusation(data, proof.state, data.accusation.culprit, proof.now).accepted,
        "The production accusation rule refused a planned step.",
    )
    return proof
