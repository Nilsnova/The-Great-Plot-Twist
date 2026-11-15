"""Tests for POST /api/island/reset ("Start fresh", decision D054). The database is a
FakeIslandDatabase (island_helpers.py); the SQL side is island_sql/test_island_reset_sql.py."""

from dataclasses import replace

import httpx

from server.flags import parse_flags
from server.island.catalogue import load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import GUEST, ISLAND_SETTINGS, PLAYER, PLAYER_ID, World
from server.wallet import WALLET_REASONS

START = load_island().starting_coins  # islands.json startingCoins


def reset(world: World, headers=PLAYER, **body):
    request = {"confirm": "RESET", "actionUid": "reset-0001"}
    request.update(body)
    return world.client.post("/api/island/reset", json=request, headers=headers)


def test_a_reset_runs_the_one_database_function_and_answers_the_fresh_island():
    world = World(settings=ISLAND_SETTINGS)

    response = reset(world)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()
    assert body["code"] == "ISLE-K7Q2M" and body["waveBest"] == 0
    (call,) = world.database.calls("island_reset_own")
    # Always the verified player's own island, with the starting coins of islands.json.
    assert call == {"p_player_id": PLAYER_ID, "p_action_uid": "reset-0001", "p_start_coins": START}
    assert ("island_reset", "either") in WALLET_REASONS


def test_a_reset_needs_a_signed_in_player():
    world = World(settings=ISLAND_SETTINGS)

    assert_error(reset(world, headers={}), 401, "unauthorized")
    assert world.database.calls("island_reset_own") == []


def test_a_class_demo_guest_cannot_reset():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))
    assert world.island(headers=GUEST).status_code == 200  # an admitted guest plays

    assert_error(reset(world, headers=GUEST), 403, "sign_in_needed")
    assert world.database.calls("island_reset_own") == []


def test_the_confirm_word_is_required_exactly():
    world = World(settings=ISLAND_SETTINGS)

    for body in ({"confirm": "reset"}, {"confirm": ""}, {"confirm": True}):
        assert_error(reset(world, **body), 422, "validation_error")
    missing = world.client.post(
        "/api/island/reset", json={"actionUid": "reset-0001"}, headers=PLAYER
    )
    assert_error(missing, 422, "validation_error")
    assert_error(reset(world, actionUid="no"), 422, "validation_error")
    assert_error(reset(world, code="ISLE-ZZ234"), 422, "validation_error")  # never another island
    assert world.database.calls("island_reset_own") == []


def test_a_running_wave_answers_409_wave_running():
    world = World(settings=ISLAND_SETTINGS)
    world.database.paid_replies["island_reset_own"] = {
        "status": "refused",
        "reason": "wave_running",
    }

    assert_error(reset(world), 409, "wave_running")


def test_no_island_and_no_player_record_are_404():
    world = World(settings=ISLAND_SETTINGS)
    world.database.paid_replies["island_reset_own"] = {"status": "refused", "reason": "no_island"}
    assert_error(reset(world), 404, "no_island")

    world.database.paid_replies["island_reset_own"] = {
        "status": "refused",
        "reason": "player_not_set_up",
    }
    assert_error(reset(world), 404, "player_not_set_up")


def test_an_answer_that_cannot_be_read_is_a_502_and_a_database_outage_a_503():
    world = World(settings=ISLAND_SETTINGS)
    world.database.paid_replies["island_reset_own"] = {"status": "maybe"}
    assert reset(world).status_code == 502

    world.database.paid_replies["island_reset_own"] = httpx.Response(503, json={})
    assert reset(world).status_code in (502, 503)


def test_the_route_is_off_with_the_islands_flag():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))

    assert_error(reset(world), 404, "feature_off")
