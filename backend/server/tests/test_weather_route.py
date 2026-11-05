"""Tests for routes/weather.py: GET /api/weather, on a fake Open-Meteo and a fake clock.

No test here uses the network. The saved answers are in backend/content/weather/.
"""

from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.settings import Settings
from server.tests.helpers import FakeClock, FakeReply, assert_error, fail_with
from server.tests.weather_helpers import (
    LISBON_SETTINGS,
    answer_with_sample,
    make_transport,
    replies_in_order,
)
from server.weather.source import CONTENT_FOLDER, TTL_SECONDS, make_weather_source

URL = "/api/weather"

# The answer for the saved "rain" sample, at 12:00 UTC on the fake clock, for the made-up place.
RAIN_ANSWER = {
    "cloudCover": 1.0,
    "rain": 0.6,
    "fog": 0.22,
    "wind": 0.52,
    "isDay": True,
    "summary": "Rain, windy",
    "place": "Lisbon, Portugal",
    "source": "live",
    "fetchedAt": "2026-11-05T12:00:00Z",
    "attribution": "Weather data by Open-Meteo.com, adapted for the game",
}


def make_client(
    reply: FakeReply,
    clock: FakeClock | None = None,
    settings: Settings = LISBON_SETTINGS,
    recorded_folder: Path = CONTENT_FOLDER,
):
    """An API on a fake Open-Meteo. Returns the client, the requests sent and the clock."""
    transport, seen = make_transport(reply)
    clock = clock or FakeClock()
    source = make_weather_source(settings, transport, clock, recorded_folder)
    return TestClient(create_app(settings, weather_source=source)), seen, clock


# --- the normal answer ---


def test_weather_answers_with_the_agreed_fields_and_values():
    client, _, _ = make_client(answer_with_sample("rain"))

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == RAIN_ANSWER


def test_the_fields_come_in_the_documented_order():
    client, _, _ = make_client(answer_with_sample("rain"))

    assert list(client.get(URL).json()) == [
        "cloudCover",
        "rain",
        "fog",
        "wind",
        "isDay",
        "summary",
        "place",
        "source",
        "fetchedAt",
        "attribution",
    ]


@pytest.mark.parametrize("name", ["cloudCover", "rain", "fog", "wind"])
def test_each_weather_value_is_a_number_from_zero_to_one(name):
    client, _, _ = make_client(answer_with_sample("thunderstorm"))

    value = client.get(URL).json()[name]

    assert 0.0 <= value <= 1.0


def test_a_thunderstorm_at_night_says_so_in_is_day_and_the_summary():
    client, _, _ = make_client(answer_with_sample("thunderstorm"))

    body = client.get(URL).json()

    assert body["isDay"] is False
    assert body["summary"] == "Thunderstorm, very windy"


def test_anyone_may_call_weather_without_signing_in():
    client, _, _ = make_client(answer_with_sample("rain"))

    assert client.get(URL).status_code == 200


