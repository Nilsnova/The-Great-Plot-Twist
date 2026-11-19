"""Lifecycle HTTP keeps original reset intents and separately confirms owned deletion."""

from copy import deepcopy

import httpx
import pytest

from server.tests.account_helpers import (
    PLAYER_ID as ACCOUNT_PLAYER,
)
from server.tests.account_helpers import RIGHT_HEADER, make_client, scripted_database
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, FakeIslandDatabase, World
from server.tests.test_island_lifecycle import OLD_EPOCH, UID, result

HEADERS = {**PLAYER, "X-Island-Economy-Version": "1"}


def reset_body():
    return {"economy": {"mode": "island_shared", "version": 1,
                        "islandOwner": PLAYER_ID, "runEpoch": OLD_EPOCH},
            "actionUid": UID, "confirmCode": "ISLE-K7Q2M"}


def reset_reply(repeat=False):
    value = result()
    value.update(repeat=repeat, currentEconomy=None)
    value["receipt"].update(actorId=PLAYER_ID)
    value["receipt"]["origin"]["islandOwner"] = PLAYER_ID
    value["receipt"]["result"]["grantPolicyVersion"] = "catalogue-starting-coins-v1"
    return value


class LifecycleDatabase(FakeIslandDatabase):
    def __call__(self, request):
        if request.url.path.endswith("/rpc/island_lifecycle_reset"):
            self.requests.append(request)
            return httpx.Response(200, json=reset_reply(self.calls_seen > 0))
        return super().__call__(request)


def reset_world():
    world = World()
    world.database.__class__ = LifecycleDatabase
    world.database.calls_seen = 0
    return world


def test_reset_retries_use_original_epoch_before_any_current_projection_lookup():
    world = reset_world()
    for repeat in (False, True):
        world.database.calls_seen = int(repeat)
        response = world.client.post("/api/island/fresh-start", headers=HEADERS, json=reset_body())
        assert response.status_code == 200, response.text
        assert response.json() == reset_reply(repeat)
        assert response.headers["cache-control"] == "private, no-store"
    calls = world.database.calls("island_lifecycle_reset")
    assert len(calls) == 2 and calls[0] == calls[1]
    assert calls[0] == {
        "p_actor_id": PLAYER_ID, "p_island_owner": PLAYER_ID, "p_run_epoch": OLD_EPOCH,
        "p_action_uid": UID, "p_confirm_code": "K7Q2M", "p_starting_coins": 200,
        "p_grant_policy_version": "catalogue-starting-coins-v1",
    }
    assert not world.database.calls("island_economy_context")
    assert not world.database.calls("island_fresh_start")


@pytest.mark.parametrize("headers,change,status,code", [
    (PLAYER, {}, 409, "economy_context_required"),
    ({**PLAYER, "X-Island-Economy-Version": "2"}, {}, 409, "economy_version_mismatch"),
    (HEADERS, {"actionUid": "sys_not_a_player_root"}, 422, "invalid_transaction"),
    (HEADERS, {"confirmCode": "invalid"}, 400, "wrong_code"),
    (HEADERS, {"startingCoins": "999999"}, 422, "validation_error"),
    (HEADERS, {"payer": PLAYER_ID}, 422, "validation_error"),
])
def test_invalid_shared_reset_never_reaches_database(headers, change, status, code):
    world = reset_world()
    response = world.client.post("/api/island/fresh-start", headers=headers,
                                 json={**reset_body(), **change})
    assert_error(response, status, code)
    assert world.database.paths() == []


def test_cached_deleted_actor_cannot_replay_or_create_reset():
    world = reset_world()
    world.database.deleted_players.add(PLAYER_ID)
    response = world.client.post("/api/island/fresh-start", headers=HEADERS, json=reset_body())
    assert_error(response, 401, "unauthorized")
    assert not world.database.calls("island_lifecycle_reset")


def test_shared_reset_cannot_choose_another_owner():
    world = reset_world()
    body = reset_body()
    body["economy"]["islandOwner"] = "11111111-1111-4111-8111-111111111111"
    response = world.client.post("/api/island/fresh-start", headers=HEADERS, json=body)
    assert_error(response, 403, "not_owner")
    assert not world.database.calls("island_lifecycle_reset")


def test_owned_island_deletion_has_separate_explicit_confirmation_and_one_atomic_rpc():
    calls = []

    def remove(arguments):
        calls.append(deepcopy(arguments))
        return ({"status": "deleted"} if arguments["p_confirm_owned_island"] else
                {"status": "refused", "reason": "owned_island_confirmation_required"})

    client, seen = make_client(scripted_database(functions={
        "island_lifecycle_delete_player": remove,
    }))
    refused = client.request("DELETE", "/api/me", headers=RIGHT_HEADER, json={"confirm": True})
    assert_error(refused, 409, "owned_island_confirmation_required")
    accepted = client.request("DELETE", "/api/me", headers=RIGHT_HEADER,
                              json={"confirm": True, "confirmOwnedIslandDeletion": True})
    assert accepted.status_code == 200 and accepted.json() == {"deleted": True}
    assert calls == [
        {"p_actor_id": ACCOUNT_PLAYER, "p_confirm_owned_island": False},
        {"p_actor_id": ACCOUNT_PLAYER, "p_confirm_owned_island": True},
    ]
    assert len(seen) == 2 and all(request.method == "POST" for request in seen)


@pytest.mark.parametrize("confirmation", [1, "true", None, [], {}])
def test_owned_island_confirmation_cannot_be_coerced(confirmation):
    client, seen = make_client(scripted_database())
    response = client.request("DELETE", "/api/me", headers=RIGHT_HEADER,
        json={"confirm": True, "confirmOwnedIslandDeletion": confirmation})
    assert_error(response, 422, "validation_error")
    assert seen == []
