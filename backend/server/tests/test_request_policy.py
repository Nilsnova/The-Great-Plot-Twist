"""Request policy regressions: private caches and logs must never retain player input."""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.tests.helpers import CONFIGURED_SETTINGS


@pytest.mark.parametrize("path,status", [
    ("/api/me", 401), ("/api/save", 401), ("/api/market/portfolio", 401),
    ("/api/content/not-public", 404), ("/api/not-a-route", 404),
])
def test_private_and_error_answers_are_not_stored(path, status):
    response = TestClient(create_app(CONFIGURED_SETTINGS)).get(path)
    assert response.status_code == status
    assert response.headers["cache-control"] == "private, no-store"


def test_request_logs_use_templates_and_never_request_or_exception_data(caplog):
    app = create_app(CONFIGURED_SETTINGS)

    @app.get("/api/test/{player}")
    async def crash(player: str):
        raise RuntimeError("private-exception-detail")

    with caplog.at_level(logging.INFO):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get(
                "/api/test/private-player?token=private-query",
                headers={"Authorization": "Bearer private-header"},
            )
            client.get("/unknown/private-path")
    assert response.status_code == 500
    assert response.headers["cache-control"] == "private, no-store"
    records = [json.loads(r.message) for r in caplog.records if r.name == "uvicorn.error.requests"]
    assert len(records) == 2
    assert records[0]["route"] == "/api/test/{player}"
    assert records[0]["status"] == 500
    assert records[1]["route"] == "unmatched"
    assert records[1]["status"] == 404
    for record in records:
        assert set(record) == {"route", "status", "duration_ms"}
        assert record["duration_ms"] >= 0
    # Third-party TestClient INFO logs contain full URLs; inspect our server records only.
    own = [r for r in caplog.records if r.name.startswith(("server.", "uvicorn."))]
    text = "\n".join(r.message for r in own)
    assert "private-" not in text
    assert all(not r.exc_info for r in own)


def test_public_content_keeps_its_short_cache_policy():
    response = TestClient(create_app(CONFIGURED_SETTINGS)).get("/api/content/intro-story")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"


def test_included_router_logs_its_full_template(caplog):
    with caplog.at_level(logging.INFO):
        TestClient(create_app(CONFIGURED_SETTINGS)).get("/api/health?ignored=private-query")
    record = next(r for r in caplog.records if r.name == "uvicorn.error.requests")
    assert json.loads(record.message)["route"] == "/api/health"


def test_successful_market_answers_also_get_private_cache_defaults():
    from server.tests.market_world import AUTH, World

    world = World()
    portfolio = world.client.get("/api/market/portfolio", headers=AUTH)
    trade = world.client.post("/api/market/open", headers=AUTH, json={
        "companyId": "harbor-trust", "side": "rising", "stake": 50,
        "actionUid": "request-policy-check",
    })
    for response in (portfolio, trade):
        assert response.status_code == 200
        assert "no-store" in response.headers["cache-control"].split(", ")
