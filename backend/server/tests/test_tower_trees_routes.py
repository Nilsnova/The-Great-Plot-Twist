"""Tower upgrade trees and the swivel-gun nest (decision D055): POST /api/island/tower-tree.

The server checks the tier (rules.check_tree: the path, the level, the tier before it, the
Bloons rule, the wave) and sends tower_trees.json's price with the click id to
island_tower_tree(); the database takes the coins and sets the tier in one step. Nothing here
uses the network: the database is a FakeIslandDatabase (island_helpers.py). The SQL side (the
charge under the island lock, a repeat paid once, the check rules) is
island_sql/test_tower_trees_sql.py.
"""

import json
from pathlib import Path

import pytest

from server.island.catalogue import (
    IslandFileError,
    catalogue_for_flags,
    load_island,
    read_tower_trees,
)
from server.tests.helpers import assert_error
from server.tests.island_helpers import GUEST, GUEST_ID, PLAYER, PLAYER_ID
from server.tests.test_tech_hub_routes import game_of_owner, world_at

TREES_FILE = Path(__file__).resolve().parents[2] / "content" / "tower_trees.json"
PRICES = {
    "cannon": (1000, 2200, 4800),
    "mortar": (1200, 2600, 5600),
    "harpoon": (700, 1500, 3200),
    "culverin": (1400, 2800, 6000),
    "swivel": (900, 2000, 4400),
}


def tree(world, spot="cannon_1", path="a", tier=1, headers=PLAYER, **body):
    body = {"spot": spot, "path": path, "tier": tier, "actionUid": "click-0001", **body}
    return world.client.post("/api/island/tower-tree", json=body, headers=headers)


def cannon(world, level=5, tree_a=0, tree_b=0, kind="cannon"):
    world.database.buildings[PLAYER_ID] = [
        {
            "plot": "cannon_1",
            "building_type": kind,
            "level": level,
            "tree_a": tree_a,
            "tree_b": tree_b,
        }
    ]


def test_the_file_reads_five_kinds_with_rising_prices_and_the_campaign_waves():
    catalogue = load_island()
    assert {t.kind: t.prices for t in catalogue.trees} == PRICES
    assert {t.waves for t in catalogue.trees} == {(20, 35, 45)}
    assert {t.level for t in catalogue.trees} == {5}
    cannon_tree = next(t for t in catalogue.trees if t.kind == "cannon")
    assert [(p.path, p.id, p.name) for p in cannon_tree.paths] == [
        ("a", "drill", "Drill"),
        ("b", "powder", "Powder"),
    ]
    assert cannon_tree.tier_name("a", 2) == "Drill II"
    # The culverin's tree only counts while its kind is in the catalogue (the flag defenses_v2).
    assert catalogue.tree_of("culverin") is None
    assert catalogue_for_flags(catalogue, {"defenses_v2": True}).tree_of("culverin") is not None


def test_a_broken_file_is_refused_with_a_clear_message(tmp_path):
    catalogue = load_island()
    good = json.loads(TREES_FILE.read_text())
    cases = [
        ({**good, "steps": ["tree_1", "tree_2"]}, "steps"),
        ({**good, "steps": ["tree_1", "tree_2", "nope"]}, "nope"),
        ({**good, "kinds": [{**good["kinds"][0], "kind": "wall"}]}, "wall"),
        ({**good, "kinds": [{**good["kinds"][0], "prices": [3000, 2000, 1000]}]}, "rising"),
    ]
    for data, word in cases:
        path = tmp_path / "tower_trees.json"
        path.write_text(json.dumps(data))
        with pytest.raises(IslandFileError, match=word):
            read_tower_trees(catalogue.campaign, catalogue.kinds, path)


def test_the_island_answer_carries_the_tree_of_each_tower_and_the_prices():
    world = world_at(40)
    cannon(world, tree_a=2, tree_b=1)
    body = world.island().json()
    shown = next(spot for spot in body["spots"] if spot["id"] == "cannon_1")
    assert shown["tree"] == {"a": 2, "b": 1}
    assert next(spot for spot in body["spots"] if spot["id"] == "wall_1")["tree"] is None
    trees = body["prices"]["towerTrees"]
    assert set(trees) == {"cannon", "mortar", "harpoon", "swivel"}  # the culverin: flag off
    assert trees["cannon"] == {
        "prices": [1000, 2200, 4800],
        "waves": [20, 35, 45],
        "level": 5,
        "a": {"id": "drill", "name": "Drill"},
        "b": {"id": "powder", "name": "Powder"},
    }
    assert body["unlocks"]["locked"] == {}
    assert body["campaign"]["locked"] == {"tree_3": 45, "tier_50": 50, "final_battle": 99}


