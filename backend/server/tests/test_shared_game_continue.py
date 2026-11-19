"""Host Continue negotiates persisted mode without a private-wallet fallback."""

import httpx
import pytest

from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, opened
from server.tests.test_games_routes import game_world


def shared_context():
    return {
        "status": "ok",
        "economy": {
            "mode": "island_shared", "version": 1, "islandOwner": PLAYER_ID,
            "accountId": "00000000-0000-4000-8000-000000000051",
            "runEpoch": "00000000-0000-4000-8000-000000000052", "revision": "1",
            "treasury": {"balanceCoins": "0", "committedCoins": "0", "availableCoins": "0"},
        },
    }


def test_shared_host_continue_reuses_actual_island_and_stamps_host_without_legacy_open():
    world = game_world()
    world.database.economy_context_replies[PLAYER_ID] = shared_context()
    world.database.open_replies = [{"status": "refused", "reason": "economy_context_required"}]
    before = world.database.balance

    first = world.client.post("/api/games", json={}, headers=PLAYER)
    again = world.client.post("/api/games", json={}, headers=PLAYER)

    assert first.status_code == again.status_code == 200
    assert first.json() == again.json() == {
        "game": {
            "code": "ISLE-K7Q2M", "hostName": "Captain Gull", "role": "host",
            "waveBest": 3, "members": 1, "maxMembers": 10,
        },
        "created": False,
    }
    assert first.headers["cache-control"] == "private, no-store"
    assert world.database.balance == before
    assert not world.database.calls("island_open")
    assert len(world.database.calls("game_join")) == 2


@pytest.mark.parametrize("reply,status,code", [
    ({"status": "unknown"}, 502, "database_error"),
    ({"status": "legacy", "islandOwner": "00000000-0000-4000-8000-000000000053"},
     502, "database_error"),
    ({"status": "ok", "economy": {}}, 502, "database_error"),
    (httpx.Response(503, json={"message": "unavailable"}), 503, "database_unavailable"),
])
def test_context_failure_never_selects_legacy_creation(reply, status, code):
    world = game_world()
    world.database.economy_context_replies[PLAYER_ID] = reply

    answer = world.client.post("/api/games", json={}, headers=PLAYER)

    assert_error(answer, status, code)
    assert not world.database.calls("island_open")
    assert not world.database.calls("game_join")


def test_shared_context_with_missing_island_never_recreates_it():
    world = game_world()
    world.database.islands.clear()
    world.database.economy_context_replies[PLAYER_ID] = shared_context()

    answer = world.client.post("/api/games", json={}, headers=PLAYER)

    assert_error(answer, 404, "no_such_game")
    assert not world.database.calls("island_open")
    assert not world.database.calls("game_join")


def test_explicit_missing_own_island_preserves_legacy_first_creation():
    world = game_world()
    world.database.islands.clear()
    world.database.economy_context_replies[PLAYER_ID] = {"status": "missing_island"}
    world.database.open_replies = [{**opened(), "created": True}]

    answer = world.client.post("/api/games", json={}, headers=PLAYER)

    assert answer.status_code == 200 and answer.json()["created"] is True
    assert len(world.database.calls("island_open")) == 1
    assert len(world.database.calls("game_join")) == 1


@pytest.mark.parametrize("reason", [
    "economy_context_required", "personal_captain_managed", "captain_context_required",
])
def test_admission_or_adoption_after_legacy_discovery_refuses_without_retry(reason):
    world = game_world()
    world.database.open_replies = [{"status": "refused", "reason": reason}]

    answer = world.client.post("/api/games", json={}, headers=PLAYER)

    assert_error(answer, 409, reason)
    assert len(world.database.calls("island_economy_context")) == 1
    assert len(world.database.calls("island_open")) == 1
    assert not world.database.calls("game_join")
