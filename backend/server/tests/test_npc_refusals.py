"""Partner refusals follow a fixed order and expose only the four minimum reasons.

Used by: developers checking route windows and partner eligibility without server writes.
"""

from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.case_clock import minutes_until_open
from server.game.case_data import load_case
from server.game.case_snapshot import Pin, Post
from server.game.npc_orders import ARRIVE_AFTER_MINUTES, decide_order
from server.tests.case_rule_helpers import PLAYER
from server.tests.npc_rule_helpers import open_crew, partner_card, replace_routes, stored_order


@pytest.fixture
def data():
    return load_case()


def timed_case(data, crew):
    partner = crew.seats[1]
    card = next(card for card in data.cards if any(route.kind == "timed" for route in card.routes))
    route = next(route for route in card.routes if route.kind == "timed")
    return replace_routes(data, card, (route,)), card, route, partner


def test_wrong_kit_is_refused_with_its_reason(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    route = next(route for route in card.routes if route.kind == "kit")
    changed = replace_routes(data, card, (replace(route, kit=crew.seats[0].kit),))
    result = decide_order(changed, crew, crew.seats[0], partner, "fetch", card.id, 0)
    assert result.reason == result.raw_reason == result.variant == "wrong_kit"
    assert result.event == "cannot_do_it"


def test_a_shut_place_gives_the_exact_wait_until_arrival_falls_inside_its_window(data):
    crew = open_crew(data)
    data, card, route, partner = timed_case(data, crew)
    window = data.window(route.open_when)
    for minute in range(window.every_minutes):
        result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, minute * 60)
        wait = minutes_until_open(window, minute, ARRIVE_AFTER_MINUTES)
        if wait:
            assert result.reason == "locked_window" and result.minutes == wait
        else:
            assert result.accepted and result.route_id == route.id


def test_ordering_again_after_the_wait_is_accepted_and_one_minute_sooner_is_refused(data):
    crew = open_crew(data)
    data, card, route, partner = timed_case(data, crew)
    window = data.window(route.open_when)
    minute = (window.from_minute - ARRIVE_AFTER_MINUTES - 2) % window.every_minutes
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, minute * 60 + 59)
    assert result.reason == "locked_window" and result.minutes == 2
    assert not decide_order(
        data, crew, crew.seats[0], partner, "fetch", card.id, (minute + 1) * 60 + 59
    ).accepted
    assert decide_order(
        data, crew, crew.seats[0], partner, "fetch", card.id, (minute + 2) * 60 + 59
    ).accepted


def test_fetch_needs_a_lead_before_it_checks_an_existing_pin(data):
    crew = open_crew(data)
    card = next(card for card in data.cards if card.opens_after)
    partner = crew.seats[1]
    crew = replace(crew, formed=(), pins=(Pin(partner.seat_no, card.id, 0, 0, PLAYER, True),))
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 0)
    assert result.reason == result.variant == "not_ready" and result.raw_reason == "no_lead"


def test_busy_precedes_lead_kit_window_and_light_checks(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    crew = replace(crew, formed=(), orders=(stored_order(crew, 121),))
    card = next(card for card in data.cards if card.opens_after)
    fetch = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 0)
    assert fetch.reason == "busy" and fetch.minutes == 3
    home = next(light for light in data.active_lights if not light.partners_may_man)
    assert (
        decide_order(data, crew, crew.seats[0], partner, "man_light", home.id, 0).reason == "busy"
    )


def test_man_light_is_refused_before_nightfall_and_for_home_lights(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    public = next(light for light in data.active_lights if light.partners_may_man)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    before = decide_order(data, crew, crew.seats[0], partner, "man_light", public.id, 0)
    assert before.reason == before.variant == "not_ready" and before.raw_reason == "not_nightfall"
    home_result = decide_order(data, crew, crew.seats[0], partner, "man_light", home.id, 0)
    assert home_result.reason == "not_ready" and home_result.raw_reason == "light_not_for_partners"
    assert home_result.variant == "wrong_kit"


def test_existing_pins_and_light_duties_answer_not_ready_in_the_minimum(data):
    crew = replace(open_crew(data), night_no=1, night_started_second=0)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    crew = replace(crew, pins=(Pin(partner.seat_no, card.id, 900, 0, PLAYER, True),))
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 0)
    assert result.reason == result.variant == "not_ready" and result.raw_reason == "already_have"
    light = next(light for light in data.active_lights if light.partners_may_man)
    crew = replace(crew, posts=(Post(light.id, partner.seat_no, 0, 0, npc_id=partner.npc_id),))
    result = decide_order(data, crew, crew.seats[0], partner, "man_light", light.id, 0)
    assert result.reason == "not_ready" and result.raw_reason == "already_have"


def test_a_stale_taken_over_post_does_not_reserve_a_light(data):
    crew = replace(open_crew(data), night_no=1, night_started_second=0)
    partner = crew.seats[1]
    light = next(light for light in data.active_lights if light.partners_may_man)
    stale = Post(light.id, 3, 0, 0, npc_id="old-partner")
    crew = replace(crew, posts=(stale,))
    assert decide_order(data, crew, crew.seats[0], partner, "man_light", light.id, 0).accepted


def test_a_refusal_creates_no_order_and_costs_no_minutes_or_coins(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    home = next(light for light in data.active_lights if not light.partners_may_man)
    before = crew
    for _ in range(2):
        result = decide_order(data, crew, crew.seats[0], partner, "man_light", home.id, 0)
        assert not result.accepted and result.ready_second is None and result.price == 0
    assert crew == before and crew.orders == () and crew.orders_count == 0


@pytest.mark.parametrize("kind,code", [("fetch", "no_such_card"), ("man_light", "no_such_light")])
def test_unknown_targets_are_standard_errors(data, kind, code):
    crew = open_crew(data)
    with pytest.raises(ApiError) as caught:
        decide_order(data, crew, crew.seats[0], crew.seats[1], kind, "missing", 0)
    assert caught.value.status_code == 404 and caught.value.code == code
