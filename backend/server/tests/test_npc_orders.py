"""Minimum partner orders choose free routes and preserve acceptance-time deadlines."""

from dataclasses import replace
from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS, NPC_KIT_ORDER, Seat, partner_seats
from server.errors import ApiError
from server.game.case_data import load_case
from server.game.case_snapshot import Find, Formed, Pin, Post
from server.game.npc_orders import (
    NpcOrder,
    choose_route,
    decide_fetch,
    decide_man_light,
    minimum_reason,
    order_stage,
)
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot


def generic_card(*, kinds=("open",), opens_after=()):
    source = load_case()
    routes = tuple(
        replace(
            source.cards[0].routes[0],
            id=f"C1.route_{index}",
            card_id="C1",
            kind=kind,
            kit="informant" if kind == "kit" else None,
            players_only=kind in ("share", "world", "log_reader"),
            coins=100 if kind == "paid" else 0,
            open_when="always",
        )
        for index, kind in enumerate(kinds)
    )
    card = replace(source.cards[0], id="C1", routes=routes, opens_after=opens_after)
    return replace(source, cards=(card,)), card


def partner():
    return snapshot().seats[1]


def running_order(*, ready=900):
    return NpcOrder(1, 2, "deckhand", "fetch", "C1", 0, ready)


def test_fetch_arrives_after_4_minutes_finds_after_10_and_pins_after_15():
    data, _ = generic_card()
    decision = decide_fetch(data, snapshot(), partner(), "C1", 17)
    assert decision.accepted and decision.line_variant == "go"
    assert (decision.arrive_second, decision.found_second) == (257, 617)
    assert (decision.pin_second, decision.ready_second) == (917, 917)
    assert decision.route.coins == 0


def test_a_held_card_needs_only_five_minutes_to_pin_without_choosing_a_route():
    data, _ = generic_card(kinds=("share",))
    state = replace(snapshot(), finds=(Find(2, "C1", "old.route", 0, 0),))
    decision = decide_fetch(data, state, partner(), "C1", 33)
    assert decision.accepted and decision.line_variant == "pin"
    assert decision.route is None and decision.arrive_second is None
    assert decision.found_second is None
    assert decision.pin_second == decision.ready_second == 333


def test_future_finds_are_not_treated_as_a_card_already_carried():
    data, _ = generic_card()
    state = replace(snapshot(), finds=(Find(2, "C1", "old.route", 0, 100),))
    decision = decide_fetch(data, state, partner(), "C1", 99)
    assert not decision.accepted and decision.reason == "not_ready"
    assert decide_fetch(data, state, partner(), "C1", 100).line_variant == "pin"


def test_busy_has_precedence_and_the_partner_is_free_at_the_exact_ready_second():
    data, _ = generic_card(opens_after=("D1",))
    orders = (running_order(),)
    for now, minutes in ((0, 15), (840, 1), (899, 1)):
        decision = decide_fetch(data, snapshot(), partner(), "C1", now, orders=orders)
        assert not decision.accepted and decision.reason == "busy" and decision.minutes == minutes
    decision = decide_fetch(data, snapshot(), partner(), "C1", 900, orders=orders)
    assert decision.raw_reason == "no_lead" and decision.reason == "not_ready"


def test_fetch_needs_a_lead_before_checking_for_an_existing_pin():
    data, _ = generic_card(opens_after=("D1",))
    state = replace(snapshot(), pins=(Pin(2, "C1", 0, 0),))
    assert decide_fetch(data, state, partner(), "C1", 0).raw_reason == "no_lead"
    state = replace(state, formed=(Formed("D1", 0),))
    decision = decide_fetch(data, state, partner(), "C1", 0)
    assert decision.raw_reason == "already_have" and decision.reason == "not_ready"


@pytest.mark.parametrize("kind", ("share", "world", "log_reader", "paid"))
def test_a_partner_never_uses_paid_share_world_or_log_reader_routes(kind):
    data, card = generic_card(kinds=(kind,))
    assert choose_route(data, card, partner(), 0).reason == "wrong_kit"


def test_a_partner_cannot_use_a_player_only_route_or_another_kits_route():
    data, card = generic_card(kinds=("kit", "open"))
    card = replace(card, routes=(card.routes[0], replace(card.routes[1], players_only=True)))
    assert choose_route(data, card, partner(), 0).reason == "wrong_kit"
    assert choose_route(data, card, replace(partner(), kit="informant"), 0).accepted


def timed_data():
    data, card = generic_card(kinds=("timed",))
    window = replace(
        data.windows[0], id="sample_window", every_minutes=20, from_minute=12, open_minutes=8
    )
    card = replace(card, routes=(replace(card.routes[0], open_when=window.id),))
    return replace(data, cards=(card,), windows=(window,)), card


