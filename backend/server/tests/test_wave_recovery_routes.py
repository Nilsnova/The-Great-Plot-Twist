from uuid import UUID

import pytest

from server.island import wave_recovery
from server.island import waves as wave_service
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, World

WAVE = UUID("11111111-1111-4111-8111-111111111111")
TOKEN = UUID("22222222-2222-4222-8222-222222222222")


def test_recovery_transport_routes_are_registered_and_authenticated():
    world = World()
    paths = world.client.get("/api/openapi.json").json()["paths"]
    assert "/api/waves/{wave_id}/inputs" in paths
    assert "/api/waves/{wave_id}/events" in paths
    assert "/api/waves/{wave_id}/health" in paths
    assert_error(
        world.client.get(f"/api/waves/{WAVE}/events"),
        401,
        "unauthorized",
    )


def test_input_route_returns_accepted_events_as_direct_response(monkeypatch):
    world = World()

    async def append(admin, player_id, wave_id, inputs):
        assert player_id
        assert wave_id == WAVE
        assert inputs[0].command == {"type": "captain_move", "x": 1, "z": 2}
        assert inputs[0].tick == 5
        return wave_recovery.RecoveryInputResult(
            accepted=[
                wave_recovery.RecoveryEvent(
                    serverSeq=1,
                    effectiveTick=5,
                    type="captain_input",
                    participantToken=TOKEN,
                    payload={
                        "inputUid": "input_001",
                        "actorCounter": 1,
                        "participantToken": str(TOKEN),
                        "command": {"type": "captain_move", "x": 1, "z": 2},
                        "captain": {"level": 1, "skills": [], "weapon": "musket"},
                    },
                )
            ],
            headSeq=1,
        )

    monkeypatch.setattr(wave_recovery, "append_inputs", append)
    response = world.client.post(
        f"/api/waves/{WAVE}/inputs",
        headers=PLAYER,
        json={
            "waveProtocol": 2,
            "inputs": [
                {
                    "inputUid": "input_001",
                    "actorCounter": 1,
                    "tick": 5,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "accepted": [
            {
                "serverSeq": 1,
                "effectiveTick": 5,
                "type": "captain_input",
                "participantToken": str(TOKEN),
                "payload": {
                    "inputUid": "input_001",
                    "actorCounter": 1,
                    "participantToken": str(TOKEN),
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                    "captain": {"level": 1, "skills": [], "weapon": "musket"},
                },
            }
        ],
        "headSeq": 1,
    }


@pytest.mark.parametrize("wave_protocol", [0, 1, 3, True])
def test_input_route_requires_explicit_protocol2(wave_protocol):
    world = World()
    response = world.client.post(
        f"/api/waves/{WAVE}/inputs",
        headers=PLAYER,
        json={"waveProtocol": wave_protocol, "inputs": []},
    )
    assert response.status_code == 422


def test_protocol2_finish_maps_the_rpc_balance_to_the_legacy_coins_field(monkeypatch):
    world = World()

    async def finish(*args, **kwargs):
        return {
            "loot": 15,
            "balance": 115,
            "waveBest": 1,
            "flags": 1,
            "boss": False,
            "recovery": {
                "waveId": str(WAVE),
                "islandEpoch": "33333333-3333-4333-8333-333333333333",
                "closedAt": "2026-11-17T02:00:00Z",
                "closedHp": {"instance-1": 987654},
                "checkpointUid": "checkpoint_001",
                "throughTick": 30,
                "inputHeadSeq": 4,
                "lastRepairSeq": 1,
                "basisRepairSeq": {"instance-1": 1},
            },
        }

    monkeypatch.setattr(wave_service, "finish_protocol2", finish)
    response = world.finish(
        waveProtocol=2,
        checkpoint={
            "islandEpoch": "33333333-3333-4333-8333-333333333333",
            "checkpointUid": "checkpoint_001",
            "throughTick": 30,
            "inputHeadSeq": 4,
            "lastRepairSeq": 1,
            "basisRepairSeq": {"33333333-3333-4333-8333-333333333333": 1},
            "hpUnits": {"33333333-3333-4333-8333-333333333333": 987654},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["coins"] == 115
    assert response.json()["recovery"]["closedHp"] == {"instance-1": 987654}
