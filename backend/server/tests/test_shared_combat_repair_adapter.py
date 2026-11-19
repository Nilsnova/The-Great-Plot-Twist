"""Strict adapters for real shared-repair RPCs; all database replies here are fixtures."""

import asyncio
from uuid import UUID

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island.shared_combat_repair import (
    SharedRepairRequest,
    read_reply,
    repair_shared,
    require_shared_revival,
)
from server.supabase_admin import SupabaseRejected

OWNER = str(UUID(int=961))
ACTOR = str(UUID(int=962))
EPOCH = str(UUID(int=999))


def request(**changes):
    value = {
        "economy": {"mode": "island_shared", "version": 1, "islandOwner": OWNER, "runEpoch": EPOCH},
        "spot": "wall_1",
        "instanceId": str(UUID(int=3)),
        "actionUid": "repair-0001",
        "expectedEpoch": str(UUID(int=964)),
        "expectedWindow": "reserved_wave",
        "expectedWaveId": str(UUID(int=965)),
        "expectedLevel": 1,
        "expectedRepairSeq": 0,
        "quotedPrice": 10,
        "waveProtocol": 2,
    }
    value.update(changes)
    return SharedRepairRequest.model_validate(value)


class UnavailableAdmin:
    def __init__(self):
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        if name == "island_shared_repair_replay":
            return None
        return {"status": "refused", "reason": "path_unavailable"}


def test_unavailable_shared_path_never_calls_legacy_repair_or_private_wallet():
    admin = UnavailableAdmin()
    with pytest.raises(ApiError) as caught:
        asyncio.run(repair_shared(admin, ACTOR, request()))
    assert caught.value.code == "economy_path_unavailable"
    assert [name for name, _ in admin.calls] == [
        "island_shared_repair_replay",
        "island_economy_context",
    ]


def test_wire_does_not_accept_a_client_selected_payer_account_or_hp():
    with pytest.raises(ValidationError):
        request(accountId=str(UUID(int=8)), hpUnits=1_000_000)


def test_revival_dependency_cannot_fall_back_to_a_paid_legacy_rpc():
    admin = UnavailableAdmin()
    with pytest.raises(ApiError):
        asyncio.run(require_shared_revival(admin, ACTOR, request().economy))
    assert [name for name, _ in admin.calls] == ["island_economy_context"]


OPERATION = UUID(int=20)
ACCOUNT = UUID(int=21)


def replay_reply():
    body = request()
    return {
        "status": "done",
        "repeat": True,
        "receipt": {
            "receiptId": str(OPERATION),
            "actionUid": body.action_uid,
            "action": "structure_repair",
            "actorId": ACTOR,
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": str(ACCOUNT),
                "runEpoch": EPOCH,
            },
            "result": {
                "recoveryEpoch": str(body.expected_epoch),
                "spot": body.spot,
                "instanceId": str(body.instance_id),
                "kind": "wall",
                "level": 1,
                "chargedPrice": "10",
                "waveId": str(body.expected_wave_id),
                "useOrdinal": 1,
                "eventSeq": 1,
                "repairSeq": 1,
                "financialReceipt": {
                    "id": str(UUID(int=22)),
                    "accountId": str(ACCOUNT),
                    "runEpoch": EPOCH,
                    "actorId": ACTOR,
                    "actionUid": f"fx_{OPERATION.hex}_repair",
                    "kind": "spend",
                    "reason": "structure_repair",
                    "reference": f"repair:{OPERATION}",
                    "balanceDelta": "-10",
                    "committedDelta": "0",
                    "balanceAtCommit": "90",
                    "committedAtCommit": "0",
                    "revisionAtCommit": "2",
                    "sourceReservationId": None,
                },
            },
        },
    }


def test_owned_historical_receipt_is_returned_without_permission_or_current_treasury_read():
    class ReplayAdmin:
        def __init__(self):
            self.calls = []

        async def call_function(self, name, parameters):
            self.calls.append(name)
            assert name == "island_shared_repair_replay"
            assert parameters["p_account_id"] is None
            return replay_reply()

    admin = ReplayAdmin()
    body = request(expectedRepairSeq=40, expectedWaveId=str(UUID(int=800)))
    result = asyncio.run(repair_shared(admin, ACTOR, body))
    assert result.receipt.result.repairSeq == 1
    assert result.repeat is True
    assert result.currentEconomy is None
    assert admin.calls == ["island_shared_repair_replay"]


@pytest.mark.parametrize(
    "key,value",
    [
        ("accountId", str(UUID(int=90))),
        ("actorId", str(UUID(int=91))),
        ("actionUid", "repair-0001"),
        ("balanceDelta", "-9"),
        ("committedDelta", "1"),
        ("reference", "other:operation"),
        ("revisionAtCommit", "0"),
    ],
)
def test_unrelated_financial_facts_are_rejected(key, value):
    reply = replay_reply()
    reply["receipt"]["result"]["financialReceipt"][key] = value
    with pytest.raises(SupabaseRejected):
        read_reply(reply, ACTOR, request())


@pytest.mark.parametrize(
    "key,value", [("runEpoch", str(UUID(int=77))), ("version", True), ("mode", "personal_legacy")]
)
def test_changed_domain_origin_is_rejected(key, value):
    reply = replay_reply()
    reply["receipt"]["origin"][key] = value
    with pytest.raises(SupabaseRejected):
        read_reply(reply, ACTOR, request())


def test_replay_cannot_smuggle_a_fresh_treasury_snapshot_to_a_departed_actor():
    reply = replay_reply()
    reply["currentEconomy"] = {
        "mode": "island_shared",
        "version": 1,
        "islandOwner": OWNER,
        "accountId": str(ACCOUNT),
        "runEpoch": EPOCH,
        "revision": "2",
        "treasury": {"balanceCoins": "90", "committedCoins": "0", "availableCoins": "90"},
    }
    with pytest.raises(SupabaseRejected):
        read_reply(reply, ACTOR, request())


def test_noncanonical_coin_text_in_a_receipt_is_rejected():
    reply = replay_reply()
    reply["receipt"]["result"]["chargedPrice"] = "10.0"
    with pytest.raises(SupabaseRejected):
        read_reply(reply, ACTOR, request())


def test_malformed_refusal_is_not_coerced_or_allowed_to_reach_a_write():
    with pytest.raises(SupabaseRejected):
        read_reply({"status": "refused", "reason": {}}, ACTOR, request())


@pytest.mark.parametrize("uid", ["fx_reserved_0001", "sys_reserved_0001"])
def test_client_root_cannot_use_a_reserved_financial_namespace(uid):
    admin = UnavailableAdmin()
    with pytest.raises(ApiError) as caught:
        asyncio.run(repair_shared(admin, ACTOR, request(actionUid=uid)))
    assert caught.value.code == "invalid_transaction"
    assert admin.calls == []
