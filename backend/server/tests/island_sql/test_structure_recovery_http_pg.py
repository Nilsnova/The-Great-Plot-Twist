"""A real paid-repair HTTP request through FastAPI and the disposable recovery database.

This is a first API integration slice. The companion lifecycle assertions will be added once the
T55 reservation RPC and its routes have landed on this branch.
"""

from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

psycopg = pytest.importorskip("psycopg")

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_sql.test_structure_repair_sql import (  # noqa: E402
    ISLAND_CODE,
    MEMBER,
    OWNER,
    balance,
    hp,
    instance,
    seed_recovery,
)
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402

TOKENS = {
    "owner": str(OWNER),
    "member": str(MEMBER),
}
HEADERS = {
    name: {"Authorization": f"Bearer test.{name}.signature"}
    for name in TOKENS
}


def test_member_paid_repair_http_receipt_matches_committed_database_state(database):
    epoch, wave_id = seed_recovery(database, active=True)
    settings = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands,structure_recovery"))

    def login(request: httpx.Request) -> httpx.Response:
        token = request.headers["authorization"].removeprefix("Bearer ")
        who = token.removeprefix("test.").removesuffix(".signature")
        player_id = TOKENS.get(who)
        if player_id is None:
            return httpx.Response(401, json={"message": "bad token"})
        return httpx.Response(200, json={"id": player_id, "is_anonymous": False})

    verifier = PlayerVerifier(
        settings,
        transport=httpx.MockTransport(login),
        clock=FakeClock(),
    )
    app = create_app(settings, verifier, ScratchRecoveryAdmin(database))

    with TestClient(app) as client:
        state_response = client.get(
            f"/api/island/structures?code=ISLE-{ISLAND_CODE}", headers=HEADERS["member"]
        )
        assert state_response.status_code == 200, state_response.text
        state = state_response.json()
        structure = state["structures"][0]
        assert structure["spot"] == "wall_1"
        assert structure["hpUnits"] == 500_000
        assert state["repairWindow"] == "reserved_wave"
        assert state["waveId"] == str(wave_id)

        before = balance(database, MEMBER)
        repair_response = client.post(
            "/api/island/structures/repair",
            headers=HEADERS["member"],
            json={
                "code": f"ISLE-{ISLAND_CODE}",
                "spot": structure["spot"],
                "instanceId": structure["instanceId"],
                "actionUid": "api-repair-0001",
                "expectedEpoch": str(epoch),
                "expectedWindow": "reserved_wave",
                "expectedWaveId": str(wave_id),
                "expectedLevel": structure["level"],
                "expectedRepairSeq": structure["repairSeq"],
                "quotedPrice": structure["fixedPrice"],
                "waveProtocol": 2,
            },
        )
        assert repair_response.status_code == 200, repair_response.text
        body = repair_response.json()
        assert body["receipt"]["actionUid"] == "api-repair-0001"
        assert body["receipt"]["chargedPrice"] == 10
        assert body["receipt"]["balanceAtCommit"] == before - 10
        assert body["receipt"]["useOrdinal"] == 1
        assert body["receipt"]["waveId"] == str(wave_id)
        assert body["coins"] == before - 10
        assert body["currentState"]["structures"][0]["hpUnits"] == 1_000_000

    assert hp(database) == (1_000_000, 1)
    assert balance(database, MEMBER) == before - 10
    assert database.execute(
        "select paid_used from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone() == (1,)
    assert database.execute(
        "select seq,event_kind from public.recovery_wave_events "
        "where wave_id=%s order by seq",
        (wave_id,),
    ).fetchall() == [(1, "structure_repaired")]
    assert database.execute(
        "select instance_id from public.structure_repair_receipts "
        "where payer_id=%s and action_uid=%s",
        (MEMBER, "api-repair-0001"),
    ).fetchone() == (instance(database),)
