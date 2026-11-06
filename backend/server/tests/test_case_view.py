"""View calculations, countdown stability and boundary changes from the case contract."""

from dataclasses import replace
from datetime import timedelta, timezone

import pytest

from server.game.case_data import load_case
from server.game.case_snapshot import Formed, Post, Signal
from server.game.case_view import CLOCK_KEYS, build_case_view
from server.game.finale_geometry import glow_position, schooner_position
from server.tests.case_fixtures import EXAMPLE_NOW, VIEWER, example_snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


def without_clock_keys(value):
    if isinstance(value, dict):
        return {
            key: without_clock_keys(item) for key, item in value.items() if key not in CLOCK_KEYS
        }
    if isinstance(value, list):
        return [without_clock_keys(item) for item in value]
    return value


def route_in(view, route_id):
    return next(
        route
        for spot in view["search"]["spots"]
        for route in spot.get("routes", [])
        if route["id"] == route_id
    )


def test_the_spec_example_view_is_what_the_rules_build(data):
    view = build_case_view(data, example_snapshot(), VIEWER, EXAMPLE_NOW)

    assert view["caseId"] == data.case_id
    assert (view["writeRevision"], view["now"], view["minute"]) == (8, 2125, 35)
    assert view["me"] == {
        "seatNo": 1,
        "kit": "informant",
        "readLog": False,
        "coins": 1300,
        "timber": 20,
    }
    ferry = route_in(view, "C2.ferry_log_timed")
    assert (ferry["canStart"], ferry["reason"], ferry["waitMinutes"]) == (
        False,
        "locked_window",
        15,
    )
    assert view["search"]["jobs"] == [
        {
            "routeId": "C4.back_room",
            "cardId": "C4",
            "title": data.card("C4").title,
            "total": 300,
            "remaining": 112,
            "done": False,
            "foundLine": None,
        }
    ]
    credits = view["credits"]
    assert [(row["seat"], row["pins"], row["deductionParts"]) for row in credits] == [
        (1, 2, 1),
        (3, 1, 0),
    ]
    assert [row["state"] for row in view["board"]["cards"]] == ["used", "used", "pinned"]
    assert [row["cardId"] for row in view["board"]["leads"]] == ["C4", "C7"]
    assert view["board"]["logLead"] is None
    assert view["board"]["canPair"] is True
    assert view["reveal"] == {"available": False}
    assert "revision" not in view


def test_time_alone_changes_only_the_clock_keys(data):
    snapshot = example_snapshot()
    first = without_clock_keys(build_case_view(data, snapshot, VIEWER, 2101))

    for second in range(2102, 2237):
        assert without_clock_keys(build_case_view(data, snapshot, VIEWER, second)) == first


def test_revision_never_decreases_and_changes_on_every_write_and_every_landing(data):
    snapshot = example_snapshot()
    before = build_case_view(data, snapshot, VIEWER, 2236)
    landed = build_case_view(data, snapshot, VIEWER, 2237)
    written = build_case_view(data, replace(snapshot, write_revision=9), VIEWER, 2237)

    assert [before["writeRevision"], landed["writeRevision"], written["writeRevision"]] == [8, 8, 9]
    assert without_clock_keys(before) != without_clock_keys(landed)
    assert without_clock_keys(landed) != without_clock_keys(written)


def test_a_job_disappears_ten_minutes_after_landing(data):
    before = build_case_view(data, example_snapshot(), VIEWER, 2836)
    after = build_case_view(data, example_snapshot(), VIEWER, 2837)

    assert any(job["routeId"] == "C4.back_room" for job in before["search"]["jobs"])
    assert not any(job["routeId"] == "C4.back_room" for job in after["search"]["jobs"])


def test_forming_or_missing_viewer_has_no_case_view(data):
    assert build_case_view(data, replace(example_snapshot(), status="forming"), VIEWER, 0) is None
    assert build_case_view(data, example_snapshot(), "not-a-seated-player", 0) is None


