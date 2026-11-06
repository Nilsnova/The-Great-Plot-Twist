"""The Phase 2 proof uses real pure rules for all 35 four-player kit mixes.

Phase 4 extends the same playthrough with partners to prove all 69 crew mixes.
"""

from dataclasses import replace
from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS
from server.game.building import level_one_cost
from server.game.building_catalogue import load_buildings
from server.game.case_board import two_seats_pinned
from server.game.case_data import load_case
from server.game.case_routes import RouteDecision
from server.game.case_snapshot import Post
from server.tests import case_playthrough
from server.tests.case_playthrough import PlannerFailure, find_cards_for_crew, solve_for_crew

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


@pytest.mark.parametrize("kits", MIXES, ids=[f"mix-{number:02}" for number in range(1, 36)])
def test_every_four_player_mix_parts_the_fog_and_solves(data, kits):
    proof = solve_for_crew(data, kits)
    snapshot = proof.snapshot
    catalogue = load_buildings()
    cost = level_one_cost(catalogue)
    owner = snapshot.seats[0]

    assert snapshot.status == "finished" and snapshot.solved_second == proof.finished_second
    assert snapshot.accusations[-1].correct
    assert {find.card_id for find in snapshot.finds} == {card.id for card in data.cards}
    assert all(
        data.route(find.route_id).kind in ("kit", "open", "timed") for find in snapshot.finds
    )
    assert all(find.coins_paid == 0 for find in snapshot.finds)
    assert proof.coins_spent == cost.coins <= data.kit(owner.kit).start_coins
    assert proof.station_timber == cost.timber <= catalogue.starter_timber
    assert len({signal.post_seat_no for signal in snapshot.signals if signal.parted}) == 3
    assert len({signal.light_id for signal in snapshot.signals if signal.parted}) == 3
    assert [
        signal.case_second - snapshot.signals[0].case_second for signal in snapshot.signals
    ] == [0, 10, 20]
    assert snapshot.schooner_found_second == snapshot.signals[-1].case_second
    assert snapshot.world_outcome is None
    assert all(left != right for _, left, right in proof.pair_seats)
    assert all(
        two_seats_pinned(snapshot.pins, *data.deduction(row.deduction_id).cards, row.formed_second)
        for row in snapshot.formed
    )


@pytest.mark.parametrize(
    "rule",
    [
        "decide_pin",
        "decide_pair",
        "decide_nightfall",
        "decide_post",
        "decide_signal",
        "decide_accusation",
    ],
)
def test_the_full_proof_requires_every_production_decision(data, monkeypatch, rule):
    monkeypatch.setattr(case_playthrough, rule, lambda *_args: RouteDecision(False, "blocked"))

    with pytest.raises(PlannerFailure, match="production"):
        solve_for_crew(data, ("stranger",) * 4)


def test_a_test_apply_post_preserves_ended_post_history(data):
    proof = find_cards_for_crew(data, ("stranger",) * 4)
    now = proof.finished_second
    snapshot = case_playthrough.apply_nightfall(data, proof.snapshot, now)
    seat = snapshot.seats[0]
    old = Post(
        "keepers_lamp",
        seat.seat_no,
        now,
        now,
        player_id=seat.player_id,
        ended_second=now + 30,
        id=1,
    )
    current = replace(old, taken_second=now + 40, on_post_second=now + 100, ended_second=None, id=2)
    snapshot = replace(snapshot, posts=(old, current))

    moved = case_playthrough.apply_post(data, snapshot, seat, "harbor_light", now + 120)

    assert moved.posts[0] == old
    assert moved.posts[1].ended_second == now + 120
