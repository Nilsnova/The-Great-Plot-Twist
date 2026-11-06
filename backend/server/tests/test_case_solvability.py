"""Production rules prove all 69 starting crews, including a solo player with three partners.

The original 35 four-player proofs remain alongside the complete partner proof.
"""

from dataclasses import replace
from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS
from server.game.building import level_one_cost
from server.game.building_catalogue import load_buildings
from server.game.case_board import two_seats_pinned
from server.game.case_data import load_case
from server.game.case_rewards import deduction_rewarded_players, solve_shares
from server.game.case_routes import RouteDecision
from server.game.case_snapshot import Formed, Post, Signal
from server.game.case_view import build_case_view
from server.tests import case_playthrough, npc_apply
from server.tests.case_playthrough import PlannerFailure, find_cards_for_crew, solve_for_crew

MIXES = tuple(combinations_with_replacement(KITS, 4))
ALL_MIXES = tuple(mix for size in range(1, 5) for mix in combinations_with_replacement(KITS, size))


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


@pytest.mark.parametrize("kits", ALL_MIXES, ids=[f"crew-{number:02}" for number in range(69)])
def test_every_kit_mix_can_pin_all_eight_cards_with_two_seats_for_each_deduction(data, kits):
    proof = find_cards_for_crew(data, kits)
    crew = proof.snapshot
    assert len(crew.seats) == 4 and sum(seat.player_id is not None for seat in crew.seats) == len(
        kits
    )
    assert {find.card_id for find in crew.finds} == {card.id for card in data.cards}
    assert {pin.card_id for pin in crew.pins if pin.pinned_second <= proof.finished_second} == {
        card.id for card in data.cards
    }
    assert all(
        two_seats_pinned(crew.pins, *data.deduction(row.deduction_id).cards, row.formed_second)
        for row in crew.formed
    )
    players = {seat.player_id for seat in crew.seats if seat.player_id is not None}
    assert all(row.formed_by in players for row in crew.formed)
    assert all(pin.pinned_by in players for pin in crew.pins)
    assert all(data.route(find.route_id).kind in ("kit", "open", "timed") for find in crew.finds)
    assert all(order.price == 0 for order in crew.orders) and proof.coins_spent == 0
    assert [order.order_no for order in crew.orders] == list(range(1, crew.orders_count + 1))
    assert crew.orders_count == len(crew.orders)
    assert len({(find.seat_no, find.card_id) for find in crew.finds}) == len(crew.finds)
    assert len({(pin.seat_no, pin.card_id) for pin in crew.pins}) == len(crew.pins)
    assert all(
        find.order_no is not None and find.started_by in players
        for find in crew.finds
        if find.by_partner
    )


@pytest.mark.parametrize("kits", ALL_MIXES, ids=[f"crew-{number:02}" for number in range(69)])
def test_every_player_mix_solves_on_starting_coins_and_mans_three_distinct_lights(data, kits):
    proof = solve_for_crew(data, kits)
    crew = proof.snapshot
    catalogue = load_buildings()
    cost = level_one_cost(catalogue)
    players = {seat.player_id for seat in crew.seats if seat.player_id is not None}
    assert crew.status == "finished" and crew.solved_second == proof.finished_second
    assert proof.coins_spent == cost.coins <= data.kit(crew.seats[0].kit).start_coins
    assert proof.station_timber == cost.timber <= catalogue.starter_timber
    assert all(find.coins_paid == 0 for find in crew.finds) and all(
        order.price == 0 for order in crew.orders
    )
    assert len({signal.light_id for signal in crew.signals if signal.parted}) == 3
    assert len({signal.post_seat_no for signal in crew.signals if signal.parted}) == 3
    assert all(signal.aimed_by in players for signal in crew.signals)
    assert crew.solved_by in players and crew.night_called_by in players
    assert all(row.player_id in players for row in crew.accusations)
    assert crew.world_outcome is None
    home = next(light for light in data.active_lights if not light.partners_may_man)
    assert (
        next(
            post for post in crew.posts if post.light_id == home.id and post.ended_second is None
        ).player_id
        in players
    )
    assert all(
        data.light(post.light_id).partners_may_man for post in crew.posts if post.npc_id is not None
    )


@pytest.mark.parametrize("kit", KITS)
def test_four_identical_endings_can_solve(data, kit):
    assert solve_for_crew(data, (kit,) * 4).snapshot.status == "finished"


def test_a_solo_player_with_three_partners_finishes_and_receives_rewards_and_reveal(data):
    proof = solve_for_crew(data, ("true_keeper",))
    crew = proof.snapshot
    actor = crew.seats[0]
    assert sum(seat.npc_id is not None for seat in crew.seats) == 3
    assert any(order.kind == "fetch" for order in crew.orders)
    assert sum(order.kind == "man_light" for order in crew.orders) == 2
    assert all(order.ordered_by == actor.player_id for order in crew.orders)
    assert all(pin.pinned_by == actor.player_id for pin in crew.pins)
    for formed in crew.formed:
        assert deduction_rewarded_players(
            crew, data.deduction(formed.deduction_id).cards, formed.formed_second
        ) == (actor.player_id,)
    payouts = solve_shares(data, crew)
    assert len(payouts) == len(crew.solvers) == 1
    assert payouts[0].contributor and payouts[0].share == data.rewards.coin("solve_share").maximum
    assert crew.solvers[0].share_paid == payouts[0].share
    reveal = build_case_view(data, crew, actor.player_id, proof.finished_second)["reveal"]
    assert reveal["available"] and bool(reveal["lines"])
    assert {line["kind"] for line in reveal["lines"]} >= {"unmasking", "twist", "closing", "last"}


