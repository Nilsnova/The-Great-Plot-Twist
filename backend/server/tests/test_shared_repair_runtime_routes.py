"""Shared repair HTTP contracts; database/authority replies are explicit route fixtures."""

from copy import deepcopy
from uuid import UUID

import httpx
import pytest

from server.island import shared_combat_repair
from server.island.shared_repair_transaction_models import SharedRepairReply
from server.tests.helpers import assert_error
from server.tests.island_helpers import FRIEND_ID, PLAYER, PLAYER_ID, World
from server.tests.test_shared_combat_repair_adapter import replay_reply
from server.tests.test_structure_recovery_routes import VIEW
from server.tests.test_structure_repair_routes import BODY

CAPABLE = {**PLAYER, "X-Island-Economy-Version": "1"}
EPOCH = str(UUID(int=999))
ACCOUNT = str(UUID(int=21))
ECONOMY = {
    "mode": "island_shared",
    "version": 1,
    "islandOwner": PLAYER_ID,
    "accountId": ACCOUNT,
    "runEpoch": EPOCH,
    "revision": "2",
    "treasury": {"balanceCoins": "90", "committedCoins": "0", "availableCoins": "90"},
}
CONTEXT = {"status": "ok", "economy": ECONOMY, "accountState": "active", "admissionState": "active"}
STATE = {
    **{key: value for key, value in VIEW.items() if key != "status"},
    "serverNow": "2026-11-17T12:00:00Z",
    "displayPhase": "preparing",
    "repairWindow": "reserved_wave",
    "waveId": str(UUID(int=965)),
    "remainingPaidUses": 2,
}
SHARED_BODY = {
    **BODY,
    "economy": {key: ECONOMY[key] for key in ("mode", "version", "islandOwner", "runEpoch")},
    "expectedEpoch": str(UUID(int=964)),
    "expectedWindow": "reserved_wave",
    "expectedWaveId": STATE["waveId"],
    "actionUid": "repair-0001",
}


def world(shared=True):
    value = World()
    value.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID,
        "code": "K7Q2M",
        "wave_best": 0,
        "flags": 0,
    }
    value.database.recovery_state_reply = {"status": "ok", **deepcopy(STATE)}
    if shared:
        value.database.economy_context_replies[PLAYER_ID] = deepcopy(CONTEXT)
    old_call = value.app.state.admin.call_function

    async def call(name, arguments):
        if name == "island_economy_authority":
            return {
                "actor_id": PLAYER_ID,
                "island_owner": PLAYER_ID,
                "is_member": True,
                "reservation_id": STATE["waveId"],
                "session_leader_id": PLAYER_ID,
                "actor_assignment_wave_id": STATE["waveId"],
            }
        if name == "island_shared_repair_replay":
            return None
        return await old_call(name, arguments)

    value.app.state.admin.call_function = call
    return value


def result(repeat=False):
    value = replay_reply()
    receipt = value["receipt"]
    receipt["actionUid"] = SHARED_BODY["actionUid"]
    receipt["actorId"] = PLAYER_ID
    receipt["origin"]["islandOwner"] = PLAYER_ID
    facts = receipt["result"]
    facts["instanceId"] = SHARED_BODY["instanceId"]
    facts["financialReceipt"]["actorId"] = PLAYER_ID
    value["repeat"] = repeat
    if not repeat:
        value["currentEconomy"] = deepcopy(ECONOMY)
    return SharedRepairReply.model_validate(value)


@pytest.mark.parametrize("header", [None, "2", "true"])
def test_shared_structure_read_requires_actual_client_capability(header):
    value = world()
    headers = PLAYER if header is None else {**PLAYER, "X-Island-Economy-Version": header}
    answer = value.client.get("/api/island/structures", headers=headers)
    assert_error(
        answer, 409, "economy_context_required" if header is None else "economy_version_mismatch"
    )
    assert value.database.calls("structure_recovery_read_state") == []


def test_shared_structure_read_returns_account_context_without_personal_coins():
    value = world()
    answer = value.client.get("/api/island/structures", headers=CAPABLE)
    assert answer.status_code == 200, answer.text
    assert answer.json()["economy"] == ECONOMY
    assert "coins" not in answer.json()
    assert all(request.url.path != "/rest/v1/wallets" for request in value.database.requests)


def test_old_personal_repair_payload_cannot_debit_on_a_persisted_shared_island():
    value = world()
    answer = value.client.post("/api/island/structures/repair", headers=PLAYER, json=BODY)
    assert_error(answer, 409, "economy_context_required")
    assert value.database.calls("island_structure_repair") == []


def test_failed_persisted_mode_read_is_not_treated_as_personal_legacy():
    value = world()
    value.database.economy_context_replies[PLAYER_ID] = httpx.Response(
        503, json={"message": "away"}
    )
    answer = value.client.post("/api/island/structures/repair", headers=PLAYER, json=BODY)
    assert answer.status_code in (502, 503)
    assert value.database.calls("island_structure_repair") == []


