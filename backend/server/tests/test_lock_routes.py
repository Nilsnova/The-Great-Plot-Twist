"""Tests for the Keeper's Lock routes (routes/lock.py) with fake Open-Meteo and a fake database.

Open-Meteo is a fake transport that counts its calls; the database is FakeDemoDatabase. Nothing
uses the network.
"""

from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.tests.demo_helpers import (
    DEMO_SETTINGS,
    GUEST,
    GUEST_ID,
    PLAYER,
    PLAYER_ID,
    make_demo_app,
)
from server.tests.helpers import assert_error

LISBON = {
    "x-vercel-ip-city": "Lisbon",
    "x-vercel-ip-latitude": "38.72",
    "x-vercel-ip-longitude": "-9.14",
}


class FakeOpenMeteo:
    """Answers the weather with one WMO code, or fails while `down` is true."""

    def __init__(self, code: int = 61) -> None:
        self.code = code
        self.down = False
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.down:
            return httpx.Response(500, json={"error": True, "reason": "down"})
        current = {
            "time": "2026-11-05T12:00",
            "interval": 900,
            "weather_code": self.code,
            "cloud_cover": 90,
            "precipitation": 0.3,
            "visibility": 8000,
            "wind_speed_10m": 12,
            "is_day": 1,
        }
        return httpx.Response(200, json={"current": current})


def lock_client(code: int = 61, settings=DEMO_SETTINGS, places_reply=None):
    meteo = FakeOpenMeteo(code)
    app, database, clock = make_demo_app(settings, weather_reply=meteo, places_reply=places_reply)
    return TestClient(app), database, meteo, clock


def answer(client, value, uid, headers=None, **extra):
    body = {"answer": value, "actionUid": uid, **extra}
    return client.post(
        "/api/lock/answer", json=body, headers={**PLAYER, **LISBON, **(headers or {})}
    )


# --- the question ---


def test_the_question_names_the_ip_place_and_never_sends_the_reading():
    client, database, meteo, _ = lock_client()

    response = client.get("/api/lock", headers={**PLAYER, **LISBON})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["question"] == "What does the sky over Lisbon look like right now?"
    assert body["place"] == {
        "name": "Lisbon",
        "latitude": 38.72,
        "longitude": -9.14,
        "source": "ip",
    }
    assert body["weatherSource"] == "live"
    assert [choice["id"] for choice in body["choices"]] == [
        "clear",
        "cloudy",
        "rain",
        "fog",
        "snow",
    ]
    assert body["opened"] is False and body["hintReady"] is False
    assert "Open-Meteo" in body["attribution"]
    assert "rain" not in {key for key in body}  # no reading field
    (request,) = meteo.requests
    # Open-Meteo sees the rounded place only.
    assert request.url.params["latitude"] == "38.7"
    assert request.url.params["longitude"] == "-9.1"


def test_without_geo_headers_the_default_place_is_used():
    client, *_ = lock_client()

    body = client.get("/api/lock", headers=PLAYER).json()

    assert body["place"]["source"] == "default"
    assert body["place"]["name"] == "Torshavn, Faroe Islands"


def test_a_chosen_place_wins_over_the_headers():
    client, *_ = lock_client()

    body = client.get(
        "/api/lock?name=Porto&latitude=41.15&longitude=-8.61", headers={**PLAYER, **LISBON}
    ).json()

    assert body["place"] == {
        "name": "Porto",
        "latitude": 41.15,
        "longitude": -8.61,
        "source": "chosen",
    }


@pytest.mark.parametrize(
    "query",
    [
        "name=Porto",
        "name=Porto&latitude=41&longitude=200",
        "name=&latitude=1&longitude=1",
        "name=Porto&latitude=nan&longitude=1",
        "latitude=1&longitude=1",
    ],
)
def test_a_half_or_odd_chosen_place_is_refused(query):
    client, *_ = lock_client()

    assert_error(client.get(f"/api/lock?{query}", headers=PLAYER), 422, "validation_error")


def test_the_weather_is_cached_for_ten_minutes_per_rounded_place():
    client, _, meteo, clock = lock_client()

    client.get("/api/lock", headers={**PLAYER, **LISBON})
    client.get("/api/lock?name=Nearby&latitude=38.74&longitude=-9.12", headers=PLAYER)
    assert len(meteo.requests) == 1
    clock.advance(601)
    client.get("/api/lock", headers={**PLAYER, **LISBON})
    assert len(meteo.requests) == 2


def test_open_meteo_down_uses_the_last_good_reading_then_the_riddle():
    client, _, meteo, clock = lock_client()
    client.get("/api/lock", headers={**PLAYER, **LISBON})
    meteo.down = True
    clock.advance(601)

    assert client.get("/api/lock", headers={**PLAYER, **LISBON}).json()["weatherSource"] == "cache"

    clock.advance(7 * 3600)
    body = client.get("/api/lock", headers={**PLAYER, **LISBON}).json()
    assert body["weatherSource"] == "clue"
    assert [choice["id"] for choice in body["choices"]] == ["beam", "smoke", "song", "flags"]
    assert body["attribution"] is None


