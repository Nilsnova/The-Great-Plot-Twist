"""Tests for the captain's skill tree and weapon shop (docs/TOWER-DEFENSE.md sections 7, 14 and 15):
GET /api/island's skills and weapons, POST /api/island/skill, /weapon/buy and /weapon/equip, every
refusal and the happy paths.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py). The tree,
the prices and the unlock waves come from the real islands.json. The SQL side of the same rules is
in island_sql/test_captain_skills_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

import json
import re
from pathlib import Path

from server.island.catalogue import SKILL_IDS, WEAPON_IDS, load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, World
from server.wallet import WALLET_REASONS

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase"
    / "migrations"
    / "20261112030000_captain_skills.sql"
)
REFUSED = {"status": "refused", "reason": "insufficient_funds", "price": 60}


def world_at(won: int = 0, wave: int | None = None, **progress) -> World:
    world = World(settings=ISLAND_SETTINGS)
    world.database.progress.update(
        won_wave_best=won, wave_best=won if wave is None else wave, **progress
    )
    return world


def skill(world: World, name: str, uid: str = "click-0001"):
    return world.post("/api/island/skill", skill=name, actionUid=uid)


def buy(world: World, name: str, uid: str = "click-0001"):
    return world.post("/api/island/weapon/buy", weapon=name, actionUid=uid)


def equip(world: World, name: str):
    return world.client.post("/api/island/weapon/equip", json={"weapon": name}, headers=PLAYER)


# --- GET /api/island ---


def test_the_island_shows_skill_points_from_won_waves_and_the_weapon_shop():
    world = world_at(7, captain_skills=["steady_aim"], weapons_owned=["musket", "pistols"],
                     weapon_equipped="pistols")  # fmt: skip

    body = world.island().json()

    assert body["skills"]["points"] == 2  # 7 // 2 = 3 earned, 1 spent
    assert (body["skills"]["spent"], body["skills"]["known"]) == (1, ["steady_aim"])
    assert [item["id"] for item in body["skills"]["tree"]] == list(SKILL_IDS)
    assert body["skills"]["tree"][1] == {
        "id": "long_barrel", "name": "Long barrel", "branch": "marksman", "tier": 2, "cost": 2,
        "needs": "steady_aim",
    }  # fmt: skip
    assert body["weapons"]["owned"] == ["musket", "pistols"]
    assert body["weapons"]["equipped"] == "pistols"
    assert [item["id"] for item in body["weapons"]["shop"]] == list(WEAPON_IDS)
    assert body["weapons"]["shop"][1] == {"id": "pistols", "name": "Pistols", "price": 60,
                                          "unlockWave": 2}  # fmt: skip


def test_points_count_only_waves_the_player_won_themselves():
    body = world_at(1, wave=9).island().json()  # the island's best is a friend's win

    assert body["skills"]["points"] == 0


# --- POST /api/island/skill ---


def test_a_skill_is_learnt_with_points_and_the_tree_goes_to_the_database():
    world = world_at(2)

    response = skill(world, "steady_aim")

    assert response.status_code == 200
    (call,) = world.database.calls("island_learn_skill")
    assert (call["p_skill"], call["p_action_uid"], call["p_waves_per_point"]) == (
        "steady_aim", "click-0001", 2,
    )  # fmt: skip
    assert call["p_tree"][2] == {"skill": "quick_hands", "needs": "long_barrel", "cost": 3}
    assert "skills" in response.json()


def test_a_skill_refuses_a_bad_id_known_the_tier_order_and_no_points():
    assert_error(skill(world_at(9), "laser_eyes"), 400, "bad_skill")
    assert_error(skill(world_at(9, captain_skills=["cutlass"]), "cutlass"), 409, "known")
    locked = skill(world_at(9), "long_barrel")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Learn Steady aim first."
    poor = skill(world_at(1), "steady_aim")
    assert_error(poor, 409, "no_points")
    assert poor.json()["error"]["message"] == "Win new waves to earn skill points."
    spent = world_at(5, captain_skills=["steady_aim", "cutlass"])  # 2 earned, 2 spent
    assert_error(skill(spent, "quick_fix"), 409, "no_points")
    assert spent.database.calls("island_learn_skill") == []


def test_a_skill_the_database_refuses_says_why():
    world = world_at(9)
    world.database.paid_replies["island_learn_skill"] = {"status": "refused", "reason": "no_points"}

    assert_error(skill(world, "steady_aim"), 409, "no_points")


def test_a_repeated_skill_click_learns_nothing_and_answers_the_island():
    world = world_at(9, captain_skills=["steady_aim"])
    world.database.skill_refs.add("skill:click-0001")

    assert skill(world, "steady_aim").status_code == 200
    assert world.database.calls("island_learn_skill") == []


def test_a_skill_needs_a_click_id():
    world = world_at(9)

    response = world.client.post("/api/island/skill", json={"skill": "steady_aim"}, headers=PLAYER)

    assert response.status_code == 422


# --- the weapon shop ---


def test_a_weapon_is_bought_with_coins_and_the_price_comes_from_the_file():
    world = world_at(2)

    assert buy(world, "pistols").status_code == 200
    (call,) = world.database.calls("island_weapon_buy")
    assert (call["p_weapon"], call["p_price"], call["p_unlock_wave"]) == ("pistols", 60, 2)


def test_a_weapon_refuses_a_bad_id_owned_locked_and_too_few_coins():
    assert_error(buy(world_at(9), "laser"), 400, "bad_weapon")
    assert_error(buy(world_at(9), "musket"), 409, "owned")
    assert_error(buy(world_at(9, weapons_owned=["musket", "pistols"]), "pistols"), 409, "owned")
    locked = buy(world_at(3), "long_rifle")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Unlocks after wave 6."
    poor = world_at(9)
    poor.database.paid_replies["island_weapon_buy"] = REFUSED
    assert_error(buy(poor, "pistols"), 409, "insufficient_funds")


def test_a_repeated_weapon_click_charges_nothing():
    world = world_at(9, weapons_owned=["musket", "pistols"], weapon_equipped="pistols")
    world.database.ledger_refs.add(("weapon_purchase", "weapon:click-0001"))

    assert buy(world, "pistols").status_code == 200
    assert world.database.calls("island_weapon_buy") == []


def test_equip_needs_a_weapon_you_own():
    assert_error(equip(world_at(9), "laser"), 400, "bad_weapon")
    assert_error(equip(world_at(9), "fire_bombs"), 409, "not_owned")
    world = world_at(9, weapons_owned=["musket", "pistols"])
    assert equip(world, "pistols").status_code == 200
    (call,) = world.database.calls("island_weapon_equip")
    assert call == {"p_player_id": call["p_player_id"], "p_weapon": "pistols"}
    refused = world_at(9, weapons_owned=["musket", "pistols"])
    refused.database.paid_replies["island_weapon_equip"] = {
        "status": "refused",
        "reason": "not_owned",
    }
    assert_error(equip(refused, "pistols"), 409, "not_owned")


def test_the_new_routes_are_closed_while_the_flag_is_off():
    from dataclasses import replace

    from server.flags import parse_flags

    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))
    for path in ("/api/island/skill", "/api/island/weapon/buy"):
        assert_error(world.post(path, skill="sweep", weapon="pistols"), 404, "feature_off")
    assert world.database.requests == []


# --- the file, the migration and the wallet agree ---


def test_the_migration_knows_exactly_the_skills_and_weapons_of_the_file():
    sql = MIGRATION.read_text(encoding="utf-8")
    catalogue = load_island()
    skills_check = re.search(r"islands_captain_skills_known check \((.*?)\);", sql, re.DOTALL)
    weapons_check = re.search(r"islands_weapons_owned_known check \((.*?)\);", sql, re.DOTALL)
    assert skills_check and weapons_check
    assert re.findall(r"'([a-z_]+)'", skills_check.group(1).split("::")[0]) == [
        item.skill for item in catalogue.skills.tree
    ]
    assert re.findall(r"'([a-z_]+)'", weapons_check.group(1).split("::")[0]) == [
        item.weapon for item in catalogue.weapons
    ]
    assert ("weapon_purchase", "spend") in WALLET_REASONS
    assert "security invoker" in sql and "set search_path = ''" in sql
    for name in ("island_learn_skill", "island_weapon_buy", "island_weapon_equip"):
        assert re.search(
            rf"grant execute on function public\.{name}\([^)]*\)\s+to service_role;", sql
        )
    assert "enable row level security" in sql


def test_islands_json_and_the_browser_list_the_same_tree():
    island = json.loads(load_island.__defaults__[0].read_text(encoding="utf-8"))
    assert [item["skill"] for item in island["captainSkills"]["tree"]] == list(SKILL_IDS)
    assert [item["weapon"] for item in island["weapons"]] == list(WEAPON_IDS)
