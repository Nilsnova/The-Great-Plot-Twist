"""Actual sports HTTP services and wallet SQL over a disposable Unix-socket database.

The upstream responses are synthetic schema fixtures. Only fixture timestamps are moved to
simulate kickoff; every grant, stake and payout goes through its real API and SQL function.
Opt in with CASE_PG_SCRATCH=1 and pgserver/psycopg test extras. No real key or network is used.
"""

import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from server.routes.sports import router
from server.sports.service import sports_from_settings
from server.tests.story_states import ROUTES
from server.tests.test_sports_source import upcoming
from tools import local_admin
from tools.local_players import PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in scratch SQL"
)


@pytest.mark.parametrize(
    "status,score,expected",
    [
        ("FINISHED", {"home": 2, "away": 0}, (1029, 980, 990)),
        ("POSTPONED", {"home": None, "away": None}, (1000, 1000, 1000)),
    ],
)
def test_actual_sports_api_stakes_and_verified_results_pay_exactly_once(
    monkeypatch, status, score, expected
):
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    # The production local tool stays fail-closed; this test explicitly permits only G15's ports.
    monkeypatch.setattr(local_admin, "TABLES", local_admin.TABLES | {"fixtures", "sports_stakes"})
    monkeypatch.setattr(
        local_admin,
        "FUNCTIONS",
        local_admin.FUNCTIONS
        | {
            "sports_place_stake",
            "sports_settle_fixture",
        },
    )
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    settings = replace(
        app.state.settings,
        demo_mode=False,
        sports_api_provider="football-data.org",
        sports_api_key=SecretStr("synthetic-sports-fixture"),
        flags={**app.state.settings.flags, "sports": True},
    )
    app.state.settings = settings
    row = upcoming()
    kickoff = datetime.now(UTC).replace(microsecond=0) + timedelta(hours=2)
    row["utcDate"] = kickoff.isoformat()
    seen = []

    def provider(request):
        seen.append(request)
        return httpx.Response(
            200, json={"matches": [row]} if "competitions" in request.url.path else row
        )

    app.state.sports = sports_from_settings(settings, transport=httpx.MockTransport(provider))
    app.include_router(router, prefix="/api")
    database = app.state.local_database
    with TestClient(app) as client:
        headers, bodies = [], []
        for index, (pick, amount) in enumerate((("home", 30), ("away", 20), ("draw", 10))):
            login = client.post("/api/local/sign-in", json={"player": PLAYERS[index].name})
            assert login.status_code == 200
            header = {"Authorization": f"Bearer {login.json()['accessToken']}"}
            headers.append(header)
            intro = client.post(
                "/api/intro/complete",
                headers=header,
                json={"actions": next(route.moves for route in ROUTES if route.kit == "witness")},
            )
            assert intro.status_code == 200 and intro.json()["coinsPaid"] == 1000
            body = {
                "fixtureId": "fd-101",
                "pick": pick,
                "amount": amount,
                "stakeId": f"sportsproof{index:02}",
            }
            bodies.append(body)
            answer = client.post("/api/sports/stake", headers=header, json=body)
            assert answer.status_code == 200 and answer.json()["coins"] == 1000 - amount
            repeat = client.post("/api/sports/stake", headers=header, json=body)
            assert repeat.status_code == 200 and repeat.json()["repeat"]
        with database.connect() as connection:
            connection.execute(
                "update public.fixtures set kickoff = kickoff - interval '3 hours', "
                "closes_at = closes_at - interval '3 hours' where fixture_id = 'fd-101'"
            )
        row["utcDate"] = (kickoff - timedelta(hours=3)).isoformat()
        row["status"], row["score"]["fullTime"] = status, score
        settled = client.get("/api/sports/mine", headers=headers[0])
        assert settled.status_code == 200 and settled.json()["coins"] == expected[0]
        assert settled.json()["stakes"][0]["status"] == "settled"
        with database.connect() as connection:
            payments = connection.execute(
                "select count(*), sum(delta) from public.wallet_transactions "
                "where ref = 'sports:pool:fd-101'"
            ).fetchone()
        for index, header in enumerate(headers):
            mine = client.get("/api/sports/mine", headers=header)
            assert mine.status_code == 200 and mine.json()["coins"] == expected[index]
            replay = client.post("/api/sports/stake", headers=header, json=bodies[index])
            assert replay.status_code == 200 and replay.json()["repeat"]
        replay = client.post("/api/sports/settle", headers=headers[0], json={"fixtureId": "fd-101"})
        assert replay.status_code == 200 and replay.json()["repeat"]
        with database.connect() as connection:
            assert (
                connection.execute(
                    "select count(*), sum(delta) from public.wallet_transactions "
                    "where ref = 'sports:pool:fd-101'"
                ).fetchone()
                == payments
            )
            assert connection.execute("select count(*) from public.sports_stakes").fetchone() == (
                3,
            )
            assert connection.execute(
                "select sum(amount), sum(payout) from public.sports_stakes"
            ).fetchone() == (
                60,
                59 if status == "FINISHED" else 60,
            )
        assert all(request.url.host == "api.football-data.org" for request in seen)
    assert database.uri is None
