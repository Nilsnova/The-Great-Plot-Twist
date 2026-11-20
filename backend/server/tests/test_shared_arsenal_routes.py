"""Versioned arsenal route composition; authenticated/runtime acceptance is separate."""

from copy import deepcopy
from dataclasses import replace
from uuid import UUID

import pytest

from server.flags import parse_flags
from server.tests.arsenal_runtime_helpers import FakeRuntimeArsenalDatabase
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, PLAYER_ID, World
from server.tests.test_shared_arsenal_store import response

ACCOUNT, EPOCH = (str(UUID(int=i)) for i in (51, 52))
CAPABILITY = {**PLAYER, "X-Island-Economy-Version": "1"}
SETTINGS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,arsenal"))


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(
        "server.tests.island_helpers.FakeIslandDatabase", FakeRuntimeArsenalDatabase
    )
    world = World(settings=SETTINGS)
    economy = {
        "mode": "island_shared",
        "version": 1,
        "islandOwner": PLAYER_ID,
        "accountId": ACCOUNT,
        "runEpoch": EPOCH,
        "revision": "1",
        "treasury": {
            "balanceCoins": "999999999999999999999",
            "committedCoins": "0",
            "availableCoins": "999999999999999999999",
        },
    }
    world.database.economy_context_replies[PLAYER_ID] = {"status": "ok", "economy": economy}
    world.database.shared_arsenal_reply = {
        "status": "done",
        "arsenalVersion": 1,
        "economy": economy,
        "arsenalRevision": "0",
        "code": "ISLE-K7Q2M",
        "capacity": 20,
        "total": 0,
        "stored": 0,
        "copies": [],
        "mine": None,
        "carried": "musket",
        "unlockWave": 4,
        "waveRunning": False,
    }
    reply = deepcopy(response())
    reply["receipt"]["actorId"] = PLAYER_ID
    reply["receipt"]["origin"].update(islandOwner=PLAYER_ID, accountId=ACCOUNT, runEpoch=EPOCH)
    reply["currentEconomy"] = economy
    world.database.shared_write_reply = reply
    return world


def intent(world):
    economy = world.database.shared_arsenal_reply["economy"]
    return {key: economy[key] for key in ("mode", "version", "islandOwner", "runEpoch")}


def test_initial_shared_read_requires_capability_before_any_legacy_open_or_sweep(world):
    answer = world.client.get("/api/island/arsenal", headers=PLAYER)
    assert_error(answer, 409, "economy_context_required")
    assert not world.database.calls("island_open")
    assert not world.database.calls("arsenal_state")
    assert not world.database.calls("island_arsenal_legacy_request")


def test_capable_shared_read_preserves_decimal_treasury_and_island_unlocks(world):
    answer = world.client.get("/api/island/arsenal", headers=CAPABILITY)
    assert answer.status_code == 200
    view = answer.json()
    assert view["economy"]["treasury"]["availableCoins"] == "999999999999999999999"
    assert "coins" not in view
    assert view["types"][1]["priceCoins"] == "60"
    assert view["types"][1]["unlocked"]
    assert not world.database.calls("island_open")


def test_unsupported_capability_is_rejected(world):
    answer = world.client.get(
        "/api/island/arsenal", headers={**PLAYER, "X-Island-Economy-Version": "2"}
    )
    assert_error(answer, 409, "economy_version_mismatch")


@pytest.mark.parametrize(
    ("provider_reply", "status", "code"),
    [
        ({"status": "refused", "reason": "path_unavailable"}, 409, "economy_path_unavailable"),
        ({"status": "done"}, 502, "database_error"),
    ],
)
def test_missing_or_unreadable_shared_provider_never_falls_back_to_legacy(
    world, provider_reply, status, code
):
    world.database.shared_arsenal_reply = provider_reply
    answer = world.client.get("/api/island/arsenal", headers=CAPABILITY)
    assert_error(answer, status, code)
    assert not world.database.calls("island_arsenal_legacy_request")
    assert not world.database.calls("island_open")


def test_shared_mutation_requires_explicit_epoch_and_uses_one_atomic_domain_request(world):
    missing = world.post("/api/island/arsenal/buy", headers=CAPABILITY, weapon="pistols")
    assert_error(missing, 409, "economy_context_required")
    reply = world.post(
        "/api/island/arsenal/buy",
        headers=CAPABILITY,
        weapon="pistols",
        actionUid="arsenal001",
        economy=intent(world),
    )
    assert reply.status_code == 200
    calls = world.database.calls("island_shared_arsenal_request")
    assert len(calls) == 1 and calls[0]["p_actor_id"] == PLAYER_ID
    assert calls[0]["p_price"] == "60" and "p_account_id" not in calls[0]
    assert not world.database.calls("island_open")


def test_historical_receipt_replay_survives_current_membership_loss_without_fresh_state(world):
    world.database.shared_write_reply.update(repeat=True, currentEconomy=None)
    world.database.shared_arsenal_reply = {"status": "refused", "reason": "not_member"}
    reply = world.post(
        "/api/island/arsenal/buy",
        headers=CAPABILITY,
        weapon="pistols",
        actionUid="arsenal001",
        economy={
            "mode": "island_shared",
            "version": 1,
            "islandOwner": PLAYER_ID,
            "runEpoch": EPOCH,
        },
    )
    assert reply.status_code == 200
    data = reply.json()
    assert data["repeat"] and data["currentEconomy"] is None and data["arsenal"] is None
    assert not world.database.calls("island_economy_context")


@pytest.mark.parametrize("code", ["ISLE-K7Q2M", None])
def test_shared_mutation_uses_only_envelope_target_and_rejects_navigation_code(world, code):
    answer = world.post(
        "/api/island/arsenal/buy",
        headers=CAPABILITY,
        weapon="pistols",
        economy=intent(world),
        code=code,
    )
    assert answer.status_code == 422
    assert not world.database.calls("island_shared_arsenal_request")


@pytest.mark.parametrize("extras", [{"actorId": PLAYER_ID}, {"price": 1}, {"payer": PLAYER_ID}])
def test_shared_mutation_refuses_forged_identity_and_price_fields(world, extras):
    answer = world.post(
        "/api/island/arsenal/buy",
        headers=CAPABILITY,
        weapon="pistols",
        economy=intent(world),
        **extras,
    )
    assert answer.status_code == 422
    assert not world.database.calls("island_shared_arsenal_request")


def test_shared_take_and_return_require_the_exact_selected_copy_tenure(world):
    copy = str(UUID(int=60))
    take = world.post(
        "/api/island/arsenal/take", headers=CAPABILITY, economy=intent(world), copy=copy
    )
    back = world.post("/api/island/arsenal/return", headers=CAPABILITY, economy=intent(world))
    assert take.status_code == 422 and back.status_code == 422
    assert not world.database.calls("island_shared_arsenal_request")
