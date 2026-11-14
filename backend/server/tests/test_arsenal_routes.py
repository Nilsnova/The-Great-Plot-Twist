"""Tests for the island arsenal routes (T40, T41, D042): GET /api/island/arsenal and POST
/api/island/arsenal/buy, /take and /return, behind the flags "islands" and "arsenal".

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py) whose
arsenal_* functions answer what a test queues. The invariants themselves (20 slots, exclusive
possession, repeats, concurrency, full-rack returns, departed captains) are proven on a real
PostgreSQL in island_sql/test_arsenal_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from dataclasses import replace
from pathlib import Path

from server.flags import parse_flags
from server.island import permissions
from server.island.arsenal_policy import ACTIONS, MATRIX_ACTION
from server.island.arsenal_rules import CAPACITY
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    COPY_ID,
    FRIEND_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    World,
)

ARSENAL_SETTINGS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,arsenal"))
MIGRATION = (
    Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20261114120000_arsenal.sql"
)


def world_at(won: int = 0, settings=ARSENAL_SETTINGS) -> World:
    world = World(settings=settings)
    world.database.progress.update(won_wave_best=won, wave_best=won)
    return world


def refused(reason: str, price: int = 0) -> dict:
    return {"status": "refused", "reason": reason, "price": price}


def buy(world: World, weapon: str = "pistols", **body):
    return world.post("/api/island/arsenal/buy", weapon=weapon, **body)


def take(world: World, copy: str = COPY_ID, **body):
    return world.post("/api/island/arsenal/take", copy=copy, **body)


def give_back(world: World, **body):
    return world.post("/api/island/arsenal/return", **body)


# --- the flag: off keeps today's game exactly as it is ---


def test_every_arsenal_route_is_hidden_while_the_flag_is_off():
    world = world_at(9, settings=ISLAND_SETTINGS)
    assert_error(world.client.get("/api/island/arsenal", headers=PLAYER), 404, "feature_off")
    assert_error(buy(world), 404, "feature_off")
    assert_error(take(world), 404, "feature_off")
    assert_error(give_back(world), 404, "feature_off")
    assert world.database.calls("arsenal_state") == []


def test_the_old_weapon_shop_still_sells_while_the_flag_is_off():
    world = world_at(9, settings=ISLAND_SETTINGS)
    answer = world.post("/api/island/weapon/buy", weapon="pistols")
    assert answer.status_code == 200
    assert len(world.database.calls("island_weapon_buy")) == 1


def test_the_old_weapon_shop_points_to_the_arsenal_while_the_flag_is_on():
    world = world_at(9)
    assert_error(world.post("/api/island/weapon/buy", weapon="pistols"), 409, "use_arsenal")
    assert world.database.calls("island_weapon_buy") == []


def test_signing_in_is_needed():
    world = world_at(9)
    assert world.client.get("/api/island/arsenal").status_code == 401


# --- look ---


def test_the_arsenal_shows_copies_holders_the_rack_and_the_types():
    world = world_at(4)
    answer = world.client.get("/api/island/arsenal", headers=PLAYER)

    assert answer.status_code == 200
    data = answer.json()
    assert (data["capacity"], data["stored"], data["mine"], data["carried"]) == (
        20,
        0,
        COPY_ID,
        "pistols",
    )
    assert data["copies"][0] == {
        "id": COPY_ID, "no": 1, "weapon": "pistols", "name": "Pistols", "holder": PLAYER_ID,
        "holderName": "Captain Gull", "away": False, "you": True,
    }  # fmt: skip
    unlocked = {item["id"]: item["unlocked"] for item in data["types"]}
    assert unlocked == {
        "musket": True,
        "pistols": True,
        "blunderbuss": True,
        "long_rifle": False,
        "fire_bombs": False,
    }
    assert world.database.calls("arsenal_state") == [
        {"p_player_id": PLAYER_ID, "p_island_owner": PLAYER_ID}
    ]
    assert answer.headers["cache-control"] == "private, no-store"


def test_without_a_copy_you_carry_the_standard_musket():
    world = world_at(0)
    world.database.arsenal_replies["arsenal_state"] = {
        "status": "ok",
        "arsenal": {"capacity": 20, "stored": 0, "mine": None, "waveRunning": False, "copies": []},
    }
    assert world.client.get("/api/island/arsenal", headers=PLAYER).json()["carried"] == "musket"


def test_a_friends_arsenal_needs_membership():
    world = world_at(4)
    world.database.games.add(FRIEND_ID, FRIEND_ID)
    world.database.islands["F7END"] = {"player_id": FRIEND_ID, "code": "F7END", "wave_best": 0,
                                       "flags": 0}  # fmt: skip
    world.database.names[FRIEND_ID] = "Captain Wren"
    answer = world.client.get("/api/island/arsenal", params={"code": "ISLE-F7END"}, headers=PLAYER)
    assert_error(answer, 403, "not_member")
    assert world.database.calls("arsenal_state") == []


# --- buy ---


def test_a_buy_sends_the_price_and_unlock_of_the_file_and_the_click_id():
    world = world_at(2)
    assert buy(world, actionUid="click-0042").status_code == 200
    (call,) = world.database.calls("arsenal_buy")
    assert call == {
        "p_player_id": PLAYER_ID, "p_island_owner": PLAYER_ID, "p_weapon": "pistols",
        "p_action_uid": "click-0042", "p_price": 60, "p_unlock_wave": 2,
    }  # fmt: skip


def test_a_buy_refuses_a_bad_id_the_musket_and_a_locked_type_before_the_database():
    world = world_at(3)
    assert_error(buy(world, "laser"), 400, "bad_weapon")
    assert_error(buy(world, "musket"), 409, "standard_weapon")
    locked = buy(world, "long_rifle")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Opens after wave 6."
    assert world.database.calls("arsenal_buy") == []


def test_a_buy_passes_on_the_refusals_of_the_database():
    for reason, status in (
        ("arsenal_full", 409),
        ("wave_running", 409),
        ("not_member", 403),
        ("action_used", 409),
    ):
        world = world_at(9)
        world.database.arsenal_replies["arsenal_buy"] = refused(reason)
        assert_error(buy(world), status, reason)


def test_too_few_coins_says_the_price():
    world = world_at(9)
    world.database.arsenal_replies["arsenal_buy"] = refused("insufficient_funds", 60)
    answer = buy(world)
    assert_error(answer, 409, "insufficient_funds")
    assert "60 coins" in answer.json()["error"]["message"]


def test_a_repeated_buy_sends_the_same_click_id_and_the_database_answers_repeat():
    world = world_at(9)
    buy(world, actionUid="click-0007")
    world.database.arsenal_replies["arsenal_buy"] = {
        **world.database.arsenal_replies.get("arsenal_buy", {}),
        "status": "done",
        "repeat": True,
        "arsenal": {"capacity": 20, "stored": 0, "mine": None, "waveRunning": False, "copies": []},
    }
    assert buy(world, actionUid="click-0007").status_code == 200
    uids = [call["p_action_uid"] for call in world.database.calls("arsenal_buy")]
    assert uids == ["click-0007", "click-0007"]


def test_a_buy_refuses_extra_fields_and_a_bad_click_id():
    world = world_at(9)
    assert buy(world, price=1).status_code == 422
    assert buy(world, actionUid="no").status_code == 422


# --- take and return ---


def test_take_sends_the_copy_and_answers_taken_when_another_captain_has_it():
    world = world_at(9)
    assert take(world).status_code == 200
    (call,) = world.database.calls("arsenal_take")
    assert call["p_copy_id"] == COPY_ID
    world.database.arsenal_replies["arsenal_take"] = refused("taken")
    assert_error(take(world), 409, "taken")
    world.database.arsenal_replies["arsenal_take"] = refused("no_such_copy")
    assert_error(take(world), 404, "no_such_copy")


def test_take_refuses_a_copy_id_that_is_not_an_id():
    assert take(world_at(9), copy="pistols").status_code == 422


def test_a_return_into_a_full_rack_is_refused_and_says_so():
    world = world_at(9)
    world.database.arsenal_replies["arsenal_return"] = refused("arsenal_full")
    answer = give_back(world)
    assert_error(answer, 409, "arsenal_full")
    assert "full" in answer.json()["error"]["message"]
    world.database.arsenal_replies["arsenal_return"] = refused("nothing_held")
    assert_error(give_back(world), 409, "nothing_held")


def test_an_unknown_refusal_is_a_database_error():
    world = world_at(9)
    world.database.arsenal_replies["arsenal_return"] = refused("something_new")
    assert give_back(world).status_code == 502


# --- the contract stays the same in Python and SQL ---


def test_the_capacity_and_the_policy_match_the_migration():
    sql = MIGRATION.read_text()
    assert re.search(r"function public\.arsenal_capacity\(\).*?select (\d+)", sql, re.S)[1] == str(
        CAPACITY
    )
    actions = re.search(r"p_action in \(([^)]*)\)", sql)[1]
    assert tuple(re.findall(r"'([a-z]+)'", actions)) == ACTIONS
    # D043: the host and every member may use the arsenal; only a buy is paid, by the buyer.
    for action in MATRIX_ACTION.values():
        assert permissions.ACTIONS[action].roles == permissions.HOST_AND_MEMBERS
    # Every move (not the look) is between waves only, as the SQL functions refuse wave_running.
    for action in ("buy", "take", "return"):
        assert permissions.ACTIONS[MATRIX_ACTION[action]].between_waves is True
    assert permissions.payer_of(MATRIX_ACTION["buy"], "me") == "me"
    assert permissions.payer_of(MATRIX_ACTION["take"], "me") is None


def test_the_migration_converts_nothing_when_applied():
    sql = MIGRATION.read_text()
    assert "select public.arsenal_convert" not in sql
    assert "perform public.arsenal_convert_island(p_island_owner);" in sql


def test_the_migration_gives_the_browser_nothing():
    sql = MIGRATION.read_text()
    assert not re.search(r"grant [^;]* to [^;]*\b(anon|authenticated)\b", sql)
    assert "create policy" not in sql
