"""Sports HTTP/auth/DTO/provider orchestration over a scripted database port.

Actual wallet, cap, race and settlement arithmetic proofs run separately on scratch PostgreSQL.
"""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import Player, unauthorized
from server.sports.service import SportsService
from server.sports.source import SportsSource
from server.tests.helpers import assert_error
from server.tests.test_sports_providers import configured
from server.tests.test_sports_source import clock, upcoming

PLAYER = "00000000-0000-0000-0000-000000000001"
HEADER = {"Authorization": "Bearer local.sports.fixture"}


class Verifier:
    async def verify(self, token):
        if token != "local.sports.fixture":
            raise unauthorized("Unknown test player.")
        return Player(PLAYER)


def fixture_row():
    row = upcoming()
    kickoff = datetime.fromisoformat(row["utcDate"].replace("Z", "+00:00"))
    return {
        "fixture_id": "fd-101",
        "provider": "football-data.org",
        "provider_match_id": 101,
        "sport": "football",
        "competition": row["competition"]["name"],
        "home": row["homeTeam"]["name"],
        "away": row["awayTeam"]["name"],
        "kickoff": kickoff.isoformat(),
        "closes_at": (kickoff - timedelta(hours=1)).isoformat(),
        "status": "open",
        "outcome": None,
        "settlement": None,
    }


def stake_row(number=1, *, pick="home", amount=30, player=PLAYER):
    return {
        "id": number,
        "fixture_id": "fd-101",
        "player_id": player,
        "pick": pick,
        "amount": amount,
        "stake_id": f"sportsuid{number:02}",
        "payout": None,
        "created_at": "2026-11-06T10:00:00Z",
    }


class ScriptedDatabase:
    def __init__(self):
        self.fixtures = []
        self.stakes = []
        self.calls = []
        self.reads = []
        self.reply = {
            "status": "done",
            "id": 1,
            "fixtureId": "fd-101",
            "pick": "home",
            "amount": 30,
            "coins": 970,
            "stakedToday": 30,
        }

    async def select_rows(self, table, query):
        self.reads.append((table, query))
        if table == "wallets":
            return [{"balance": 970}]
        rows = self.fixtures if table == "fixtures" else self.stakes
        for key, expression in query.items():
            if expression.startswith("eq."):
                rows = [row for row in rows if str(row.get(key)) == expression[3:]]
            if expression.startswith("in.("):
                rows = [row for row in rows if str(row.get(key)) in expression[4:-1].split(",")]
        return rows[: int(query.get("limit", "10000"))]

    async def call_function(self, name, params):
        self.calls.append((name, params))
        return self.reply


def make_client(*, enabled=True, final=False, unavailable=False, database=None):
    settings = configured()
    settings.flags["sports"] = enabled
    timer = clock()
    if final:
        timer.now = datetime(2026, 11, 7, 18, tzinfo=UTC)
    row = upcoming()
    if final:
        row["status"] = "FINISHED"
        row["score"]["fullTime"] = {"home": 2, "away": 0}
    seen = []

    def response(request):
        seen.append(request)
        if unavailable:
            return httpx.Response(503)
        return httpx.Response(
            200, json={"matches": [row]} if request.url.path == "/v4/matches" else row
        )

    source = SportsSource(settings, clock=timer, transport=httpx.MockTransport(response))
    database = database or ScriptedDatabase()
    app = create_app(
        settings=settings,
        verifier=Verifier(),
        admin=database,
        sports_service=SportsService(source, clock=timer),
        clock=timer,
    )
    return TestClient(app), database, seen


def test_public_live_board_has_no_player_ids_and_is_cached_with_attribution():
    client, database, _ = make_client()
    answer = client.get("/api/sports")
    assert (
        answer.status_code == 200
        and answer.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    )
    body = answer.json()
    assert body["source"] == "live" and body["fixtures"][0]["canStake"]
    assert body["fixtures"][0]["picks"] == ["home", "draw", "away"]
    assert body["attribution"] and body["simulationNote"]
    assert PLAYER not in answer.text and not database.calls
    assert_error(client.get("/api/sports?player=other"), 422, "validation_error")


