"""Attack real FastAPI parsing/auth boundaries using explicit fake transports.

SQL concurrency is tested separately against real migrations, not scripted fakes.
Absent future endpoints are listed in ECONOMY.md rather than counted as passes.
"""

from datetime import timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.tests.account_helpers import (
    OTHER_PLAYER_ID,
    PLAYER_ID,
    RIGHT_HEADER,
    AccountsDatabase,
    make_client,
)
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.tests.story_states import SILENT_TRAPPED
from server.tests.test_intro_route import EntryDatabase
from server.tests.test_market_routes import World

INTENTS = [
    ("POST", "/api/me/name", None),
    ("POST", "/api/me/name/reroll", {"actionUid": "reroll-001"}),
    ("GET", "/api/save", None),
    ("PUT", "/api/save", {"version": 1, "data": {}}),
    ("POST", "/api/intro/complete", {"actions": SILENT_TRAPPED}),
    ("POST", "/api/crews", None),
    ("POST", "/api/crews/join", {"code": "K7QF2M"}),
    ("POST", "/api/crews/me/start", None),
    ("GET", "/api/crews/me", None),
    ("GET", "/api/market/portfolio", None),
    (
        "POST",
        "/api/market/trade",
        {"companyId": "harbor-trust", "side": "buy", "units": 1, "actionUid": "order-001"},
    ),
]


@pytest.mark.parametrize("method,path,body", INTENTS)
@pytest.mark.parametrize("header", [None, "Bearer forged", "Bearer a.b", "Bearer a.b.c.d"])
def test_every_personal_intent_rejects_signed_out_and_forged_tokens(method, path, body, header):
    database = AccountsDatabase()
    client, seen = make_client(database)
    response = client.request(
        method, path, json=body, headers={"Authorization": header} if header else {}
    )
    assert_error(response, 401, "unauthorized")
    assert seen == []


@pytest.mark.parametrize("token", ["a", "a.b", "a.b.c.d", "a" * 4096])
def test_malformed_tokens_are_verified_and_never_accepted_locally(token):
    seen = []

    def reject(request):
        seen.append(request)
        return httpx.Response(401, json={"msg": "invalid JWT"})

    verifier = PlayerVerifier(CONFIGURED_SETTINGS, transport=httpx.MockTransport(reject))
    client = TestClient(create_app(CONFIGURED_SETTINGS, verifier=verifier))
    response = client.get("/api/save", headers={"Authorization": f"Bearer {token}"})
    assert_error(response, 401, "unauthorized")
    assert len(seen) == 1  # actual verification, never local JWT-decoding as authentication


@pytest.mark.parametrize(
    "field,value",
    [
        ("units", True),
        ("units", "5"),
        ("units", 1.5),
        ("units", 0),
        ("units", -1),
        ("units", 100001),
        ("units", 10**100),
        ("units", None),
        ("companyId", "a" * 41),
        ("companyId", {"id": "harbor-trust"}),
        ("side", "close"),
        ("side", -1),
        ("actionUid", "x" * 65),
        ("actionUid", "short"),
        ("actionUid", "bad uid!"),
        ("playerId", OTHER_PLAYER_ID),
        ("price", 0),
        ("fee", -100),
        ("coins", 10**9),
    ],
)
def test_market_intent_rejects_forged_oversized_or_wrong_type_fields(field, value):
    world = World()
    response = world.trade(**{field: value})
    assert_error(response, 422, "validation_error")
    assert world.database.calls("market_trade") == []


def test_unknown_company_and_over_500_purchase_do_not_write():
    world = World()
    assert_error(world.trade(companyId="unknown"), 404, "no_such_company")
    assert_error(world.trade(units=9), 422, "trade_too_big")  # 9 * 60 = 540
    assert world.database.calls("market_trade") == []


def test_trade_rate_limit_resets_after_window_but_not_before():
    world = World()
    for i in range(10):
        assert world.trade(actionUid=f"attempt-{i:02d}").status_code == 200
    refused = world.trade(actionUid="attempt-10")
    assert_error(refused, 429, "too_many_requests")
    assert int(refused.headers["Retry-After"]) >= 1
    world.clock.now += timedelta(seconds=30)
    assert world.trade(actionUid="attempt-11").status_code == 200


