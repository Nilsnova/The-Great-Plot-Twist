"""Board rules preserve seat credit and hide a pair until both seats contributed.

Used by: developers checking pure decisions without a database or protected story output.
"""

from dataclasses import replace

import pytest

from server.game.board_rules import decide_pair, decide_pin
from server.game.case_data import load_case
from server.game.case_rewards import deduction_rewarded_players, reward_ref
from server.game.case_snapshot import Find, Formed, Pin
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot


@pytest.fixture
def data():
    return load_case()


def pair_snapshot(data, same_seat=False):
    cards = data.deductions[0].cards
    return replace(
        snapshot(),
        pins=(Pin(1, cards[0], 0, 0, PLAYER), Pin(1 if same_seat else 3, cards[1], 0, 0, FRIEND)),
    )


def test_one_seat_can_never_form_a_deduction(data):
    crew = pair_snapshot(data, same_seat=True)
    before = crew
    result = decide_pair(data, crew, *data.deductions[0].cards, 0)
    assert not result.accepted and result.reason == "different_seats_required"
    assert crew == before and crew.formed == ()


def test_a_pair_needs_both_cards_pinned(data):
    crew = pair_snapshot(data)
    crew = replace(crew, pins=crew.pins[:1])
    assert decide_pair(data, crew, *data.deductions[0].cards, 0).reason == "not_pinned"


def test_a_pending_partner_pin_does_not_count_for_a_pair(data):
    crew = pair_snapshot(data)
    crew = replace(
        crew, pins=(crew.pins[0], replace(crew.pins[1], pinned_second=10, by_partner=True))
    )
    assert decide_pair(data, crew, *data.deductions[0].cards, 9).reason == "not_pinned"
    assert decide_pair(data, crew, *data.deductions[0].cards, 10).accepted


def test_wrong_pair_starts_a_30_second_crew_wait_and_changes_nothing_else(data):
    first, second = (item.cards[0] for item in data.deductions[:2])
    crew = replace(snapshot(), pins=(Pin(1, first, 0, 0, PLAYER), Pin(3, second, 0, 0, FRIEND)))
    result = decide_pair(data, crew, first, second, 20)
    assert not result.accepted and result.reason == "wrong_pair"
    assert result.seconds == data.board.wrong_pair_wait_seconds == 30
    assert result.deduction_id is None and crew.pair_wait_until == 0 and crew.formed == ()


def test_pair_checks_run_in_the_fixed_order(data):
    cards = data.deductions[0].cards
    crew = replace(snapshot(), pair_wait_until=100)
    result = decide_pair(data, crew, *cards, 90)
    assert result.reason == "pair_cooldown" and result.seconds == 10
    assert decide_pair(data, crew, *cards, 100).reason == "not_pinned"
    crew = pair_snapshot(data, same_seat=True)
    crew = replace(crew, formed=(Formed(data.deductions[0].id, 0),))
    assert decide_pair(data, crew, *cards, 100).reason == "different_seats_required"
    crew = replace(crew, pins=(crew.pins[0], replace(crew.pins[1], seat_no=3)))
    assert decide_pair(data, crew, *cards, 100).reason == "already_deduced"


def test_pinning_needs_the_card_in_the_seat_journal(data):
    crew = snapshot()
    card = data.cards[0]
    seat = crew.seats[0]
    assert decide_pin(data, crew, seat, card.id, 0).reason == "card_not_held"
    find = Find(seat.seat_no, card.id, card.routes[0].id, 0, 10)
    crew = replace(crew, finds=(find,))
    assert decide_pin(data, crew, seat, card.id, 9).reason == "card_not_held"
    assert decide_pin(data, crew, seat, card.id, 10).accepted
    assert decide_pin(data, crew, crew.seats[2], card.id, 10).reason == "card_not_held"


def test_pinning_twice_is_refused(data):
    card = data.cards[0]
    crew = replace(
        snapshot(),
        finds=(Find(1, card.id, card.routes[0].id, 0, 0),),
        pins=(Pin(1, card.id, 0, 0, PLAYER),),
    )
    assert decide_pin(data, crew, crew.seats[0], card.id, 0).reason == "already_pinned"
    crew = replace(crew, finds=())
    assert decide_pin(data, crew, crew.seats[0], card.id, 0).reason == "card_not_held"


def test_deduction_pays_200_to_every_player_part_of_it(data):
    crew = pair_snapshot(data)
    deduction = data.deductions[0]
    pending = Pin(4, deduction.cards[0], 30, 10, PLAYER, True)
    later = Pin(2, deduction.cards[1], 40, 21, "late-player", True)
    crew = replace(crew, pins=(*crew.pins, pending, later))
    decision = decide_pair(data, crew, *deduction.cards, 20)
    assert decision.accepted and decision.deduction_id == deduction.id
    assert deduction_rewarded_players(crew, deduction.cards, 20) == tuple(sorted((PLAYER, FRIEND)))
    assert data.rewards.coin("deduction").amount == 200


def test_reward_refs_stay_the_same_across_crews(data):
    crew = pair_snapshot(data)
    other = replace(crew, crew_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    cards = data.deductions[0].cards
    assert decide_pair(data, crew, *cards, 0).accepted
    assert decide_pair(data, other, *cards, 0).accepted
    deduction_ref = reward_ref(data, "deduction", deduction_id=data.deductions[0].id)
    pin_ref = reward_ref(data, "first_card", card_id=cards[0])
    assert crew.crew_id not in deduction_ref and other.crew_id not in deduction_ref
    assert crew.crew_id not in pin_ref and other.crew_id not in pin_ref


def test_pairing_can_use_a_later_pin_from_a_different_seat(data):
    crew = pair_snapshot(data, same_seat=True)
    additional = replace(crew.pins[1], seat_no=3, pinned_by=FRIEND)
    crew = replace(crew, pins=(*crew.pins, additional))
    assert decide_pair(data, crew, *data.deductions[0].cards, 0).accepted
