"""Phase 2 HTTP intents preserve repeats, strict shapes, and state-changing nudges."""

from dataclasses import replace
from itertools import combinations

import pytest

from server.game.case_board import deduction_for_pair
from server.game.case_snapshot import Find, Formed, Pin, Post
from server.game.finale_geometry import bearing_to, schooner_position
from server.routes import board, finale
from server.tests.case_api_helpers import HEADER, client_and_store
from server.tests.case_rule_helpers import FRIEND, PLAYER
from server.tests.helpers import assert_error


class Recorder:
    def __init__(self):
        self.events = []

    async def send(self, crew_id, kind, data):
        self.events.append((crew_id, kind, data))
        return True


def phase2_client(*, enabled=True):
    client, store, service, clock = client_and_store(enabled=enabled)
    client.app.include_router(board.router, prefix="/api")
    client.app.include_router(finale.router, prefix="/api")
    recorder = Recorder()
    service.broadcaster = recorder

    async def write(kind, uid, target, outcome, reply):
        scripted = store.scripted_reply(kind)
        if scripted is not None:
            return scripted
        store.current = replace(store.current, write_revision=store.current.write_revision + 1)
        store.remember(PLAYER, uid, kind, target, outcome)
        return {**reply, "revision": store.current.write_revision}

    async def pin(current, data, player, uid, card):
        return await write("pin", uid, card, "pinned", {"status": "done", "coinsPaid": 50})

    async def pair(current, data, player, uid, a, b):
        deduction = deduction_for_pair(data, a, b)
        if deduction is None:
            return await write(
                "pair", uid, a + "+" + b, "wrong_pair", {"status": "wrong_pair", "seconds": 30}
            )
        return await write(
            "pair",
            uid,
            deduction.id,
            "formed",
            {"status": "formed", "payouts": [{"playerId": PLAYER, "paid": 200}]},
        )

    async def nightfall(current, data, player, uid):
        return await write(
            "nightfall",
            uid,
            None,
            "night",
            {"status": "done", "nightNo": 1, "endsSecond": store.now() + 1200},
        )

    async def take_post(current, data, player, uid, light, ready):
        return await write(
            "post", uid, light, "climbing", {"status": "done", "onPostSecond": store.now() + 60}
        )

    async def signal(current, data, player, uid, light, bearing, on_target):
        reply = (
            {"status": "locked", "parted": False}
            if on_target
            else {"status": "off_target", "seconds": 5}
        )
        return await write("signal", uid, light, "locked" if on_target else "off_target", reply)

    store.pin, store.pair, store.nightfall = pin, pair, nightfall
    store.take_post, store.signal = take_post, signal
    return client, store, service, clock, recorder


def held_card(store):
    store.current = replace(store.current, finds=(Find(1, "C1", "C1.notice_board", 0, 0, PLAYER),))


def pinned_pair(store, service, correct):
    pair = next(
        (a, b)
        for a, b in combinations([c.id for c in service.data.cards], 2)
        if (deduction_for_pair(service.data, a, b) is not None) == correct
    )
    store.current = replace(
        store.current, pins=(Pin(1, pair[0], 0, 0, PLAYER), Pin(3, pair[1], 0, 0, FRIEND))
    )
    return list(pair)


def signal_ready(store, service):
    light = next(
        light for light in service.data.active_lights if light.id != "islet_signal_station"
    )
    store.current = replace(
        store.current,
        night_no=1,
        night_started_second=0,
        posts=(Post(1, light.id, 1, 0, 0, player_id=PLAYER),),
    )
    return light, bearing_to(
        light.chart_xy, schooner_position(store.current.crew_id, service.data.night.chart)
    )


