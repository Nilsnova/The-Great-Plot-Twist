"""The shared structure state route resolves island ownership before reading recovery state."""

from dataclasses import replace

from server.flags import parse_flags
from server.island import rules
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FRIEND_ID,
    GUEST,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    World,
)

VIEW = {
    "status": "ok",
    "serverNow": "2026-11-17T12:00:00+00:00",
    "islandEpoch": "77777777-2222-4333-8444-555555555555",
    "revision": 4,
    "recoveryVersion": 1,
    "waveProtocol": 2,
    "displayPhase": "between_waves",
    "repairWindow": "between_waves",
    "waveId": None,
    "remainingPaidUses": None,
    "structures": [
        {
            "spot": "wall_1",
            "instanceId": "88888888-2222-4333-8444-555555555555",
            "kind": "wall",
            "level": 1,
            "hpUnits": 500000,
            "maxHP": 60,
            "rateUnitsPerSecond": 1666.6667,
            "estimatedFreeSeconds": 300,
            "fixedPrice": 10,
            "repairSeq": 0,
        }
    ],
}


def test_owned_structure_state_uses_canonical_wire_fields_without_wallet() -> None:
    world = World()
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID,
        "code": "K7Q2M",
        "wave_best": 0,
        "flags": 0,
    }
    world.database.recovery_state_reply = VIEW

    response = world.client.get("/api/island/structures", headers=PLAYER)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert list(body) == [
        "serverNow",
        "islandEpoch",
        "revision",
        "recoveryVersion",
        "waveProtocol",
        "displayPhase",
        "repairWindow",
        "waveId",
        "remainingPaidUses",
        "structures",
    ]
    assert body["structures"][0] == {
        key: value for key, value in VIEW["structures"][0].items()
    }
    assert "coins" not in body
    assert world.database.calls("structure_recovery_read_state") == [
        {"p_island_owner": PLAYER_ID, "p_prices": rules.price_table(world.app.state.island)}
    ]


def test_member_can_read_a_shared_island_but_outsider_cannot() -> None:
    world = World()
    world.database.islands["K7Q2M"] = {
        "player_id": FRIEND_ID,
        "code": "K7Q2M",
        "wave_best": 0,
        "flags": 0,
    }
    world.database.recovery_state_reply = VIEW
    world.database.games.add(FRIEND_ID, PLAYER_ID)

    allowed = world.client.get("/api/island/structures?code=ISLE-K7Q2M", headers=PLAYER)
    outsider = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))
    outsider.database.islands["K7Q2M"] = world.database.islands["K7Q2M"]
    denied = outsider.client.get("/api/island/structures?code=ISLE-K7Q2M", headers=GUEST)

    assert allowed.status_code == 200, allowed.text
    assert world.database.calls("structure_recovery_read_state") == [
        {"p_island_owner": FRIEND_ID, "p_prices": rules.price_table(world.app.state.island)}
    ]
    assert_error(denied, 403, "not_member")
    assert outsider.database.calls("structure_recovery_read_state") == []


def test_legacy_island_is_not_reinterpreted_as_recovery_v1() -> None:
    world = World()
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID,
        "code": "K7Q2M",
        "wave_best": 0,
        "flags": 0,
    }
    world.database.recovery_state_reply = {"status": "legacy", "recoveryVersion": 0}

    response = world.client.get("/api/island/structures", headers=PLAYER)

    assert_error(response, 404, "feature_off")
