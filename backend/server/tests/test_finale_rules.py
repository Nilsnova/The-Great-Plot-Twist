"""Night boundaries, post ownership and simultaneous locks cannot be bypassed."""

from dataclasses import replace

from server.game.case_data import load_case
from server.game.case_snapshot import Formed, Post, Signal
from server.game.finale_geometry import bearing_to, schooner_position
from server.game.finale_rules import (
    decide_nightfall,
    decide_post,
    decide_signal,
    night_phase,
    parting_locks,
)
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot


def night():
    return replace(
        snapshot(),
        night_no=1,
        night_started_second=0,
        formed=(Formed(load_case().night.opens_after[0], 0),),
    )


def test_nightfall_requires_deduction_and_obeys_exact_night_and_dawn_boundaries():
    data = load_case()
    assert decide_nightfall(data, snapshot(), 0).reason == "deduction_required"
    state = night()
    assert decide_nightfall(data, state, 1199).reason == "night_in_progress"
    assert night_phase(data, state, 1200) == "dawn"
    assert decide_nightfall(data, state, 1379).reason == "dawn_wait"
    assert decide_nightfall(data, state, 1380).accepted
    assert night_phase(data, replace(state, schooner_found_second=100), 2000) == "success"


def test_station_is_shared_by_crew_but_cannot_be_manned_by_a_partner():
    data, state = load_case(), night()
    seat = state.seat_for_player(PLAYER)
    assert decide_post(data, state, seat, "islet_signal_station", 0).reason == "light_not_ready"
    assert decide_post(data, state, seat, "islet_signal_station", 0, station_ready=True).accepted
    assert not decide_post(
        data, state, state.seats[1], "islet_signal_station", 0, station_ready=True
    ).accepted


def test_signal_waits_for_climb_rejects_another_player_and_obeys_miss_cooldown():
    data, state = load_case(), night()
    light = data.active_lights[0]
    seat = state.seat_for_player(PLAYER)
    post = Post(1, light.id, 1, 0, 60, player_id=PLAYER)
    state = replace(state, posts=(post,))
    bearing = bearing_to(light.chart_xy, schooner_position(state.crew_id, data.night.chart))
    assert decide_signal(data, state, seat, light.id, bearing, 59).reason == "post_not_ready"
    assert decide_signal(data, state, seat, light.id, bearing, 60).accepted
    assert (
        decide_signal(data, state, state.seat_for_player(FRIEND), light.id, bearing, 60).reason
        == "post_not_owned"
    )
    miss = Signal(1, 1, light.id, 1, 1, 0, False, 60)
    state = replace(state, signals=(miss,))
    assert decide_signal(data, state, seat, light.id, bearing, 64).reason == "aim_cooldown"
    assert decide_signal(data, state, seat, light.id, bearing, 65).accepted


def test_three_distinct_post_seats_must_hold_overlapping_live_locks():
    data, state = load_case(), night()
    holders = [state.seats[i] for i in range(3)]
    posts = tuple(
        Post(i + 1, light.id, seat.seat_no, 0, 0, player_id=seat.player_id, npc_id=seat.npc_id)
        for i, (light, seat) in enumerate(zip(data.active_lights, holders, strict=True))
    )
    signals = tuple(
        Signal(i + 1, 1, post.light_id, post.seat_no, 1, 0, True, at, holds_until_second=at + 90)
        for i, (post, at) in enumerate(zip(posts, (0, 45, 89), strict=True))
    )
    state = replace(state, posts=posts, signals=signals)
    assert len(parting_locks(data, state, 89)) == 3
    assert not parting_locks(data, state, 90)
    moved = replace(state, posts=(replace(posts[0], ended_second=89), *posts[1:]))
    assert not parting_locks(data, moved, 89)
    changed = replace(
        state,
        seats=(state.seats[0], replace(state.seats[1], npc_id="replacement"), *state.seats[2:]),
    )
    assert not parting_locks(data, changed, 89)