def test_shared_repair_response_contains_only_domain_receipt_and_authorized_state(monkeypatch):
    value = world()

    async def repair(admin, actor, body):
        assert actor == PLAYER_ID
        assert body.economy.runEpoch != body.expected_epoch
        return result()

    monkeypatch.setattr(shared_combat_repair, "repair_shared", repair)
    answer = value.client.post("/api/island/structures/repair", headers=CAPABLE, json=SHARED_BODY)
    assert answer.status_code == 200, answer.text
    assert answer.json()["receipt"] == result().receipt.model_dump(mode="json")
    assert answer.json()["economy"] == ECONOMY
    assert answer.json()["currentState"]["waveId"] == STATE["waveId"]
    assert "coins" not in answer.json()
    assert all(request.url.path != "/rest/v1/wallets" for request in value.database.requests)


def test_owned_shared_retry_returns_receipt_without_current_membership_or_state_reads(monkeypatch):
    value = world()
    value.database.has_wallet = False
    # Archived common origins remain readable after physical deletion.
    value.database.islands.clear()

    async def repair(*_args):
        return result(repeat=True)

    monkeypatch.setattr(shared_combat_repair, "repair_shared", repair)
    answer = value.client.post("/api/island/structures/repair", headers=CAPABLE, json=SHARED_BODY)
    assert answer.status_code == 200, answer.text
    assert answer.json() == {
        "receipt": result(True).receipt.model_dump(mode="json"),
        "repeat": True,
    }
    assert value.database.calls("structure_recovery_read_state") == []
    assert value.database.calls("island_economy_context") == []


def test_navigation_code_is_not_allowed_to_retarget_a_shared_mutation(monkeypatch):
    value = world()
    value.database.islands["FR3ND"] = {
        "player_id": FRIEND_ID,
        "code": "FR3ND",
        "wave_best": 0,
        "flags": 0,
    }
    called = []

    async def repair(*args):
        called.append(args)
        return result()

    monkeypatch.setattr(shared_combat_repair, "repair_shared", repair)
    answer = value.client.post(
        "/api/island/structures/repair", headers=CAPABLE, json={**SHARED_BODY, "code": "ISLE-FR3ND"}
    )
    assert_error(answer, 422, "validation_error")
    assert called == []


def test_explicit_legacy_get_keeps_its_payload_and_requires_no_capability():
    value = world(shared=False)
    answer = value.client.get("/api/island/structures", headers=PLAYER)
    assert answer.status_code == 200
    assert answer.json() == STATE


def test_legacy_target_repair_never_initializes_the_actors_separate_shared_island():
    from server.tests.test_structure_repair_routes import RECEIPT

    value = world()
    value.database.islands["FR3ND"] = {
        "player_id": FRIEND_ID,
        "code": "FR3ND",
        "wave_best": 0,
        "flags": 0,
    }
    value.database.games.add(FRIEND_ID, PLAYER_ID)
    value.database.repair_reply = {
        "status": "done",
        "repeat": False,
        "receipt": RECEIPT.model_dump(mode="json", by_alias=True),
        "balance": 90,
        "event": None,
    }
    value.database.recovery_state_reply["structures"] = [
        {
            **value.database.recovery_state_reply["structures"][0],
            "instanceId": SHARED_BODY["instanceId"],
        }
    ]
    answer = value.client.post(
        "/api/island/structures/repair", headers=PLAYER, json={**BODY, "code": "ISLE-FR3ND"}
    )
    assert answer.status_code == 200, answer.text
    assert value.database.calls("island_open") == []
    assert value.database.calls("island_structure_repair")[0]["p_island_owner"] == FRIEND_ID


def revoking_member_world():
    """Actual permission reader sees a leave while its structure projection is awaited."""
    value = world()
    value.database.islands["FR3ND"] = {
        "player_id": FRIEND_ID, "code": "FR3ND", "wave_best": 0, "flags": 0,
    }
    value.database.games.add(FRIEND_ID, PLAYER_ID)
    context = deepcopy(CONTEXT)
    context["economy"]["islandOwner"] = FRIEND_ID
    value.database.economy_context_replies[FRIEND_ID] = context
    old_call = value.app.state.admin.call_function
    member = True

    async def call(name, arguments):
        nonlocal member
        if name == "island_economy_authority":
            return {
                "actor_id": PLAYER_ID, "island_owner": FRIEND_ID, "is_member": member,
                "reservation_id": STATE["waveId"], "session_leader_id": FRIEND_ID,
                "actor_assignment_wave_id": STATE["waveId"],
            }
        answer = await old_call(name, arguments)
        if name == "structure_recovery_read_state":
            member = False
        return answer

    value.app.state.admin.call_function = call
    return value


def test_shared_read_rechecks_membership_after_awaiting_its_state_and_treasury():
    value = revoking_member_world()
    answer = value.client.get("/api/island/structures?code=ISLE-FR3ND", headers=CAPABLE)
    assert_error(answer, 403, "not_member")
    assert "economy" not in answer.json()


def test_committed_repair_keeps_only_receipt_when_membership_changes_during_projection(monkeypatch):
    value = revoking_member_world()
    committed = result()
    committed.receipt.origin.islandOwner = UUID(FRIEND_ID)

    async def repair(*_args):
        return committed

    monkeypatch.setattr(shared_combat_repair, "repair_shared", repair)
    body = deepcopy(SHARED_BODY)
    body["economy"]["islandOwner"] = FRIEND_ID
    answer = value.client.post("/api/island/structures/repair", headers=CAPABLE, json=body)
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"receipt": committed.receipt.model_dump(mode="json"), "repeat": False}
