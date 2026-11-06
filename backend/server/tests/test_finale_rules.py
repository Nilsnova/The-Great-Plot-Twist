"""Night decisions require current light holders and overlapping locks from distinct seats.

Used by: developers verifying pure rules without sockets, database writes or story output.
"""

from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.case_data import load_case
from server.game.case_snapshot import Formed, Post, Signal
from server.game.finale_geometry import bearing_to, schooner_position
from server.game.finale_rules import (
    decide_nightfall,
    decide_post,
    decide_signal,
    light_is_ready,
    night_phase,
    parting_locks,
    valid_posts,
)
from server.tests.case_rule_helpers import FRIEND, PLAYER, snapshot


@pytest.fixture
def data():
    return load_case()


def night_snapshot(data):
    return replace(
        snapshot(),
        formed=tuple(Formed(item, 0) for item in data.night.opens_after),
        night_no=1,
        night_started_second=0,
        station_players=frozenset((FRIEND,)),
    )


def ready_posts(data, crew):
    return tuple(
        Post(light.id, seat.seat_no, 0, 0, seat.player_id, seat.npc_id)
        for light, seat in zip(data.active_lights, crew.seats, strict=False)
    )


def true_bearing(data, crew, light_id):
    return bearing_to(
        data.light(light_id).chart_xy, schooner_position(crew.crew_id, data.night.chart)
    )


def lock(data, post, second, night_no=1):
    return Signal(
        post.light_id,
        post.seat_no,
        PLAYER,
        1,
        0,
        True,
        second,
        second + data.night.lock_seconds,
        night_no=night_no,
    )


def test_gated_cards_wait_for_their_deduction(data):
    assert decide_nightfall(data, snapshot(), 0).reason == "deduction_required"
    crew = night_snapshot(data)
    crew = replace(crew, night_no=0, night_started_second=None)
    assert decide_nightfall(data, crew, 0).accepted


def test_night_lasts_20_minutes_and_dawn_waits_3(data):
    crew = night_snapshot(data)
    end = data.night.night_minutes * 60
    dawn_end = end + data.night.dawn_wait_minutes * 60
    assert end == 1200 and dawn_end - end == 180
    assert night_phase(data, snapshot(), 0) == "waiting"
    assert night_phase(data, crew, end - 1) == "night"
    assert decide_nightfall(data, crew, end - 1).reason == "night_in_progress"
    assert night_phase(data, crew, end) == "dawn"
    refusal = decide_nightfall(data, crew, end)
    assert refusal.reason == "dawn_wait" and refusal.seconds == dawn_end - end
    assert night_phase(data, crew, dawn_end) == "waiting"
    assert decide_nightfall(data, crew, dawn_end).accepted
    crew = replace(crew, schooner_found_second=50, formed=())
    assert night_phase(data, crew, dawn_end) == "success"
    assert decide_nightfall(data, crew, dawn_end).reason == "schooner_found"


