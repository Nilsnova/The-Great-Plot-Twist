"""All four-player kit mixes finish using production search, board and night decisions."""

from dataclasses import replace
from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS
from server.game.building_catalogue import load_buildings
from server.game.case_accusation import decide_accusation
from server.game.case_data import load_case
from server.game.case_decisions import IntentDecision
from server.game.case_rewards import deduction_parts
from server.game.case_snapshot import Post, Signal
from server.game.finale_geometry import bearing_to, schooner_position
from server.game.finale_rules import decide_nightfall, decide_post, decide_signal, parting_locks
from server.tests import case_playthrough
from server.tests.case_playthrough import PlannerFailure, find_cards_for_crew

MIXES = tuple(combinations_with_replacement(KITS, 4))


@pytest.mark.parametrize("kits", MIXES, ids=[f"mix-{i:02}" for i in range(1, 36)])
def test_every_four_player_mix_parts_the_fog_and_solves(kits):
    data, catalogue = load_case(), load_buildings()
    proof = find_cards_for_crew(data, kits)
    state, now = proof.snapshot, proof.finished_second
    price = next(step.cost for step in catalogue.price_list if step.level == 1)
    assert catalogue.starter_timber >= price.timber
    pin_reward, deduction_reward = data.rewards.coin("first_card"), data.rewards.coin("deduction")
    available = [
        data.kit(seat.kit).start_coins
        + sum(pin.pinned_by == seat.player_id for pin in state.pins) * pin_reward.amount
        + len(deduction_parts(data, state, seat.player_id)) * deduction_reward.amount
        for seat in state.seats
    ]
    assert max(available) >= price.coins
    assert decide_nightfall(data, state, now).accepted
    state = replace(state, night_no=1, night_started_second=now, station_ready=True)
    target = schooner_position(state.crew_id, data.night.chart)
    for index, (light, seat) in enumerate(zip(data.active_lights, state.seats[:3], strict=True)):
        assert decide_post(data, state, seat, light.id, now, station_ready=True).accepted
        post = Post(
            index + 1,
            light.id,
            seat.seat_no,
            now,
            now + data.night.climb_minutes * 60,
            player_id=seat.player_id,
        )
        state = replace(state, posts=(*state.posts, post))
    for index, post in enumerate(state.posts):
        second = post.on_post_second + index
        seat = state.seats[post.seat_no - 1]
        bearing = bearing_to(data.light(post.light_id).chart_xy, target)
        assert decide_signal(data, state, seat, post.light_id, bearing, second).accepted
        signal = Signal(
            index + 1,
            1,
            post.light_id,
            post.seat_no,
            seat.seat_no,
            bearing,
            True,
            second,
            holds_until_second=second + data.night.lock_seconds,
            aimed_by=seat.player_id,
        )
        state = replace(state, signals=(*state.signals, signal))
        assert bool(parting_locks(data, state, second)) is (index == 2)
    state = replace(state, schooner_found_second=second)
    assert decide_accusation(data, state, data.accusation.culprit, second).accepted


def test_card_proof_cannot_skip_the_production_board_rules(monkeypatch):
    monkeypatch.setattr(case_playthrough, "decide_pair", lambda *args: IntentDecision(False))
    with pytest.raises(PlannerFailure, match="production pair rule"):
        find_cards_for_crew(load_case(), ("witness",) * 4)