def test_feature_off_hides_board_and_writes_and_all_money_routes_require_authentication():
    client, database, seen = make_client(enabled=False)
    assert_error(client.get("/api/sports"), 404, "feature_off")
    assert not seen and not database.calls
    client, _, _ = make_client()
    assert_error(client.get("/api/sports/mine"), 401, "unauthorized")
    assert_error(client.post("/api/sports/stake", json={}), 401, "unauthorized")


@pytest.mark.parametrize("path", ["/api/sports/mine", "/api/sports/stake", "/api/sports/settle"])
def test_player_errors_remain_private_and_uncached(path):
    client, _, _ = make_client()
    response = client.get(path) if path.endswith("mine") else client.post(path, json={})
    assert_error(response, 401, "unauthorized")
    assert response.headers["cache-control"] == "private, no-store"
    if not path.endswith("mine"):
        response = client.post(path, headers=HEADER, json={})
        assert_error(response, 422, "validation_error")
        assert response.headers["cache-control"] == "private, no-store"


def test_new_stake_uses_server_metadata_limits_and_verified_player_only():
    client, database, _ = make_client()
    answer = client.post(
        "/api/sports/stake",
        headers=HEADER,
        json={
            "fixtureId": "fd-101",
            "pick": "home",
            "amount": 30,
            "stakeId": "sportsuid01",
        },
    )
    assert answer.status_code == 200 and answer.json()["coins"] == 970
    assert answer.headers["cache-control"] == "private, no-store"
    name, params = database.calls[0]
    assert name == "sports_place_stake" and params["p_player_id"] == PLAYER
    assert params["p_max_stake"] == 50 and params["p_daily_cap"] == 200
    assert params["p_provider"] == "football-data.org" and params["p_provider_match_id"] == 101
    assert params["p_closes_at"] == "2026-11-07T14:00:00+00:00"
    assert "payout" not in params and len(database.calls) == 1


@pytest.mark.parametrize(
    "change",
    [
        {"amount": True},
        {"amount": 51},
        {"amount": 0},
        {"pick": "drawn"},
        {"outcome": "home"},
        {"playerId": PLAYER},
        {"fixtureId": "https://example.org"},
    ],
)
def test_client_cannot_send_amounts_identities_or_outcomes_outside_the_contract(change):
    client, database, _ = make_client()
    response = client.post(
        "/api/sports/stake",
        headers=HEADER,
        json={
            "fixtureId": "fd-101",
            "pick": "home",
            "amount": 30,
            "stakeId": "sportsuid01",
            **change,
        },
    )
    assert_error(response, 422, "validation_error")
    assert not database.calls


def test_durable_exact_retry_works_without_provider_and_changed_intent_never_debits():
    database = ScriptedDatabase()
    database.stakes = [stake_row()]
    client, _, seen = make_client(database=database, unavailable=True)
    intent = {"fixtureId": "fd-101", "pick": "home", "amount": 30, "stakeId": "sportsuid01"}
    response = client.post("/api/sports/stake", headers=HEADER, json=intent)
    assert response.status_code == 200 and response.json()["repeat"] and not seen
    assert not database.calls
    assert_error(
        client.post("/api/sports/stake", headers=HEADER, json=intent | {"amount": 31}),
        409,
        "stake_id_conflict",
    )
    assert not database.calls and not seen


def test_provider_failure_cannot_create_a_new_stake_or_settlement():
    client, database, _ = make_client(unavailable=True)
    response = client.post(
        "/api/sports/stake",
        headers=HEADER,
        json={
            "fixtureId": "fd-101",
            "pick": "home",
            "amount": 30,
            "stakeId": "sportsuid01",
        },
    )
    assert_error(response, 503, "sports_unavailable")
    assert not database.calls


