"""TestClient to real festival/A7 SQL in a disposable database, without live credentials."""

import os

import pytest
from fastapi.testclient import TestClient

from server.festival.content import LAMP_IDS
from tools.local_players import PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in scratch SQL"
)


def okay(client, method, path, **kwargs):
    response = client.request(method, path, **kwargs)
    assert response.status_code == 200
    return response.json()


def test_real_api_claims_pairing_replay_expiry_and_sealed_duel_access():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    from dataclasses import replace

    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    app.state.settings = replace(
        app.state.settings, flags={**app.state.settings.flags, "festival": True, "arena": True}
    )
    headers = [{"Authorization": f"Bearer {player.token}"} for player in PLAYERS]
    with TestClient(app) as client:
        database = app.state.local_database
        with database.connect() as connection:
            connection.execute(
                "update public.world_state set stage = 'relit', "
                "relit_at = clock_timestamp() - interval '1 hour', solves = 4, extra_lights = 3"
            )
        public = okay(client, "GET", "/api/festival")
        assert public["phase"] == "active" and len(public["lamps"]) == 12
        assert sum(lamp["lit"] for lamp in public["lamps"]) == 3
        first = okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[0],
            json={"lampId": LAMP_IDS[0], "actionUid": "claim001"},
        )
        assert first["accepted"] and first["status"] == "claimed"
        retry = okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[0],
            json={"lampId": LAMP_IDS[1], "actionUid": "claim001"},
        )
        assert retry["repeat"] and not retry["festival"]["lamps"][1]["claimed"]
        occupied = okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[1],
            json={"lampId": LAMP_IDS[0], "actionUid": "claim002"},
        )
        assert not occupied["accepted"] and occupied["reason"] == "lamp_occupied"
        # One captain may reserve several lamps, without changing the solve-owned light count.
        assert okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[0],
            json={"lampId": LAMP_IDS[1], "actionUid": "claim003"},
        )["accepted"]
        queued = okay(
            client,
            "POST",
            "/api/festival/ring/join",
            headers=headers[0],
            json={"signals": ["flash", "shade", "shade"], "actionUid": "ring0001"},
        )
        assert queued["status"] == "queued" and queued["festival"]["ring"]["queued"]
        with database.connect() as connection:
            assert connection.execute("select count(*) from public.duels").fetchone() == (0,)
        paired = okay(
            client,
            "POST",
            "/api/festival/ring/join",
            headers=headers[1],
            json={"signals": ["mirror", "shade", "shade"], "actionUid": "ring0002"},
        )
        assert paired["status"] == "paired" and paired["duelId"]
        duel_id = paired["duelId"]
        # Replay keeps the queued receipt and current paired view, despite an oil-invalid body.
        old = okay(
            client,
            "POST",
            "/api/festival/ring/join",
            headers=headers[0],
            json={"signals": ["flash"] * 3, "actionUid": "ring0001"},
        )
        assert old["repeat"] and old["status"] == "queued"
        assert old["festival"]["ring"]["duelId"] == duel_id
        again = okay(
            client,
            "POST",
            "/api/festival/ring/join",
            headers=headers[1],
            json={"signals": ["shade"] * 3, "actionUid": "ring0002"},
        )
        assert again["repeat"] and again["duelId"] == duel_id
        detail = okay(client, "GET", f"/api/duels/{duel_id}", headers=headers[0])
        assert detail["duel"]["status"] == "finished" and detail["duel"]["stake"] == 0
        assert len(detail["duel"]["reveal"]) == 3
        assert client.get(f"/api/duels/{duel_id}", headers=headers[2]).status_code == 404
        for header in headers[:2]:
            response = client.get("/api/festival", headers=header)
            assert response.headers["cache-control"] == "private, no-store"
            assert "signals" not in response.text and PLAYERS[0].id not in response.text
        with database.connect() as connection:
            assert connection.execute("select count(*) from public.duels").fetchone() == (1,)
            assert connection.execute("select count(*) from public.duel_moves").fetchone() == (6,)
            assert connection.execute(
                "select count(*) from public.wallet_transactions"
            ).fetchone() == (0,)
            assert connection.execute("select extra_lights from public.world_state").fetchone() == (
                3,
            )
            connection.execute(
                "update public.world_state set relit_at = clock_timestamp() - interval '48 hours'"
            )
        ended = okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[2],
            json={"lampId": LAMP_IDS[2], "actionUid": "claim004"},
        )
        assert not ended["accepted"] and ended["reason"] == "festival_ended"
        assert ended["festival"]["remainingSeconds"] == 0
        assert not any(lamp["claimed"] for lamp in ended["festival"]["lamps"])
        assert okay(
            client,
            "POST",
            "/api/festival/claim",
            headers=headers[0],
            json={"lampId": LAMP_IDS[2], "actionUid": "claim001"},
        )["repeat"]
