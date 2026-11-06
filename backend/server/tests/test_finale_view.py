"""Earned finale views respect ownership, exact timer boundaries and target disclosure."""

from dataclasses import replace

from server.game.case_data import load_case
from server.game.case_snapshot import Pin, Post, Signal
from server.game.case_view import build_case_view
from server.game.finale_geometry import schooner_position
from server.game.finale_view import build_finale_view
from server.tests.case_rule_helpers import FRIEND, PLAYER
from server.tests.test_case_view import without_clock_keys
from server.tests.test_finale_rules import night


def light(view, light_id="keepers_lamp"):
    return next(row for row in view["lights"] if row["id"] == light_id)


def test_glow_only_during_night_exact_target_only_after_success():
    data, state = load_case(), night()
    for now, phase in ((1199, "night"), (1200, "dawn"), (1380, "waiting")):
        view = build_finale_view(data, state, PLAYER, now)
        assert view["phase"] == phase and view["parted"] is None
        assert (view["glow"] is not None) == (phase == "night")
        assert "target" not in view
    signal = Signal(1, 1, "keepers_lamp", 2, 1, 50.2, True, 100, 190, parted=True, aimed_by=PLAYER)
    state = replace(state, schooner_found_second=100, signals=(signal,))
    success = build_finale_view(data, state, PLAYER, 500)
    target = schooner_position(state.crew_id, data.night.chart)
    assert success["glow"] is None and success["phase"] == "success"
    assert success["parted"] == {
        "second": 100,
        "lights": ["keepers_lamp"],
        "target": {"x": target[0], "y": target[1]},
    }


def test_post_arrival_ownership_and_station_readiness_control_actions():
    data, state = load_case(), night()
    own = Post(1, "keepers_lamp", 1, 0, 60, player_id=PLAYER)
    other = Post(2, "harbor_light", 3, 0, 60, player_id=FRIEND)
    state = replace(state, posts=(own, other))
    before = build_finale_view(data, state, PLAYER, 59)
    after = build_finale_view(data, state, PLAYER, 60)
    assert not light(before)["post"]["onPost"] and not light(before)["canAim"]
    assert light(after)["post"]["onPost"] and light(after)["canAim"]
    assert not light(after)["canTake"] and not light(after, "harbor_light")["canAim"]
    assert not light(after, "islet_signal_station")["ready"]
    ready = build_finale_view(data, replace(state, station_ready=True), PLAYER, 60)
    assert light(ready, "islet_signal_station")["ready"]
    assert light(ready, "islet_signal_station")["canTake"]


def test_any_player_aims_a_partner_post_and_takeover_invalidates_it():
    data, state = load_case(), night()
    post = Post(1, "keepers_lamp", 2, 0, 0, npc_id="deckhand")
    state = replace(state, posts=(post,))
    assert light(build_finale_view(data, state, PLAYER, 0))["canAim"]
    changed = replace(
        state,
        seats=(state.seats[0], replace(state.seats[1], npc_id="replacement"), *state.seats[2:]),
    )
    view = light(build_finale_view(data, changed, PLAYER, 0))
    assert view["post"] is None and not view["canAim"] and view["canTake"]


def test_expired_locks_hide_and_bearings_remain_with_miss_cooldown():
    data, state = load_case(), night()
    post = Post(1, "keepers_lamp", 2, 0, 0, npc_id="deckhand")
    lock = Signal(1, 1, "keepers_lamp", 2, 1, 50.2, True, 10, 100, aimed_by=PLAYER)
    state = replace(state, posts=(post,), signals=(lock,))
    before, expired = [light(build_finale_view(data, state, PLAYER, now)) for now in (99, 100)]
    assert before["lock"] == {"remaining": 1, "aimedBySeat": 1}
    assert expired["lock"] is None and expired["lastBearing"] == 50.2
    miss = Signal(2, 1, "keepers_lamp", 2, 1, 80.1, False, 100, aimed_by=PLAYER)
    state = replace(state, signals=(lock, miss))
    assert not light(build_finale_view(data, state, PLAYER, 104))["canAim"]
    assert light(build_finale_view(data, state, PLAYER, 105))["canAim"]
    assert light(build_finale_view(data, state, PLAYER, 105))["lastBearing"] == 80.1


def test_night_and_dawn_keep_posts_but_disable_take_and_aim():
    data, state = load_case(), night()
    state = replace(state, posts=(Post(1, "keepers_lamp", 1, 0, 0, player_id=PLAYER),))
    for now in (1200, 1380):
        view = build_finale_view(data, state, PLAYER, now)
        assert light(view)["post"] and not light(view)["canAim"]
        assert not any(row["canTake"] for row in view["lights"])
    assert not build_finale_view(data, state, PLAYER, 1379)["canCall"]
    assert build_finale_view(data, state, PLAYER, 1380)["canCall"]


def test_time_only_countdowns_and_every_finale_boundary_change_structure():
    data, state = load_case(), night()
    state = replace(
        state,
        posts=(Post(1, "keepers_lamp", 1, 0, 60, player_id=PLAYER),),
        signals=(Signal(1, 1, "keepers_lamp", 1, 1, 50.2, True, 60, 150),),
    )
    for start, end in ((1, 59), (60, 149), (150, 1199), (1200, 1379)):
        assert without_clock_keys(
            build_finale_view(data, state, PLAYER, start)
        ) == without_clock_keys(build_finale_view(data, state, PLAYER, end))
    for boundary in (60, 150, 1200, 1380):
        assert without_clock_keys(
            build_finale_view(data, state, PLAYER, boundary - 1)
        ) != without_clock_keys(build_finale_view(data, state, PLAYER, boundary))


def test_credits_count_all_parting_locks_and_pending_order_credit():
    data, state = load_case(), night()
    state = replace(
        state,
        pins=(Pin(2, "C1", 300, 0, PLAYER, True),),
        signals=tuple(
            Signal(i + 1, 1, item.id, i + 1, 1, 50.2, True, 10, 100, parted=True, aimed_by=PLAYER)
            for i, item in enumerate(data.active_lights)
        ),
        parted_players=frozenset({PLAYER}),
        schooner_found_second=10,
    )
    view = build_case_view(data, state, PLAYER, 20)
    mine = next(row for row in view["credits"] if row["isMe"])
    assert mine["pins"] == 1 and mine["locks"] == 3 and mine["deductionParts"] == 1
    assert view["finale"]["phase"] == "success"


def test_night_credits_count_current_locks_without_granting_a_finale_reward():
    data, state = load_case(), night()
    state = replace(
        state,
        posts=(Post(1, "keepers_lamp", 2, 0, 0, npc_id="deckhand"),),
        signals=(Signal(1, 1, "keepers_lamp", 2, 1, 50.2, True, 0, 90, aimed_by=PLAYER),),
    )
    for now, count in ((89, 1), (90, 0), (1200, 0)):
        view = build_case_view(data, state, PLAYER, now)
        assert next(row for row in view["credits"] if row["isMe"])["locks"] == count
    assert not state.parted_players