def test_fewer_than_three_seats_never_part_the_fog(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    two = replace(crew, posts=posts[:2], signals=tuple(lock(data, post, 0) for post in posts[:2]))
    assert parting_locks(data, two, 1) == ()
    hopped = tuple(replace(post, seat_no=1, player_id=PLAYER, npc_id=None) for post in posts)
    crew = replace(crew, posts=hopped, signals=tuple(lock(data, post, 0) for post in hopped))
    assert parting_locks(data, crew, 1) == ()


def test_one_player_can_hold_three_locks_for_partner_lights(data):
    crew = night_snapshot(data)
    # The home station stays player-held; the same player can aim both partner lights.
    public = tuple(light for light in data.active_lights if light.partners_may_man)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    posts = (
        Post(public[0].id, 2, 0, 0, npc_id=crew.seats[1].npc_id),
        Post(public[1].id, 4, 0, 0, npc_id=crew.seats[3].npc_id),
        Post(home.id, 1, 0, 0, player_id=PLAYER),
    )
    crew = replace(crew, posts=posts)
    for post in posts:
        result = decide_signal(
            data, crew, crew.seats[0], post.light_id, true_bearing(data, crew, post.light_id), 0
        )
        assert result.accepted and result.status == "locked"
    crew = replace(
        crew,
        signals=tuple(
            lock(data, post, second) for post, second in zip(posts, (0, 45, 89), strict=True)
        ),
    )
    assert len(parting_locks(data, crew, 89)) == data.night.lights_needed
    assert all(signal.aimed_by == PLAYER for signal in crew.signals)
    assert (
        decide_signal(data, replace(crew, posts=()), crew.seats[0], posts[0].light_id, 0, 0).reason
        == "post_not_ready"
    )


@pytest.mark.parametrize("last,parts", [(89, True), (90, False)])
def test_locks_must_overlap(data, last, parts):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    crew = replace(
        crew,
        posts=posts,
        signals=tuple(
            lock(data, post, second) for post, second in zip(posts, (0, 45, last), strict=True)
        ),
    )
    assert bool(parting_locks(data, crew, last)) is parts


def test_a_lock_ends_when_its_seat_leaves_the_light(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    signals = tuple(lock(data, post, 0) for post in posts)
    crew = replace(crew, posts=posts, signals=signals)
    assert parting_locks(data, crew, 1)
    assert (
        parting_locks(data, replace(crew, posts=(replace(posts[0], ended_second=1), *posts[1:])), 1)
        == ()
    )
    assert (
        parting_locks(
            data, replace(crew, signals=(replace(signals[0], ended_second=1), *signals[1:])), 1
        )
        == ()
    )
    returned = replace(posts[0], taken_second=2, on_post_second=2)
    assert parting_locks(data, replace(crew, posts=(returned, *posts[1:])), 2) == ()


def test_a_player_cannot_lock_another_players_light(data):
    crew = night_snapshot(data)
    light = data.active_lights[0]
    post = Post(light.id, 3, 0, 0, player_id=FRIEND)
    crew = replace(crew, posts=(post,))
    assert decide_signal(data, crew, crew.seats[0], light.id, 0, 0).reason == "post_not_owned"


def test_relock_waits_5_seconds_after_a_miss(data):
    crew = night_snapshot(data)
    post = ready_posts(data, crew)[0]
    miss = Signal(post.light_id, post.seat_no, PLAYER, 1, 0, False, 10, None)
    crew = replace(crew, posts=(post,), signals=(miss,))
    bearing = true_bearing(data, crew, post.light_id)
    result = decide_signal(data, crew, crew.seats[0], post.light_id, bearing, 14)
    assert result.reason == "aim_cooldown" and result.seconds == 1
    assert data.night.relock_wait_seconds == 5
    assert decide_signal(data, crew, crew.seats[0], post.light_id, bearing, 15).accepted
    assert decide_signal(
        data, replace(crew, night_no=2), crew.seats[0], post.light_id, bearing, 14
    ).accepted


def test_one_station_built_by_any_player_readies_the_light_for_the_whole_crew(data):
    crew = night_snapshot(data)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    result = decide_post(data, crew, crew.seats[0], home.id, 0)
    assert result.accepted and result.seconds == data.night.climb_minutes * 60
    assert light_is_ready(data, crew, home)
    assert not light_is_ready(
        data, replace(crew, station_players=frozenset(("former-member",))), home
    )


def test_with_no_station_the_home_post_is_refused_and_nothing_changes(data):
    crew = replace(night_snapshot(data), station_players=frozenset())
    home = next(light for light in data.active_lights if not light.partners_may_man)
    result = decide_post(data, crew, crew.seats[0], home.id, 0)
    assert not result.accepted and result.reason == "light_not_ready" and crew.posts == ()


def test_a_partner_cannot_man_the_home_station(data):
    crew = night_snapshot(data)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    assert not decide_post(data, crew, crew.seats[1], home.id, 0).accepted


def test_a_failed_night_keeps_cards_deductions_and_posts(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    crew = replace(crew, posts=posts, signals=tuple(lock(data, post, 0) for post in posts))
    before = crew
    retry = data.night.night_minutes * 60 + data.night.dawn_wait_minutes * 60
    assert decide_nightfall(data, crew, retry).accepted and crew == before
    next_night = replace(crew, night_no=2, night_started_second=retry)
    assert valid_posts(next_night, retry) == posts
    assert parting_locks(data, next_night, retry) == ()


def test_post_refusals_follow_the_fixed_order(data):
    crew = night_snapshot(data)
    light = data.active_lights[0]
    assert (
        decide_post(data, snapshot(), snapshot().seats[0], "missing", 0).reason == "night_required"
    )
    with pytest.raises(ApiError) as caught:
        decide_post(data, crew, crew.seats[0], "missing", 0)
    assert caught.value.status_code == 404
    own = Post(light.id, 1, 0, 0, player_id=PLAYER)
    assert (
        decide_post(data, replace(crew, posts=(own,)), crew.seats[0], light.id, 0).reason
        == "already_on_post"
    )
    other = replace(own, seat_no=3, player_id=FRIEND)
    assert (
        decide_post(data, replace(crew, posts=(other,)), crew.seats[0], light.id, 0).reason
        == "post_taken"
    )


def test_signal_refusals_follow_the_fixed_order(data):
    crew = night_snapshot(data)
    light = data.active_lights[0]
    found = replace(crew, schooner_found_second=0, posts=())
    assert decide_signal(data, found, crew.seats[0], light.id, 0, 0).reason == "schooner_found"
    assert decide_signal(data, snapshot(), crew.seats[0], light.id, 0, 0).reason == "night_required"
    post = Post(light.id, 3, 0, 10, player_id=FRIEND)
    crew = replace(crew, posts=(post,))
    assert decide_signal(data, crew, crew.seats[0], light.id, 0, 9).reason == "post_not_ready"
    assert decide_signal(data, crew, crew.seats[0], light.id, 0, 10).reason == "post_not_owned"


def test_a_takeover_invalidates_the_partner_post_and_its_lock(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    crew = replace(crew, posts=posts, signals=tuple(lock(data, post, 0) for post in posts))
    seats = tuple(
        replace(seat, player_id="new-player", npc_id=None) if seat.seat_no == 2 else seat
        for seat in crew.seats
    )
    crew = replace(crew, seats=seats)
    assert len(valid_posts(crew, 0)) == 2
    assert parting_locks(data, crew, 1) == ()
    assert (
        decide_signal(data, crew, crew.seats[0], posts[1].light_id, 0, 0).reason == "post_not_ready"
    )
    assert decide_post(data, crew, crew.seats[0], posts[1].light_id, 0).accepted


def test_a_miss_does_not_end_an_existing_lock(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    locks = tuple(lock(data, post, 0) for post in posts)
    miss = replace(locks[0], case_second=1, on_target=False, holds_until_second=None)
    crew = replace(crew, posts=posts, signals=(*locks, miss))
    assert len(parting_locks(data, crew, 2)) == data.night.lights_needed


@pytest.mark.parametrize("offset,accepted", [(5.0, True), (5.1, False), (6, False)])
def test_off_target_lock_is_refused_and_changes_nothing(data, offset, accepted):
    crew = night_snapshot(data)
    post = ready_posts(data, crew)[0]
    crew = replace(crew, posts=(post,))
    # Synthetic geometry makes the inclusive boundary exact after one-decimal normalization.
    light = data.light(post.light_id)
    target = schooner_position(crew.crew_id, data.night.chart)
    light = replace(light, chart_xy=(target[0], target[1] + 1))
    night = replace(data.night, lights=(light,))
    result = decide_signal(
        replace(data, night=night), crew, crew.seats[0], post.light_id, offset, 0
    )
    assert result.accepted is accepted and result.on_target is accepted
    assert result.status == ("locked" if accepted else "off_target")
    assert crew.signals == ()


def test_timings_and_tolerance_follow_the_loaded_content(data):
    night = replace(
        data.night,
        night_minutes=2,
        dawn_wait_minutes=1,
        climb_minutes=2,
        lock_seconds=17,
        relock_wait_seconds=3,
        tolerance_degrees=1,
    )
    data = replace(data, night=night)
    crew = night_snapshot(data)
    light = data.active_lights[0]
    assert night_phase(data, crew, 119) == "night"
    assert night_phase(data, crew, 120) == "dawn"
    assert night_phase(data, crew, 180) == "waiting"
    assert decide_post(data, crew, crew.seats[0], light.id, 0).seconds == 120
    target = schooner_position(crew.crew_id, data.night.chart)
    light = replace(light, chart_xy=(target[0], target[1] + 1))
    data = replace(data, night=replace(night, lights=(light,)))
    crew = replace(crew, posts=(Post(light.id, 1, 0, 0, player_id=PLAYER),))
    hit = decide_signal(data, crew, crew.seats[0], light.id, 1.04, 0)
    assert hit.accepted and hit.bearing == 1 and hit.seconds == 17
    miss = decide_signal(data, crew, crew.seats[0], light.id, 1.06, 0)
    assert not miss.accepted and miss.bearing == 1.1 and miss.seconds == 3


def test_future_climbing_duplicate_and_previous_night_locks_do_not_add_lights(data):
    crew = night_snapshot(data)
    posts = ready_posts(data, crew)
    locks = tuple(lock(data, post, 0) for post in posts)
    crew = replace(crew, posts=posts, signals=locks)
    assert parting_locks(data, replace(crew, signals=(*locks[:2], locks[0])), 1) == ()
    assert (
        parting_locks(data, replace(crew, signals=(*locks[:2], replace(locks[2], night_no=2))), 1)
        == ()
    )
    assert (
        parting_locks(
            data, replace(crew, signals=(*locks[:2], replace(locks[2], case_second=2))), 1
        )
        == ()
    )
    climbing = replace(posts[2], on_post_second=2)
    assert parting_locks(data, replace(crew, posts=(*posts[:2], climbing)), 1) == ()


def test_a_stored_partner_post_at_home_does_not_make_a_valid_lock(data):
    crew = night_snapshot(data)
    home = next(light for light in data.active_lights if not light.partners_may_man)
    post = Post(home.id, 2, 0, 0, npc_id=crew.seats[1].npc_id)
    crew = replace(crew, posts=(post,))
    assert decide_signal(data, crew, crew.seats[0], home.id, 0, 0).reason == "post_not_ready"
