"""Protected routes with injected auth/provider services; separate SQL tests verify money."""

from dataclasses import replace
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.flags import parse_flags
from server.routes import island_wager_jobs, island_wagers
from server.tests.helpers import CONFIGURED_SETTINGS
from server.tests.test_island_treasury import ACTOR, EPOCH, OWNER, FakeAdmin
from server.tests.test_wager_store import reply

AUTH = {"Authorization": "Bearer test.player.signature"}
CAP = AUTH | {"X-Island-Economy-Version": "1"}


@pytest.fixture
def world(monkeypatch):
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,market,sports"))
    verifier = PlayerVerifier(settings, httpx.MockTransport(
        lambda request: httpx.Response(200, json={"id": ACTOR, "is_anonymous": False}),
    ))
    app = create_app(settings=settings, verifier=verifier, admin=FakeAdmin({"status": "missing"}))
    app.include_router(island_wagers.router, prefix="/api")
    app.include_router(island_wager_jobs.router, prefix="/api")
    calls = []

    async def opened(*arguments):
        calls.append(arguments)
        return SimpleNamespace(model_dump=lambda **kwargs: reply())

    monkeypatch.setattr(island_wagers.wager_service, "open_market_call", opened)
    monkeypatch.setattr(island_wagers.wager_service, "open_football_bet", opened)
    return TestClient(app), calls


def intent(**changes):
    return {"economy": {"mode": "island_shared", "version": 1,
                        "islandOwner": OWNER, "runEpoch": EPOCH},
            "actionUid": "market001", "asset": "harbor-trust", "direction": "up",
            "stake": "1"} | changes


def test_shared_post_requires_login_and_capability_before_any_mutation(world):
    client, calls = world
    assert client.post("/api/island/wagers/market", json=intent()).status_code == 401
    response = client.post("/api/island/wagers/market", headers=AUTH, json=intent())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "economy_context_required"
    assert calls == []


def test_shared_payload_uses_authenticated_actor_exact_origin_and_arbitrary_size_stake(world):
    client, calls = world
    value = "1" + "0" * 5000
    response = client.post("/api/island/wagers/market", headers=CAP, json=intent(stake=value))
    assert response.status_code == 200
    assert calls[0][2:5] == (ACTOR, OWNER, EPOCH)
    assert calls[0][-1] == 10**5000


@pytest.mark.parametrize("field", ["accountId", "actorId", "payer", "payout", "price"])
def test_client_money_authority_fields_are_rejected(world, field):
    client, calls = world
    assert client.post("/api/island/wagers/market", headers=CAP,
                       json=intent(**{field: OWNER})).status_code == 422
    assert calls == []


@pytest.mark.parametrize("stake", [0, 1, True, "0", "01", "-1", "1e6", "NaN", "1.5"])
def test_shared_route_rejects_noncanonical_or_nonpositive_stakes(world, stake):
    client, calls = world
    assert client.post("/api/island/wagers/market", headers=CAP,
                       json=intent(stake=stake)).status_code == 422
    assert calls == []


def test_missing_explicit_economy_is_a_context_error(world):
    client, calls = world
    body = intent()
    del body["economy"]
    response = client.post("/api/island/wagers/market", headers=CAP, json=body)
    assert response.status_code == 409 and calls == []


def test_worker_requires_existing_cron_secret_and_never_takes_a_payout_body(world, monkeypatch):
    client, _ = world

    async def worker(*args):
        return {"considered": 0, "settled": 0, "retried": 0}

    monkeypatch.setattr(island_wager_jobs, "settle_due_jobs", worker)
    path = "/api/internal/island-wagers/settle"
    assert client.post(path).status_code == 401
    headers = {"Authorization": "Bearer cron_not_a_real_secret"}
    assert client.post(path, headers=headers).status_code == 200
    assert client.post(path, headers=headers, json={"payout": 100}).status_code == 422
