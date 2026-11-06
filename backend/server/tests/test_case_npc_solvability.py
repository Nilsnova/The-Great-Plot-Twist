"""All 69 human kit mixes solve with real partner orders and starting resources only.

The bounded playthrough uses production decisions; deliberate rule failures must stop it.
No API, wallet, database, market, world event or protected prose is involved in this proof.
"""

from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS, NPC_KIT_ORDER
from server.game.case_board import two_seats_pinned
from server.game.case_data import load_case
from server.game.case_rewards import deduction_rewarded_players
from server.game.npc_orders import OrderDecision
from server.tests import npc_playthrough
from server.tests.case_playthrough import PlannerFailure
from server.tests.npc_playthrough import solve_case

MIXES = tuple(kits for count in range(1, 5) for kits in combinations_with_replacement(KITS, count))


@pytest.fixture(scope="module")
def data():
    return load_case()


@pytest.mark.parametrize("kits", MIXES, ids=[f"mix-{i:02}" for i in range(1, 70)])
def test_every_player_mix_solves_on_starting_coins_with_production_partner_orders(data, kits):
    proof = solve_case(data, kits)
    state = proof.state
    humans = [seat for seat in state.seats if seat.player_id is not None]
    partners = [seat for seat in state.seats if seat.npc_id is not None]
    expected = [kit for kit in NPC_KIT_ORDER if kit not in kits][: 4 - len(kits)]
    assert [seat.kit for seat in humans] == list(kits)
    assert [seat.kit for seat in partners] == expected
    assert len({seat.npc_id for seat in partners}) == len(partners)
    assert {find.card_id for find in state.finds} == {card.id for card in data.cards}
    assert {pin.card_id for pin in state.pins} == {card.id for card in data.cards}
    assert {formed.deduction_id for formed in state.formed} == {item.id for item in data.deductions}
    assert all(left != right for _, left, right in proof.pairs)
    for formed in state.formed:
        cards = data.deduction(formed.deduction_id).cards
        assert two_seats_pinned(state.pins, *cards, formed.formed_second)
        assert formed.formed_by in {seat.player_id for seat in humans}
        assert deduction_rewarded_players(state, cards, formed.formed_second)
    assert all(find.coins_paid == 0 for find in state.finds)
    assert all(data.route(find.route_id).coins == 0 for find in state.finds)
    assert all(data.route(find.route_id).kind in ("kit", "open", "timed") for find in state.finds)
    assert all(order.price == 0 for order in proof.orders)
    assert all(order.ordered_by in {seat.player_id for seat in humans} for order in proof.orders)
    assert [order.order_no for order in proof.orders] == list(range(1, len(proof.orders) + 1))
    assert proof.station_owner in {seat.player_id for seat in humans}
    assert proof.station_coins > 0 and proof.station_timber > 0
    assert len({post.seat_no for post in state.posts}) == data.night.lights_needed
    assert len({post.light_id for post in state.posts}) == data.night.lights_needed
    assert len(state.signals) == data.night.lights_needed
    assert all(signal.parted for signal in state.signals)
    assert all(signal.aimed_by in {seat.player_id for seat in humans} for signal in state.signals)
    assert state.schooner_found_second == proof.now
    assert proof.now < proof.night_started + data.night.night_minutes * 60
    assert min(signal.holds_until_second for signal in state.signals) > proof.now
    if partners:
        assert any(order.kind == "fetch" for order in proof.orders)
        assert any(order.kind == "man_light" for order in proof.orders)
    check_partner_deadlines(data, proof)


def check_partner_deadlines(data, proof):
    last_ready = {}
    for order in proof.orders:
        assert order.ordered_second >= last_ready.get(order.seat_no, 0)
        last_ready[order.seat_no] = order.ready_second
        if order.kind == "man_light":
            post = next(post for post in proof.state.posts if post.order_no == order.order_no)
            assert post.taken_second == order.ordered_second
            assert post.on_post_second == order.ready_second == order.ordered_second + 600
            assert data.light(order.target).partners_may_man
            continue
        pin = next(
            pin
            for pin in proof.state.pins
            if pin.by_partner and pin.seat_no == order.seat_no and pin.card_id == order.target
        )
        assert pin.ordered_second == order.ordered_second
        assert pin.pinned_by == order.ordered_by
        assert pin.pinned_second == order.pin_second == order.ready_second
        if order.route_id is None:
            assert order.arrive_second is order.found_second is None
            assert order.ready_second == order.ordered_second + 300
        else:
            assert order.arrive_second == order.ordered_second + 240
            assert order.found_second == order.ordered_second + 600
            assert order.ready_second == order.ordered_second + 900
            find = next(find for find in proof.state.finds if find.order_no == order.order_no)
            assert find.ready_second == order.found_second and find.by_partner


def test_the_proof_covers_all_69_mixes_and_four_identical_endings(data):
    assert len(MIXES) == 69 and len(set(MIXES)) == 69
    assert {count: sum(len(kits) == count for kits in MIXES) for count in range(1, 5)} == {
        1: 4,
        2: 10,
        3: 20,
        4: 35,
    }
    for kit in KITS:
        assert (kit,) * 4 in MIXES


def test_a_witness_partner_uses_its_starting_card_without_a_second_find(data):
    proof = solve_case(data, ("informant",))
    witness = next(seat for seat in proof.state.seats if seat.kit == "witness")
    starting = [
        find
        for find in proof.state.finds_for_seat(witness.seat_no)
        if data.route(find.route_id).starts_in_journal
    ]
    assert len(starting) == 1 and starting[0].ready_second == 0
    assert len({(find.seat_no, find.card_id) for find in proof.state.finds}) == len(
        proof.state.finds
    )


def test_a_human_orders_the_witness_starting_card_to_be_pinned_in_five_minutes(data):
    proof = npc_playthrough.starting_crew(data, ("informant",))
    witness = next(seat for seat in proof.state.seats if seat.kit == "witness")
    card = next(route.card_id for route in data.active_routes if route.starts_in_journal)
    after = npc_playthrough.fetch_and_pin(data, proof, witness, card)
    order = after.orders[-1]
    assert order.route_id is None and order.ready_second == 300
    assert after.state.finds == proof.state.finds
    assert after.state.pins[-1].pinned_by == proof.state.seats[0].player_id
    assert after.state.pins[-1].ordered_second == 0
    assert not after.state.formed and after.state.schooner_found_second is None


def test_the_solo_proof_cannot_skip_refused_production_fetch_rules(data, monkeypatch):
    monkeypatch.setattr(npc_playthrough, "decide_fetch", lambda *_a, **_k: OrderDecision(False))
    with pytest.raises(PlannerFailure, match="no bounded two-seat plan"):
        solve_case(data, ("stranger",))


def test_the_proof_cannot_replace_refused_partner_light_duty_with_a_human(data, monkeypatch):
    monkeypatch.setattr(npc_playthrough, "decide_man_light", lambda *_a, **_k: OrderDecision(False))
    with pytest.raises(PlannerFailure, match="production man_light rule"):
        solve_case(data, ("stranger",))
