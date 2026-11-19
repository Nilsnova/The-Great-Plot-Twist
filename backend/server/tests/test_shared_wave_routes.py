"""Native transport fences precede legacy initialization and deleted-player writes."""

import pytest

from server.routes import waves as wave_routes
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, WAVE_ID, World
from server.tests.test_personal_captain import reply as captain_reply
from server.tests.test_shared_session_api import (
    EPOCH as NATIVE_EPOCH,
)
from server.tests.test_shared_session_api import OWNER as NATIVE_OWNER
from server.tests.test_shared_session_api import SESSION as NATIVE_SESSION
from server.tests.test_shared_session_api import WAVE as NATIVE_WAVE
from server.tests.test_shared_session_api import historical_wave
from server.tests.test_shared_snapshot import raw_snapshot
from server.tests.test_shared_wave_http import proof

SHARED_HEADERS = {**PLAYER, "X-Island-Economy-Version": "1"}


def shared_context(world):
    economy = raw_snapshot()["economy"]
    economy["islandOwner"] = PLAYER_ID
    world.database.economy_context_replies[PLAYER_ID] = {"status": "ok", "economy": economy}


@pytest.mark.parametrize("version,protocol,code", [
    (None, 2, "economy_context_required"),
    ("2", 2, "economy_version_mismatch"),
    ("1", 1, "client_update_required"),
])
def test_native_bell_requires_transport_before_any_database_call(version, protocol, code):
    world = World()
    headers = {**PLAYER, **({"X-Island-Economy-Version": version} if version else {})}
    response = world.start(headers=headers, waveProtocol=protocol, **proof())
    assert_error(response, 409, code)
    assert world.database.paths() == []


@pytest.mark.parametrize("extra", [
    {"connectionGeneration": True}, {"connectionGeneration": "0"},
    {"connectionGeneration": "01"}, {"payer": PLAYER_ID}, {"isController": True},
])
def test_native_body_cannot_choose_authority_or_lossy_generation(extra):
    world = World()
    response = world.start(headers=SHARED_HEADERS, waveProtocol=2, **{**proof(), **extra})
    assert_error(response, 422, "validation_error")
    assert world.database.paths() == []


def test_reserved_native_bell_root_is_rejected_before_lifecycle_read():
    world = World()
    response = world.start(headers=SHARED_HEADERS, waveProtocol=2,
                           actionUid="fx_not_a_browser_root", **proof())
    assert_error(response, 422, "invalid_transaction")
    assert world.database.paths() == []


@pytest.mark.parametrize("headers,protocol,code", [
    (PLAYER, 1, "economy_context_required"),
    (SHARED_HEADERS, 1, "client_update_required"),
    (SHARED_HEADERS, 2, "economy_context_required"),
])
def test_naked_shared_bell_cannot_open_a_legacy_island(headers, protocol, code):
    world = World()
    shared_context(world)
    response = world.start(headers=headers, waveProtocol=protocol)
    assert_error(response, 409, code)
    assert world.database.paths() == [
        "POST /rpc/island_lifecycle_actor_status", "POST /rpc/island_economy_context",
    ]


@pytest.mark.parametrize("where", ["own", "pirate_point"])
def test_managed_captain_cannot_initialize_a_new_legacy_wave(where):
    world = World()
    world.database.personal_captain_context_reply = captain_reply()
    response = world.start(where=where)
    assert_error(response, 409, "personal_captain_managed")
    assert not world.database.calls("island_open")
    assert not world.database.calls("recovery_wave_start")


def test_shared_legacy_join_refuses_before_opening_the_joiners_own_island():
    world = World()
    shared_context(world)
    world.database.wave_places[WAVE_ID] = {"place": "island", "island_owner": PLAYER_ID}
    response = world.join()
    assert_error(response, 409, "economy_context_required")
    assert not world.database.calls("island_open")
    assert not world.database.calls("recovery_wave_join")


@pytest.mark.parametrize("query", [
    "sessionId=33333333-3333-4333-8333-333333333333",
    "connectionGeneration=1",
    "islandOwner=11111111-1111-4111-8111-111111111111",
    "runEpoch=22222222-2222-4222-8222-222222222222",
    "sessionId=33333333-3333-4333-8333-333333333333&connectionGeneration=1",
])
def test_shared_journal_query_requires_complete_origin_and_optional_complete_proof(query):
    world = World()
    response = world.client.get(f"/api/waves/{WAVE_ID}/events?{query}", headers=SHARED_HEADERS)
    assert_error(response, 422, "validation_error")
    assert world.database.paths() == []


