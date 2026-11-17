"""Perimeter offer authority and strict HTTP transport, using declared local database fakes."""

from dataclasses import replace

import pytest

from server.flags import default_flags, parse_flags
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, PLAYER_ID, World
from server.tests.test_island_routes import friend_island

FLAGS = "islands,placement,perimeter_walls,structure_recovery"


def world(flags=FLAGS):
    return World(settings=replace(ISLAND_SETTINGS, flags=parse_flags(flags)))


def post(game, action, **body):
    return game.client.post("/api/island/walls/" + action, json=body, headers=PLAYER)


def test_admission_preserves_displayed_legacy_geometry_without_buying_pieces():
    game = world()
    game.database.layout_rows = [
        {"plot": "wall_11", "x_half": -8, "z_half": -11},
        {"plot": "cannon_1", "x_half": 38, "z_half": 2},
    ]
    before = {s["id"]: (s["x"], s["z"]) for s in game.island().json()["spots"]}
    assert before["wall_11"] != (-4, -5.5)
    response = post(game, "enable")
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    answer = response.json()
    assert answer["layout"]["wallCapacity"] == 128
    assert {s["id"]: (s["x"], s["z"]) for s in answer["spots"]} == before
    (call,) = game.database.calls("island_wall_policy_admit")
    assert len(call["p_effective"]) == 26
    assert call["p_seen"] == sorted(game.database.layout_rows, key=lambda row: row["plot"])
    assert game.database.calls("islet_build") == game.database.calls("island_build") == []


def test_only_the_owner_may_enable_another_islands_policy():
    game = world()
    friend_island(game)
    response = post(game, "enable", code="ISLE-K7Q2M")
    assert response.status_code == 403 and response.json()["error"]["code"] == "owner_only"
    assert game.database.calls("island_wall_policy_admit") == []


@pytest.mark.parametrize(
    "flags,code",
    [
        ("islands,placement,structure_recovery", "feature_off"),
        ("islands,perimeter_walls,structure_recovery", "feature_off"),
        ("islands,placement,perimeter_walls", "client_update_required"),
    ],
)
def test_new_offers_require_explicit_flags_placement_and_recovery_capability(flags, code):
    game = world(flags)
    assert default_flags()["perimeter_walls"] is False
    response = post(game, "enable")
    assert response.json()["error"]["code"] == code
    assert game.database.calls("island_wall_policy_admit") == []


def test_persisted_v1_capability_survives_its_flag_being_paused():
    game = world("islands,placement,perimeter_walls")
    game.database.recovery_policy_version = 1
    assert post(game, "enable").status_code == 200
    game.app.state.settings = replace(game.app.state.settings, flags=parse_flags("islands"))
    assert post(game, "enable").json()["layout"]["wallCapacity"] == 128
    assert len(game.database.calls("island_wall_policy_admit")) == 1


@pytest.mark.parametrize("engineer,unit", [(False, 10), (True, 9)])
def test_quote_returns_current_price_ids_remaining_and_trusted_reset_epoch(engineer, unit):
    game = world()
    assert post(game, "enable").status_code == 200
    if engineer:
        game.database.progress.update(captain_level=5, captain_role="engineer")
    response = post(game, "quote", cells=[{"x": 4, "z": -19.5}, {"x": 6, "z": -19.5}])
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "placements": [
            {"spot": "wall_1", "x": 4, "z": -19.5},
            {"spot": "wall_2", "x": 6, "z": -19.5},
        ],
        "unitCost": unit,
        "totalCost": unit * 2,
        "remaining": 126,
        "wallRuleVersion": 1,
        "wallCapacity": 128,
        "islandEpoch": game.database.wall_epochs[PLAYER_ID],
    }


@pytest.mark.parametrize(
    "body",
    [
        {"cells": []},
        {"cells": [{"x": 4, "z": -19.5}] * 33},
        {"cells": [{"x": True, "z": 0}]},
        {"cells": [{"x": "4", "z": 0}]},
        {"cells": [{"x": 4.25, "z": -19.5}]},
        {"cells": [{"x": 4, "z": -19.5}], "wallCapacity": 128},
    ],
)
def test_quote_refuses_malformed_or_client_selected_authority(body):
    game = world()
    assert post(game, "enable").status_code == 200
    assert post(game, "quote", **body).status_code == 422


def test_busy_or_active_wave_admission_never_sends_a_false_success():
    game = world()
    game.database.wall_admit_reply = {"status": "refused", "reason": "wave_running"}
    response = post(game, "enable")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "wave_running"
    assert PLAYER_ID not in game.database.wall_policies