def test_a_listed_window_changes_structure_when_it_opens_and_closes(data):
    window = data.window("ferry_in")
    opening = (2 * window.every_minutes + window.from_minute) * 60
    closing = opening + window.open_minutes * 60
    snapshot = example_snapshot()

    for boundary in (opening, closing):
        before = build_case_view(data, snapshot, VIEWER, boundary - 1)
        after = build_case_view(data, snapshot, VIEWER, boundary)
        assert without_clock_keys(before) != without_clock_keys(after)
    assert route_in(build_case_view(data, snapshot, VIEWER, opening), "C2.ferry_log_timed")[
        "canStart"
    ]
    assert not route_in(build_case_view(data, snapshot, VIEWER, closing), "C2.ferry_log_timed")[
        "canStart"
    ]


def test_started_at_is_utc_even_when_the_database_answer_uses_an_offset(data):
    snapshot = example_snapshot()
    snapshot = replace(
        snapshot, started_at=snapshot.started_at.astimezone(timezone(timedelta(hours=1)))
    )

    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)

    assert view["crew"]["startedAt"] == "2026-11-13T10:02:00Z"


def night_snapshot(**changes):
    snapshot = replace(
        example_snapshot(),
        finds=(),
        pins=(),
        formed=(Formed("D1", 0, VIEWER),),
        night_no=1,
        night_started_second=0,
        station_players=frozenset({VIEWER}),
    )
    return replace(snapshot, **changes)


def light_in(view, light_id="keepers_lamp"):
    return next(light for light in view["finale"]["lights"] if light["id"] == light_id)


@pytest.mark.parametrize(
    "second,phase",
    [(0, "night"), (1199, "night"), (1200, "dawn"), (1379, "dawn"), (1380, "waiting")],
)
def test_the_finale_phase_and_glow_follow_the_production_clock(data, second, phase):
    view = build_case_view(data, night_snapshot(), VIEWER, second)

    assert view["finale"]["phase"] == phase
    assert (view["finale"]["glow"] is not None) == (phase == "night")
    assert view["finale"]["parted"] is None
    assert view["finale"]["canCall"] == (phase == "waiting")
    if phase == "night":
        x, y = glow_position(view["crew"]["id"], data.night.chart)
        assert view["finale"]["glow"] == {"x": x, "y": y}


def test_only_success_exposes_the_exact_target_and_parting_lights(data):
    signals = (
        Signal("keepers_lamp", 1, VIEWER, 1, 0, True, 70, 160, parted=True, id=1),
        Signal("harbor_light", 2, VIEWER, 1, 0, True, 80, 170, parted=True, id=2),
        Signal("islet_signal_station", 3, VIEWER, 1, 0, True, 90, 180, parted=True, id=3),
    )
    snapshot = night_snapshot(signals=signals, schooner_found_second=90)
    finale = build_case_view(data, snapshot, VIEWER, 90)["finale"]
    x, y = schooner_position(snapshot.crew_id, data.night.chart)

    assert finale["phase"] == "success"
    assert finale["glow"] is None
    assert finale["parted"] == {
        "second": 90,
        "lights": [signal.light_id for signal in signals],
        "target": {"x": x, "y": y},
    }


def test_a_post_lands_at_the_climb_boundary_and_all_seats_see_the_last_aim(data):
    post = Post("keepers_lamp", 1, 0, 60, player_id=VIEWER)
    signal = Signal("keepers_lamp", 1, VIEWER, 1, 52.4, False, 55, None)
    snapshot = night_snapshot(posts=(post,), signals=(signal,))
    before = light_in(build_case_view(data, snapshot, VIEWER, 59))
    after = light_in(build_case_view(data, snapshot, VIEWER, 60))

    assert before["post"] == {
        "seat": 1,
        "label": "Brave Puffin 17",
        "holder": "player",
        "onPost": False,
        "remaining": 1,
    }
    assert not before["canAim"]
    assert after["post"]["onPost"] and after["canAim"]
    assert after["lastBearing"] == 52.4
    assert (
        light_in(build_case_view(data, snapshot, "22222222-2222-4222-8222-222222222222", 60))[
            "lastBearing"
        ]
        == 52.4
    )
    assert not light_in(
        build_case_view(data, snapshot, "22222222-2222-4222-8222-222222222222", 60)
    )["canAim"]


