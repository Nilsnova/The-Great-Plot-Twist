from uuid import UUID

import pytest

from server.island import wave_recovery
from server.island import waves as wave_service
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, World

WAVE = UUID("11111111-1111-4111-8111-111111111111")
TOKEN = UUID("22222222-2222-4222-8222-222222222222")


def test_recovery_transport_routes_are_registered_and_authenticated():
    world = World()
    paths = world.client.get("/api/openapi.json").json()["paths"]
    assert "/api/waves/{wave_id}/inputs" in paths
    assert "/api/waves/{wave_id}/events" in paths
    assert "/api/waves/{wave_id}/health" in paths
    assert_error(
        world.client.get(f"/api/waves/{WAVE}/events"),
        401,
        "unauthorized",
    )


def test_first_event_page_omits_fixed_frontier_and_keeps_the_response_shape(monkeypatch):
    world = World()
    calls = []
    frontiers = [(2, 12), (3, 16)]

    async def read_events(admin, player_id, wave_id, after, through, sealed_through_tick):
        calls.append((player_id, wave_id, after, through, sealed_through_tick))
        head_seq, sealed_tick = frontiers[len(calls) - 1]
        return wave_recovery.RecoveryEventPage(
            headSeq=head_seq, sealedThroughTick=sealed_tick, through=None, events=[]
        )

    monkeypatch.setattr(wave_recovery, "read_events", read_events)
    # Simulate losing the first HTTP response, then retrying the initial request as the same actor.
    response = world.client.get(f"/api/waves/{WAVE}/events", headers=PLAYER)
    retry = world.client.get(f"/api/waves/{WAVE}/events?after=0", headers=PLAYER)

    assert response.status_code == 200, response.text
    assert response.json() == {"headSeq": 2, "sealedThroughTick": 12, "events": []}
    assert retry.status_code == 200, retry.text
    assert retry.json() == {"headSeq": 3, "sealedThroughTick": 16, "events": []}
    assert len(calls) == 2
    assert all(call[1:] == (WAVE, 0, None, None) for call in calls)


def test_event_page_retries_send_the_complete_fixed_frontier(monkeypatch):
    world = World()
    calls = []

    async def read_events(admin, player_id, wave_id, after, through, sealed_through_tick):
        calls.append((player_id, wave_id, after, through, sealed_through_tick))
        return wave_recovery.RecoveryEventPage(
            headSeq=3, sealedThroughTick=40, through=through, events=[]
        )

    monkeypatch.setattr(wave_recovery, "read_events", read_events)
    response = world.client.get(
        f"/api/waves/{WAVE}/events?after=0&through=3&sealedThroughTick=40",
        headers=PLAYER,
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "headSeq": 3,
        "sealedThroughTick": 40,
        "through": 3,
        "events": [],
    }
    assert calls[0][1:] == (WAVE, 0, 3, 40)


def test_event_page_accepts_the_empty_sealed_frontier(monkeypatch):
    world = World()

    async def read_events(admin, player_id, wave_id, after, through, sealed_through_tick):
        assert (after, through, sealed_through_tick) == (0, 0, -1)
        return wave_recovery.RecoveryEventPage(
            headSeq=0, sealedThroughTick=-1, through=0, events=[]
        )

    monkeypatch.setattr(wave_recovery, "read_events", read_events)
    response = world.client.get(
        f"/api/waves/{WAVE}/events?through=0&sealedThroughTick=-1", headers=PLAYER
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "headSeq": 0,
        "sealedThroughTick": -1,
        "through": 0,
        "events": [],
    }


@pytest.mark.parametrize(
    "query",
    [
        "through=3",
        "sealedThroughTick=40",
        "through=3&sealedThroughTick=-2",
        "through=-1&sealedThroughTick=40",
    ],
)
def test_event_page_requires_bounded_paired_frontier(query):
    response = World().client.get(f"/api/waves/{WAVE}/events?{query}", headers=PLAYER)
    assert response.status_code == 422


