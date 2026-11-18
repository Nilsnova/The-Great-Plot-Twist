"""Shared island HTTP contracts alongside explicit legacy mode and global Captain routes.

Used by pytest with synthetic authenticated transports; no live authority is installed.
"""

import json
from copy import deepcopy
from dataclasses import replace

import httpx
import pytest

from server.errors import ApiError
from server.flags import parse_flags
from server.island import economy_http
from server.island.economy_http_models import SharedBody
from server.tests import island_helpers
from server.tests.helpers import assert_error
from server.tests.island_helpers import FRIEND_ID, ISLAND_SETTINGS, PLAYER, PLAYER_ID, World
from server.tests.test_economy_http import receipt
from server.tests.test_shared_snapshot import EPOCH, raw_snapshot

HEADERS = {**PLAYER, "X-Island-Economy-Version": "1"}
LEGACY_DATABASE = island_helpers.FakeIslandDatabase


class SharedDatabase(LEGACY_DATABASE):
    def __init__(self):
        super().__init__()
        self.facts = raw_snapshot()
        self.facts.update(actorId=PLAYER_ID, owner=FRIEND_ID)
        self.facts["economy"]["islandOwner"] = FRIEND_ID
        self.islands["K7Q2M"] = {
            "player_id": FRIEND_ID,
            "code": "K7Q2M",
            "wave_best": 80,
            "flags": 0,
        }
        self.shared_calls = []
        self.reply = receipt()
        self.reply["receipt"]["actorId"] = PLAYER_ID
        self.reply["receipt"]["origin"]["islandOwner"] = FRIEND_ID
        self.reply["currentEconomy"] = deepcopy(self.facts["economy"])
        self.authority_missing = True
        self.snapshot_failure = False
        self.is_member = True

    def __call__(self, request):
        name = request.url.path.rsplit("/", 1)[-1]
        if name not in {
            "island_economy_snapshot",
            "island_economy_operation_origin",
            "island_economy_construct",
            "island_economy_authority",
            "personal_captain_context",
        }:
            return super().__call__(request)
        self.requests.append(request)
        body = json.loads(request.content)
        self.shared_calls.append((name, body))
        if name == "island_economy_snapshot":
            if self.snapshot_failure:
                return httpx.Response(503)
            return self.answer(
                self.facts if self.is_member else {"status": "refused", "reason": "not_member"}
            )
        if name == "personal_captain_context":
            return self.answer({"status": "legacy"})
        if name == "island_economy_operation_origin":
            return self.answer(
                {"status": "replay", "origin": self.reply["receipt"]["origin"]}
                if self.reply["repeat"]
                else {"status": "new"}
            )
        if name == "island_economy_authority":
            if self.authority_missing:
                return httpx.Response(404, json={"code": "PGRST202"})
            return self.answer(
                {
                    "actor_id": PLAYER_ID,
                    "island_owner": FRIEND_ID,
                    "is_member": True,
                    "reservation_id": None,
                    "session_leader_id": FRIEND_ID,
                    "actor_assignment_wave_id": None,
                }
            )
        return self.answer(self.reply)

    def economy_context(self, request):
        body = json.loads(request.content)
        if body["p_island_owner"] == self.facts["owner"]:
            return self.answer({"status": "ok", "economy": self.facts["economy"]})
        return super().economy_context(request)


@pytest.fixture
def world(monkeypatch):
    monkeypatch.setattr(island_helpers, "FakeIslandDatabase", SharedDatabase)
    return World()


def build_body():
    return {
        "economy": {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": FRIEND_ID,
            "runEpoch": EPOCH,
        },
        "actionUid": "build001",
        "spot": "wall_1",
        "kind": "wall",
        "instanceId": None,
        "expectedLevel": 0,
        "quotedCoins": "9",
        "code": "ISLE-K7Q2M",
    }


def test_own_and_visited_shared_reads_are_coherent_and_never_open_or_read_wallet(world):
    response = world.visit("K7Q2M", HEADERS)
    assert response.status_code == 200, response.text
    assert response.json()["snapshotVersion"] == 1
    assert response.json()["actorId"] == PLAYER_ID
    assert response.headers["cache-control"] == "private, no-store"
    assert "POST /rpc/island_open" not in world.database.paths()
    assert "GET /wallets" not in world.database.paths()
    world.database.facts["owner"] = PLAYER_ID
    world.database.facts["economy"]["islandOwner"] = PLAYER_ID
    own = world.island(HEADERS)
    assert own.status_code == 200 and own.json()["economy"]["islandOwner"] == PLAYER_ID