def test_phase2_routes_require_flag_login_and_strict_bodies():
    paths = [
        ("board/pin", {"cardId": "C1"}),
        ("board/pair", {"cards": ["C1", "C2"]}),
        ("finale/nightfall", {}),
        ("finale/post", {"light": "harbor_light"}),
        ("finale/signal", {"light": "harbor_light", "bearing": 20}),
    ]
    for path, body in paths:
        client, store, *_ = phase2_client(enabled=False)
        assert_error(
            client.post("/api/" + path, headers=HEADER, json={**body, "actionUid": "action0001"}),
            404,
            "feature_off",
        )
        assert store.calls == []
        client, store, *_ = phase2_client()
        assert_error(
            client.post("/api/" + path, json={**body, "actionUid": "action0001"}),
            401,
            "unauthorized",
        )
        assert_error(
            client.post(
                "/api/" + path,
                headers=HEADER,
                json={**body, "actionUid": "action0001", "playerId": FRIEND},
            ),
            422,
            "validation_error",
        )
        assert store.calls == []


@pytest.mark.parametrize("bearing", [True, "14.2", -1, 360, float("inf"), float("nan")])
def test_signal_rejects_invalid_bearings(bearing):
    from pydantic import ValidationError

    from server.routes.case_models import SignalIntent

    with pytest.raises(ValidationError):
        SignalIntent(light="harbor_light", bearing=bearing, actionUid="signal0001")


@pytest.mark.parametrize("cards", [["C1", "C1"], ["C1"], ["C1", "C2", "C3"], [1, "C2"]])
def test_pair_requires_exactly_two_distinct_card_ids(cards):
    client, store, *_ = phase2_client()
    assert_error(
        client.post(
            "/api/board/pair", headers=HEADER, json={"cards": cards, "actionUid": "pair00001"}
        ),
        422,
        "validation_error",
    )
    assert store.calls == []


def test_pin_pays_and_nudges_once_and_repeat_precedes_target_rules():
    client, store, _, _, recorder = phase2_client()
    held_card(store)
    body = {"cardId": "C1", "actionUid": "pin000001"}
    response = client.post("/api/board/pin", headers=HEADER, json=body)
    assert response.status_code == 200 and response.json()["coinsPaid"] == 50
    store.current = replace(store.current, status="finished")
    repeat = client.post("/api/board/pin", headers=HEADER, json={**body, "cardId": "C8"}).json()
    assert repeat["accepted"] and repeat["repeat"] and "coinsPaid" not in repeat
    assert store.calls == ["pin"]
    assert recorder.events == [(store.current.crew_id, "board_changed", {"version": 2})]


def test_correct_and_wrong_pairs_are_written_once():
    for correct in (True, False):
        client, store, service, _, recorder = phase2_client()
        body = {"cards": pinned_pair(store, service, correct), "actionUid": "pair00001"}
        first = client.post("/api/board/pair", headers=HEADER, json=body).json()
        assert first["accepted"] is correct
        if correct:
            assert first["coinsPaid"] == 200
            assert set(first["deduction"]) == {
                "id",
                "name",
                "finding",
                "clearLine",
                "opens",
                "opensLine",
            }
        else:
            assert first["reason"] == "wrong_pair" and first["seconds"] == 30
        repeat = client.post("/api/board/pair", headers=HEADER, json=body).json()
        assert repeat["repeat"] and repeat["accepted"] is correct
        assert len(recorder.events) == 1 and store.calls == ["pair"]


def test_early_refusals_do_not_write_or_nudge():
    client, store, _, _, recorder = phase2_client()
    answer = client.post(
        "/api/board/pin", headers=HEADER, json={"cardId": "C8", "actionUid": "pin000002"}
    ).json()
    assert answer["reason"] == "card_not_held"
    assert store.calls == recorder.events == []