@pytest.mark.parametrize("suffix,body", [
    ("inputs", {"waveProtocol": 2, "inputs": [
        {"inputUid": "input-0001", "actorCounter": 1, "tick": 2,
         "command": {"type": "captain_move", "x": 0, "z": 0}},
    ]}),
    ("health", {"waveProtocol": 2,
                "islandEpoch": "22222222-2222-4222-8222-222222222222",
                "checkpointUid": "checkpoint-001", "throughTick": 2,
                "inputHeadSeq": 0, "lastRepairSeq": 0, "basisRepairSeq": {}, "hpUnits": {}}),
])
def test_shared_journal_writes_require_negotiation_before_lifecycle(suffix, body):
    world = World()
    response = world.client.post(f"/api/waves/{WAVE_ID}/{suffix}",
                                 json={**body, **proof()}, headers=PLAYER)
    assert_error(response, 409, "economy_context_required")
    assert world.database.paths() == []


@pytest.mark.parametrize("suffix", ["inputs", "health", "events"])
def test_cached_deleted_actor_cannot_reach_any_legacy_journal_path(suffix):
    world = World()
    world.database.deleted_players.add(PLAYER_ID)
    if suffix == "events":
        response = world.client.get(f"/api/waves/{WAVE_ID}/events", headers=PLAYER)
    elif suffix == "inputs":
        response = world.client.post(f"/api/waves/{WAVE_ID}/inputs", headers=PLAYER, json={
            "waveProtocol": 2, "inputs": [{"inputUid": "input-0001", "actorCounter": 1,
                "tick": 2, "command": {"type": "captain_move", "x": 0, "z": 0}}],
        })
    else:
        response = world.client.post(f"/api/waves/{WAVE_ID}/health", headers=PLAYER, json={
            "waveProtocol": 2, "islandEpoch": "22222222-2222-4222-8222-222222222222",
            "checkpointUid": "checkpoint-001", "throughTick": 2, "inputHeadSeq": 0,
            "lastRepairSeq": 0, "basisRepairSeq": {}, "hpUnits": {},
        })
    assert_error(response, 401, "unauthorized")
    assert world.database.paths() == ["POST /rpc/island_lifecycle_actor_status"]


class ReplayDatabase:
    def __init__(self, replay):
        self.replay, self.calls = replay, []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        if name == "island_lifecycle_actor_status":
            return {"status": "active"}
        assert name == "shared_session_wave_replay"
        return self.replay


def native_start_body():
    return {"where": "ISLE-K7Q2M", "actionUid": "bell-0001", "waveProtocol": 2,
            "economy": {"mode": "island_shared", "version": 1,
                        "islandOwner": NATIVE_OWNER, "runEpoch": NATIVE_EPOCH},
            "sessionId": NATIVE_SESSION, "connectionGeneration": "1"}


def test_historical_bell_returns_before_current_weather_or_code_resolution(monkeypatch):
    world = World()
    database = ReplayDatabase(historical_wave())
    world.app.state.admin = database

    async def unexpected(*_args):
        raise AssertionError("Historical replay must not depend on today's weather or code.")

    monkeypatch.setattr(wave_routes, "wave_weather", unexpected)
    monkeypatch.setattr(wave_routes, "target_owner", unexpected)
    response = world.client.post("/api/waves/start", headers=SHARED_HEADERS,
                                 json=native_start_body())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["historical"] and body["repeat"] and body["waveId"] == NATIVE_WAVE
    assert body["economy"] is None and body["session"] is None
    assert body["participantToken"] is None and body["lastActorCounter"] is None
    assert body["weather"]["label"] == body["initialSnapshot"]["weatherLabel"]
    assert [name for name, _arguments in database.calls] == [
        "island_lifecycle_actor_status", "shared_session_wave_replay",
    ]
    assert database.calls[-1][1] == {
        "p_actor_id": PLAYER_ID, "p_island_owner": NATIVE_OWNER,
        "p_run_epoch": NATIVE_EPOCH, "p_action_uid": "bell-0001",
    }


def test_new_bell_code_must_name_its_captured_origin_before_weather_or_mutation(monkeypatch):
    world = World()
    database = ReplayDatabase({"status": "new"})
    world.app.state.admin = database
    resolved = []

    async def another_owner(_admin, actor, code):
        resolved.append((actor, code))
        return PLAYER_ID

    async def unexpected(*_args):
        raise AssertionError("A mismatched new bell must stop before weather or mutation.")

    monkeypatch.setattr(wave_routes, "target_owner", another_owner)
    monkeypatch.setattr(wave_routes, "wave_weather", unexpected)
    response = world.client.post("/api/waves/start", headers=SHARED_HEADERS,
                                 json=native_start_body())
    assert_error(response, 409, "economy_context_required")
    assert resolved == [(PLAYER_ID, "ISLE-K7Q2M")]
    assert [name for name, _arguments in database.calls] == [
        "island_lifecycle_actor_status", "shared_session_wave_replay",
    ]
