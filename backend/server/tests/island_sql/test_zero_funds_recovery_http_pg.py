"""Combined zero-budget API journey backed by the actual disposable domain transactions.

The verifier's synthetic Auth response and saved island/market setup are labeled fixtures.
This exercises registered HTTP routes; provider-issued browser acceptance is separate.
"""

from dataclasses import replace
from time import monotonic, sleep

import httpx
import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner  # noqa: E402
from server.tests.island_sql.test_shared_lifecycle_native_sql import native_room  # noqa: E402
from server.tests.zero_funds_recovery import (  # noqa: E402
    CATALOGUE,
    CanonicalAdmin,
    demolished_loss,
    money,
)


def client_for(database, owner, member):
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))
    identities = {"test.zero-owner.signature": owner, "test.zero-member.signature": member}

    def login(request):
        actor = identities.get(request.headers.get("authorization", "").removeprefix("Bearer "))
        return (
            httpx.Response(200, json={"id": str(actor), "is_anonymous": False})
            if actor
            else httpx.Response(401)
        )

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    return TestClient(
        create_app(settings, verifier, CanonicalAdmin(database), weather_source=FakeWeather(CALM))
    )


def test_zero_budget_member_can_start_normal_defense_but_only_owner_can_reset(database):
    prepared, _, _ = demolished_loss(database, ship_ready=False)
    owner, member, _, treasury, code = prepared
    room = native_room(database, prepared=prepared, actors=[member])
    origin = {
        key: treasury["currentEconomy"][key]
        for key in ("mode", "version", "islandOwner", "runEpoch")
    }
    member_headers = {
        "Authorization": "Bearer test.zero-member.signature",
        "X-Island-Economy-Version": "1",
    }
    owner_headers = member_headers | {"Authorization": "Bearer test.zero-owner.signature"}
    reset_body = {
        "economy": origin,
        "actionUid": "zero-http-reset01",
        "confirmCode": f"ISLE-{code}",
    }
    with client_for(database, owner, member) as client:
        before = client.get(f"/api/island/visit/ISLE-{code}", headers=member_headers)
        assert before.status_code == 200, before.text
        snapshot = before.json()
        assert snapshot["economy"]["treasury"]["availableCoins"] == "0"
        assert all(not row["built"] for row in snapshot["spots"])
        assert (
            client.post(
                "/api/island/fresh-start", json=reset_body, headers=member_headers
            ).status_code
            == 403
        )
        started = client.post(
            "/api/waves/start",
            headers=member_headers,
            json={
                "where": f"ISLE-{code}",
                "economy": origin,
                "waveProtocol": 2,
                "sessionId": str(room["sessions"][member]),
                "connectionGeneration": str(room["generations"][member]),
                "actionUid": "zero-http-bell01",
            },
        )
        assert started.status_code == 200, started.text
        wave = started.json()
        assert wave["wave"] == 31 and wave["initialSnapshot"]["structures"] == []
        assert money(database, treasury) == (0, 0, 0)
        blocked = client.post("/api/island/fresh-start", json=reset_body, headers=owner_headers)
        assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "wave_running"
        # Explicit trusted outcome fixture, separate from rendered gameplay/natural defeat.
        as_owner(database)
        limit = monotonic() + wave["countdownSeconds"] + 3
        while True:
            now, starts_at = database.execute(
                "select clock_timestamp(),starts_at from public.wave_runs where id=%s",
                (wave["waveId"],),
            ).fetchone()
            if now >= starts_at:
                break
            assert monotonic() < limit
            sleep(0.02)
        rpc(database, "shared_session_close_locked", wave["waveId"], "lost", Jsonb([]), now)
        confirmed = client.post("/api/island/fresh-start", json=reset_body, headers=owner_headers)
        assert confirmed.status_code == 200, confirmed.text
        replay = client.post("/api/island/fresh-start", json=reset_body, headers=owner_headers)
        assert replay.status_code == 200 and replay.json()["repeat"] is True, replay.text
        assert replay.json()["receipt"] == confirmed.json()["receipt"]
        assert replay.json()["currentEconomy"] is None
        new_account = confirmed.json()["receipt"]["result"]["newAccountId"]
        as_owner(database)
        assert database.execute(
            "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
            (new_account,),
        ).fetchone() == (CATALOGUE.starting_coins, 0)
        assert money(database, treasury) == (0, 0, 0)
        assert new_account != keys(treasury)[0]
