"""The mounted host API uses real scoped SQL and never closes another human's crew."""

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from server.tests.test_local_server_pg import INTRO, request_ok
from tools.local_players import PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL checks"
)


def test_host_overview_cleanup_repeats_and_other_human_guards_use_actual_sql():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    with TestClient(app) as client:
        headers = []
        for player in PLAYERS[:2]:
            login = request_ok(client, "POST", "/api/local/sign-in", json={"player": player.name})
            header = {"Authorization": f"Bearer {login['accessToken']}"}
            headers.append(header)
            request_ok(
                client, "POST", "/api/intro/complete", headers=header, json={"actions": INTRO}
            )
        host, friend = headers
        assert client.get("/api/host/overview").status_code == 403
        assert client.get("/api/host/overview", headers=friend).status_code == 403
        overview = request_ok(client, "GET", "/api/host/overview", headers=host)
        assert overview["players"] == len(PLAYERS)
        probes = {row["name"]: row["objectPresent"] for row in overview["expectedMigrations"]}
        assert probes["20261106160000_festival.sql"]
        assert probes["20261106170000_host_console.sql"]
        first = request_ok(client, "POST", "/api/crews", headers=host)["crew"]
        route = f"/api/host/crews/{first['id']}/close"
        body = {"actionUid": str(uuid4())}
        assert client.post(route, headers=friend, json=body).status_code == 403
        answer = request_ok(client, "POST", route, headers=host, json=body)
        assert answer == {"status": "closed", "crewId": first["id"]}
        assert request_ok(client, "POST", route, headers=host, json=body) == answer
        second = request_ok(client, "POST", "/api/crews", headers=host)["crew"]
        request_ok(client, "POST", "/api/crews/join", headers=friend, json={"code": second["code"]})
        refused = client.post(
            f"/api/host/crews/{second['id']}/close",
            headers=host,
            json={"actionUid": str(uuid4())},
        )
        assert refused.status_code == 409
        assert refused.headers["cache-control"] == "private, no-store"
        with app.state.local_database.connect() as connection:
            assert connection.execute(
                "select count(*) from public.host_console_actions where host_id = %s",
                (PLAYERS[0].id,),
            ).fetchone() == (1,)
            assert connection.execute(
                "select status from public.crews where id = %s", (second["id"],)
            ).fetchone() == ("forming",)