def test_no_reading_at_all_gives_the_riddle_and_it_opens_the_lock():
    client, _, meteo, _ = lock_client()
    meteo.down = True

    assert client.get("/api/lock", headers=PLAYER).json()["weatherSource"] == "clue"
    body = answer(client, "beam", "clue0001").json()

    assert body["accepted"] is True and body["match"] == "clue"


def test_demo_mode_never_calls_open_meteo():
    client, _, meteo, _ = lock_client(settings=replace(DEMO_SETTINGS, demo_mode=True))

    assert client.get("/api/lock", headers=PLAYER).json()["weatherSource"] == "clue"
    assert meteo.requests == []


def test_a_guest_needs_the_class_code():
    client, database, _, clock = lock_client()

    assert_error(client.get("/api/lock", headers=GUEST), 403, "demo_closed")
    database.admit(GUEST_ID)  # the guest presented the class code (on any instance)
    assert client.get("/api/lock", headers=GUEST).status_code == 200


# --- answers ---


def test_the_right_sky_opens_the_lock_and_is_stored_without_the_place():
    client, database, *_ = lock_client(code=61)

    response = answer(client, "rain", "answer0001")

    body = response.json()
    assert response.status_code == 200
    assert body["accepted"] is True
    assert body["reason"] is None
    assert body["match"] == "exact"
    assert "Lisbon" in body["message"]
    assert body["lock"]["opened"] is True
    (stored,) = database.calls("demo_lock_record")
    assert stored == {
        "p_player_id": PLAYER_ID,
        "p_action_uid": "answer0001",
        "p_answer": "rain",
        "p_outcome": "exact",
    }
    assert "Lisbon" not in str(stored) and "38" not in str(stored)


def test_one_step_away_is_close_enough():
    client, *_ = lock_client(code=61)

    body = answer(client, "cloudy", "answer0001").json()

    assert body["accepted"] is True and body["match"] == "close"
    assert body["message"].startswith("Close enough: the reading says Rain")


def test_a_wrong_sky_is_refused_and_unlocks_the_hint_button():
    client, *_ = lock_client(code=0)

    body = answer(client, "rain", "answer0001").json()

    assert body["accepted"] is False
    assert body["reason"] == "wrong"
    assert body["match"] is None
    assert body["lock"]["hintReady"] is True


def test_the_hint_path_after_one_honest_try():
    client, *_ = lock_client(code=0)

    early = answer(client, "hint", "hint00001").json()
    assert early["accepted"] is False and early["reason"] == "hint_too_early"

    answer(client, "rain", "answer0001")
    offered = answer(client, "hint", "hint00002").json()
    assert offered["reason"] == "hint_offered"
    assert offered["prompt"] == "I looked outside"

    opened = answer(client, "hint_confirm", "hint00003").json()
    assert opened["accepted"] is True and opened["match"] == "hint"


def test_a_repeated_uid_answers_the_stored_verdict_first():
    client, database, meteo, _ = lock_client(code=0)
    first = answer(client, "rain", "answer0001").json()
    answer(client, "clear", "answer0002")  # opens the lock

    again = answer(client, "rain", "answer0001").json()

    assert again["accepted"] is False and again["reason"] == first["reason"] == "wrong"
    assert again["repeat"] is True
    assert len(database.calls("demo_lock_record")) == 2


def test_after_opening_new_answers_are_accepted_and_not_stored():
    client, database, *_ = lock_client(code=0)
    answer(client, "clear", "answer0001")

    body = answer(client, "snow", "answer0002").json()

    assert body["accepted"] is True and body["alreadyOpen"] is True
    assert len(database.calls("demo_lock_record")) == 1


def test_an_answer_to_the_other_question_is_question_changed():
    client, *_ = lock_client(code=0)

    body = answer(client, "beam", "answer0001").json()

    assert body["accepted"] is False and body["reason"] == "question_changed"


@pytest.mark.parametrize(
    "body",
    [
        {"answer": "", "actionUid": "answer0001"},
        {"answer": None, "actionUid": "answer0001"},
        {"answer": 7, "actionUid": "answer0001"},
        {"answer": [], "actionUid": "answer0001"},
        {"answer": "r" * 21, "actionUid": "answer0001"},
        {"answer": "lava", "actionUid": "answer0001"},
        {"answer": "RAIN", "actionUid": "answer0001"},
        {"answer": "rain", "actionUid": "short"},
        {"answer": "rain", "actionUid": ""},
        {"answer": "rain", "actionUid": None},
        {"answer": "rain", "actionUid": "x" * 65},
        {"answer": "rain"},
        {"answer": "rain", "actionUid": "answer0001", "accepted": True},
        {
            "answer": "rain",
            "actionUid": "answer0001",
            "place": {"name": "X", "latitude": 99, "longitude": 0},
        },
    ],
)
def test_odd_answers_are_refused_and_nothing_is_stored(body):
    client, database, meteo, _ = lock_client()

    response = client.post("/api/lock/answer", json=body, headers=PLAYER)

    assert_error(response, 422, "validation_error")
    assert database.calls("demo_lock_record") == []
    assert meteo.requests == []


