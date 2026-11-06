"""Search refusal order, kit ownership, gates and delayed card possession."""

from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.case_clock import minutes_until_open
from server.game.case_data import load_case
from server.game.case_routes import decide_route, held_cards
from server.game.case_snapshot import Find, Formed
from server.tests.case_rule_helpers import snapshot


def test_gated_cards_wait_for_their_deduction():
    data = load_case()
    crew = snapshot()
    for card in data.cards:
        if not card.opens_after:
            continue
        route = next(route for route in card.routes if route in data.active_routes)
        refusal = decide_route(data, crew, crew.seats[0], route.id, 0)
        assert refusal.reason == "lead_locked"
        formed = tuple(Formed(value, 0) for value in card.opens_after)
        seat = next((seat for seat in crew.seats if seat.kit == route.kit), crew.seats[0])
        now = 0 if route.open_when == "always" else data.window(route.open_when).from_minute * 60
        assert decide_route(data, replace(crew, formed=formed), seat, route.id, now).accepted


def test_a_kit_route_needs_its_kit():
    data = load_case()
    crew = snapshot()
    route = next(
        route
        for route in data.active_routes
        if route.kind == "kit" and route.kit != crew.seats[0].kit
    )
    assert decide_route(data, crew, crew.seats[0], route.id, 0).reason == "wrong_kit"
    owner = next(seat for seat in crew.seats if seat.kit == route.kit)
    assert decide_route(data, crew, owner, route.id, 0).accepted


def test_a_seat_cannot_start_a_card_it_already_has_even_while_it_is_running():
    data = load_case()
    crew = snapshot()
    route = next(
        route
        for route in data.active_routes
        if route.kind == "kit" and route.kit == crew.seats[0].kit
    )
    find = Find(1, route.card_id, route.id, 0, 100)
    pending = replace(crew, finds=(find,))
    assert decide_route(data, pending, crew.seats[0], route.id, 1).reason == "already_have"
    assert held_cards(pending.finds, 99) == frozenset()
    assert held_cards(pending.finds, 100) == frozenset({route.card_id})


def test_route_refusals_follow_the_fixed_order():
    data = load_case()
    crew = snapshot()
    card = next(card for card in data.cards if card.opens_after)
    route = next(route for route in card.routes if route.kind == "kit")
    pending = replace(crew, finds=(Find(1, card.id, route.id, 0, 100),))
    assert decide_route(data, pending, crew.seats[0], route.id, 0).reason == "lead_locked"
    opened = replace(pending, formed=tuple(Formed(value, 0) for value in card.opens_after))
    assert decide_route(data, opened, crew.seats[0], route.id, 0).reason == "already_have"


def test_a_timer_of_zero_lands_the_card_at_once():
    data = load_case()
    crew = snapshot()
    route = next(
        route for route in data.active_routes if route.kind == "open" and route.timer_minutes == 0
    )
    answer = decide_route(data, crew, crew.seats[0], route.id, 0)
    assert answer.accepted and answer.ready_in == 0
    assert answer.message == route.found_line


def test_a_timed_search_waits_until_the_window_opens():
    data = load_case()
    crew = snapshot()
    route = next(
        route
        for route in data.active_routes
        if route.kind == "timed" and not data.card(route.card_id).opens_after
    )
    window = data.window(route.open_when)
    closed = (window.from_minute - 1) % window.every_minutes
    answer = decide_route(data, crew, crew.seats[0], route.id, closed * 60)
    assert answer.reason == "locked_window"
    assert answer.minutes == minutes_until_open(window, closed)
    assert decide_route(
        data, crew, crew.seats[0], route.id, (closed + answer.minutes) * 60
    ).accepted


def test_routes_of_later_kinds_are_not_offered_in_the_minimum():
    data = load_case()
    crew = snapshot()
    for route in data.routes:
        if route in data.active_routes:
            continue
        with pytest.raises(ApiError) as problem:
            decide_route(data, crew, crew.seats[0], route.id, 0)
        assert problem.value.code == "no_such_route"
