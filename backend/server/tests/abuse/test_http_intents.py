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
from server.tests.market_world import (
    BASE_PRICES,
    POSITION_ID,
    World,
    position_row,
)
from server.tests.market_world import (
    OTHER_PLAYER_ID as OTHER_MARKET_PLAYER_ID,
)
from server.tests.market_world import (
    PLAYER_ID as MARKET_PLAYER_ID,
)
from server.tests.story_states import SILENT_TRAPPED
from server.tests.test_intro_route import EntryDatabase

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
        "/api/market/open",
        {"companyId": "harbor-trust", "side": "rising", "stake": 100, "actionUid": "order-001"},
    ),
    ("POST", "/api/market/close", {"positionId": POSITION_ID, "actionUid": "close-001"}),
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


@pytest.mark.parametrize(
    "token,upstream_calls",
    [
        pytest.param("a", 0, id="one-part"),
        pytest.param("a.b", 0, id="two-parts"),
        pytest.param("a.b.c.d", 0, id="four-parts"),
        pytest.param("a" * 4096, 0, id="bounded-malformed"),
        pytest.param("a.b.c", 1, id="forged-three-parts"),
        pytest.param("a" * 4092 + ".b.c", 1, id="forged-at-length-boundary"),
    ],
)
def test_bad_shapes_stop_locally_and_forged_tokens_need_upstream_verification(
    token, upstream_calls
):
    seen = []

    def reject(request):
        seen.append(request)
        return httpx.Response(401, json={"msg": "invalid JWT"})

    verifier = PlayerVerifier(CONFIGURED_SETTINGS, transport=httpx.MockTransport(reject))
    client = TestClient(create_app(CONFIGURED_SETTINGS, verifier=verifier))
    response = client.get("/api/save", headers={"Authorization": f"Bearer {token}"})
    assert_error(response, 401, "unauthorized")
    assert len(seen) == upstream_calls  # Valid shape still needs real authentication.


@pytest.mark.parametrize(
    "field,value",
    [
        ("stake", True),
        ("stake", "100"),
        ("stake", 100.5),
        ("stake", 0),
        ("stake", -1),
        ("stake", 1000001),
        ("stake", 10**100),
        ("stake", None),
        ("companyId", "a" * 41),
        ("companyId", {"id": "harbor-trust"}),
        ("side", "buy"),
        ("side", "close"),
        ("side", -1),
        ("actionUid", "x" * 65),
        ("actionUid", "short"),
        ("actionUid", "bad uid!"),
        ("playerId", OTHER_PLAYER_ID),
        ("price", 0),
        ("entryPrice", 1),
        ("fee", -100),
        ("coins", 10**9),
        ("units", 1),
    ],
)
def test_open_rejects_forged_oversized_or_wrong_type_fields_before_database(field, value):
    world = World()
    response = world.open(**{field: value})
    assert_error(response, 422, "validation_error")
    assert world.database.requests == []
    assert world.binance.requests == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("positionId", True),
        ("positionId", 1),
        ("positionId", "not-a-uuid"),
        ("positionId", "x" * 10000),
        ("positionId", {"id": POSITION_ID}),
        ("positionId", None),
        ("actionUid", "x" * 65),
        ("actionUid", "short"),
        ("actionUid", "bad uid!"),
        ("playerId", OTHER_PLAYER_ID),
        ("companyId", "harbor-trust"),
        ("side", "rising"),
        ("stake", 100),
        ("price", 1),
        ("closePrice", 1),
        ("value", 1000000),
        ("fee", -100),
        ("coins", 10**9),
    ],
)
def test_close_rejects_forged_oversized_or_wrong_type_fields_before_database(field, value):
    world = World()
    response = world.close(**{field: value})
    assert_error(response, 422, "validation_error")
    assert world.database.requests == []
    assert world.binance.requests == []


