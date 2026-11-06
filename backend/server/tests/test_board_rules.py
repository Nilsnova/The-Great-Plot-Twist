"""Board decisions use landed cards, two seats and the documented refusal order."""

from dataclasses import replace

import pytest

from server.game.board_rules import decide_pair, decide_pin
from server.game.case_data import load_case
from server.game.case_snapshot import Find, Formed, Pin
from server.tests.case_rule_helpers import PLAYER, snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


def test_pin_needs_a_landed_find_and_rejects_an_existing_pin(data):
    state = snapshot()
    seat = state.seat_for_player(PLAYER)
    find = Find(1, "C1", "C1.test", 0, 10)
    state = replace(state, finds=(find,))
    assert decide_pin(data, state, seat, "C1", 9).reason == "card_not_held"
    assert decide_pin(data, state, seat, "C1", 10).accepted
    state = replace(state, pins=(Pin(1, "C1", 10, 10, PLAYER),))
    assert decide_pin(data, state, seat, "C1", 10).reason == "already_pinned"


def test_pair_checks_cooldown_then_pins_then_distinct_seats(data):
    state = replace(snapshot(), pair_wait_until=30)
    seat = state.seat_for_player(PLAYER)
    a, b = data.deductions[0].cards
    assert decide_pair(data, state, seat, a, b, 29).reason == "pair_cooldown"
    assert decide_pair(data, state, seat, a, b, 30).reason == "not_pinned"
    pins = (Pin(1, a, 0, 0, PLAYER), Pin(1, b, 0, 0, PLAYER))
    state = replace(state, pins=pins)
    assert decide_pair(data, state, seat, a, b, 30).reason == "different_seats_required"
    state = replace(state, pins=(pins[0], replace(pins[1], seat_no=2, pinned_second=31)))
    assert decide_pair(data, state, seat, a, b, 30).reason == "not_pinned"
    assert decide_pair(data, state, seat, a, b, 31).target == data.deductions[0].id


def test_wrong_pair_changes_no_snapshot_and_formed_pairs_are_refused(data):
    first, second = data.deductions[:2]
    a, b = first.cards[0], second.cards[0]
    state = replace(snapshot(), pins=(Pin(1, a, 0, 0), Pin(2, b, 0, 0)))
    seat = state.seat_for_player(PLAYER)
    decision = decide_pair(data, state, seat, a, b, 10)
    assert (decision.reason, decision.seconds) == ("wrong_pair", 30)
    assert state.pair_wait_until == 0
    a, b = first.cards
    state = replace(state, pins=(Pin(1, a, 0, 0), Pin(2, b, 0, 0)), formed=(Formed(first.id, 0),))
    assert decide_pair(data, state, seat, a, b, 10).reason == "already_deduced"
