"""Real API view/action wiring with declared fake transport; not SQL or production proof."""

from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.tests.island_helpers import FRIEND_ID, ISLAND_SETTINGS, PLAYER_ID, World
from server.tests.test_island_routes import friend_island


def admitted(world, owner=PLAYER_ID):
    world.database.wall_policies[owner] = {"ruleVersion": 1, "capacity": 128}
    world.database.layout_rows_by_owner[owner] = [{"plot": "wall_128", "x_half": 8, "z_half": -39}]
    world.database.buildings[owner] = [{"plot": "wall_128", "building_type": "wall", "level": 1}]
    return world


def selected(answer):
    return next(spot for spot in answer["spots"] if spot["id"] == "wall_128")


@pytest.mark.parametrize("placement_on", [False, True])
def test_paid_owner_positions_survive_paused_placement_and_empty_inventory_is_hidden(placement_on):
    settings = replace(
        ISLAND_SETTINGS, flags=parse_flags("islands,placement" if placement_on else "islands")
    )
    world = admitted(World(settings=settings))
    answer = world.island().json()
    assert (selected(answer)["x"], selected(answer)["z"]) == (4, -19.5)
    assert answer["layout"] == {
        "version": 2,
        "grid": 0.5,
        "movable": placement_on,
        "wallRuleVersion": 1,
        "wallCapacity": 128,
    }
    assert len(answer["spots"]) == 23 and all(s["id"] != "wall_13" for s in answer["spots"])
    world.database.buildings[PLAYER_ID] = []
    assert len(world.island().json()["spots"]) == 22


def test_visit_uses_owner_policy_instead_of_the_visitors_legacy_policy():
    world = World()
    friend_island(world)
    admitted(world, FRIEND_ID)
    own = world.island().json()
    visited = world.visit("ISLE-K7Q2M").json()
    assert own["layout"]["wallCapacity"] == 12
    assert visited["layout"]["wallCapacity"] == 128
    assert (selected(visited)["x"], selected(visited)["z"]) == (4, -19.5)


def test_paid_new_piece_without_an_authoritative_position_is_not_hidden_or_defaulted():
    world = admitted(World())
    world.database.layout_rows_by_owner[PLAYER_ID] = []
    response = world.island()
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "database_error"


def test_unpositioned_old_build_cannot_charge_an_additional_wall_id():
    world = admitted(World())
    world.database.balance = 10000
    response = world.build(spot="wall_13", kind="wall")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "position_required"
    assert world.database.calls("islet_build") == world.database.calls("island_build") == []


def test_existing_single_upgrade_uses_owner_cohort_and_real_level_price_rules():
    world = admitted(World())
    world.database.progress["wave_best"] = 100
    response = world.post("/api/island/upgrade", spot="wall_128")
    assert response.status_code == 200
    assert selected(response.json())["upgradeCost"] == 20
    (call,) = world.database.calls("island_upgrade")
    assert call["p_plot"] == "wall_128" and call["p_unlocked_level"] == 5
    assert call["p_prices"] == [10, 20, 40, 80, 160]


def test_legacy_owner_cannot_use_additional_piece_actions():
    world = World()
    response = world.post("/api/island/upgrade", spot="wall_128")
    assert response.status_code == 404
    assert world.database.calls("island_upgrade") == []


def test_wall_specialization_and_demolition_quote_recognize_owned_additional_ids():
    world = admitted(World())
    world.database.research = [{"branch": "wall", "tier": 1}]
    specialised = world.post("/api/island/tower-skill", spot="wall_128", spec="stone")
    assert specialised.status_code == 200
    assert world.database.calls("island_specialise")[0]["p_plot"] == "wall_128"
    world.database.paid_replies["island_demolish_quote"] = {
        "status": "quote",
        "plot": "wall_128",
        "kind": "wall",
        "level": 1,
        "refunds": [],
    }
    quote = world.client.get(
        "/api/island/demolish",
        params={"spot": "wall_128"},
        headers={"Authorization": "Bearer test.player.signature"},
    )
    assert quote.status_code == 200 and quote.json()["spot"] == "wall_128"
    assert world.database.calls("island_demolish_quote")[0]["p_plot"] == "wall_128"


def test_wrong_intent_demolition_receipt_is_a_clear_conflict():
    world = admitted(World())
    world.database.paid_replies["island_demolish"] = {
        "status": "refused",
        "reason": "action_uid_conflict",
    }
    response = world.post("/api/island/demolish", spot="wall_128")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "action_uid_conflict"
