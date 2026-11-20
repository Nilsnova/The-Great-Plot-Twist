"""HTTP checks for paid structure repair against the T55 canonical state read adapter."""

import json
from dataclasses import replace

from server.errors import ApiError
from server.flags import parse_flags
from server.island.store import Island
from server.island.structure_repair_models import RepairReceipt
from server.routes import structure_repair
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, PLAYER_ID, World

ISLAND = Island(PLAYER_ID, "K7Q2M", 0, 0)
RECEIPT = RepairReceipt.model_validate(
    {
        "actionUid": "repair_123456",
        "spot": "wall_1",
        "instanceId": "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468",
        "kind": "wall",
        "level": 1,
        "chargedPrice": 10,
        "balanceAtCommit": 90,
        "waveId": None,
        "useOrdinal": None,
        "eventSeq": None,
        "repairSeq": 1,
    }
)
STATE = {
    "serverNow": "2026-11-17T12:00:00+00:00",
    "islandEpoch": "dc6f36b8-b7b5-4fd1-b08c-e2f933be10d2",
    "revision": 2,
    "recoveryVersion": 1,
    "waveProtocol": 2,
    "displayPhase": "between_waves",
    "repairWindow": "between_waves",
    "waveId": None,
    "remainingPaidUses": None,
    "structures": [],
}
BODY = {
    "spot": "wall_1",
    "instanceId": str(RECEIPT.instance_id),
    "actionUid": RECEIPT.action_uid,
    "expectedEpoch": STATE["islandEpoch"],
    "expectedWindow": "between_waves",
    "expectedLevel": 1,
    "expectedRepairSeq": 0,
    "quotedPrice": 10,
    "waveProtocol": 2,
}


def off_structure_recovery_settings():
    """Keep core islands open while the new persisted recovery admission stays off."""
    return replace(ISLAND_SETTINGS, flags=parse_flags("islands"))


def test_saved_v1_repair_route_works_while_recovery_admission_flag_is_off(monkeypatch):
    world = World(settings=off_structure_recovery_settings())
    accepted = []

    async def repair(*args):
        accepted.append(args[3])
        return ISLAND, RECEIPT

    async def read_state(*args):
        return STATE

    monkeypatch.setattr("server.island.structure_repair.repair", repair)
    monkeypatch.setattr(structure_repair.structure_recovery, "read_state", read_state)

    response = world.client.post("/api/island/structures/repair", json=BODY, headers=PLAYER)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "receipt": RECEIPT.model_dump(mode="json", by_alias=True),
        "currentState": STATE,
        "coins": 100,
    }
    assert accepted[0].action_uid == BODY["actionUid"]
    assert not world.database.requests or all(
        "/rpc/structure_recovery_read_state" not in request.url.path
        for request in world.database.requests
    )


def test_http_repair_uses_the_real_t55_reader_and_paid_service_with_a_fresh_view():
    world = World(settings=off_structure_recovery_settings())
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID,
        "code": "K7Q2M",
        "wave_best": 0,
        "flags": 0,
    }
    structure = {
        "spot": "wall_1",
        "instanceId": str(RECEIPT.instance_id),
        "kind": "wall",
        "level": 1,
        "hpUnits": 500_000,
        "maxHP": 60,
        "rateUnitsPerSecond": 1.666667,
        "estimatedFreeSeconds": 300,
        "fixedPrice": 10,
        "repairSeq": 0,
    }
    world.database.recovery_state_reply = {
        "status": "ok",
        **STATE,
        "structures": [structure],
    }
    world.database.repair_reply = {
        "status": "done",
        "repeat": False,
        "receipt": RECEIPT.model_dump(mode="json", by_alias=True),
        "balance": 90,
        "event": None,
    }

    response = world.client.post("/api/island/structures/repair", json=BODY, headers=PLAYER)

    assert response.status_code == 200
    assert response.json()["receipt"]["balanceAtCommit"] == 90
    assert response.json()["coins"] == 100
    assert response.json()["currentState"]["structures"] == [structure]
    rpc = next(
        request
        for request in world.database.requests
        if request.url.path.endswith("/rpc/island_structure_repair")
    )
    command = json.loads(rpc.content)
    assert command["p_player_id"] == PLAYER_ID
    assert command["p_quoted_price"] == 10
    assert command["p_request_fingerprint"]
    assert any(
        request.url.path.endswith("/rpc/structure_recovery_read_state")
        for request in world.database.requests
    )


def test_stale_repair_quote_returns_fresh_state_and_current_wallet(monkeypatch):
    world = World(settings=off_structure_recovery_settings())

    async def repair(*args):
        raise ApiError(409, "stale_recovery_quote", "Refresh this repair quote.")

    async def resolve_target(*args):
        return ISLAND

    async def read_state(*args):
        return STATE

    monkeypatch.setattr("server.island.structure_repair.repair", repair)
    monkeypatch.setattr(
        structure_repair.structure_recovery, "resolve_target_island", resolve_target
    )
    monkeypatch.setattr(structure_repair.structure_recovery, "read_state", read_state)

    response = world.client.post("/api/island/structures/repair", json=BODY, headers=PLAYER)

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "stale_recovery_quote",
            "message": "The structure changed. Refresh it and confirm the repair again.",
        },
        "currentState": STATE,
        "coins": 100,
    }