def test_fresh_final_result_drives_conserved_three_way_plan_without_client_outcome():
    database = ScriptedDatabase()
    database.fixtures = [fixture_row()]
    database.stakes = [
        stake_row(),
        stake_row(2, pick="away", amount=20, player="other"),
        stake_row(3, pick="draw", amount=10, player="third"),
    ]
    database.reply = {
        "status": "done",
        "settlement": "winners",
        "paidPlayers": 1,
        "paidCoins": 59,
        "cutCoins": 1,
        "settledAt": "2026-11-07T18:00:00Z",
    }
    client, _, seen = make_client(database=database, final=True)
    response = client.post("/api/sports/settle", headers=HEADER, json={"fixtureId": "fd-101"})
    assert response.status_code == 200 and response.json()["paidCoins"] == 59
    name, params = database.calls[0]
    assert name == "sports_settle_fixture" and params["p_outcome"] == "home"
    assert params["p_result_status"] == "finished" and params["p_home_score"] == 2
    assert params["p_expected_stakes"] == [1, 2, 3]
    assert params["p_payouts"] == [{"row_id": 1, "player_id": PLAYER, "coins": 59}]
    assert len(seen) == 1 and seen[0].url.path == "/v4/matches/101"
    assert_error(
        client.post(
            "/api/sports/settle", headers=HEADER, json={"fixtureId": "fd-101", "outcome": "away"}
        ),
        422,
        "validation_error",
    )
    assert len(database.calls) == 1


def test_nonfinal_or_future_final_does_not_pay_and_other_players_cannot_settle_a_pool():
    database = ScriptedDatabase()
    database.fixtures, database.stakes = [fixture_row()], [stake_row()]
    client, _, _ = make_client(database=database)
    assert_error(
        client.post("/api/sports/settle", headers=HEADER, json={"fixtureId": "fd-101"}),
        409,
        "result_pending",
    )
    assert not database.calls
    database.stakes = [stake_row(player="other")]
    assert_error(
        client.post("/api/sports/settle", headers=HEADER, json={"fixtureId": "fd-101"}),
        404,
        "no_such_fixture",
    )
    assert not database.calls


class GrowingStakeDatabase(ScriptedDatabase):
    """A concurrent commit appears only in the final own-stake snapshot."""

    def __init__(self, *, initially_empty, missing_fixture=False):
        super().__init__()
        first, second = stake_row(), stake_row(2) | {"fixture_id": "fd-102"}
        self.initial = [] if initially_empty else [first]
        self.stakes = [second] if initially_empty else [first, second]
        self.mine_reads = 0
        self.fixtures = [fixture_row()]
        if not missing_fixture:
            self.fixtures.append(fixture_row() | {"fixture_id": "fd-102", "provider_match_id": 102})

    async def select_rows(self, table, query):
        if table == "sports_stakes" and query.get("order") == "id.desc":
            self.reads.append((table, query))
            self.mine_reads += 1
            return self.initial if self.mine_reads == 1 else self.stakes
        return await super().select_rows(table, query)


@pytest.mark.parametrize("initially_empty", [True, False], ids=("empty-to-one", "new-fixture"))
def test_mine_reads_fixture_metadata_for_the_final_concurrent_stake_snapshot(initially_empty):
    database = GrowingStakeDatabase(initially_empty=initially_empty)
    client, _, _ = make_client(database=database)
    response = client.get("/api/sports/mine", headers=HEADER)
    assert response.status_code == 200
    expected = {"fd-102"} if initially_empty else {"fd-101", "fd-102"}
    assert {row["fixtureId"] for row in response.json()["stakes"]} == expected
    assert database.mine_reads == 2 and not database.calls
    assert response.headers["cache-control"] == "private, no-store"


def test_mine_missing_final_fixture_metadata_is_a_generic_database_error():
    database = GrowingStakeDatabase(initially_empty=True, missing_fixture=True)
    client, _, _ = make_client(database=database)
    response = client.get("/api/sports/mine", headers=HEADER)
    assert_error(response, 502, "database_error")
    assert not database.calls