def test_partners_without_orders_never_progress_when_time_passes(data):
    crew = case_playthrough.starting_snapshot(data, ("true_keeper",))
    actor = crew.seats[0]
    original = crew
    first = build_case_view(data, crew, actor.player_id, 0)
    later = build_case_view(data, crew, actor.player_id, 100000)
    assert crew == original and crew.orders == () and crew.orders_count == 0
    assert crew.pins == crew.formed == crew.accusations == crew.solvers == ()
    assert crew.posts == crew.signals == () and crew.solved_second is None
    assert [card["id"] for card in first["board"]["cards"]] == [
        card["id"] for card in later["board"]["cards"]
    ]
    assert not later["reveal"]["available"]
    assert case_playthrough.decide_nightfall(data, crew, 100000).reason == "deduction_required"


def test_the_solo_proof_requires_the_actual_production_partner_decision(data, monkeypatch):
    monkeypatch.setattr(npc_apply, "decide_order", lambda *_args: RouteDecision(False, "blocked"))
    with pytest.raises(PlannerFailure, match="production partner order"):
        solve_for_crew(data, ("true_keeper",))


def test_a_new_partner_order_ends_duty_and_lock_but_preserves_history(data):
    crew = case_playthrough.starting_snapshot(data, ("true_keeper",))
    crew = replace(
        crew,
        formed=tuple(Formed(item.id, 0) for item in data.deductions),
        night_no=2,
        night_started_second=0,
    )
    actor, partner = crew.seats[:2]
    light = next(light for light in data.active_lights if light.partners_may_man)
    crew, order = npc_apply.apply_order(data, crew, actor, partner, "man_light", light.id, 0)
    target = case_playthrough.schooner_position(crew.crew_id, data.night.chart)
    crew = case_playthrough.apply_signal(
        data,
        crew,
        actor,
        light.id,
        case_playthrough.bearing_to(light.chart_xy, target),
        order.ready_second,
    )
    card = data.card(data.kit(partner.kit).cheap_card)
    previous_posts, previous_signals = crew.posts, crew.signals
    active = crew.signals[0]
    untouched = (
        replace(active, id=2, on_target=False, holds_until_second=None),
        replace(active, id=3, holds_until_second=order.ready_second),
        replace(active, id=4, night_no=1),
        replace(active, id=5, ended_second=order.ready_second),
    )
    crew = replace(crew, signals=(*crew.signals, *untouched))
    crew, _ = npc_apply.apply_order(
        data, crew, actor, partner, "fetch", card.id, order.ready_second + 1
    )
    assert len(crew.posts) == len(previous_posts) and len(crew.signals) == len(
        previous_signals
    ) + len(untouched)
    assert crew.posts[0].ended_second == crew.signals[0].ended_second == order.ready_second + 1
    assert crew.signals[1:] == untouched
    assert crew.orders_count == len(crew.orders) == 2


def test_a_player_post_ends_a_stale_target_post_and_only_its_live_lock(data):
    crew = case_playthrough.starting_snapshot(data, ("true_keeper",))
    crew = replace(crew, night_no=1, night_started_second=0)
    actor = crew.seats[0]
    light = next(light for light in data.active_lights if light.partners_may_man)
    stale = Post(light.id, 3, 0, 0, npc_id="former_partner", id=1)
    signal = Signal(
        light.id, 3, actor.player_id, actor.seat_no, 0, True, 0, data.night.lock_seconds
    )
    crew = replace(crew, posts=(stale,), signals=(signal,))
    crew = case_playthrough.apply_post(data, crew, actor, light.id, 1)
    assert len(crew.posts) == 2 and crew.posts[0].ended_second == 1
    assert crew.signals[0].ended_second == 1
    assert sum(post.light_id == light.id and post.ended_second is None for post in crew.posts) == 1


@pytest.mark.parametrize("action", ("pair", "nightfall", "signal", "accuse"))
def test_the_planner_never_forges_a_player_action_for_a_partner(data, action):
    crew = case_playthrough.starting_snapshot(data, ("true_keeper",))
    partner = crew.seats[1]
    with pytest.raises(PlannerFailure, match="player actor"):
        if action == "pair":
            case_playthrough.apply_pair(data, crew, data.deductions[0], partner, 0)
        elif action == "nightfall":
            case_playthrough.apply_nightfall(
                data, replace(crew, seats=(partner, crew.seats[0], *crew.seats[2:])), 0
            )
        elif action == "signal":
            case_playthrough.apply_signal(data, crew, partner, data.active_lights[0].id, 0, 0)
        else:
            case_playthrough.apply_accusation(data, crew, partner, 0)
