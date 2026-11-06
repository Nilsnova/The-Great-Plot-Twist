"""Accepted partner decisions fix their result and effective seconds at acceptance.

Used by: developers checking fetch-and-pin and man-light orders without a database.
"""

from dataclasses import FrozenInstanceError, replace

import pytest

from server.errors import ApiError
from server.game.case_data import load_case
from server.game.case_routes import held_cards
from server.game.case_snapshot import Find, Order, Pin, Post
from server.game.npc_lines import load_lines, pick_line
from server.game.npc_orders import busy_seconds, choose_route, decide_order, latest_order
from server.tests.case_rule_helpers import PLAYER
from server.tests.npc_rule_helpers import open_crew, partner_card, replace_routes, stored_order


@pytest.fixture
def data():
    return load_case()


def test_fetch_arrives_after_4_minutes_finds_after_10_and_pins_after_15(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 17)
    assert result.accepted and result.reason is None and result.raw_reason is None
    assert result.event == "order_accepted" and result.variant == "fetch" and result.minutes == 10
    assert (result.arrive_second, result.found_second, result.pin_second, result.ready_second) == (
        257,
        617,
        917,
        917,
    )
    assert result.result_card == card.id and data.route(result.route_id).kit == partner.kit
    assert result.price == 0 and crew.orders == () and crew.orders_count == 0


def test_man_light_takes_10_minutes_and_a_witness_pin_takes_5(data):
    crew = open_crew(data)
    partner = crew.seats[3]
    route = next(
        route for route in data.routes if route.starts_in_journal and route.kit == partner.kit
    )
    crew = replace(crew, finds=(Find(partner.seat_no, route.card_id, route.id, 0, 0),))
    pin = decide_order(data, crew, crew.seats[0], partner, "fetch", route.card_id, 9)
    assert pin.accepted and pin.variant == "pin" and pin.minutes == 5
    assert pin.route_id is None and pin.result_card == route.card_id
    assert pin.arrive_second is None and pin.found_second is None
    assert pin.pin_second == pin.ready_second == 309
    light = next(light for light in data.active_lights if light.partners_may_man)
    crew = replace(crew, night_no=1, night_started_second=0)
    man = decide_order(data, crew, crew.seats[0], partner, "man_light", light.id, 9)
    assert man.accepted and man.variant == "man_light" and man.ready_second == 609
    assert man.arrive_second is None and man.found_second is None and man.pin_second is None


def test_an_order_is_still_running_one_second_before_ready_at(data):
    crew = open_crew(data)
    order = stored_order(crew, 900)
    crew = replace(crew, orders=(order,), orders_count=1)
    card = partner_card(data, crew.seats[1])
    result = decide_order(data, crew, crew.seats[0], crew.seats[1], "fetch", card.id, 899)
    assert result.reason == "busy" and result.minutes == 1 and not result.accepted
    assert busy_seconds(crew, 2, 899) == 1
    assert decide_order(data, crew, crew.seats[0], crew.seats[1], "fetch", card.id, 900).accepted


def test_timed_rows_need_no_settle_write_and_repeated_reads_change_nothing(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 0)
    find = Find(partner.seat_no, card.id, result.route_id, 0, result.found_second, PLAYER, True, 1)
    pin = Pin(partner.seat_no, card.id, result.pin_second, 0, PLAYER, True)
    crew = replace(
        crew, finds=(find,), pins=(pin,), orders=(stored_order(crew, result.ready_second),)
    )
    before = crew
    for _ in range(2):
        assert held_cards(crew.finds, 599) == frozenset()
        assert held_cards(crew.finds, 600) == frozenset((card.id,))
        assert busy_seconds(crew, partner.seat_no, 900) == 0
    assert crew == before


