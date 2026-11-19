"""Request preparation around the paid SQL transaction; database effects are mocked here.

Real wallet, quota, health and event atomicity belong to the disposable PostgreSQL SQL suite.
Used by: pytest in backend/server/tests/.
"""

import asyncio

from server.island.catalogue import load_island
from server.island.store import Island
from server.island.structure_repair import repair
from server.island.structure_repair_models import RepairRequest
from server.island.structure_repair_rules import request_intent_fingerprint

PLAYER_ID = "e8d91e44-6b1d-4655-b09e-f3569491be53"
OWNER_ID = "b235ba34-7de5-4a17-a993-cb4b52a6a6c4"
INSTANCE_ID = "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468"
EPOCH = "dc6f36b8-b7b5-4fd1-b08c-e2f933be10d2"
WAVE_ID = "25126b41-cff8-4f53-b4bd-526849dd9ee0"
OTHER_WAVE_ID = "a77acdb0-717d-4903-bcb5-b7b409fdd40d"


def request(**changes) -> RepairRequest:
    body = {
        "spot": "cannon_11",
        "instanceId": INSTANCE_ID,
        "actionUid": "repair_123456",
        "expectedEpoch": EPOCH,
        "expectedWindow": "reserved_wave",
        "expectedWaveId": WAVE_ID,
        "expectedLevel": 2,
        "expectedRepairSeq": 4,
        "quotedPrice": 60,
        "waveProtocol": 2,
    }
    body.update(changes)
    return RepairRequest.model_validate(body)


def receipt(**changes):
    value = {
        "actionUid": "repair_123456",
        "spot": "cannon_11",
        "instanceId": INSTANCE_ID,
        "kind": "cannon",
        "level": 2,
        "chargedPrice": 60,
        "balanceAtCommit": 40,
        "waveId": WAVE_ID,
        "useOrdinal": 1,
        "eventSeq": 11,
        "repairSeq": 5,
    }
    value.update(changes)
    return value


class FakeAdmin:
    def __init__(self, rows=None, order=None):
        self.rows = rows or []
        self.calls = []
        self.reads = []
        self.order = order

    async def select_rows(self, table, query):
        self.reads.append((table, query))
        if self.order is not None:
            self.order.append("uid_lookup")
        return self.rows

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        return {
            "status": "done",
            "repeat": False,
            "receipt": receipt(),
            "balance": 40,
            "event": None,
        }


def test_new_coop_repair_needs_no_join_token_and_uses_server_state(monkeypatch):
    order = []
    admin = FakeAdmin(order=order)
    island = Island(OWNER_ID, "K7Q2M", 0, 0)

    async def resolve_target(*args):
        order.append("permission")
        return island

    async def read_state(*args):
        order.append("state")
        return {
            "structures": [
                {
                    "spot": "cannon_11",
                    "instanceId": INSTANCE_ID,
                    "kind": "cannon",
                    "level": 2,
                    "fixedPrice": 60,
                    "repairSeq": 4,
                }
            ]
        }

    monkeypatch.setattr(
        "server.island.structure_repair.structure_recovery.resolve_target_island", resolve_target
    )
    result = asyncio.run(repair(admin, load_island(), PLAYER_ID, request(), read_state))

    assert order == ["permission", "uid_lookup", "state"]
    assert result[0] == island
    assert result[1].balance_at_commit == 40
    rpc_name, arguments = admin.calls[0]
    assert rpc_name == "island_structure_repair"
    assert arguments["p_island_owner"] == OWNER_ID
    assert arguments["p_request_fingerprint"]
    assert arguments["p_prices"]["cannon"] == [30, 60, 120, 240, 480]
    assert "p_participant_token" not in arguments


def test_old_uid_retry_uses_immutable_receipt_without_reading_current_target(monkeypatch):
    retry_request = request(expectedWaveId=OTHER_WAVE_ID, expectedRepairSeq=8)
    old_fingerprint = request_intent_fingerprint(OWNER_ID, "cannon", retry_request)
    admin = FakeAdmin(
        rows=[
            {
                "payer_id": PLAYER_ID,
                "action_uid": "repair_123456",
                "island_owner": OWNER_ID,
                "reset_epoch": EPOCH,
                "instance_id": INSTANCE_ID,
                "spot": "cannon_11",
                "building_kind": "cannon",
                "level": 2,
                "charged_price": 60,
                "request_fingerprint": old_fingerprint,
            }
        ],
        order=[],
    )
    island = Island(OWNER_ID, "K7Q2M", 0, 0)
    state_calls = []

    async def resolve_target(*args):
        admin.order.append("permission")
        return island

    async def read_state(*args):
        state_calls.append(args)
        raise AssertionError("a receipt retry must not depend on current target health")

    monkeypatch.setattr(
        "server.island.structure_repair.structure_recovery.resolve_target_island", resolve_target
    )
    result = asyncio.run(
        repair(
            admin,
            load_island(),
            PLAYER_ID,
            retry_request,
            read_state,
        )
    )

    assert result[1].repair_seq == 5
    assert state_calls == []
    assert admin.order == ["permission", "uid_lookup"]
    assert admin.calls[0][1]["p_request_fingerprint"] == old_fingerprint
