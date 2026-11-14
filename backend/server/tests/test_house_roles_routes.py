"""The house roles (docs/GAME-V3.md "Houses"): POST /api/island/tower-skill with a role, the spots
of GET /api/island, the house's level 3 and POST /api/waves/revive on an island with a Tavern.

A house of level 2 or more picks barracks, tavern or workshop (free, no research), through the same
route and database function as a tower skill (island_specialise(), p_branch "house"). The revive
discount is the database's (wave_revive() checks the island's buildings), so the server sends the
same arguments as before and passes the price on. The database is a FakeIslandDatabase
(island_helpers.py); the SQL side is island_sql/test_house_roles_sql.py. Nothing uses the network.
"""

from dataclasses import replace

from server.flags import parse_flags
from server.island.catalogue import HOUSE_ROLE_LEVEL, HOUSE_ROLES, load_island
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

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))


def world_at(wave: int = 0, **progress) -> World:
    world = World(settings=WITH_GUESTS)
    world.database.progress.update(wave_best=wave, **progress)
    return world


def pick(world: World, spot: str = "house_1", spec: str = "barracks", headers=PLAYER, **body):
    return world.client.post(
        "/api/island/tower-skill", json={"spot": spot, "spec": spec, **body}, headers=headers
    )


def test_the_roles_and_their_level():
    assert HOUSE_ROLES == ("barracks", "tavern", "workshop")
    assert HOUSE_ROLE_LEVEL == 2


def test_a_house_of_level_two_picks_a_role_with_no_research():
    world = world_at(3)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]

    for role in HOUSE_ROLES:
        assert pick(world, spec=role).status_code == 200

    calls = world.database.calls("island_specialise")
    assert [call["p_spec"] for call in calls] == list(HOUSE_ROLES)
    assert calls[0] == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "house_1",
        "p_branch": "house",
        "p_spec": "barracks",
    }


def test_a_role_needs_a_house_of_level_two():
    world = world_at(3)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 1},
        {"plot": "wall_1", "building_type": "wall", "level": 2},
    ]

    low = pick(world)
    assert_error(low, 409, "house_level")
    assert low.json()["error"]["message"] == "Raise this house to level 2 first."
    wall = pick(world, spot="wall_1", spec="tavern")
    assert_error(wall, 422, "wrong_kind")
    assert wall.json()["error"]["message"] == "A wall cannot take a house role."
    assert_error(pick(world, spot="house_2"), 409, "not_built")
    # A tower skill is no role: a house cannot learn one.
    assert_error(pick(world, spec="rapid"), 422, "wrong_kind")
    assert world.database.calls("island_specialise") == []


def test_the_database_has_the_last_word_on_the_level():
    world = world_at(3)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]
    world.database.paid_replies["island_specialise"] = {
        "status": "refused",
        "reason": "house_level",
    }

    assert_error(pick(world), 409, "house_level")


def test_a_member_picks_a_role_on_the_hosts_island_and_a_stranger_cannot():
    world = world_at(3)
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 3, "flags": 3,
    }  # fmt: skip
    world.database.names[PLAYER_ID] = "Captain Gull"
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]
    assert_error(pick(world, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    world.database.games.add(PLAYER_ID, GUEST_ID)

    assert pick(world, headers=GUEST, code="ISLE-K7Q2M", spec="tavern").status_code == 200
    (call,) = world.database.calls("island_specialise")
    assert (call["p_player_id"], call["p_island_owner"], call["p_spec"]) == (
        GUEST_ID,
        PLAYER_ID,
        "tavern",
    )


def test_the_island_shows_a_role_from_level_two_only():
    world = world_at(5)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2, "spec": "workshop"},
        {"plot": "house_2", "building_type": "house", "level": 1, "spec": "tavern"},
        {"plot": "cannon_1", "building_type": "cannon", "level": 1, "spec": "tavern"},
    ]

    spots = {spot["id"]: spot for spot in world.island().json()["spots"]}

    assert spots["house_1"]["spec"] == "workshop"
    assert (spots["house_2"]["spec"], spots["cannon_1"]["spec"]) == (None, None)


def test_a_house_has_a_third_level_after_wave_five():
    house = next(kind for kind in load_island().kinds if kind.kind == "house")
    assert house.max_level == 3
    assert house.prices == (50, 100, 200)
    assert house.level_waves == (1, 2, 5)

    early = world_at(4)
    early.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]
    locked = early.post("/api/island/upgrade", spot="house_1")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Opens after wave 5."

    later = world_at(5)
    later.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]
    assert later.post("/api/island/upgrade", spot="house_1").status_code == 200
    (call,) = later.database.calls("island_upgrade")
    assert call["p_plot"] == "house_1"


def test_the_revive_sends_what_it_sent_before_and_passes_the_tavern_price_on():
    world = World()
    world.database.revive_reply = {"status": "done", "price": 18, "balance": 82, "repeat": False}

    reply = world.revive()

    assert reply.json() == {"price": 18, "coins": 82, "repeat": False}
    (call,) = world.database.calls("wave_revive")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_wave_id": WAVE_ID,
        "p_fallen": "p-k3x9q2",
        "p_down_at": 412,
        "p_action_uid": "help-0001",
        "p_base": 20,
        "p_per_wave": 5,
    }


def test_the_catalogue_prices_a_revive_with_a_tavern_like_the_database():
    revive = load_island().revive
    assert revive.tavern_percent == 25
    assert [revive.price(1), revive.price(1, tavern=True)] == [25, 18]
    assert [revive.price(12), revive.price(12, tavern=True)] == [80, 60]
