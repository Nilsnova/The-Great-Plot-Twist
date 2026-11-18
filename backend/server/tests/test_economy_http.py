"""Core HTTP dispatch keeps immutable retries separate from new authority checks."""

import asyncio
from uuid import UUID

import pytest
from pydantic import BaseModel, ConfigDict

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.economy_http import shared_write
from server.island.economy_http_models import parse_shared_body
from server.supabase_admin import SupabaseRejected
from server.tests.test_shared_snapshot import ACCOUNT, ACTOR, EPOCH, INSTANCE, OWNER, raw_snapshot


def request_body():
    return parse_shared_body(
        "build",
        {
            "economy": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "runEpoch": EPOCH,
            },
            "actionUid": "build001",
            "spot": "wall_1",
            "kind": "wall",
            "instanceId": None,
            "expectedLevel": 0,
            "quotedCoins": "9",
        },
    )


def receipt(repeat=False):
    return {
        "status": "done",
        "repeat": repeat,
        "currentEconomy": None if repeat else raw_snapshot()["economy"],
        "receipt": {
            "receiptId": str(UUID(int=919)),
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
                "chargedCoins": "9",
                "refundedCoins": "0",
                "engineerCommitmentId": None,
                "treasuryReceiptId": str(UUID(int=918)),
            },
        },
    }


class Admin:
    def __init__(self, *, repeat=False, unavailable=False, context=None):
        self.calls = []
        self.repeat, self.unavailable, self.context = repeat, unavailable, context

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        if name == "island_economy_operation_origin":
            return (
                {"status": "replay", "origin": receipt()["receipt"]["origin"]}
                if self.repeat
                else {"status": "new"}
            )
        if name == "island_economy_context":
            economy = raw_snapshot()["economy"]
            economy["islandOwner"] = parameters["p_island_owner"]
            return self.context or {"status": "ok", "economy": economy}
        if name == "island_economy_authority":
            if self.unavailable:
                raise SupabaseRejected()
            return {
                "actor_id": ACTOR,
                "island_owner": OWNER,
                "is_member": True,
                "reservation_id": None,
                "session_leader_id": OWNER,
                "actor_assignment_wave_id": None,
            }
        if name == "island_economy_construct":
            return receipt(self.repeat)
        raise AssertionError(name)


def write(admin, body=None):
    return asyncio.run(shared_write(admin, ACTOR, "build", body or request_body(), load_island()))


def test_new_shared_intent_uses_actual_authority_then_one_atomic_domain_rpc():
    admin = Admin()
    assert write(admin) == receipt()
    assert [name for name, _ in admin.calls] == [
        "island_economy_operation_origin",
        "island_economy_context",
        "island_economy_authority",
        "island_economy_construct",
    ]
    parameters = admin.calls[-1][1]
    assert parameters["p_actor_id"] == ACTOR and parameters["p_account_id"] == ACCOUNT
    assert parameters["p_intent"]["quotedCoins"] == "9"


def test_missing_canonical_authority_stays_unavailable_without_domain_mutation():
    admin = Admin(unavailable=True)
    with pytest.raises(ApiError) as error:
        write(admin)
    assert error.value.code == "economy_path_unavailable"
    assert "island_economy_construct" not in [name for name, _ in admin.calls]


def test_historical_root_uses_original_receipt_without_current_preflight_or_hydration():
    admin = Admin(repeat=True, unavailable=True)
    assert write(admin) == receipt(True)
    assert [name for name, _ in admin.calls] == [
        "island_economy_operation_origin",
        "island_economy_construct",
    ]


class LegacyBuild(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spot: str = "wall_1"
    kind: str = "wall"
    actionUid: str = "build001"
    code: str | None = None


def test_only_explicit_proven_legacy_mode_selects_the_legacy_service():
    legacy = {"status": "legacy", "islandOwner": ACTOR}
    admin = Admin(context=legacy)
    assert write(admin, LegacyBuild()) is None
    assert [name for name, _ in admin.calls] == ["island_economy_context"]
    admin.context = {"status": "unknown"}
    with pytest.raises(SupabaseRejected):
        write(admin, LegacyBuild())


def test_valid_old_body_on_a_persisted_shared_island_refuses_before_legacy_effects():
    admin = Admin()
    with pytest.raises(ApiError) as error:
        write(admin, LegacyBuild())
    assert error.value.code == "economy_context_required"