def test_forty_stored_answers_are_enough():
    client, database, *_ = lock_client(code=0)
    database.attempts = [
        {
            "player_id": PLAYER_ID,
            "action_uid": f"old{n:05d}",
            "answer": "fog",
            "outcome": "question_changed",
            "accepted": False,
        }
        for n in range(40)
    ]

    assert_error(answer(client, "rain", "answer0001"), 409, "too_many_tries")


def test_the_lock_budget_answers_429_after_thirty_requests_a_minute():
    client, *_ = lock_client()
    for _ in range(30):
        assert client.get("/api/lock", headers=PLAYER).status_code == 200

    response = client.get("/api/lock", headers=PLAYER)

    assert_error(response, 429, "too_many_requests")
    assert int(response.headers["retry-after"]) >= 1


def test_no_coins_move_at_the_lock():
    client, database, *_ = lock_client(code=61)

    answer(client, "rain", "answer0001")

    assert not [path for path in database.paths() if "wallet" in path]


# --- place search ---


class FakeGeocoding:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.down = False

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.down:
            return httpx.Response(503)
        results = [
            {
                "name": f"Lisbon {n}",
                "latitude": 38.7,
                "longitude": -9.1,
                "country": "Portugal",
                "admin1": "Lisbon",
            }
            for n in range(7)
        ]
        return httpx.Response(200, json={"results": results})


def test_place_search_gives_at_most_five_places_and_caches_them():
    geocoding = FakeGeocoding()
    client, *_ = lock_client(places_reply=geocoding)

    first = client.get("/api/places/search?q=Lisb", headers=PLAYER)
    second = client.get("/api/places/search?q=%20lisb%20", headers=PLAYER)

    assert first.status_code == 200
    assert first.headers["cache-control"] == "private, no-store"
    body = first.json()
    assert len(body["places"]) == 5
    assert body["places"][0] == {
        "name": "Lisbon 0",
        "region": "Lisbon",
        "country": "Portugal",
        "latitude": 38.7,
        "longitude": -9.1,
    }
    assert "GeoNames" in body["attribution"]
    assert second.json() == body
    (request,) = geocoding.requests
    assert request.url.params["name"] == "lisb"
    assert request.url.params["count"] == "5"


def test_place_search_needs_sign_in_and_a_sensible_query():
    client, *_ = lock_client(places_reply=FakeGeocoding())

    assert_error(client.get("/api/places/search?q=Lisb"), 401, "unauthorized")
    assert_error(client.get("/api/places/search?q=L", headers=PLAYER), 422, "validation_error")
    assert_error(client.get("/api/places/search", headers=PLAYER), 422, "validation_error")
    assert_error(
        client.get("/api/places/search?q=Lis%0Abon", headers=PLAYER), 422, "validation_error"
    )


def test_place_search_failure_is_503_and_not_cached():
    geocoding = FakeGeocoding()
    geocoding.down = True
    client, *_ = lock_client(places_reply=geocoding)

    assert_error(client.get("/api/places/search?q=Lisb", headers=PLAYER), 503, "places_unavailable")
    geocoding.down = False
    assert client.get("/api/places/search?q=Lisb", headers=PLAYER).status_code == 200


def test_place_search_budget_is_ten_a_minute():
    client, *_ = lock_client(places_reply=FakeGeocoding())
    for number in range(10):
        client.get(f"/api/places/search?q=town{number}", headers=PLAYER)

    assert_error(client.get("/api/places/search?q=more", headers=PLAYER), 429, "too_many_requests")


@pytest.mark.parametrize("query", ["", "   ", "x" * 61])
def test_a_bad_search_never_asks_the_place_provider(query: str) -> None:
    geocoding = FakeGeocoding()
    client, *_ = lock_client(places_reply=geocoding)

    response = client.get("/api/places/search", params={"q": query}, headers=PLAYER)

    assert_error(response, 422, "validation_error")
    assert geocoding.requests == []


@pytest.mark.parametrize("query", ["Li", "x" * 60])
def test_search_accepts_both_length_boundaries(query: str) -> None:
    geocoding = FakeGeocoding()
    client, *_ = lock_client(places_reply=geocoding)

    response = client.get("/api/places/search", params={"q": query}, headers=PLAYER)

    assert response.status_code == 200
    assert len(geocoding.requests) == 1