@pytest.mark.parametrize(
    "patch",
    [
        {"version": True},
        {"version": -1},
        {"version": 2**31},
        {"version": "1"},
        {"data": []},
        {"data": "x" * 100001},
        {"data": {"x": "x" * 100001}},
        {"playerId": OTHER_PLAYER_ID},
        {"actionUid": "save-001"},
    ],
)
def test_save_size_type_and_identity_forgery_are_refused(patch):
    database = AccountsDatabase()
    database.add_player(PLAYER_ID)
    client, seen = make_client(database)
    response = client.put(
        "/api/save", json={"version": 1, "data": {}, **patch}, headers=RIGHT_HEADER
    )
    assert response.status_code == 422
    assert seen == []
    assert database.saves[PLAYER_ID]["version"] == 1


def test_save_retry_after_name_action_does_not_overwrite_and_other_save_is_hidden():
    database = AccountsDatabase()
    database.add_player(PLAYER_ID, data={"own": True})
    database.add_player(OTHER_PLAYER_ID, data={"private": "other player"})
    client, seen = make_client(database)
    assert (
        client.put(
            "/api/save", json={"version": 1, "data": {"new": True}}, headers=RIGHT_HEADER
        ).status_code
        == 200
    )
    assert client.post("/api/me/name", headers=RIGHT_HEADER).status_code == 200
    assert_error(
        client.put("/api/save", json={"version": 1, "data": {"old": True}}, headers=RIGHT_HEADER),
        409,
        "stale_save",
    )
    response = client.get("/api/save", params={"player_id": OTHER_PLAYER_ID}, headers=RIGHT_HEADER)
    assert response.json()["data"] == {"new": True}
    assert database.saves[OTHER_PLAYER_ID]["data"] == {"private": "other player"}
    assert response.headers["Cache-Control"] == "private, no-store"
    assert all(OTHER_PLAYER_ID not in str(r.url) for r in seen)


def test_name_natural_replay_and_reroll_uid_after_another_request():
    database = AccountsDatabase()
    database.add_player(PLAYER_ID)
    client, _ = make_client(database)
    first = client.post("/api/me/name", headers=RIGHT_HEADER)
    assert client.post("/api/me/name", headers=RIGHT_HEADER).json() == first.json()
    body = {"actionUid": "reroll-001"}
    assert client.post("/api/me/name/reroll", json=body, headers=RIGHT_HEADER).status_code == 200
    client.get("/api/save", headers=RIGHT_HEADER)
    client.app.state.verifier.clock.now += timedelta(seconds=61)
    assert_error(
        client.post("/api/me/name/reroll", json=body, headers=RIGHT_HEADER), 409, "already_applied"
    )


@pytest.mark.parametrize(
    "body",
    [
        {"actions": SILENT_TRAPPED, "coins": 999999},
        {"actions": SILENT_TRAPPED, "playerId": OTHER_PLAYER_ID},
        {"actions": ["x"] * 301},
        {"actions": ["x" * 41]},
        {"actions": [True]},
        {"actions": ["unknown"]},
    ],
)
def test_kit_forgery_and_oversized_logs_cannot_pay(body):
    database = EntryDatabase()
    client, _ = make_client(database)
    response = client.post("/api/intro/complete", json=body, headers=RIGHT_HEADER)
    assert response.status_code == 422
    assert database.calls == [] and database.ledger == []


def test_kit_delayed_replay_returns_stored_kit_and_ledger_total():
    database = EntryDatabase()
    client, _ = make_client(database)
    first = client.post(
        "/api/intro/complete", json={"actions": SILENT_TRAPPED}, headers=RIGHT_HEADER
    )
    client.get("/api/health")
    client.app.state.verifier.clock.now += timedelta(days=2)
    again = client.post(
        "/api/intro/complete", json={"actions": SILENT_TRAPPED}, headers=RIGHT_HEADER
    )
    assert first.json()["coinsPaid"] == 1600
    assert again.json()["coinsPaid"] == 0
    assert database.balances[PLAYER_ID] == sum(row[1] for row in database.ledger) == 1600


@pytest.mark.parametrize("code", ["x" * 21, 123, True, [], {}])
def test_crew_code_input_is_bounded_before_database(code):
    client, seen = make_client(AccountsDatabase())
    response = client.post("/api/crews/join", json={"code": code}, headers=RIGHT_HEADER)
    assert_error(response, 422, "validation_error")
    assert seen == []
