"""The Tech hub, the tower skills and the wreck (docs/GAME-V3.md sections 4 and 5): POST
/api/island/research, /api/island/tower-skill and /api/island/wreck.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py); the
prices, the skills and the unlock waves come from the real islands.json and campaign.json. The SQL
side of the same rules is in island_sql/test_tech_hub_sql.py.
"""

from dataclasses import replace

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    World,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))
REFUSED = {"status": "refused", "reason": "insufficient_funds", "price": 180}


def world_at(wave: int = 0, **progress) -> World:
    world = World(settings=WITH_GUESTS)
    world.database.progress.update(wave_best=wave, **progress)
    return world


def game_of_owner(world: World, member: bool = True) -> None:
    """PLAYER hosts ISLE-K7Q2M; the guest is a member unless `member` is False."""
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 9, "flags": 9,
    }  # fmt: skip
    world.database.names[PLAYER_ID] = "Captain Gull"
    if member:
        world.database.games.add(PLAYER_ID, GUEST_ID)


def research(world: World, branch: str = "cannon", **body):
    return world.post("/api/island/research", branch=branch, **body)


# --- research ---


def test_research_opens_after_wave_eight_and_sends_the_price_of_islands_json():
    early = world_at(7)
    locked = research(early)
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Opens after wave 8."
    assert early.database.calls("island_research") == []

    world = world_at(8)
    response = research(world, "mortar")

    assert response.status_code == 200
    (call,) = world.database.calls("island_research")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_branch": "mortar",
        "p_action_uid": "click-0001",
        "p_price": 220,
        "p_unlock_wave": 8,
    }


def test_research_refuses_a_bad_branch_a_known_one_and_too_few_coins():
    world = world_at(9)
    assert_error(research(world, "laser"), 400, "bad_research")
    world.database.research = [{"branch": "cannon"}]
    assert_error(research(world, "cannon"), 409, "known")
    world.database.paid_replies["island_research"] = REFUSED
    assert_error(research(world, "wall"), 409, "insufficient_funds")


def test_a_repeated_research_click_charges_nothing():
    world = world_at(9)
    world.database.ledger_refs.add(("tech_research", "research:click-0001"))

    assert research(world).status_code == 200
    assert world.database.calls("island_research") == []


def test_a_member_researches_for_the_game_and_a_stranger_cannot():
    world = world_at(9)
    game_of_owner(world)
    response = research(world, "wall", headers=GUEST, code="ISLE-K7Q2M")
    assert response.status_code == 200
    (call,) = world.database.calls("island_research")
    assert (call["p_player_id"], call["p_island_owner"]) == (GUEST_ID, PLAYER_ID)

    stranger = world_at(9)
    game_of_owner(stranger, member=False)
    assert_error(research(stranger, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert stranger.database.calls("island_research") == []


def test_the_database_has_the_last_word_on_membership_and_the_unlock():
    world = world_at(9)
    world.database.paid_replies["island_research"] = {"status": "refused", "reason": "not_member"}
    assert_error(research(world), 403, "not_member")
    world.database.paid_replies["island_research"] = {"status": "refused", "reason": "locked"}
    assert_error(research(world), 409, "locked")


def test_the_island_shows_the_research_done_and_the_tower_skill_of_a_spot():
    world = world_at(9)
    world.database.research = [{"branch": "cannon"}]
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon", "level": 2, "spec": "heavy"},
        {"plot": "wall_1", "building_type": "wall", "level": 1, "spec": "rapid"},  # not a wall's
    ]

    body = world.island().json()

    spots = {spot["id"]: spot for spot in body["spots"]}
    assert (spots["cannon_1"]["spec"], spots["wall_1"]["spec"]) == ("heavy", None)
    assert body["campaign"]["research"]["done"] == ["cannon"]
    cannon = body["campaign"]["research"]["branches"][0]
    assert (cannon["price"], [spec["id"] for spec in cannon["specs"]]) == (
        180,
        ["rapid", "heavy", "chain"],
    )


# --- specialise ---


def specialise(world: World, spot: str = "cannon_1", spec: str = "rapid", headers=PLAYER, **body):
    """No actionUid: picking a skill moves no coins and is the same every time."""
    body = {"spot": spot, "spec": spec, **body}
    return world.client.post("/api/island/tower-skill", json=body, headers=headers)


def test_a_tower_picks_a_skill_of_its_researched_kind():
    world = world_at(9)
    world.database.research = [{"branch": "cannon"}]
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]

    response = specialise(world, spec="chain")

    assert response.status_code == 200
    (call,) = world.database.calls("island_specialise")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "cannon_1",
        "p_branch": "cannon",
        "p_spec": "chain",
    }


def test_a_skill_needs_a_tower_of_its_kind_and_its_research():
    world = world_at(9)
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]

    assert_error(specialise(world, spot="cannon_2"), 409, "not_built")
    assert_error(specialise(world, spec="laser"), 400, "bad_spec")
    assert_error(specialise(world, spec="stone"), 422, "wrong_kind")
    refused = specialise(world)
    assert_error(refused, 409, "not_researched")
    assert refused.json()["error"]["message"] == "Research cannon skills at the Tech hub first."
    assert world.database.calls("island_specialise") == []


def test_a_stranger_cannot_pick_a_skill_on_somebody_elses_island():
    world = world_at(9)
    game_of_owner(world, member=False)
    assert_error(specialise(world, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")


# --- the wreck ---


def gift(world: World, amount: int = 25, **body):
    return world.post("/api/island/wreck", amount=amount, **body)


def test_the_wreck_takes_gifts_after_wave_six():
    assert_error(gift(world_at(5)), 409, "locked")

    world = world_at(6, wreck_paid=100)
    assert gift(world, 100).status_code == 200
    (call,) = world.database.calls("island_wreck_repair")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_amount": 100,
        "p_action_uid": "click-0001",
        "p_goal": 500,
        "p_unlock_wave": 6,
    }
    assert world.island().json()["campaign"]["wreck"]["paid"] == 100


def test_the_wreck_refuses_an_odd_amount_and_a_finished_repair():
    assert_error(gift(world_at(9), 30), 400, "bad_gift")
    done = gift(world_at(9, wreck_paid=500))
    assert_error(done, 409, "repaired")
    assert done.json()["error"]["message"] == "The wreck is repaired. Sailing opens later."


def test_a_member_mends_the_wreck_of_the_game_and_a_stranger_cannot():
    world = world_at(9)
    game_of_owner(world)
    assert gift(world, headers=GUEST, code="ISLE-K7Q2M").status_code == 200
    stranger = world_at(9)
    game_of_owner(stranger, member=False)
    assert_error(gift(stranger, headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")
    assert stranger.database.calls("island_wreck_repair") == []


# --- the loot of a late wave (GAME-V3 section 4) ---


def test_a_late_wave_sends_the_slower_loot_rates_to_wave_finish():
    from server.tests.island_helpers import WAVE_ID

    world = world_at(40)
    world.database.wave_places[WAVE_ID] = {"place": "island", "island_owner": PLAYER_ID, "wave": 40}

    assert world.finish().status_code == 200
    (call,) = world.database.calls("wave_finish")
    assert (call["p_loot_base"], call["p_loot_per_wave"], call["p_point_loot_base"]) == (
        205,
        4,
        220,
    )

    early = world_at(12)
    early.database.wave_places[WAVE_ID] = {"place": "island", "island_owner": PLAYER_ID, "wave": 12}
    assert early.finish().status_code == 200
    (call,) = early.database.calls("wave_finish")
    assert (call["p_loot_base"], call["p_loot_per_wave"]) == (25, 10)