def test_night_post_signal_extras_and_misses_are_state_changing():
    client, store, service, _, recorder = phase2_client()
    store.current = replace(
        store.current, formed=tuple(Formed(value, 0) for value in service.data.night.opens_after)
    )
    answer = client.post(
        "/api/finale/nightfall", headers=HEADER, json={"actionUid": "night0001"}
    ).json()
    assert answer["accepted"] and answer["endsIn"] == 1200
    light, bearing = signal_ready(store, service)
    store.current = replace(store.current, posts=())
    answer = client.post(
        "/api/finale/post", headers=HEADER, json={"light": light.id, "actionUid": "post00001"}
    ).json()
    assert answer["accepted"] and answer["onPostIn"] == 60
    signal_ready(store, service)
    for uid, value, accepted in [
        ("signal001", bearing, True),
        ("signal002", (bearing + 180) % 360, False),
    ]:
        body = {"light": light.id, "bearing": value, "actionUid": uid}
        answer = client.post("/api/finale/signal", headers=HEADER, json=body).json()
        assert answer["accepted"] is accepted
        if accepted:
            assert answer["holdsFor"] == 90 and answer["parted"] is False
            assert "target" not in answer
        else:
            assert answer["reason"] == "off_target" and answer["seconds"] == 5
        repeat = client.post("/api/finale/signal", headers=HEADER, json=body).json()
        assert repeat["repeat"] and repeat["accepted"] is accepted
        assert "holdsFor" not in repeat and "seconds" not in repeat
    assert len(recorder.events) == 4


@pytest.mark.parametrize(
    "reason,seconds",
    [("dawn_wait", 60), ("aim_cooldown", 3), ("pair_cooldown", 20), ("post_not_ready", None)],
)
def test_sql_race_refusals_format_messages(reason, seconds):
    from server.game.case_answers import refusal_answer
    from server.game.case_data import load_case

    answer = refusal_answer(
        load_case(), "signal", "harbor_light", {"reason": reason, "seconds": seconds}
    )
    assert "{" not in answer["message"]
    if seconds is not None:
        assert answer["seconds"] == seconds


def test_phase2_reopens_once_and_maps_sql_races_without_nudges():
    client, store, _, _, recorder = phase2_client()
    held_card(store)
    store.scripted["pin"] = [
        {"status": "refused", "reason": "case_not_open"},
        {"status": "refused", "reason": "already_pinned"},
    ]
    answer = client.post(
        "/api/board/pin", headers=HEADER, json={"cardId": "C1", "actionUid": "pin000003"}
    ).json()
    assert answer["reason"] == "already_pinned" and store.calls == ["pin", "pin"]
    assert recorder.events == []


def test_crew_station_readiness_and_viewer_timber_enrich_every_fresh_view():
    class Stations:
        def __init__(self):
            self.calls = []

        async def players_with_signal_station(self, admin, players):
            self.calls.append(("stations", tuple(players)))
            return frozenset({FRIEND})

        async def timber(self, admin, player):
            self.calls.append(("timber", player))
            return 17

    client, store, service, _, _ = phase2_client()
    stations = Stations()
    service.stations = stations
    read = client.get("/api/case", headers=HEADER)
    assert read.status_code == 200 and read.json()["case"]["me"]["timber"] == 17
    held_card(store)
    body = {"cardId": "C1", "actionUid": "pin000004"}
    for _ in range(2):
        answer = client.post("/api/board/pin", headers=HEADER, json=body)
        assert answer.status_code == 200 and answer.json()["case"]["me"]["timber"] == 17
    assert stations.calls == [("stations", (PLAYER, FRIEND)), ("timber", PLAYER)] * 4


def test_signal_cannot_aim_another_players_post():
    client, store, service, _, recorder = phase2_client()
    light, bearing = signal_ready(store, service)
    store.current = replace(store.current, posts=(Post(1, light.id, 3, 0, 0, player_id=FRIEND),))
    answer = client.post(
        "/api/finale/signal",
        headers=HEADER,
        json={"light": light.id, "bearing": bearing, "actionUid": "signal003"},
    ).json()
    assert answer["reason"] == "post_not_owned"
    assert store.calls == recorder.events == []


