"""Host console routes use fake login, database and weather; never a live service."""

import json
from dataclasses import replace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.tests.helpers import CONFIGURED_SETTINGS, make_admin
from server.tests.test_hosts import HOST_HEADER, HOST_ID, PLAYER_HEADER, login_works
from server.weather.source import make_weather_source

CREW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
SUMMARY = {
    "players": 12,
    "crews": {"forming": 2, "active": 3, "finished": 1},
    "openPositions": 4,
    "walletToday": [{"reason": "kit_grant", "count": 2, "earned": 100, "spent": 0, "net": 100}],
    "day": "2026-11-06",
    "schemaObjects": {"profiles": True, "market_positions": True},
    "lastKeepaliveAt": None,
}
CREW = {"id": CREW_ID, "code": "K7QF2M", "status": "forming", "startedAt": None,
        "seats": [{"seatNo": 1, "captainName": "Captain Fern", "kind": "player"}],
        "canClose": True}


def client_for(reply=None):
    settings = replace(CONFIGURED_SETTINGS, demo_mode=True, host_player_ids=frozenset({HOST_ID}))

    def database(request):
        if reply is not None:
            return reply(request)
        name = request.url.path.rsplit("/", 1)[-1]
        body = {"host_console_overview": SUMMARY,
                "host_console_crews": {"crews": [CREW], "total": 1, "limit": 50},
                "host_close_test_crew": {"status": "closed", "crewId": CREW_ID}}
        return httpx.Response(200, json=body[name])

    admin, seen = make_admin(database)
    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login_works))
    app = create_app(settings, admin=admin, verifier=verifier,
                     weather_source=make_weather_source(settings))
    return TestClient(app), seen


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/host/overview"), ("GET", "/api/host/crews"),
    ("POST", f"/api/host/crews/{CREW_ID}/close"),
])
@pytest.mark.parametrize("headers", [{}, PLAYER_HEADER, {"Authorization": "Bearer invalid"}])
def test_only_hosts_may_read_or_write(method, path, headers):
    client, seen = client_for()
    response = client.request(method, path, headers=headers, json={"actionUid": str(uuid4())})
    assert response.status_code == 403
    assert seen == []
    assert response.headers["cache-control"] == "no-store"


def test_overview_has_aggregates_readiness_and_explicit_unknowns():
    client, seen = client_for()
    response = client.get("/api/host/overview", headers=HOST_HEADER)
    assert response.status_code == 200
    body = response.json()
    assert body["players"] == 12
    assert body["walletToday"] == SUMMARY["walletToday"]
    assert body["weather"]["origin"] == "recorded"
    assert body["realtimeConnections"] is None
    assert body["caseClockAvailable"] is False
    assert body["keepalive"]["today"] is False
    assert body["expectedMigrations"]
    assert body["build"]["version"]
    assert response.headers["cache-control"] == "no-store"
    assert seen[0].url.path.endswith("/host_console_overview")


def test_recent_crews_show_only_captain_names_and_safe_fields():
    client, _ = client_for()
    response = client.get("/api/host/crews", headers=HOST_HEADER)
    assert response.json() == {"crews": [CREW], "total": 1, "limit": 50}
    assert response.headers["cache-control"] == "no-store"
    assert "player_id" not in response.text


def test_close_passes_verified_host_and_stable_action_to_atomic_function():
    client, seen = client_for()
    action = str(uuid4())
    for _ in range(2):
        response = client.post(f"/api/host/crews/{CREW_ID}/close", headers=HOST_HEADER,
                               json={"actionUid": action})
        assert response.json() == {"status": "closed", "crewId": CREW_ID}
    assert all(json.loads(r.content) == {"p_host_id": HOST_ID, "p_crew_id": CREW_ID,
                                       "p_action_uid": action} for r in seen)


@pytest.mark.parametrize("body", [{}, {"actionUid": "bad"},
                                  {"actionUid": str(uuid4()), "hostId": HOST_ID}])
def test_close_rejects_invalid_actions_without_database_work(body):
    client, seen = client_for()
    response = client.post(f"/api/host/crews/{CREW_ID}/close", headers=HOST_HEADER, json=body)
    assert response.status_code == 422
    assert seen == []


@pytest.mark.parametrize("reason", ["not_test_crew", "not_forming", "action_conflict"])
def test_close_reports_safe_refusals(reason):
    client, _ = client_for(
        lambda _: httpx.Response(200, json={"status": "refused", "reason": reason})
    )
    response = client.post(f"/api/host/crews/{CREW_ID}/close", headers=HOST_HEADER,
                           json={"actionUid": str(uuid4())})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == reason


@pytest.mark.parametrize("path", ["overview", "crews"])
def test_malformed_database_reply_is_not_forwarded_to_browser(path):
    client, _ = client_for(lambda _: httpx.Response(200, json={"private": "not for screens"}))
    response = client.get(f"/api/host/{path}", headers=HOST_HEADER)
    assert response.status_code == 502
    assert "not for screens" not in response.text


def test_database_failure_does_not_expose_details():
    client, _ = client_for(lambda _: httpx.Response(500, json={"message": "private detail"}))
    response = client.get("/api/host/overview", headers=HOST_HEADER)
    assert response.status_code == 503
    assert "private detail" not in response.text