def test_shared_header_is_required_while_legacy_reads_keep_their_original_shape(world):
    assert_error(world.visit("K7Q2M"), 409, "economy_context_required")
    assert world.database.shared_calls == []
    legacy = world.island(HEADERS)
    assert legacy.status_code == 200 and "coins" in legacy.json()
    assert "snapshotVersion" not in legacy.json()


def test_negotiated_legacy_discovery_declares_its_server_selected_origin(world):
    response = world.island(HEADERS)
    assert response.status_code == 200
    assert response.json()["economy"] == {
        "mode": "personal_legacy", "version": 0, "islandOwner": PLAYER_ID,
        "accountId": None, "runEpoch": None, "revision": None, "treasury": None,
    }
    assert "economy" not in world.island(PLAYER).json()


@pytest.mark.parametrize("version,code", [(None, "economy_context_required"),
                                        ("2", "economy_version_mismatch")])
def test_shared_core_write_requires_capability_before_root_or_authority(world, version, code):
    world.database.authority_missing = False
    headers = dict(PLAYER)
    if version is not None:
        headers["X-Island-Economy-Version"] = version
    reply = world.client.post("/api/island/build", json=build_body(), headers=headers)
    assert_error(reply, 409, code)
    assert world.database.shared_calls == []


def test_unsupported_shared_read_version_has_the_common_mismatch_code(world):
    assert_error(world.visit("K7Q2M", {**PLAYER, "X-Island-Economy-Version": "2"}),
                 409, "economy_version_mismatch")


def test_a_cached_token_cannot_restore_island_access_after_deletion(world):
    assert world.island(HEADERS).status_code == 200
    world.database.deleted_players.add(PLAYER_ID)
    before = len(world.database.requests)
    assert_error(world.island(HEADERS), 401, "unauthorized")
    assert_error(world.client.post("/api/island/build", json=build_body(), headers=HEADERS),
                 401, "unauthorized")
    assert [request.url.path.rsplit("/", 1)[-1]
            for request in world.database.requests[before:]] == [
                "island_lifecycle_actor_status", "island_lifecycle_actor_status",
            ]


def test_paused_member_can_read_but_outsider_gets_no_snapshot(world):
    world.database.facts["admissionState"] = "paused"
    response = world.visit("K7Q2M", HEADERS)
    assert response.status_code == 200 and response.json()["admissionState"] == "paused"
    world.database.is_member = False
    assert_error(world.visit("K7Q2M", HEADERS), 403, "not_member")


def test_shared_writes_keep_authority_unavailable_and_never_charge_the_private_wallet(world):
    response = world.client.post("/api/island/build", json=build_body(), headers=HEADERS)
    assert_error(response, 409, "economy_path_unavailable")
    assert "POST /rpc/island_economy_construct" not in world.database.paths()
    assert "POST /rpc/island_open" not in world.database.paths()
    assert "GET /wallets" not in world.database.paths()


def test_committed_receipt_survives_independent_refresh_failure_and_departed_replay(world):
    world.database.authority_missing = False
    response = world.client.post("/api/island/build", json=build_body(), headers=HEADERS)
    assert response.status_code == 200 and response.json() == world.database.reply
    world.database.snapshot_failure = True
    assert_error(world.visit("K7Q2M", HEADERS), 503, "database_unavailable")
    world.database.reply.update(repeat=True, currentEconomy=None)
    world.database.authority_missing = True
    world.database.is_member = False
    world.database.shared_calls.clear()
    body = build_body()
    body["code"] = "obsolete-code"
    repeated = world.client.post("/api/island/build", json=body, headers=HEADERS)
    assert repeated.status_code == 200 and repeated.json()["currentEconomy"] is None
    assert [name for name, _ in world.database.shared_calls] == [
        "island_economy_operation_origin",
        "island_economy_construct",
    ]


@pytest.mark.parametrize(
    "change",
    [
        {"quotedCoins": 9},
        {"expectedLevel": True},
        {"economy": {}},
        {"actorId": PLAYER_ID},
        {"instanceId": EPOCH},
        {"quotedCoins": "09"},
        {"dispatch": "demolish"},
    ],
)
def test_malformed_shared_markers_never_select_a_legacy_request(world, change):
    body = {**build_body(), **change}
    assert_error(
        world.client.post("/api/island/build", json=body, headers=HEADERS), 422, "validation_error"
    )
    assert world.database.requests == []


def test_old_shaped_body_on_shared_target_is_rejected_before_legacy_actions(world):
    assert_error(world.build(code="K7Q2M"), 409, "economy_context_required")
    assert "POST /rpc/island_open" not in world.database.paths()


@pytest.mark.parametrize("uid", ["fx_reserved_charge", "sys_reserved_loot"])
def test_financial_child_and_system_namespaces_are_not_new_http_roots(world, uid):
    payload = {**build_body(), "actionUid": uid}
    assert_error(
        world.client.post("/api/island/build", json=payload, headers=HEADERS),
        422,
        "invalid_transaction",
    )
    assert world.database.requests == []


