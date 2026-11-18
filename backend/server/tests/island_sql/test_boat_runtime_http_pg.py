"""Actual boat HTTP routes and SQL with verified TEST-ONLY auth/authority providers.

The auth verifier contacts a fixture transport. These are not production login/browser checks.
"""

from dataclasses import replace
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

psycopg = pytest.importorskip("psycopg")
from psycopg import sql  # noqa: E402

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.economy_test_authority import configure_test_authority  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_boat_runtime_sql import (  # noqa: E402,F401
    database as database,
)
from server.tests.island_sql.test_boat_runtime_sql import (  # noqa: E402
    runtime_server as runtime_server,
)
from server.tests.island_sql.test_boat_runtime_sql import (  # noqa: E402
    setup,
)
from server.tests.island_sql.test_island_treasury_sql import as_owner, keys  # noqa: E402


class LocalAdmin:
    """Own scratch SQL through the actual adapter interface, never a configured database."""

    def __init__(self, connection):
        self.connection = connection

    async def call_function(self, name, parameters):
        assert name in {
            "island_economy_context",
            "island_boat_runtime_status",
            "island_legacy_boat_reward",
            "island_shared_boat_start",
            "island_shared_boat_claim",
        }
        fields = sql.SQL(",").join(
            sql.SQL("{}=>%s").format(sql.Identifier(key)) for key in parameters
        )
        statement = sql.SQL("select public.{}({})").format(sql.Identifier(name), fields)
        return self.connection.execute(statement, tuple(parameters.values())).fetchone()[0]

    async def select_rows(self, table, query):
        assert table in {"islands", "island_boat_rounds"}
        columns = query["select"].split(",")
        filters = [
            (field, value[3:]) for field, value in query.items() if field not in {"select", "limit"}
        ]
        assert all(
            value.startswith("eq.")
            for key, value in query.items()
            if key not in {"select", "limit"}
        )
        statement = sql.SQL("select {} from public.{} where {} limit %s").format(
            sql.SQL(",").join(map(sql.Identifier, columns)),
            sql.Identifier(table),
            sql.SQL(" and ").join(
                sql.SQL("{}=%s").format(sql.Identifier(key)) for key, _ in filters
            ),
        )
        rows = self.connection.execute(statement, (*[value for _, value in filters], 1)).fetchall()
        return [
            {
                key: str(value) if isinstance(value, UUID) else value
                for key, value in zip(columns, row, strict=True)
            }
            for row in rows
        ]


def client_for(connection, actors):
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands"))

    def login(request):
        token = request.headers["authorization"].removeprefix("Bearer ")
        actor = actors.get(token)
        return (
            httpx.Response(200, json={"id": str(actor), "is_anonymous": False})
            if actor
            else httpx.Response(401)
        )

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    return TestClient(
        create_app(settings, verifier, LocalAdmin(connection), weather_source=FakeWeather(CALM))
    )


def context(initial):
    return {
        name: initial["currentEconomy"][name]
        for name in ("mode", "version", "islandOwner", "runEpoch")
    }


def test_real_http_shared_status_start_zero_claim_and_historical_receipt(database):
    owner, member, _, initial = setup(database, admitted=True)
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    headers = {"Authorization": "Bearer test.member.signature", "X-Island-Economy-Version": "1"}
    with client_for(database, {"test.member.signature": member}) as client:
        status = client.get(f"/api/island/boat?code=ISLE-{code}", headers=headers)
        assert status.status_code == 200, status.text
        assert status.json()["rewardScope"] == "island"
        body = {"economy": context(initial), "game": "dash", "actionUid": "httpstart1"}
        started = client.post("/api/island/boat/start", json=body, headers=headers)
        assert started.status_code == 200, started.text
        claim = {
            "economy": context(initial),
            "roundId": started.json()["receipt"]["result"]["round"]["id"],
            "stars": 0,
            "actionUid": "httpclaim1",
        }
        done = client.post("/api/island/boat/claim", json=claim, headers=headers)
        assert done.status_code == 200, done.text
        assert done.json()["receipt"]["result"]["coins"] == "0"
        as_owner(database)
        database.execute(
            "update public.island_members set left_at=clock_timestamp() "
            "where island_owner=%s and player_id=%s",
            (owner, member),
        )
        replay = client.post("/api/island/boat/claim", json=claim, headers=headers)
        assert replay.status_code == 200 and replay.json()["receipt"] == done.json()["receipt"]
        assert replay.json()["currentEconomy"] is None