def test_input_route_returns_accepted_events_as_direct_response(monkeypatch):
    world = World()

    async def append(admin, player_id, wave_id, inputs, *, arsenal=False):
        assert player_id
        assert wave_id == WAVE
        assert inputs[0].command == {"type": "captain_move", "x": 1, "z": 2}
        assert inputs[0].tick == 5
        return wave_recovery.RecoveryInputResult(
            accepted=[
                wave_recovery.RecoveryEvent(
                    serverSeq=1,
                    effectiveTick=5,
                    type="captain_input",
                    participantToken=TOKEN,
                    payload={
                        "inputUid": "input_001",
                        "actorCounter": 1,
                        "participantToken": str(TOKEN),
                        "command": {"type": "captain_move", "x": 1, "z": 2},
                        "captain": {"level": 1, "skills": [], "weapon": "musket"},
                    },
                )
            ],
            headSeq=1,
        )

    monkeypatch.setattr(wave_recovery, "append_inputs", append)
    response = world.client.post(
        f"/api/waves/{WAVE}/inputs",
        headers=PLAYER,
        json={
            "waveProtocol": 2,
            "inputs": [
                {
                    "inputUid": "input_001",
                    "actorCounter": 1,
                    "tick": 5,
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "accepted": [
            {
                "serverSeq": 1,
                "effectiveTick": 5,
                "type": "captain_input",
                "participantToken": str(TOKEN),
                "payload": {
                    "inputUid": "input_001",
                    "actorCounter": 1,
                    "participantToken": str(TOKEN),
                    "command": {"type": "captain_move", "x": 1, "z": 2},
                    "captain": {"level": 1, "skills": [], "weapon": "musket"},
                },
            }
        ],
        "headSeq": 1,
    }


@pytest.mark.parametrize("wave_protocol", [0, 1, 3, True])
def test_input_route_requires_explicit_protocol2(wave_protocol):
    world = World()
    response = world.client.post(
        f"/api/waves/{WAVE}/inputs",
        headers=PLAYER,
        json={"waveProtocol": wave_protocol, "inputs": []},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("survived", [True, False])
def test_protocol2_finish_keeps_the_saved_outcome_and_maps_balance(monkeypatch, survived):
    world = World()

    async def finish(*args, **kwargs):
        return {
            "survived": survived,
            "loot": 15,
            "balance": 115,
            "waveBest": 1,
            "flags": 1,
            "boss": False,
            "recovery": {
                "waveId": str(WAVE),
                "islandEpoch": "33333333-3333-4333-8333-333333333333",
                "closedAt": "2026-11-17T02:00:00Z",
                "closedHp": {"instance-1": 987654},
                "checkpointUid": "checkpoint_001",
                "throughTick": 30,
                "inputHeadSeq": 4,
                "lastRepairSeq": 1,
                "basisRepairSeq": {"instance-1": 1},
            },
        }

    monkeypatch.setattr(wave_service, "finish_protocol2", finish)
    response = world.finish(
        waveProtocol=2,
        checkpoint={
            "islandEpoch": "33333333-3333-4333-8333-333333333333",
            "checkpointUid": "checkpoint_001",
            "throughTick": 30,
            "inputHeadSeq": 4,
            "lastRepairSeq": 1,
            "basisRepairSeq": {"33333333-3333-4333-8333-333333333333": 1},
            "hpUnits": {"33333333-3333-4333-8333-333333333333": 987654},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["coins"] == 115
    assert response.json()["survived"] is survived
    assert response.json()["recovery"]["closedHp"] == {"instance-1": 987654}


@pytest.mark.parametrize("survived", [None, 1, "true"])
def test_protocol2_finish_refuses_an_unreadable_saved_outcome(monkeypatch, survived):
    async def finish(*args, **kwargs):
        return {"survived": survived, "recovery": {}}

    monkeypatch.setattr(wave_service, "finish_protocol2", finish)
    response = World().finish(waveProtocol=2, checkpoint=CHECKPOINT)
    assert_error(response, 502, "database_error")


def _current_v2(world):
    return world.client.get(
        "/api/waves/current", params={"where": "own", "waveProtocol": 2}, headers=PLAYER
    )


RUNNING = {
    "status": "running",
    "waveId": str(WAVE),
    "wave": 3,
    "seed": 123456789,
    "startsAt": "2026-11-10T12:00:10+00:00",
    "weatherKind": "calm",
    "ships": 1.0,
    "fog": 0,
    "place": "island",
}
JOINABLE = {**RUNNING, "recoveryVersion": 1, "waveProtocol": 2, "joined": False}


def test_a_member_who_has_not_joined_gets_the_joinable_recovery_wave_without_a_token():
    world = World()
    world.database.recovery_current_reply = JOINABLE

    response = _current_v2(world)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["waveId"] == str(WAVE) and body["wave"] == 3 and body["seed"] == 123456789
    assert body["recoveryVersion"] == 1 and body["waveProtocol"] == 2
    assert "participantToken" not in body
    assert "initialSnapshot" not in body
    assert "lastActorCounter" not in body


def test_a_joinable_answer_still_needs_the_protocol2_client():
    world = World()
    world.database.recovery_current_reply = JOINABLE

    assert_error(world.current(), 409, "client_update_required")


def test_a_recovery_wave_without_snapshot_is_only_accepted_as_not_joined():
    world = World()
    world.database.recovery_current_reply = {
        **JOINABLE,
        "joined": True,
        "participantToken": str(TOKEN),
        "lastActorCounter": 0,
    }

    assert _current_v2(world).status_code == 502


def test_a_participant_still_gets_their_token_and_snapshot():
    world = World()
    snapshot = {"recoveryVersion": 1, "waveProtocol": 2, "participants": []}
    world.database.recovery_current_reply = {
        **JOINABLE,
        "joined": True,
        "initialSnapshot": snapshot,
        "participantToken": str(TOKEN),
        "lastActorCounter": 4,
    }

    body = _current_v2(world).json()

    assert body["participantToken"] == str(TOKEN)
    assert body["initialSnapshot"] == snapshot
    assert body["lastActorCounter"] == 4


def test_an_outsider_is_still_refused_the_recovery_wave():
    world = World()
    world.database.recovery_current_reply = {"status": "refused", "reason": "not_in_wave"}

    assert_error(_current_v2(world), 403, "not_in_wave")


CHECKPOINT = {
    "islandEpoch": "33333333-3333-4333-8333-333333333333",
    "checkpointUid": "checkpoint_001",
    "throughTick": 30,
    "inputHeadSeq": 4,
    "lastRepairSeq": 1,
    "basisRepairSeq": {"33333333-3333-4333-8333-333333333333": 1},
    "hpUnits": {"33333333-3333-4333-8333-333333333333": 987654},
}


def test_protocol2_finish_too_early_is_a_409_with_retry_after_not_a_502(monkeypatch):
    # Finding 8: the recovery finish RPC answers too_early like the legacy one; it used to fall
    # through to a 502, which the client retried every 250 ms until the bell budget ran out.
    world = World()

    async def refused(admin, function, arguments, *, statuses):
        assert function == "recovery_wave_finish"
        wave_recovery._refusal({"status": "refused", "reason": "too_early", "waitSeconds": 4})

    monkeypatch.setattr(wave_recovery, "call_lifecycle_rpc", refused)
    response = world.finish(waveProtocol=2, checkpoint=CHECKPOINT)
    assert_error(response, 409, "wave_too_early")
    assert response.headers["retry-after"] == "4"


def test_too_early_without_a_usable_wait_still_asks_for_one_second():
    with pytest.raises(wave_recovery.ApiError) as raised:
        wave_recovery._refusal({"status": "refused", "reason": "too_early", "waitSeconds": True})
    assert (raised.value.status_code, raised.value.code) == (409, "wave_too_early")
    assert raised.value.headers == {"Retry-After": "1"}


def test_event_page_passes_the_closed_flag_through_and_stays_without_it_on_older_sql():
    # 20261118030000 adds closed to every page; the client ends a wave closed while it was away.
    page = wave_recovery.RecoveryEventPage.model_validate(
        {"headSeq": 3, "sealedThroughTick": 40, "through": None, "events": [], "closed": True}
    )
    assert page.model_dump(by_alias=True, exclude_none=True)["closed"] is True
    older = wave_recovery.RecoveryEventPage.model_validate(
        {"headSeq": 3, "sealedThroughTick": 40, "through": None, "events": []}
    )
    assert "closed" not in older.model_dump(by_alias=True, exclude_none=True)
    with pytest.raises(ValueError):
        wave_recovery.RecoveryEventPage.model_validate(
            {"headSeq": 3, "sealedThroughTick": 40, "events": [], "closed": "yes"}
        )