def test_signal_sql_repeat_is_answered_before_finished_crew_rules_and_never_nudged():
    client, store, service, _, recorder = phase2_client()
    light, bearing = signal_ready(store, service)
    store.scripted["signal"] = [
        {
            "status": "repeat",
            "crewId": store.current.crew_id,
            "kind": "signal",
            "target": light.id,
            "outcome": "off_target",
        }
    ]
    answer = client.post(
        "/api/finale/signal",
        headers=HEADER,
        json={"light": light.id, "bearing": bearing, "actionUid": "signal004"},
    ).json()
    assert answer["repeat"] and not answer["accepted"] and answer["reason"] == "off_target"
    assert recorder.events == []


@pytest.mark.parametrize("path", ["post", "signal"])
def test_unknown_lights_preserve_night_prerequisite_order(path):
    client, store, service, _, recorder = phase2_client()
    body = {"light": "unknown_light", "actionUid": "unknown01"}
    if path == "signal":
        body["bearing"] = 0
    response = client.post("/api/finale/" + path, headers=HEADER, json=body)
    assert response.status_code == 200 and response.json()["reason"] == "night_required"
    signal_ready(store, service)
    assert_error(
        client.post("/api/finale/" + path, headers=HEADER, json=body), 404, "no_such_light"
    )
    assert store.calls == recorder.events == []


@pytest.mark.parametrize(
    "reason,code",
    [("not_in_crew", "crew_busy"), ("seat_changed", "crew_busy"), ("state_changed", "crew_busy")],
)
def test_phase2_sql_membership_races_are_http_conflicts(reason, code):
    client, store, _, _, recorder = phase2_client()
    held_card(store)
    store.scripted["pin"] = [{"status": "refused", "reason": reason}]
    assert_error(
        client.post(
            "/api/board/pin", headers=HEADER, json={"cardId": "C1", "actionUid": "race00001"}
        ),
        409,
        code,
    )
    assert recorder.events == []


@pytest.mark.parametrize(
    "status,code", [("forming", "crew_not_started"), ("finished", "crew_finished")]
)
def test_phase2_writes_require_the_players_active_crew(status, code):
    client, store, _, _, recorder = phase2_client()
    store.current = replace(store.current, status=status)
    assert_error(
        client.post(
            "/api/board/pin", headers=HEADER, json={"cardId": "C1", "actionUid": "state0001"}
        ),
        409,
        code,
    )
    assert store.calls == recorder.events == []


def test_phase2_stops_after_one_reopen():
    client, store, _, _, recorder = phase2_client()
    held_card(store)
    store.scripted["pin"] = [{"status": "refused", "reason": "case_not_open"}] * 2
    assert_error(
        client.post(
            "/api/board/pin", headers=HEADER, json={"cardId": "C1", "actionUid": "reopen001"}
        ),
        502,
        "database_error",
    )
    assert store.calls == ["pin", "pin"] and recorder.events == []


def test_phase2_remembered_messages_omit_unstored_extras():
    from server.game.case_answers import repeat_answer
    from server.game.case_data import load_case

    data = load_case()
    scenarios = [
        ("pin", "C1", "pinned"),
        ("pair", data.deductions[0].id, "formed"),
        ("pair", "C1+C8", "wrong_pair"),
        ("nightfall", None, "night"),
        ("post", data.active_lights[0].id, "climbing"),
        ("signal", data.active_lights[0].id, "locked"),
        ("signal", data.active_lights[0].id, "parted"),
        ("signal", data.active_lights[0].id, "off_target"),
    ]
    for kind, target, outcome in scenarios:
        answer = repeat_answer(data, {"kind": kind, "target": target, "outcome": outcome})
        assert set(answer) == {"accepted", "reason", "repeat", "message"}
        assert answer["repeat"] and bool(answer["message"]) and "{" not in answer["message"]
        assert answer["accepted"] is (outcome not in ("wrong_pair", "off_target"))