def test_expired_locks_leave_the_beam_aimed_and_count_for_historical_credit(data):
    post = Post("keepers_lamp", 1, 0, 60, player_id=VIEWER)
    signal = Signal("keepers_lamp", 1, VIEWER, 1, 52.4, True, 60, 150)
    snapshot = night_snapshot(posts=(post,), signals=(signal,))
    before = build_case_view(data, snapshot, VIEWER, 149)
    after = build_case_view(data, snapshot, VIEWER, 150)

    assert light_in(before)["lock"] == {"remaining": 1, "aimedBySeat": 1}
    assert light_in(after)["lock"] is None
    assert light_in(after)["lastBearing"] == 52.4
    assert after["credits"][0]["locks"] == 1
    assert snapshot.parted_players == frozenset()
    assert before["writeRevision"] == after["writeRevision"]
    assert without_clock_keys(before) != without_clock_keys(after)


def test_a_new_night_keeps_posts_and_resets_last_aim_and_locks(data):
    post = Post("keepers_lamp", 1, 0, 60, player_id=VIEWER)
    signal = Signal("keepers_lamp", 1, VIEWER, 1, 52.4, True, 60, 150)
    snapshot = night_snapshot(posts=(post,), signals=(signal,))
    again = replace(snapshot, night_no=2, night_started_second=1380)

    light = light_in(build_case_view(data, again, VIEWER, 1380))

    assert light["post"]["onPost"]
    assert light["lastBearing"] == 0 and light["lock"] is None


def test_ended_or_replaced_posts_and_their_locks_disappear(data):
    post = Post("keepers_lamp", 2, 0, 60, npc_id="deckhand")
    signal = Signal("keepers_lamp", 2, VIEWER, 1, 52.4, True, 60, 150)
    snapshot = night_snapshot(posts=(post,), signals=(signal,))
    assert light_in(build_case_view(data, snapshot, VIEWER, 70))["canAim"]

    for changed in (
        replace(snapshot, posts=(replace(post, ended_second=70),)),
        replace(
            snapshot,
            seats=tuple(
                replace(seat, npc_id=None, player_id="replacement") if seat.seat_no == 2 else seat
                for seat in snapshot.seats
            ),
        ),
    ):
        light = light_in(build_case_view(data, changed, VIEWER, 70))
        assert light["post"] is None and light["lock"] is None
        assert light["canTake"] and not light["canAim"]


def test_a_station_owned_by_any_current_player_is_ready_for_the_crew(data):
    snapshot = night_snapshot(station_players=frozenset({"22222222-2222-4222-8222-222222222222"}))
    station = light_in(build_case_view(data, snapshot, VIEWER, 0), "islet_signal_station")

    assert station["ready"] and station["canTake"]
    for owners in (frozenset(), frozenset({"departed-player"})):
        unavailable = light_in(
            build_case_view(data, replace(snapshot, station_players=owners), VIEWER, 0),
            "islet_signal_station",
        )
        assert not unavailable["ready"] and not unavailable["canTake"]


def test_finale_countdowns_only_change_structure_at_boundaries_or_writes(data):
    snapshot = night_snapshot(posts=(Post("keepers_lamp", 1, 0, 60, player_id=VIEWER),))
    for start, end in ((1, 59), (61, 119), (1201, 1259)):
        first = without_clock_keys(build_case_view(data, snapshot, VIEWER, start))
        for now in range(start + 1, end + 1):
            assert without_clock_keys(build_case_view(data, snapshot, VIEWER, now)) == first
    for boundary in (60, 1200, 1380):
        before = build_case_view(data, snapshot, VIEWER, boundary - 1)
        after = build_case_view(data, snapshot, VIEWER, boundary)
        assert without_clock_keys(before) != without_clock_keys(after)
        assert before["writeRevision"] == after["writeRevision"]

    moved = replace(
        snapshot,
        write_revision=snapshot.write_revision + 1,
        posts=(
            replace(snapshot.posts[0], ended_second=100),
            Post("harbor_light", 1, 100, 160, player_id=VIEWER),
        ),
    )
    assert build_case_view(data, moved, VIEWER, 100)["writeRevision"] > snapshot.write_revision
    assert light_in(build_case_view(data, moved, VIEWER, 100))["post"] is None