@pytest.mark.parametrize(
    "stake,reason", [(1, "stake_too_small"), (9, "stake_too_small"), (501, "stake_too_big")]
)
def test_stakes_outside_actual_10_to_500_rule_do_not_write(stake, reason):
    world = World()
    assert_error(world.open(stake=stake), 422, reason)
    assert world.database.calls("exchange_open_position") == []
    assert not any(request.method == "POST" for request in world.database.requests)


def test_unknown_company_does_not_write():
    world = World()
    assert_error(world.open(companyId="unknown"), 404, "no_such_company")
    assert not any(request.method == "POST" for request in world.database.requests)


def test_successful_open_and_close_send_verified_identity_and_server_computed_coins():
    world = World()
    world.database.positions = [position_row()]
    assert world.open(actionUid="open-auth-001").status_code == 200
    opening = world.database.calls("exchange_open_position")[0]
    assert opening["p_player_id"] == MARKET_PLAYER_ID
    assert opening["p_entry_price"] == BASE_PRICES["BTCUSDT"]
    assert (opening["p_stake"], opening["p_fee"], opening["p_leverage"]) == (100, 2, 10)
    assert opening["p_ref"] == "market:open:open-auth-001"

    assert world.close(actionUid="close-auth-001").status_code == 200
    closing = world.database.calls("exchange_close_position")[0]
    assert closing["p_player_id"] == MARKET_PLAYER_ID
    assert closing["p_position_id"] == POSITION_ID
    assert closing["p_close_price"] == BASE_PRICES["BTCUSDT"]
    assert (closing["p_value"], closing["p_fee"]) == (115, 2)
    assert closing["p_ref"] == "market:close:close-auth-001"


def test_another_players_position_is_hidden_and_cannot_be_closed():
    world = World()
    world.database.positions = [position_row(player_id=OTHER_MARKET_PLAYER_ID)]
    assert_error(world.close(), 404, "no_such_position")
    assert world.database.calls("exchange_close_position") == []
    assert world.database.reads("exchange_positions")
    assert all(
        request.url.params["player_id"] == f"eq.{MARKET_PLAYER_ID}"
        for request in world.database.reads("exchange_positions")
    )


@pytest.mark.parametrize("intent", ["open", "close"])
def test_delayed_exchange_replay_checks_history_before_price_or_position(intent):
    world = World()
    world.database.known_refs.add((MARKET_PLAYER_ID, f"market:{intent}:retry-001"))
    world.advance(61)  # auth cache has expired, and the old action is still remembered in SQL
    world.binance_down()
    response = getattr(world, intent)(actionUid="retry-001")
    assert_error(response, 409, "already_applied")
    assert world.database.calls(f"exchange_{intent}_position") == []
    assert world.database.reads("exchange_positions") == []
    assert world.binance.requests == []
    assert all(
        request.url.params["player_id"] == f"eq.{MARKET_PLAYER_ID}"
        for request in world.database.reads("exchange_events")
    )


def test_open_and_close_share_the_rate_limit_and_reset_only_at_the_window_boundary():
    world = World()
    for i in range(10):
        # Unknown targets consume the real limiter without a scripted successful SQL trade.
        response = (
            world.open(companyId="unknown", actionUid=f"attempt-{i:02d}")
            if i % 2 == 0
            else world.close(actionUid=f"attempt-{i:02d}")
        )
        assert response.status_code == 404
    refused = world.open(companyId="unknown", actionUid="attempt-10")
    assert_error(refused, 429, "too_many_requests")
    assert int(refused.headers["Retry-After"]) >= 1
    world.advance(29)
    assert_error(world.close(actionUid="attempt-11"), 429, "too_many_requests")
    world.advance(1)
    assert_error(world.open(companyId="unknown", actionUid="attempt-12"), 404, "no_such_company")
    assert_error(world.close(actionUid="attempt-13"), 404, "no_such_position")
    assert not any(request.method == "POST" for request in world.database.requests)


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
