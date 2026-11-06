"""The Phase 1 card proof uses real pure rules for all 35 four-player kit mixes.

Later phases extend the same playthrough with partners, lights and the accepted solve.
"""

from dataclasses import replace
from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS
from server.game.case_board import two_seats_pinned
from server.game.case_data import load_case
from server.game.case_routes import RouteDecision
from server.tests import case_playthrough
from server.tests.case_playthrough import PlannerFailure, find_cards_for_crew

MIXES = tuple(combinations_with_replacement(KITS, 4))


@pytest.fixture(scope="module")
def data():
    return load_case()


@pytest.mark.parametrize("kits", MIXES, ids=[f"mix-{number:02}" for number in range(1, 36)])
def test_every_four_player_mix_finds_all_eight_cards_on_free_routes(data, kits):
    proof = find_cards_for_crew(data, kits)

    assert {find.card_id for find in proof.snapshot.finds} == {card.id for card in data.cards}
    assert [formed.deduction_id for formed in proof.snapshot.formed] == [
        deduction.id for deduction in data.deductions
    ]
    assert all(find.coins_paid == 0 for find in proof.snapshot.finds)
    assert all(data.route(find.route_id).coins == 0 for find in proof.snapshot.finds)
    assert all(
        data.route(find.route_id).kind in ("kit", "open", "timed") for find in proof.snapshot.finds
    )
    assert proof.coins_spent == 0
    for formed in proof.snapshot.formed:
        cards = data.deduction(formed.deduction_id).cards
        assert two_seats_pinned(proof.snapshot.pins, *cards, formed.formed_second)
    assert all(left != right for _, left, right in proof.pair_seats)


def test_a_witness_starting_card_is_reused_without_starting_a_second_find(data):
    proof = find_cards_for_crew(data, ("witness",) * 4)

    for seat in proof.snapshot.seats:
        starting = [
            find
            for find in proof.snapshot.finds
            if find.seat_no == seat.seat_no and data.route(find.route_id).starts_in_journal
        ]
        assert len(starting) == 1
        assert (starting[0].started_second, starting[0].ready_second) == (0, 0)
    assert len({(find.seat_no, find.card_id) for find in proof.snapshot.finds}) == len(
        proof.snapshot.finds
    )


def test_the_proof_cannot_replace_a_refused_production_rule_with_a_passing_model(data, monkeypatch):
    monkeypatch.setattr(
        case_playthrough, "decide_route", lambda *_args: RouteDecision(False, "blocked")
    )

    with pytest.raises(PlannerFailure, match="production search rule"):
        find_cards_for_crew(data, ("stranger",) * 4)


def test_a_missing_free_route_makes_the_proof_fail(data):
    last_card = data.cards[-1]
    broken = replace(
        data,
        cards=tuple(
            replace(card, routes=tuple(replace(route, coins=1) for route in card.routes))
            if card.id == last_card.id
            else card
            for card in data.cards
        ),
    )

    with pytest.raises(PlannerFailure, match="free minimum route"):
        find_cards_for_crew(broken, ("stranger",) * 4)