def test_http_capability_auth_strict_intent_and_legacy_fallback_guards(database):
    owner, member, outsider, initial = setup(database, admitted=True)
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    body = {"economy": context(initial), "game": "dash", "actionUid": "httpstart1"}
    auth = {"Authorization": "Bearer test.member.signature"}
    with client_for(
        database, {"test.member.signature": member, "test.out.signature": outsider}
    ) as client:
        assert client.post("/api/island/boat/start", json=body).status_code == 401
        assert (
            client.post("/api/island/boat/start", json=body, headers=auth).json()["error"]["code"]
            == "economy_context_required"
        )
        assert client.get(f"/api/island/boat?code=ISLE-{code}", headers=auth).status_code == 409
        headers = {**auth, "X-Island-Economy-Version": "1"}
        forged = {**body, "actorId": str(owner)}
        assert (
            client.post("/api/island/boat/start", json=forged, headers=headers).status_code == 422
        )
        account = {**body, "economy": {**body["economy"], "accountId": keys(initial)[0]}}
        assert (
            client.post("/api/island/boat/start", json=account, headers=headers).status_code == 422
        )
        outsider_headers = {**headers, "Authorization": "Bearer test.out.signature"}
        assert (
            client.post("/api/island/boat/start", json=body, headers=outsider_headers).status_code
            == 403
        )
        legacy = client.post(
            "/api/island/boat",
            json={"game": "dash", "stars": 3, "code": f"ISLE-{code}"},
            headers=auth,
        )
        assert (
            legacy.status_code == 409
            and legacy.json()["error"]["code"] == "economy_context_required"
        )


def test_bell_during_completion_refuses_without_consuming_uid_and_same_score_can_retry(database):
    owner, member, _, initial = setup(database, admitted=True)
    headers = {"Authorization": "Bearer test.member.signature", "X-Island-Economy-Version": "1"}
    with client_for(database, {"test.member.signature": member}) as client:
        started = client.post(
            "/api/island/boat/start",
            headers=headers,
            json={
                "economy": context(initial),
                "game": "dash",
                "actionUid": "phasestart1",
            },
        )
        assert started.status_code == 200
        claim = {
            "economy": context(initial),
            "roundId": started.json()["receipt"]["result"]["round"]["id"],
            "stars": 2,
            "actionUid": "phaseclaim1",
        }
        configure_test_authority(database, member, owner, reservation_id=UUID(int=100))
        refused = client.post("/api/island/boat/claim", headers=headers, json=claim)
        assert refused.status_code == 409 and refused.json()["error"]["code"] == "wave_running"
        assert (
            database.execute(
                "select count(*) from public.island_economy_operations "
                "where actor_id=%s and action_uid='phaseclaim1'",
                (member,),
            ).fetchone()[0]
            == 0
        )
        configure_test_authority(database, member, owner)
        done = client.post("/api/island/boat/claim", headers=headers, json=claim)
        assert done.status_code == 200 and done.json()["receipt"]["result"]["coins"] == "24"


def test_missing_capability_is_refused_even_when_shared_authority_is_not_installed(database):
    owner, member, _, _ = setup(database, admitted=True)
    code = database.execute(
        "select code from public.islands where player_id=%s", (owner,)
    ).fetchone()[0]
    database.execute("drop function public.island_economy_authority(uuid,uuid)")
    with client_for(database, {"test.member.signature": member}) as client:
        response = client.get(
            f"/api/island/boat?code=ISLE-{code}",
            headers={
                "Authorization": "Bearer test.member.signature",
            },
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "economy_context_required"
