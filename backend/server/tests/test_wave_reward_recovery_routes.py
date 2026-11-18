"""Saved reward recovery API contract, used by the return/reconnect task."""

from copy import deepcopy
from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    WAVE_ID,
    World,
)

REPLY = {
    "status": "done",
    "coins": 115,
    "wonWaveBest": 5,
    "recovered": [{"waveId": WAVE_ID, "wave": 5, "survived": True, "loot": 15}],
    "hasMore": False,
}


def answer_with(monkeypatch, reply):
    calls = []

    async def call(self, name, arguments):
        calls.append((name, arguments))
        return deepcopy(reply)

    monkeypatch.setattr(SupabaseAdmin, "call_function", call)
    return calls


def test_recovers_only_the_verified_callers_saved_rewards_even_with_islands_off(monkeypatch):
    calls = answer_with(monkeypatch, REPLY)
    settings = replace(ISLAND_SETTINGS, flags=parse_flags(""))
    response = World(settings).client.post("/api/waves/recover", headers=PLAYER, json={})
    assert response.status_code == 200, response.text
    assert response.json() == {key: value for key, value in REPLY.items() if key != "status"}
    assert response.headers["cache-control"] == "private, no-store"
    assert calls == [("recovery_wave_recover_rewards", {"p_player_id": PLAYER_ID})]


def test_an_empty_repeat_still_returns_current_wallet_and_personal_progress(monkeypatch):
    answer_with(monkeypatch, {**REPLY, "recovered": [], "coins": 160, "wonWaveBest": 10})
    response = World().client.post("/api/waves/recover", headers=PLAYER, json={})
    assert response.status_code == 200
    assert response.json() == {"coins": 160, "wonWaveBest": 10, "recovered": [], "hasMore": False}


@pytest.mark.parametrize("body", [{"playerId": PLAYER_ID}, {"waveId": WAVE_ID}, {"loot": 999}])
def test_reward_recovery_accepts_no_player_outcome_or_amount_input(monkeypatch, body):
    calls = answer_with(monkeypatch, REPLY)
    response = World().client.post("/api/waves/recover", headers=PLAYER, json=body)
    assert_error(response, 422, "validation_error")
    assert calls == []


def test_reward_recovery_requires_signin_and_preserves_guest_admission(monkeypatch):
    calls = answer_with(monkeypatch, REPLY)
    world = World()
    assert_error(world.client.post("/api/waves/recover", json={}), 401, "unauthorized")
    assert_error(
        world.client.post("/api/waves/recover", headers=GUEST, json={}), 403, "demo_closed"
    )
    assert calls == []


def test_an_admitted_guest_recovers_only_their_own_saved_rewards(monkeypatch):
    calls = answer_with(monkeypatch, {**REPLY, "recovered": []})
    world = World(replace(ISLAND_SETTINGS, flags=parse_flags("demo")))
    response = world.client.post("/api/waves/recover", headers=GUEST, json={})
    assert response.status_code == 200, response.text
    assert calls == [("recovery_wave_recover_rewards", {"p_player_id": GUEST_ID})]


@pytest.mark.parametrize(
    "change",
    [
        {"coins": "115"},
        {"wonWaveBest": True},
        {"hasMore": 1},
        {"recovered": [{"waveId": WAVE_ID, "wave": 5, "survived": 1, "loot": 15}]},
        {"recovered": [{"waveId": WAVE_ID, "wave": 5, "survived": False, "loot": 15}]},
        {"recovered": REPLY["recovered"] * 21},
        {"recovered": REPLY["recovered"] * 2},
        {"recovered": [], "hasMore": True},
    ],
)
def test_unreadable_saved_reward_responses_are_not_published(monkeypatch, change):
    answer_with(monkeypatch, {**REPLY, **change})
    response = World().client.post("/api/waves/recover", headers=PLAYER, json={})
    assert_error(response, 502, "database_error")


def test_a_missing_wallet_is_not_created_or_funded_by_recovery(monkeypatch):
    answer_with(monkeypatch, {"status": "refused", "reason": "player_not_set_up"})
    response = World().client.post("/api/waves/recover", headers=PLAYER, json={})
    assert_error(response, 404, "player_not_set_up")


def test_reward_recovery_uses_the_existing_wave_budget(monkeypatch):
    calls = answer_with(monkeypatch, {**REPLY, "recovered": []})
    world = World()
    for _ in range(20):
        assert world.client.post("/api/waves/recover", headers=PLAYER, json={}).status_code == 200
    response = world.client.post("/api/waves/recover", headers=PLAYER, json={})
    assert_error(response, 429, "too_many_requests")
    assert int(response.headers["retry-after"]) > 0
    assert len(calls) == 20