def test_a_login_header_is_ignored():
    client, _, _ = make_client(answer_with_sample("rain"))

    response = client.get(URL, headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 200


def test_the_answer_may_be_kept_by_browsers_and_caches_for_five_minutes():
    client, _, _ = make_client(answer_with_sample("rain"))

    assert client.get(URL).headers["cache-control"] == "public, max-age=300"


def test_the_answer_does_not_give_away_the_coordinates_or_the_service_address():
    client, _, _ = make_client(answer_with_sample("rain"))

    text = client.get(URL).text

    assert "38.72" not in text
    assert "-9.14" not in text
    assert "api.open-meteo.com" not in text


# --- the cache and the fallbacks, as the browser sees them ---


def test_the_second_request_comes_from_the_cache_and_says_so():
    client, seen, _ = make_client(answer_with_sample("rain"))
    client.get(URL)

    body = client.get(URL).json()

    assert body["source"] == "cache"
    assert body["fetchedAt"] == "2026-11-05T12:00:00Z"
    assert len(seen) == 1


def test_a_request_after_ten_minutes_asks_open_meteo_again():
    client, seen, clock = make_client(answer_with_sample("rain"))
    client.get(URL)

    clock.advance(TTL_SECONDS)
    body = client.get(URL).json()

    assert body["source"] == "live"
    assert body["fetchedAt"] == "2026-11-05T12:10:00Z"
    assert len(seen) == 2


def test_when_open_meteo_is_down_the_recorded_answer_is_sent_and_says_fallback():
    client, _, _ = make_client(fail_with(httpx.ConnectError))

    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == {
        "cloudCover": 1.0,
        "rain": 0.0,
        "fog": 0.0,
        "wind": 0.23,
        "isDay": False,
        "summary": "Overcast",
        "place": "Torshavn, Faroe Islands",
        "source": "fallback",
        "fetchedAt": "2026-11-05T17:14:33Z",
        "attribution": "Weather data by Open-Meteo.com, adapted for the game",
    }


def test_when_open_meteo_goes_down_later_the_last_good_answer_is_sent_as_stale():
    clock = FakeClock()
    works_then_fails = replies_in_order(answer_with_sample("rain"), fail_with(httpx.ConnectError))
    client, _, _ = make_client(works_then_fails, clock)

    assert client.get(URL).json()["source"] == "live"
    clock.advance(TTL_SECONDS)
    body = client.get(URL).json()

    assert body["source"] == "stale"
    assert body["rain"] == 0.6
    assert body["fetchedAt"] == "2026-11-05T12:00:00Z"
    assert body["place"] == "Lisbon, Portugal"


def test_an_unusable_answer_from_open_meteo_is_treated_like_a_failure():
    client, _, _ = make_client(lambda request: httpx.Response(200, json={"error": True}))

    assert client.get(URL).json()["source"] == "fallback"


# --- when nothing is left ---


def test_with_no_open_meteo_and_no_recorded_answer_it_answers_503_in_the_standard_shape(tmp_path):
    client, _, _ = make_client(fail_with(httpx.ConnectError), recorded_folder=tmp_path)

    response = client.get(URL)

    assert_error(response, 503, "source_unavailable")


def test_an_error_answer_is_not_marked_as_cacheable(tmp_path):
    client, _, _ = make_client(fail_with(httpx.ConnectError), recorded_folder=tmp_path)

    response = client.get(URL)

    assert "max-age" not in response.headers.get("cache-control", "")


def test_the_error_message_does_not_show_the_service_address(tmp_path):
    client, _, _ = make_client(fail_with(httpx.ConnectError), recorded_folder=tmp_path)

    assert "open-meteo.com" not in client.get(URL).text


# --- the request cannot steer the server ---


def test_the_query_string_cannot_change_the_place_or_the_coordinates():
    client, seen, _ = make_client(answer_with_sample("rain"))

    body = client.get(URL, params={"place": "Paris", "latitude": "1", "longitude": "2"}).json()

    assert body["place"] == "Lisbon, Portugal"
    assert seen[0].url.params["latitude"] == "38.72"
    assert seen[0].url.params["longitude"] == "-9.14"


def test_only_get_is_allowed():
    client, _, _ = make_client(answer_with_sample("rain"))

    assert_error(client.post(URL), 405, "method_not_allowed")


# --- demo mode and the app as a whole ---


def test_in_demo_mode_the_route_sends_the_recorded_answer_and_never_calls_open_meteo():
    client, seen, _ = make_client(
        answer_with_sample("rain"), settings=replace(LISBON_SETTINGS, demo_mode=True)
    )

    body = client.get(URL).json()

    assert body["source"] == "fallback"
    assert body["place"] == "Torshavn, Faroe Islands"
    assert seen == []


def test_weather_is_listed_in_the_api_docs_as_a_get_route():
    client, _, _ = make_client(answer_with_sample("rain"))

    paths = client.get("/api/openapi.json").json()["paths"]

    assert list(paths["/api/weather"]) == ["get"]


def test_creating_the_app_without_a_weather_source_builds_one_from_the_settings():
    app = create_app(Settings())

    assert app.state.weather_source.name == "weather"


@pytest.mark.parametrize("path", ["/api/health", "/api/config"])
def test_the_other_routes_never_touch_open_meteo(path):
    client, seen, _ = make_client(answer_with_sample("rain"))

    assert client.get(path).status_code == 200
    assert seen == []