@pytest.mark.parametrize("now,wait", ((0, 8), (180, 5), (479, 1), (480, 0), (959, 0), (960, 12)))
def test_timed_routes_check_arrival_and_give_the_smallest_whole_minute_wait(now, wait):
    data, card = timed_data()
    choice = choose_route(data, card, partner(), now)
    assert choice.minutes == wait and choice.accepted is (wait == 0)
    if wait:
        assert choice.reason == "locked_window"
        assert choose_route(data, card, partner(), now + wait * 60).accepted
        assert not choose_route(data, card, partner(), now + (wait - 1) * 60).accepted


def test_an_open_free_route_beats_a_closed_window_and_file_order_breaks_ties():
    data, card = timed_data()
    first = replace(card.routes[0], id="C1.first", kind="open", open_when="always")
    second = replace(first, id="C1.second")
    card = replace(card, routes=(card.routes[0], first, second))
    assert choose_route(data, card, partner(), 0).route.id == first.id
    assert choose_route(data, card, partner(), 480).route.id == card.routes[0].id


def test_allow_paid_is_rejected_even_when_the_order_would_otherwise_be_busy():
    data, _ = generic_card()
    with pytest.raises(ApiError) as error:
        decide_fetch(
            data, snapshot(), partner(), "C1", 0, orders=(running_order(),), allow_paid=True
        )
    assert error.value.status_code == 422 and error.value.code == "paid_errands_off"


def test_unknown_targets_and_a_player_seat_are_standard_errors():
    data, _ = generic_card()
    cases = (("missing", partner(), "no_such_card"), ("C1", snapshot().seats[0], "not_a_partner"))
    for target, seat, code in cases:
        with pytest.raises(ApiError) as error:
            decide_fetch(data, snapshot(), seat, target, 0)
        assert error.value.code == code


def test_man_light_obeys_busy_kit_night_then_post_checks_and_takes_ten_minutes():
    data = load_case()
    state = replace(snapshot(), night_no=1, night_started_second=0)
    public = next(light for light in data.active_lights if light.partners_may_man)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    decision = decide_man_light(data, state, partner(), public.id, 59)
    assert decision.accepted and decision.ready_second == 659
    assert decision.line_variant == "man_light"
    assert (
        decide_man_light(data, state, partner(), home.id, 0).raw_reason == "light_not_for_partners"
    )
    assert decide_man_light(data, snapshot(), partner(), public.id, 0).raw_reason == "not_nightfall"
    assert decide_man_light(data, state, partner(), public.id, 1200).reason == "not_ready"
    assert (
        decide_man_light(data, state, partner(), home.id, 0, orders=(running_order(),)).reason
        == "busy"
    )
    claimed = Post(1, public.id, 3, 0, 999, player_id=FRIEND)
    assert (
        decide_man_light(data, replace(state, posts=(claimed,)), partner(), public.id, 0).raw_reason
        == "light_taken"
    )
    own = replace(claimed, seat_no=2, player_id=None, npc_id="deckhand")
    assert (
        decide_man_light(data, replace(state, posts=(own,)), partner(), public.id, 0).raw_reason
        == "already_have"
    )
    old = replace(claimed, ended_second=0)
    assert decide_man_light(data, replace(state, posts=(old,)), partner(), public.id, 0).accepted


def test_order_stage_uses_fixed_deadlines_and_does_not_settle_or_mutate():
    order = replace(running_order(), arrive_second=240, found_second=600, pin_second=900)
    stages = [order_stage(order, now) for now in (0, 239, 240, 599, 600, 899, 900, 100000)]
    assert stages == [
        "order_accepted",
        "order_accepted",
        "arrived",
        "arrived",
        "found_card",
        "found_card",
        "pinned_card",
        "pinned_card",
    ]
    assert order_stage(order, 100000) == order_stage(order, 100000)
    assert order.ready_second == 900
    light_order = replace(
        order, kind="man_light", arrive_second=None, found_second=None, pin_second=None
    )
    assert order_stage(light_order, 900) == "manning_light"


def test_minimum_refusals_keep_four_groups_and_hide_other_raw_reasons():
    for reason in ("busy", "wrong_kit", "locked_window", "not_ready"):
        assert minimum_reason(reason) == reason
    for reason in ("no_lead", "already_have", "not_nightfall", "light_taken", "no_coins"):
        assert minimum_reason(reason) == "not_ready"
    assert minimum_reason("light_not_for_partners") == "wrong_kit"


def test_all_69_player_kit_mixes_fill_first_missing_kits_in_lowest_empty_seats():
    checked = 0
    for count in range(1, 5):
        for kits in combinations_with_replacement(KITS, count):
            humans = [Seat(index + 1, PLAYER, None, kit, None) for index, kit in enumerate(kits)]
            partners = partner_seats(humans)
            expected = [kit for kit in NPC_KIT_ORDER if kit not in kits][: 4 - count]
            assert [seat.kit for seat in partners] == expected
            assert [seat.seat_no for seat in partners] == list(range(count + 1, 5))
            checked += 1
    assert checked == 69
