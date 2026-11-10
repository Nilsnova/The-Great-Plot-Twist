"""Tests for routes/waves.py, island/waves.py and island/wave_weather.py: POST /api/waves/start,
/join and /finish, and GET /api/waves/current.

The timing, the loot cap, the one-running-wave rule and the idempotency are decided by the
database functions; their real SQL is tested in island_sql/. Here the database is a fake
(island_helpers.py), so these tests check what the server sends, how it reads the answers, the
weather modifier and every refusal. Nothing uses the network.

Used by: pytest (cd backend && uv run pytest).
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    CALM,
    FINISHED,
    FOG,
    FRIEND_ID,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    RAIN,
    STARTED,
    STORM,
    WAVE_ID,
    World,
)


def refused(reason: str, **extra) -> dict:
    return {"status": "refused", "reason": reason, **extra}


# --- POST /api/waves/start ---


def test_a_wave_needs_a_sign_in_and_the_flag():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))

    assert_error(world.client.post("/api/waves/start", json={}), 401, "unauthorized")
    assert_error(world.start(), 404, "feature_off")
    assert_error(world.finish(), 404, "feature_off")
    assert_error(world.join(), 404, "feature_off")
    assert_error(world.current(), 404, "feature_off")
    assert world.database.requests == []


def test_the_bell_on_your_own_island_answers_the_wave_of_the_contract():
    world = World()

    response = world.start()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "waveId": WAVE_ID,
        "wave": 1,
        "seed": 123456789,
        "startsAt": "2026-11-10T12:00:10Z",
        "weather": {"kind": "calm", "label": "Calm sea", "ships": 1.0, "fog": 0.0},
        "flagship": False,
    }


def test_the_own_island_is_opened_and_its_owner_sent_with_the_numbers_of_the_file():
    world = World()

    world.start()

    assert world.database.calls("island_open")[0]["p_player_id"] == PLAYER_ID
    (call,) = world.database.calls("wave_start")
    seed = call.pop("p_seed")
    assert 0 <= seed < 2**31
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_action_uid": "bell-0001",
        "p_place": "island",
        "p_island_owner": PLAYER_ID,
        "p_countdown_seconds": 10,
        "p_minimum_seconds": 15,
        "p_maximum_seconds": 900,
        "p_highest_wave": 50,
        "p_weather_kind": "calm",
        "p_weather_ships": 1.0,
        "p_weather_fog": 0.0,
    }


@pytest.mark.parametrize(
    ("reading", "kind", "ships", "fog"),
    [(STORM, "storm", 1.5, 0.0), (FOG, "fog", 1.0, 0.4), (RAIN, "rain", 1.0, 0.0)],
)
def test_the_real_weather_changes_the_wave(reading, kind, ships, fog):
    world = World(weather=reading)

    world.start()

    (call,) = world.database.calls("wave_start")
    assert (call["p_weather_kind"], call["p_weather_ships"], call["p_weather_fog"]) == (
        kind,
        ships,
        fog,
    )


def test_a_weather_source_that_is_down_never_stops_a_wave():
    world = World(weather=None)

    response = world.start()

    assert response.status_code == 200
    assert world.database.calls("wave_start")[0]["p_weather_kind"] == "calm"


def test_without_the_weather_rules_the_sea_is_calm():
    world = World(weather=STORM)
    world.app.state.weather_rules = None

    world.start()

    assert world.database.calls("wave_start")[0]["p_weather_kind"] == "calm"


def test_a_repeated_bell_answers_the_stored_wave_and_its_stored_weather():
    world = World(weather=None)  # the weather is down now, but the wave had fog
    world.database.start_reply = {
        **STARTED,
        "weatherKind": "fog",
        "ships": 1.0,
        "fog": 0.4,
        "repeat": True,
    }

    weather = world.start().json()["weather"]

    assert weather == {
        "kind": "fog",
        "label": "Fog: the pirates appear later",
        "ships": 1.0,
        "fog": 0.4,
    }


@pytest.mark.parametrize("where", ["ISLE-K7Q2M", "isle-k7q2m", "K7Q2M"])
def test_the_bell_on_a_friends_island_by_its_code(where):
    world = World()
    world.database.islands["K7Q2M"] = {
        "player_id": FRIEND_ID,
        "code": "K7Q2M",
        "wave_best": 2,
        "flags": 2,
    }

    assert world.start(where=where).status_code == 200

    (call,) = world.database.calls("wave_start")
    assert (call["p_place"], call["p_island_owner"]) == ("island", FRIEND_ID)
    assert world.database.calls("island_open") == []


def test_the_bell_on_pirate_point_names_no_island():
    world = World()

    world.start(where="pirate_point")

    (call,) = world.database.calls("wave_start")
    assert (call["p_place"], call["p_island_owner"]) == ("pirate_point", None)
    assert world.database.calls("island_open") == []


@pytest.mark.parametrize("where", ["ISLE-ZZZZZ", "elsewhere"])
def test_an_island_that_does_not_exist_is_refused(where):
    world = World()

    assert_error(world.start(where=where), 404, "no_such_island")
    assert world.database.calls("wave_start") == []


def test_an_island_removed_at_the_same_moment_is_refused_by_the_database():
    world = World()
    world.database.start_reply = refused("no_such_island")

    assert_error(world.start(), 404, "no_such_island")


def test_one_wave_at_a_time_per_island():
    world = World()
    world.database.start_reply = refused("wave_running")

    assert_error(world.start(), 409, "wave_running")


@pytest.mark.parametrize(
    "body",
    [
        {"where": ""},
        {"where": "own; drop"},
        {"actionUid": "short"},
        {"actionUid": None},
        {"seed": 4},
    ],
)
def test_a_start_that_does_not_fit_is_refused(body):
    world = World()

    assert_error(world.start(**body), 422, "validation_error")
    assert world.database.calls("wave_start") == []


def test_an_admitted_guest_rings_the_bell_like_a_player():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))

    assert world.start(headers=GUEST).status_code == 200
    assert world.database.calls("wave_start")[0]["p_player_id"] == GUEST_ID


def test_too_many_bells_in_a_minute_are_refused():
    world = World()
    for number in range(20):
        world.start(actionUid=f"bell-{number:04d}")

    assert_error(world.start(actionUid="bell-0099"), 429, "too_many_requests")


# --- POST /api/waves/finish ---


def test_a_finished_wave_answers_the_loot_the_coins_the_best_wave_and_the_flags():
    world = World()

    response = world.finish()

    assert response.status_code == 200
    assert response.json() == {"loot": 15, "coins": 115, "waveBest": 1, "flags": 1}
    (call,) = world.database.calls("wave_finish")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_wave_id": WAVE_ID,
        "p_survived": True,
        "p_ships_sunk": 7,
        "p_loot_base": 10,
        "p_loot_per_wave": 5,
        "p_loot_per_house": 5,
        "p_point_loot_base": 20,
    }


def test_a_repeated_finish_answers_the_stored_result():
    world = World()
    world.database.finish_reply = {**FINISHED, "repeat": True}

    assert world.finish().json() == {"loot": 15, "coins": 115, "waveBest": 1, "flags": 1}


def test_a_lost_wave_pays_nothing():
    world = World()
    world.database.finish_reply = {
        **FINISHED,
        "loot": 0,
        "balance": 100,
        "survived": False,
        "waveBest": 0,
        "flags": 0,
    }

    assert world.finish(survived=False).json() == {
        "loot": 0,
        "coins": 100,
        "waveBest": 0,
        "flags": 0,
    }


def test_a_finish_that_comes_too_early_is_refused_with_the_wait():
    world = World()
    world.database.finish_reply = refused("too_early", waitSeconds=12)

    response = world.finish()

    assert_error(response, 409, "wave_too_early")
    assert response.headers["retry-after"] == "12"


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("not_in_wave", 403, "not_in_wave"),
        ("no_such_wave", 404, "no_such_wave"),
        ("player_not_set_up", 404, "player_not_set_up"),
        ("something_new", 502, "database_error"),
    ],
)
def test_a_finish_the_database_refuses(reason, status, code):
    world = World()
    world.database.finish_reply = refused(reason)

    assert_error(world.finish(), status, code)


@pytest.mark.parametrize(
    "body",
    [
        {"waveId": "not-a-uuid"},
        {"survived": "true"},
        {"survived": 1},
        {"shipsSunk": -1},
        {"shipsSunk": 1001},
        {"shipsSunk": 2.5},
        {"loot": 500},
    ],
)
def test_a_finish_that_does_not_fit_is_refused(body):
    world = World()

    assert_error(world.finish(**body), 422, "validation_error")
    assert world.database.calls("wave_finish") == []


def test_an_answer_the_server_cannot_read_is_a_database_error():
    world = World()
    world.database.finish_reply = {"status": "done", "loot": "15"}

    assert_error(world.finish(), 502, "database_error")


def test_a_database_that_is_down_says_the_outcome_is_unknown():
    world = World()
    world.database.finish_reply = httpx.Response(503, json={"code": "XX000"})

    assert_error(world.finish(), 503, "database_unavailable")


# --- the weather where the bell was rung ---

GEO = {
    "x-vercel-ip-latitude": "38.7167",
    "x-vercel-ip-longitude": "-9.1333",
    "x-vercel-ip-city": "Lisbon",
}


def test_the_weather_comes_from_the_bell_ringers_area_when_vercel_names_it():
    world = World(weather=CALM, local_weather=STORM)

    world.start(headers={**PLAYER, **GEO})

    assert world.local_weather.asked == [(38.7167, -9.1333)]
    assert world.database.calls("wave_start")[0]["p_weather_kind"] == "storm"


def test_without_a_reading_for_the_area_the_default_place_decides():
    world = World(weather=FOG, local_weather=None)

    world.start(headers={**PLAYER, **GEO})

    assert world.database.calls("wave_start")[0]["p_weather_kind"] == "fog"


def test_without_geo_headers_the_area_is_never_asked():
    world = World(weather=RAIN, local_weather=STORM)

    world.start()

    assert world.local_weather.asked == []
    assert world.database.calls("wave_start")[0]["p_weather_kind"] == "rain"


def test_the_area_is_never_sent_to_the_database():
    world = World(local_weather=STORM)

    world.start(headers={**PLAYER, **GEO})

    sent = str(world.database.calls("wave_start"))
    assert "38.7" not in sent and "Lisbon" not in sent


# --- Pirate Point ---


def test_a_pirate_point_wave_carries_the_flagship():
    world = World()
    world.database.start_reply = {**STARTED, "place": "pirate_point"}

    assert world.start(where="pirate_point").json()["flagship"] is True


# --- POST /api/waves/join ---


def test_a_friend_joins_a_running_wave_and_gets_the_wave_shape():
    world = World()
    world.database.join_reply = {
        **STARTED,
        "status": "joined",
        "weatherKind": "storm",
        "ships": 1.5,
        "place": "pirate_point",
    }

    response = world.join()

    assert response.status_code == 200
    body = response.json()
    assert (body["waveId"], body["seed"], body["flagship"]) == (WAVE_ID, 123456789, True)
    assert body["weather"]["kind"] == "storm" and body["weather"]["ships"] == 1.5
    assert world.database.calls("wave_join") == [{"p_player_id": PLAYER_ID, "p_wave_id": WAVE_ID}]


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("no_such_wave", 404, "no_such_wave"),
        ("wave_over", 409, "wave_over"),
        ("player_not_set_up", 404, "player_not_set_up"),
        ("something_new", 502, "database_error"),
    ],
)
def test_a_join_the_database_refuses(reason, status, code):
    world = World()
    world.database.join_reply = refused(reason)

    assert_error(world.join(), status, code)


@pytest.mark.parametrize("body", [{"waveId": "nope"}, {"waveId": None}, {"seed": 4}])
def test_a_join_that_does_not_fit_is_refused(body):
    world = World()

    assert_error(world.join(**body), 422, "validation_error")
    assert world.database.calls("wave_join") == []


def test_an_admitted_guest_joins_like_a_player():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))

    assert world.join(headers=GUEST).status_code == 200
    assert world.database.calls("wave_join")[0]["p_player_id"] == GUEST_ID


# --- GET /api/waves/current ---


def test_no_running_wave_is_null():
    world = World()

    response = world.current()

    assert response.status_code == 200
    assert response.json() is None
    assert world.database.calls("wave_current") == [
        {"p_place": "island", "p_island_owner": PLAYER_ID}
    ]


def test_the_running_wave_of_a_friends_island_by_its_code():
    world = World()
    world.database.islands["K7Q2M"] = {
        "player_id": FRIEND_ID,
        "code": "K7Q2M",
        "wave_best": 2,
        "flags": 2,
    }
    world.database.current_reply = {**STARTED, "status": "running"}

    body = world.current("ISLE-K7Q2M").json()

    assert body["waveId"] == WAVE_ID and body["flagship"] is False
    assert world.database.calls("wave_current") == [
        {"p_place": "island", "p_island_owner": FRIEND_ID}
    ]


def test_the_running_wave_of_pirate_point():
    world = World()
    world.database.current_reply = {**STARTED, "status": "running", "place": "pirate_point"}

    assert world.current("pirate_point").json()["flagship"] is True
    assert world.database.calls("wave_current") == [
        {"p_place": "pirate_point", "p_island_owner": None}
    ]


def test_the_current_wave_of_an_unknown_island_is_no_island():
    assert_error(World().current("ISLE-ZZZZZ"), 404, "no_such_island")


def test_asking_for_the_current_wave_too_often_is_refused():
    world = World()
    for _ in range(30):
        world.current("pirate_point")

    assert_error(world.current("pirate_point"), 429, "too_many_requests")
