"""Session endpoint transport/security gates using explicit RPC fixtures only."""

from copy import deepcopy
from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.routes import shared_sessions
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, PLAYER_ID, World
from server.tests.test_shared_session_api import EPOCH, OWNER, SESSION, economy, metadata

HEADERS = {**PLAYER, "X-Island-Economy-Version": "1"}
INTENT = {
    key: value
    for key, value in economy().items()
    if key in {"mode", "version", "islandOwner", "runEpoch"}
}
PROOF = dict(economy=INTENT, sessionId=SESSION, connectionGeneration="1")
ATTACH = dict(economy=INTENT, sessionId=SESSION, expectedGeneration="0", actionUid="attach_001")


class Database:
    def __init__(self, result=None, deleted=False):
        self.calls, self.deleted = [], deleted
        self.result = result or dict(status="done", economy=economy(), session=metadata())

    async def call_function(self, name, arguments):
        self.calls.append((name, deepcopy(arguments)))
        if name == "island_lifecycle_actor_status":
            return {"status": "deleted" if self.deleted else "active"}
        assert name.startswith("shared_session_")
        return deepcopy(self.result)


def setup(*, result=None, deleted=False, settings=ISLAND_SETTINGS):
    world = World(settings=settings)
    world.app.include_router(shared_sessions.router, prefix="/api")
    database = Database(result, deleted)
    world.app.state.admin = database
    return world, database


def test_session_read_uses_authenticated_actor_and_keeps_explicit_spectator_nulls():
    world, database = setup(result=dict(status="done", economy=economy(), session=metadata(False)))
    result = world.client.get(
        "/api/island/session", params=dict(islandOwner=OWNER, runEpoch=EPOCH), headers=HEADERS
    )
    assert result.status_code == 200, result.text
    assert result.headers["cache-control"] == "private, no-store"
    assert result.json()["session"]["sessionId"] is None
    assert result.json()["session"]["connectionGeneration"] is None
    assert database.calls[-1] == (
        "shared_session_read",
        {
            "p_actor_id": PLAYER_ID,
            "p_island_owner": OWNER,
            "p_session_id": None,
            "p_connection_generation": None,
        },
    )


@pytest.mark.parametrize(
    "action,body", [("attach", ATTACH), ("heartbeat", PROOF), ("disconnect", PROOF)]
)
def test_controller_routes_use_current_proof_without_browser_actor_or_account(action, body):
    world, database = setup()
    result = world.client.post(f"/api/island/session/{action}", json=body, headers=HEADERS)
    assert result.status_code == 200, result.text
    name, args = database.calls[-1]
    assert name == f"shared_session_{action}" and args["p_actor_id"] == PLAYER_ID
    assert args["p_run_epoch"] == EPOCH and args["p_session_id"] == SESSION
    assert "p_account_id" not in args
    assert result.json()["session"]["graceUntil"] is None


@pytest.mark.parametrize(
    "action,body",
    [
        ("attach", ATTACH),
        ("heartbeat", PROOF),
        ("disconnect", PROOF),
        ("leave", {**PROOF, "actionUid": "leave_001"}),
        ("settings", {**PROOF, "actionUid": "pause_001", "autoNext": True}),
    ],
)
def test_post_routes_refuse_deleted_actor_before_native_rpc(action, body):
    world, database = setup(deleted=True)
    result = world.client.post(f"/api/island/session/{action}", json=body, headers=HEADERS)
    assert_error(result, 401, "unauthorized")
    assert [name for name, _ in database.calls] == ["island_lifecycle_actor_status"]


@pytest.mark.parametrize(
    "headers,status,code",
    [
        ({}, 401, "unauthorized"),
        (PLAYER, 409, "economy_context_required"),
        ({**PLAYER, "X-Island-Economy-Version": "2"}, 409, "economy_version_mismatch"),
    ],
)
def test_read_requires_login_and_capability_before_any_database_call(headers, status, code):
    world, database = setup()
    response = world.client.get(
        "/api/island/session", params=dict(islandOwner=OWNER, runEpoch=EPOCH), headers=headers
    )
    assert_error(response, status, code)
    assert database.calls == []


def test_feature_gate_precedes_native_database_reads():
    world, database = setup(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    result = world.client.post("/api/island/session/attach", json=ATTACH, headers=HEADERS)
    assert_error(result, 404, "feature_off")
    assert database.calls == []


@pytest.mark.parametrize(
    "field,value",
    [("actorId", PLAYER_ID), ("accountId", OWNER), ("expectedGeneration", 0), ("unexpected", True)],
)
def test_attach_body_refuses_authority_fields_and_generation_coercion(field, value):
    world, database = setup()
    result = world.client.post(
        "/api/island/session/attach", json={**ATTACH, field: value}, headers=HEADERS
    )
    assert_error(result, 422, "validation_error")
    assert database.calls == []


def test_shared_session_mutations_use_existing_per_actor_budget():
    world, database = setup()
    for _ in range(30):
        assert (
            world.client.post(
                "/api/island/session/heartbeat", json=PROOF, headers=HEADERS
            ).status_code
            == 200
        )
    before = len(database.calls)
    result = world.client.post("/api/island/session/heartbeat", json=PROOF, headers=HEADERS)
    assert_error(result, 429, "too_many_requests")
    assert len(database.calls) == before
