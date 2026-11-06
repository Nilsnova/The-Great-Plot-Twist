"""Contribution rewards use acceptance time, pay only players and never include crew ids."""

from dataclasses import replace

from server.game.case_board import deduction_parts, two_seats_pinned
from server.game.case_data import load_case
from server.game.case_rewards import deduction_rewarded_players, reward_ref, solve_shares
from server.game.case_snapshot import Formed, Pin
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot


def test_phase_one_only_the_accuser_earns_a_share():
    payouts = solve_shares(load_case(), snapshot(), PLAYER)
    assert [(item.player_id, item.share) for item in payouts] == [(PLAYER, 500), (FRIEND, 0)]
    assert all(item.kit != "witness" for item in payouts)


def test_a_partner_pin_counts_for_its_ordering_player_before_it_lands():
    data = load_case()
    deduction = data.deductions[0]
    pin = Pin(4, deduction.cards[0], 900, 600, PLAYER, True)
    crew = replace(snapshot(), pins=(pin,), formed=(Formed(deduction.id, 700),))
    payout = solve_shares(data, crew)[0]
    assert payout.pins == 1 and payout.parts == 1 and payout.share == 500
    assert deduction_rewarded_players(crew, deduction.cards, 700) == (PLAYER,)


def test_a_pin_ordered_after_the_deduction_formed_is_not_a_part():
    data = load_case()
    deduction = data.deductions[0]
    crew = replace(
        snapshot(),
        pins=(Pin(1, deduction.cards[0], 601, 601, PLAYER),),
        formed=(Formed(deduction.id, 600),),
    )
    assert deduction_parts(data, crew, PLAYER) == ()
    assert solve_shares(data, crew)[0].share == 400


def test_solve_share_is_capped_at_800_and_a_passenger_gets_nothing():
    data = load_case()
    pins = tuple(Pin(1, card.id, 0, 0, PLAYER) for card in data.cards)
    crew = replace(
        snapshot(), pins=pins, formed=tuple(Formed(item.id, 1) for item in data.deductions)
    )
    payouts = solve_shares(data, crew, PLAYER)
    assert payouts[0].share == 800
    assert payouts[1].share == 0 and not payouts[1].contributor


def test_pairing_needs_different_seats_and_pins_that_have_landed():
    pins = (Pin(1, "C1", 0, 0, PLAYER), Pin(1, "C2", 0, 0, PLAYER))
    assert not two_seats_pinned(pins, "C1", "C2", 0)
    pins = (pins[0], replace(pins[1], seat_no=4, by_partner=True, pinned_second=10))
    assert not two_seats_pinned(pins, "C1", "C2", 9)
    assert two_seats_pinned(pins, "C1", "C2", 10)


def test_reward_refs_belong_to_the_case_and_never_to_a_crew():
    data = load_case()
    for name, values in (
        ("first_card", {"card_id": "C1"}),
        ("deduction", {"deduction_id": "D1"}),
        ("solve_share", {}),
    ):
        ref = reward_ref(data, name, **values)
        assert ref.startswith(data.case_id + ":") and len(ref) <= 120
        assert snapshot().crew_id not in ref