def test_a_tier_sends_its_price_wave_and_the_click_id():
    world = world_at(45)
    cannon(world, tree_a=1, tree_b=1)
    assert tree(world, path="a", tier=2).status_code == 200
    (call,) = world.database.calls("island_tower_tree")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "cannon_1",
        "p_kind": "cannon",
        "p_path": "a",
        "p_tier": 2,
        "p_action_uid": "click-0001",
        "p_price": 2200,
        "p_unlock_wave": 35,
        "p_level": 5,
    }


@pytest.mark.parametrize(
    ("built", "path", "tier", "wave", "status", "code", "message"),
    [
        ({"level": 4}, "a", 1, 45, 409, "needs_level", "Raise it to level 5 first."),
        ({}, "a", 2, 45, 409, "needs_tier", "Buy Drill I first."),
        ({"tree_a": 1}, "a", 1, 45, 409, "known", "Drill I is bought already."),
        ({"tree_a": 2, "tree_b": 1}, "b", 2, 45, 409, "closed", "Closed: Drill is past tier 1."),
        ({"tree_a": 1}, "a", 2, 30, 409, "locked", "Opens after wave 35."),
        ({}, "a", 1, 19, 409, "locked", "Opens after wave 20."),
        ({"kind": "harpoon", "tree_b": 2}, "b", 3, 44, 409, "locked", "Opens after wave 45."),
    ],
)
def test_the_rules_refuse_before_the_database_is_asked(
    built, path, tier, wave, status, code, message
):
    world = world_at(wave)
    cannon(world, **built)
    refused = tree(world, path=path, tier=tier)
    assert_error(refused, status, code)
    assert refused.json()["error"]["message"] == message
    assert world.database.calls("island_tower_tree") == []


def test_a_wall_has_no_tree_and_an_empty_spot_is_not_built():
    world = world_at(45)
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall", "level": 5}]
    assert_error(tree(world, spot="wall_1"), 422, "no_tree")
    assert_error(tree(world, spot="cannon_2"), 409, "not_built")
    assert_error(tree(world, path="c"), 422, "validation_error")
    assert_error(tree(world, tier=4), 422, "validation_error")


def test_a_repeated_click_id_is_answered_without_paying_again():
    world = world_at(45)
    cannon(world)
    world.database.ledger_refs.add(("tower_tree", "towertree:click-0001"))
    assert tree(world).status_code == 200
    assert world.database.calls("island_tower_tree") == []


def test_not_enough_coins_names_the_tier_and_its_price():
    world = world_at(45)
    cannon(world)
    world.database.paid_replies["island_tower_tree"] = {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": 1000,
    }
    refused = tree(world)
    assert_error(refused, 409, "insufficient_funds")
    assert refused.json()["error"]["message"] == "Drill I costs 1000 coins. You need more coins."


def test_a_member_pays_with_their_own_coins_and_a_stranger_is_refused():
    world = world_at(45)
    game_of_owner(world)
    world.database.progress.update(wave_best=45)
    cannon(world, kind="swivel")
    assert tree(world, path="b", headers=GUEST, code="ISLE-K7Q2M").status_code == 200
    (call,) = world.database.calls("island_tower_tree")
    assert (call["p_player_id"], call["p_island_owner"], call["p_kind"], call["p_price"]) == (
        GUEST_ID,
        PLAYER_ID,
        "swivel",
        900,
    )
    other = world_at(45)
    game_of_owner(other, member=False)
    assert_error(tree(other, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")


def test_a_swivel_nest_is_built_on_a_tower_spot_after_wave_nine():
    early = world_at(8)
    assert_error(early.build(spot="cannon_2", kind="swivel"), 409, "locked")
    later = world_at(9)
    assert later.build(spot="cannon_2", kind="swivel").status_code == 200
    assert_error(later.build(spot="wall_1", kind="swivel"), 422, "wrong_kind")