def test_the_outcome_is_fixed_when_the_order_is_accepted(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    result = decide_order(data, crew, crew.seats[0], partner, "fetch", card.id, 0)
    order = Order(
        1,
        partner.seat_no,
        partner.npc_id,
        "fetch",
        card.id,
        0,
        result.ready_second,
        PLAYER,
        result.route_id,
        result.result_card,
        result.price,
        result.arrive_second,
        result.found_second,
        result.pin_second,
    )
    later = replace(crew, orders=(order,), orders_count=1, formed=())
    assert latest_order(later, partner.seat_no) == order
    assert busy_seconds(later, partner.seat_no, 10000) == 0
    assert order.route_id == result.route_id and order.result_card == card.id
    with pytest.raises(FrozenInstanceError):
        order.route_id = None


@pytest.mark.parametrize("actor", [None, "partner", "outsider"])
def test_only_a_player_of_the_crew_can_give_an_order_to_a_partner_seat(data, actor):
    crew = open_crew(data)
    acting = (
        None
        if actor is None
        else crew.seats[1]
        if actor == "partner"
        else replace(crew.seats[0], player_id="outside-player")
    )
    with pytest.raises(ApiError):
        decide_order(data, crew, acting, crew.seats[1], "fetch", data.cards[0].id, 0)


def test_an_order_to_a_player_seat_or_a_changed_partner_is_an_http_error(data):
    crew = open_crew(data)
    for target in (crew.seats[0], replace(crew.seats[1], npc_id="replacement")):
        with pytest.raises(ApiError) as caught:
            decide_order(data, crew, crew.seats[0], target, "fetch", data.cards[0].id, 0)
        assert caught.value.status_code == 409
    for status, code in (("forming", "crew_not_started"), ("finished", "crew_finished")):
        with pytest.raises(ApiError) as caught:
            decide_order(
                data,
                replace(crew, status=status),
                crew.seats[0],
                crew.seats[1],
                "fetch",
                data.cards[0].id,
                0,
            )
        assert caught.value.status_code == 409
        assert caught.value.code == code


def test_a_partner_never_uses_share_world_log_reader_paid_or_player_only_routes(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    route = card.routes[0]
    for kind in ("share", "world", "log_reader", "paid"):
        changed = replace_routes(data, card, (replace(route, kind=kind, kit=None),))
        result = decide_order(changed, crew, crew.seats[0], partner, "fetch", card.id, 0)
        assert result.reason == "wrong_kit" and not result.accepted
    changed = replace_routes(data, card, (replace(route, kind="open", players_only=True),))
    assert (
        decide_order(changed, crew, crew.seats[0], partner, "fetch", card.id, 0).reason
        == "wrong_kit"
    )


def test_a_route_tie_goes_to_the_first_in_the_file(data):
    crew = open_crew(data)
    partner = crew.seats[1]
    card = partner_card(data, partner)
    route = next(route for route in card.routes if route.kind == "kit")
    first = replace(route, id=card.id + ".first", kind="open", kit=None, open_when="always")
    second = replace(first, id=card.id + ".second")
    changed = replace_routes(data, card, (first, second))
    assert choose_route(changed, changed.card(card.id), partner, 0).route_id == first.id
    changed = replace_routes(data, card, (second, first))
    assert choose_route(changed, changed.card(card.id), partner, 0).route_id == second.id


def test_a_light_is_reserved_from_the_moment_man_light_is_accepted(data):
    crew = replace(open_crew(data), night_no=1, night_started_second=0)
    light = next(light for light in data.active_lights if light.partners_may_man)
    partner = crew.seats[1]
    result = decide_order(data, crew, crew.seats[0], partner, "man_light", light.id, 0)
    assert result.accepted
    post = Post(light.id, partner.seat_no, 0, result.ready_second, npc_id=partner.npc_id)
    crew = replace(crew, posts=(post,))
    second = decide_order(data, crew, crew.seats[0], crew.seats[3], "man_light", light.id, 1)
    assert (
        not second.accepted and second.raw_reason == "light_taken" and second.reason == "not_ready"
    )


@pytest.mark.parametrize("kind", ["search", "pin", "wait", "pair", "accuse", "nightfall", "signal"])
def test_only_the_two_minimum_order_kinds_are_available(data, kind):
    crew = open_crew(data)
    with pytest.raises(ApiError) as caught:
        decide_order(data, crew, crew.seats[0], crew.seats[1], kind, data.cards[0].id, 0)
    assert caught.value.status_code == 422


def test_allow_paid_is_refused_without_a_wallet_or_order(data):
    crew = open_crew(data)
    with pytest.raises(ApiError) as caught:
        decide_order(
            data, crew, crew.seats[0], crew.seats[1], "fetch", data.cards[0].id, 0, allow_paid=True
        )
    assert caught.value.status_code == 422 and caught.value.code == "paid_errands_off"
    assert crew.orders == () and crew.coins == 0


def test_decisions_select_their_text_only_through_the_canonical_bank(data):
    crew = replace(open_crew(data), night_no=1, night_started_second=0)
    actor, partner = crew.seats[:2]
    card = partner_card(data, partner)
    public = next(light for light in data.active_lights if light.partners_may_man)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    decisions = (
        decide_order(data, crew, actor, partner, "fetch", card.id, 0),
        decide_order(data, crew, actor, partner, "man_light", public.id, 0),
        decide_order(data, crew, actor, partner, "man_light", home.id, 0),
        decide_order(
            data,
            replace(crew, orders=(stored_order(crew, 600),)),
            actor,
            partner,
            "fetch",
            card.id,
            0,
        ),
    )
    bank = load_lines()
    for decision in decisions:
        line = pick_line(
            bank,
            decision.event,
            decision.variant,
            1,
            {"minutes": decision.minutes, "light": public.name, "price": decision.price},
        )
        assert isinstance(line, str) and bool(line) and line.isascii()
