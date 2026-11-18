"""The shared construction adapter sends one atomic intent and verifies exact effects."""

import asyncio
from copy import deepcopy
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.construction_rules import ConstructionIntent
from server.island.treasury_models import EconomyContext
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_treasury import ACCOUNT, ACTOR, EPOCH, OWNER, envelope

INSTANCE = "00000000-0000-0000-0000-000000000099"
RECEIPT = "00000000-0000-0000-0000-000000000098"


def context():
    return EconomyContext("island_shared", 1, ACTOR, OWNER, ACCOUNT, EPOCH, 1)


def intent():
    return ConstructionIntent(
        action="build",
        spot="wall_1",
        kind="wall",
        instanceId=None,
        expectedLevel=0,
        quotedCoins="10",
    )


def answer():
    return {
        "status": "done",
        "repeat": False,
        "currentEconomy": envelope(),
        "receipt": {
            "receiptId": RECEIPT,
            "actionUid": "build001",
            "action": "build",
            "actorId": ACTOR,
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": ACCOUNT,
                "runEpoch": EPOCH,
            },
            "result": {
                "spot": "wall_1",
                "kind": "wall",
                "level": 1,
                "instanceId": INSTANCE,
                "chargedCoins": "10",
                "refundedCoins": "0",
                "engineerCommitmentId": None,
                "treasuryReceiptId": RECEIPT,
            },
        },
    }


class Admin:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        return deepcopy(self.result)


def execute(admin, scope, uid, request, catalogue):
    from server.island.construction_store import construct

    return asyncio.run(construct(admin, scope, uid, request, catalogue))


def test_sends_one_combined_rpc_with_server_catalogue_and_authenticated_scope():

    admin = Admin(answer())
    result = execute(admin, context(), "build001", intent(), load_island())
    assert result == answer()
    assert len(admin.calls) == 1
    name, arguments = admin.calls[0]
    assert name == "island_economy_construct"
    assert arguments["p_actor_id"] == ACTOR
    assert arguments["p_account_id"] == ACCOUNT
    assert arguments["p_run_epoch"] == EPOCH
    assert arguments["p_intent"] == intent().model_dump(mode="json")
    assert arguments["p_catalogue"]["kinds"]["wall"]["prices"][0] == "10"


@pytest.mark.parametrize(
    "path,value",
    [
        (("repeat",), 1),
        (("receipt", "actorId"), OWNER),
        (("receipt", "actionUid"), "another1"),
        (("receipt", "origin", "runEpoch"), INSTANCE),
        (("currentEconomy", "islandOwner"), ACTOR),
        (("receipt", "result", "chargedCoins"), "9"),
        (("receipt", "result", "chargedCoins"), 10),
        (("receipt", "result", "level"), 2),
        (("receipt", "result", "spot"), "wall_2"),
        (("receipt", "result", "refundedCoins"), "1"),
        (("receipt", "result", "treasuryReceiptId"), None),
        (("currentEconomy",), None),
    ],
)
def test_inconsistent_response_cannot_become_a_success(path, value):

    result = answer()
    target = result
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(SupabaseRejected):
        execute(Admin(result), context(), "build001", intent(), load_island())


def test_original_receipt_can_be_replayed_without_fresh_state_for_a_departed_actor():

    result = {**answer(), "repeat": True, "currentEconomy": None}
    assert execute(Admin(result), context(), "build001", intent(), load_island()) == result


def test_zero_refund_demolition_needs_a_domain_receipt_but_no_financial_receipt():

    result = answer()
    result["receipt"]["action"] = "demolish"
    result["receipt"]["result"].update(chargedCoins="0", refundedCoins="0", treasuryReceiptId=None)
    request = ConstructionIntent(
        action="demolish",
        spot="wall_1",
        kind="wall",
        instanceId=UUID(INSTANCE),
        expectedLevel=1,
        quotedCoins="0",
    )
    assert execute(Admin(result), context(), "build001", request, load_island()) == result


def test_legacy_context_and_database_refusals_never_fall_back_to_private_money():

    admin = Admin({"status": "refused", "reason": "construction_basis_missing"})
    with pytest.raises(ApiError) as error:
        execute(admin, context(), "build001", intent(), load_island())
    assert error.value.code == "construction_basis_missing"
    legacy = EconomyContext("personal_legacy", 0, ACTOR, OWNER, None, None, None)
    with pytest.raises(ApiError) as error:
        execute(admin, legacy, "build001", intent(), load_island())
    assert error.value.code == "economy_context_required"
    assert len(admin.calls) == 1


def test_unknown_database_refusal_is_rejected():

    with pytest.raises(SupabaseRejected):
        execute(
            Admin({"status": "refused", "reason": "invented"}),
            context(),
            "build001",
            intent(),
            load_island(),
        )


@pytest.mark.parametrize("prefix", ["fx_", "sys_"])
def test_client_action_ids_cannot_claim_a_reserved_financial_namespace(prefix):
    admin = Admin(answer())
    with pytest.raises(ApiError) as error:
        execute(admin, context(), prefix + "0" * 32 + "_charge", intent(), load_island())
    assert error.value.code == "invalid_transaction"
    assert admin.calls == []