def test_demolition_quote_uses_single_shared_refund_and_retains_missing_basis(world):
    response = world.client.get(
        "/api/island/demolish", params={"spot": "wall_1", "code": "K7Q2M"}, headers=HEADERS
    )
    assert response.status_code == 200, response.text
    assert response.json()["quote"]["intent"]["quotedCoins"] == "4"
    world.database.facts["buildings"][0].update(
        refundCoins=None, refundReason="construction_basis_missing"
    )
    assert_error(
        world.client.get(
            "/api/island/demolish", params={"spot": "wall_1", "code": "K7Q2M"}, headers=HEADERS
        ),
        409,
        "construction_basis_missing",
    )


def test_feature_auth_and_body_validation_still_precede_any_database_work(world):
    assert_error(world.client.post("/api/island/build", json=build_body()), 401, "unauthorized")
    assert world.database.requests == []
    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    assert_error(off.client.post("/api/island/build", json={}, headers=HEADERS), 404, "feature_off")
    assert off.database.requests == []


def test_global_captain_router_is_registered_without_adopting_a_missing_profile(world):
    assert_error(world.client.get("/api/captain", headers=HEADERS), 409, "captain_not_initialized")
    assert [name for name, _ in world.database.shared_calls] == ["personal_captain_context"]


def test_shared_post_and_visit_budgets_are_spent_before_context_or_snapshot_reads(world):
    class Exhausted:
        def spend(self, player_id):
            assert player_id == PLAYER_ID
            raise ApiError(429, "too_many_requests", "Wait before trying again.")

    world.app.state.island_build_budget = Exhausted()
    world.app.state.island_visit_budget = Exhausted()
    assert_error(
        world.client.post("/api/island/build", json=build_body(), headers=HEADERS),
        429,
        "too_many_requests",
    )
    assert_error(world.visit("K7Q2M", HEADERS), 429, "too_many_requests")
    assert world.database.requests == []


@pytest.mark.parametrize(
    "path,action,intent",
    [
        (
            "build",
            "build",
            {
                "spot": "wall_2",
                "kind": "wall",
                "instanceId": None,
                "expectedLevel": 0,
                "quotedCoins": "9",
            },
        ),
        (
            "upgrade",
            "upgrade",
            {
                "spot": "wall_1",
                "kind": "wall",
                "instanceId": EPOCH,
                "expectedLevel": 1,
                "quotedCoins": "18",
            },
        ),
        (
            "demolish",
            "demolish",
            {
                "spot": "wall_1",
                "kind": "wall",
                "instanceId": EPOCH,
                "expectedLevel": 1,
                "quotedCoins": "4",
            },
        ),
        ("hire", "hire", {"crew": "gunner"}),
        (
            "research",
            "research",
            {
                "branch": "cannon",
                "tier": 1,
                "choice": None,
                "change": False,
                "expected": {"tier": 0, "choice2": None, "choice3": None, "revision": "0"},
                "quotedCoins": "180",
            },
        ),
        ("tower-skill", "towerSkill", {"spot": "house_1", "spec": "tavern", "quotedCoins": "0"}),
        (
            "tower-tree",
            "towerTree",
            {"spot": "cannon_1", "path": "a", "tier": 1, "quotedCoins": "200"},
        ),
        ("wreck", "wreck", {"amount": 100, "quotedCoins": "100"}),
    ],
)
def test_each_shared_endpoint_preserves_its_strict_body_and_domain_receipt(
    world,
    monkeypatch,
    path,
    action,
    intent,
):
    payload = {key: build_body()[key] for key in ("economy", "actionUid", "code")}
    if action in {"towerSkill", "towerTree"}:
        intent = {
            **intent,
            "expected": {
                "instanceId": EPOCH,
                "kind": "house" if action == "towerSkill" else "cannon",
                "level": 5,
                "spec": None,
                "treeA": 0,
                "treeB": 0,
                "revision": "37",
            },
        }
    payload.update(intent)
    answer = {
        "status": "done",
        "repeat": True,
        "receipt": {"original": action},
        "currentEconomy": None,
    }

    async def dispatch(admin, actor, endpoint, body, catalogue):
        assert actor == PLAYER_ID and endpoint == action and isinstance(body, SharedBody)
        assert body.model_dump(mode="json") == payload
        return answer

    monkeypatch.setattr(economy_http, "shared_write", dispatch)
    response = world.client.post("/api/island/" + path, json=payload, headers=HEADERS)
    assert response.status_code == 200 and response.json() == answer
    assert world.database.paths() == ["POST /rpc/island_lifecycle_actor_status"]
