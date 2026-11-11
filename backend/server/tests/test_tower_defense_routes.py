"""Tests for tower defense v2 (docs/TOWER-DEFENSE.md section 7): upgrades, crew, the captain,
the unlocks, Pirate Point's shared buildings, boss waves and the friend invite.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py). The
prices and the unlocks come from the real islands.json. The SQL side of the same rules is in
island_sql/test_tower_defense_sql.py.

Used by: pytest (cd backend && uv run pytest).
"""

from dataclasses import replace

import httpx

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    FINISHED,
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    STARTED,
    World,
)

WITH_GUESTS = replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo"))
REFUSED = {"status": "refused", "reason": "insufficient_funds", "price": 60}


def world_at(wave: int = 0, **progress) -> World:
    world = World(settings=WITH_GUESTS)
    world.database.progress.update(wave_best=wave, **progress)
    return world


# --- GET /api/island ---


def test_the_island_shows_levels_crew_captain_prices_unlocks_and_the_next_wave():
    world = world_at(3, next_wave=2, crew_gunner=1, captain_level=2)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "mortar", "level": 2}
    ]

    body = world.island().json()

    spot = next(spot for spot in body["spots"] if spot["id"] == "cannon_1")
    assert spot == {
        "id": "cannon_1", "kind": "mortar", "kinds": ["cannon", "mortar"], "built": True,
        "level": 2, "cost": 60, "upgradeCost": 240,
    }  # fmt: skip
    assert (body["waveBest"], body["nextWave"]) == (3, 2)
    assert body["crew"] == {"gunner": 1, "carpenter": 0, "lookout": 0}
    assert body["captain"] == {"level": 2, "nextPrice": 40}
    assert body["prices"]["kinds"]["mortar"] == [60, 120, 240]
    assert body["prices"]["crew"]["lookout"] == {"price": 25, "max": 1}
    assert body["prices"]["captain"] == [0, 20, 40, 80, 160]
    assert body["unlocks"]["wave"] == 3
    assert "mortar:1" in body["unlocks"]["unlocked"]
    assert body["unlocks"]["locked"]["crew:gunner"] == 5


def test_a_win_anywhere_counts_for_the_unlocks():
    world = world_at(0, won_wave_best=5)

    assert world.island().json()["unlocks"]["wave"] == 5


# --- POST /api/island/build: the mortar and the unlocks ---


def test_a_mortar_on_a_tower_spot_is_locked_before_wave_three_and_built_after():
    early = world_at(2)
    assert_error(early.build(spot="cannon_5", kind="mortar"), 409, "locked")
    assert early.database.calls("islet_build") == []

    later = world_at(3)
    later.database.build_reply = {"status": "done", "balance": 40, "timber": 0, "level": 1}
    response = later.build(spot="cannon_5", kind="mortar")

    assert response.status_code == 200
    (call,) = later.database.calls("islet_build")
    assert (call["p_plot"], call["p_building_type"], call["p_coins"]) == ("cannon_5", "mortar", 60)


def test_a_wall_on_a_tower_spot_is_the_wrong_kind():
    assert_error(world_at(9).build(spot="cannon_1", kind="wall"), 422, "wrong_kind")


# --- POST /api/island/upgrade ---


def test_an_upgrade_sends_the_price_list_and_the_unlocked_level():
    world = world_at(2)
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]

    response = world.post("/api/island/upgrade", spot="wall_1")

    assert response.status_code == 200
    (call,) = world.database.calls("island_upgrade")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "wall_1",
        "p_action_uid": "click-0001",
        "p_prices": [10, 20, 40],
        "p_unlocked_level": 2,
    }


def test_an_upgrade_refuses_not_built_max_level_locked_and_no_such_spot():
    world = world_at(2)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "wall_1", "building_type": "wall", "level": 2},
        {"plot": "house_1", "building_type": "house", "level": 2},
    ]

    assert_error(world.post("/api/island/upgrade", spot="wall_2"), 409, "not_built")
    assert_error(world.post("/api/island/upgrade", spot="house_1"), 409, "max_level")
    locked = world.post("/api/island/upgrade", spot="wall_1")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Unlocks after wave 5."
    assert_error(world.post("/api/island/upgrade", spot="moat_1"), 404, "no_such_spot")
    assert world.database.calls("island_upgrade") == []


def test_an_upgrade_the_player_cannot_pay_is_refused():
    world = world_at(2)
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]
    world.database.paid_replies["island_upgrade"] = REFUSED

    response = world.post("/api/island/upgrade", spot="cannon_1")

    assert_error(response, 409, "insufficient_funds")
    assert "60 coins" in response.json()["error"]["message"]


def test_a_repeated_upgrade_answers_the_island_and_charges_nothing():
    world = world_at(2)
    world.database.ledger_refs.add(("building_purchase", "upgrade:click-0001"))

    assert world.post("/api/island/upgrade", spot="wall_1").status_code == 200
    assert world.database.calls("island_upgrade") == []


def test_the_database_has_the_last_word_on_the_level():
    world = world_at(9)
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]
    world.database.paid_replies["island_upgrade"] = {"status": "refused", "reason": "max_level"}

    assert_error(world.post("/api/island/upgrade", spot="wall_1"), 409, "max_level")


# --- POST /api/island/hire ---


def test_a_gunner_is_hired_after_wave_five():
    world = world_at(5)

    assert world.post("/api/island/hire", crew="gunner").status_code == 200
    (call,) = world.database.calls("island_hire")
    assert (call["p_crew"], call["p_price"], call["p_max"]) == ("gunner", 40, 2)


def test_hiring_refuses_a_full_crew_locked_crew_and_too_few_coins():
    full = world_at(9, crew_gunner=2)
    assert_error(full.post("/api/island/hire", crew="gunner"), 409, "crew_full")

    early = world_at(7)
    assert_error(early.post("/api/island/hire", crew="lookout"), 409, "locked")

    poor = world_at(9)
    poor.database.paid_replies["island_hire"] = {**REFUSED, "price": 30}
    assert_error(poor.post("/api/island/hire", crew="carpenter"), 409, "insufficient_funds")

    raced = world_at(9)
    raced.database.paid_replies["island_hire"] = {"status": "refused", "reason": "crew_full"}
    assert_error(raced.post("/api/island/hire", crew="lookout"), 409, "crew_full")


def test_an_unknown_crew_is_a_validation_error():
    assert_error(world_at(9).post("/api/island/hire", crew="cook"), 422, "validation_error")


def test_a_repeated_hire_charges_nothing():
    world = world_at(9, crew_gunner=2)
    world.database.ledger_refs.add(("crew_hire", "crew:click-0001"))

    assert world.post("/api/island/hire", crew="gunner").status_code == 200
    assert world.database.calls("island_hire") == []


# --- POST /api/island/captain ---


def test_the_captain_climbs_after_wave_one():
    world = world_at(1)

    assert world.post("/api/island/captain").status_code == 200
    (call,) = world.database.calls("island_captain")
    assert (call["p_prices"], call["p_unlocked_level"]) == ([0, 20, 40, 80, 160], 3)


def test_the_captain_refuses_locked_max_level_and_too_few_coins():
    assert_error(world_at(0).post("/api/island/captain"), 409, "locked")
    assert_error(world_at(1, captain_level=3).post("/api/island/captain"), 409, "locked")
    assert_error(world_at(9, captain_level=5).post("/api/island/captain"), 409, "max_level")
    poor = world_at(9)
    poor.database.paid_replies["island_captain"] = {**REFUSED, "price": 20}
    assert_error(poor.post("/api/island/captain"), 409, "insufficient_funds")


def test_a_repeated_captain_click_charges_nothing():
    world = world_at(9, captain_level=5)
    world.database.ledger_refs.add(("captain_upgrade", "captain:click-0001"))

    assert world.post("/api/island/captain").status_code == 200
    assert world.database.calls("island_captain") == []


def test_the_new_routes_are_closed_while_the_flag_is_off():
    world = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("")))

    for path in ("/api/island/upgrade", "/api/island/hire", "/api/island/captain"):
        assert_error(world.post(path, spot="wall_1", crew="gunner"), 404, "feature_off")
    assert_error(world.client.get("/api/pirate-point", headers=PLAYER), 404, "feature_off")
    assert world.database.requests == []


# --- Pirate Point ---


def test_pirate_point_shows_its_ten_spots_and_its_best_wave():
    world = world_at(0)
    world.database.point_buildings = [{"spot": "pp_tower_2", "kind": "mortar", "level": 1}]
    world.database.point_best = [{"wave": 4}]

    body = world.client.get("/api/pirate-point", headers=PLAYER).json()

    assert list(body) == ["spots", "waveBest", "coins"]
    assert [spot["id"] for spot in body["spots"]] == [f"pp_wall_{n}" for n in range(1, 5)] + [
        f"pp_tower_{n}" for n in range(1, 7)
    ]
    tower = body["spots"][5]
    assert (tower["kind"], tower["built"], tower["level"], tower["upgradeCost"]) == (
        "mortar",
        True,
        1,
        120,
    )
    assert (body["waveBest"], body["coins"]) == (4, 100)


def test_two_players_build_and_upgrade_pirate_point_each_paying_themselves():
    world = world_at(3)

    built = world.post("/api/pirate-point/build", spot="pp_tower_1", kind="mortar")
    world.database.point_buildings = [{"spot": "pp_tower_1", "kind": "mortar", "level": 1}]
    raised = world.post(
        "/api/pirate-point/upgrade", headers=GUEST, spot="pp_tower_1", actionUid="click-0002"
    )

    assert (built.status_code, raised.status_code) == (200, 200)
    (build,) = world.database.calls("pp_build")
    (upgrade,) = world.database.calls("pp_upgrade")
    assert (build["p_player_id"], build["p_kind"], build["p_price"]) == (PLAYER_ID, "mortar", 60)
    assert (upgrade["p_player_id"], upgrade["p_prices"], upgrade["p_unlocked_level"]) == (
        GUEST_ID,
        [60, 120, 240],
        2,
    )


def test_pirate_point_refusals():
    world = world_at(2)
    world.database.point_buildings = [{"spot": "pp_wall_1", "kind": "wall", "level": 3}]

    assert_error(
        world.post("/api/pirate-point/build", spot="pp_wall_1", kind="wall"), 409, "spot_taken"
    )
    assert_error(
        world.post("/api/pirate-point/build", spot="pp_tower_1", kind="mortar"), 409, "locked"
    )
    assert_error(
        world.post("/api/pirate-point/build", spot="pp_wall_2", kind="cannon"), 422, "wrong_kind"
    )
    assert_error(
        world.post("/api/pirate-point/build", spot="wall_1", kind="wall"), 404, "no_such_spot"
    )
    assert_error(world.post("/api/pirate-point/upgrade", spot="pp_wall_1"), 409, "max_level")
    assert_error(world.post("/api/pirate-point/upgrade", spot="pp_wall_2"), 409, "not_built")
    assert_error(
        world.post("/api/pirate-point/upgrade", spot="pp_wall_1", kind="cannon"), 422, "wrong_kind"
    )
    world.database.paid_replies["pp_build"] = {**REFUSED, "price": 10}
    assert_error(
        world.post("/api/pirate-point/build", spot="pp_wall_3", kind="wall"),
        409,
        "insufficient_funds",
    )


def test_a_repeated_pirate_point_build_charges_nothing():
    world = world_at(0)
    world.database.ledger_refs.add(("building_purchase", "pp:click-0001"))

    assert world.post("/api/pirate-point/build", spot="pp_wall_1", kind="wall").status_code == 200
    assert world.database.calls("pp_build") == []


# --- waves: boss ---


def test_every_fifth_wave_is_a_boss_wave():
    world = world_at(4)
    world.database.start_reply = {**STARTED, "wave": 5}
    world.database.finish_reply = {**FINISHED, "loot": 90, "boss": True}

    assert world.start().json()["boss"] is True
    assert world.finish().json() == {
        "loot": 90, "coins": 115, "waveBest": 1, "flags": 1, "boss": True,
    }  # fmt: skip


# --- POST /api/island/invite/join ---


def invite(world: World, code: str = "ISLE-K7Q2M", headers=GUEST, **extra) -> httpx.Response:
    body = {"code": code, "actionUid": "invite-0001", **extra}
    return world.client.post("/api/island/invite/join", json=body, headers=headers)


def island_of_owner(world: World) -> None:
    world.database.islands["K7Q2M"] = {
        "player_id": PLAYER_ID, "code": "K7Q2M", "wave_best": 3, "flags": 3,
    }  # fmt: skip
    world.database.names[PLAYER_ID] = "Captain Gull"


def test_a_guest_with_a_valid_island_code_is_admitted_without_a_class_code():
    world = World(settings=WITH_GUESTS)
    island_of_owner(world)

    response = invite(world, code="isle k7q2m")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "admitted": True,
        "game": {
            "code": "ISLE-K7Q2M",
            "hostName": "Captain Gull",
            "role": "member",
            "waveBest": 3,
            "members": 2,
            "maxMembers": 10,
        },
        "island": {"code": "ISLE-K7Q2M", "ownerName": "Captain Gull"},
    }
    assert world.database.calls("demo_guest_admit") == [{"p_player_id": GUEST_ID}]
    # The invite is the alias of POST /api/games/join: the guest is now a member of the game.
    assert world.database.games.rows[PLAYER_ID][GUEST_ID]["role"] == "member"
    assert not any("class_code" in path for path in world.database.paths())


def test_a_bad_island_code_is_refused_and_nobody_is_admitted():
    world = World(settings=WITH_GUESTS)
    island_of_owner(world)

    assert_error(invite(world, code="ISLE-ZZZZZ"), 404, "no_such_island")
    assert_error(invite(world, code="HARBOR-K7QXM"), 404, "no_such_island")
    assert world.database.calls("demo_guest_admit") == []


def test_a_github_player_is_not_recorded():
    world = World(settings=WITH_GUESTS)
    island_of_owner(world)

    assert invite(world, headers=PLAYER).status_code == 200
    assert world.database.calls("demo_guest_admit") == []


def test_the_invite_needs_a_login_the_flag_and_for_guests_the_demo_flag():
    world = World(settings=WITH_GUESTS)
    assert_error(invite(world, headers={}), 401, "unauthorized")

    off = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("demo")))
    assert_error(invite(off), 404, "feature_off")

    no_guests = World(settings=ISLAND_SETTINGS)
    assert_error(invite(no_guests), 403, "demo_closed")
    assert no_guests.database.requests == []


def test_the_invite_is_rate_limited():
    world = World(settings=WITH_GUESTS)
    island_of_owner(world)

    answers = [invite(world, code="ISLE-ZZZZZ").status_code for _ in range(11)]

    assert answers == [404] * 10 + [429]


def test_an_extra_field_is_refused():
    assert_error(invite(World(settings=WITH_GUESTS), extra=1), 422, "validation_error")


# --- co-op: building and upgrading on a friend's island ---


def friends_island(world: World) -> None:
    """The guest plays in PLAYER's game ISLE-K7Q2M (a member since they joined it)."""
    island_of_owner(world)
    world.database.games.add(PLAYER_ID, GUEST_ID)


def test_somebody_who_is_not_in_the_game_cannot_build_upgrade_or_ring_the_bell_there():
    world = world_at(2)
    island_of_owner(world)  # PLAYER's game; the guest never joined it
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]

    build = world.build(headers=GUEST, spot="wall_2", kind="wall", code="ISLE-K7Q2M")
    upgrade = world.post("/api/island/upgrade", headers=GUEST, spot="wall_1", code="ISLE-K7Q2M")
    bell = world.start(headers=GUEST, where="ISLE-K7Q2M")

    for response in (build, upgrade, bell):
        assert_error(response, 403, "not_member")
    assert world.database.calls("island_build") == []
    assert world.database.calls("island_upgrade") == []
    assert world.database.calls("wave_start") == []
    # After joining, the same build goes through.
    assert invite(world).status_code == 200
    assert (
        world.build(headers=GUEST, spot="wall_2", kind="wall", code="ISLE-K7Q2M").status_code == 200
    )


def test_a_member_who_left_cannot_build_there_any_more():
    world = world_at(2)
    friends_island(world)
    world.database.games.rows[PLAYER_ID][GUEST_ID]["left"] = 99

    assert_error(world.build(headers=GUEST, code="ISLE-K7Q2M"), 403, "not_member")


def test_a_visitor_builds_on_a_friends_island_with_their_own_coins_and_unlocks():
    world = world_at(0, won_wave_best=3)  # the payer's progress (the fake answers one row)
    friends_island(world)

    response = world.build(headers=GUEST, spot="cannon_2", kind="mortar", code="ISLE-K7Q2M")

    assert response.status_code == 200
    assert response.json()["code"] == "ISLE-K7Q2M"
    assert world.database.calls("islet_build") == []
    (call,) = world.database.calls("island_build")
    assert call == {
        "p_player_id": GUEST_ID,
        "p_island_owner": PLAYER_ID,
        "p_plot": "cannon_2",
        "p_building_type": "mortar",
        "p_action_uid": "click-0001",
        "p_price": 60,
    }


def test_a_co_op_build_keeps_the_refusals():
    world = world_at(0)
    friends_island(world)
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]

    def coop(**body):
        return world.build(headers=GUEST, code="ISLE-K7Q2M", **body)

    assert_error(coop(spot="cannon_1", kind="mortar"), 409, "locked")
    assert_error(coop(spot="wall_1", kind="wall"), 409, "spot_taken")
    assert_error(coop(spot="wall_2", kind="cannon"), 422, "wrong_kind")
    assert_error(world.build(headers=GUEST, code="ISLE-ZZZZZ"), 404, "no_such_island")
    world.database.paid_replies["island_build"] = {**REFUSED, "price": 10}
    assert_error(coop(spot="wall_3", kind="wall"), 409, "insufficient_funds")
    raced = {"status": "refused", "reason": "spot_taken"}
    world.database.paid_replies["island_build"] = raced
    assert_error(coop(spot="wall_4", kind="wall"), 409, "spot_taken")


def test_a_repeated_co_op_build_charges_nothing():
    world = world_at(0)
    friends_island(world)
    world.database.ledger_refs.add(("building_purchase", "island:click-0001"))

    response = world.build(headers=GUEST, spot="wall_1", kind="wall", code="ISLE-K7Q2M")

    assert response.status_code == 200
    assert world.database.calls("island_build") == []


def test_a_visitor_upgrades_a_building_of_the_friends_island():
    world = world_at(2)
    friends_island(world)
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]

    response = world.post("/api/island/upgrade", headers=GUEST, spot="wall_1", code="isle-k7q2m")

    assert response.status_code == 200
    (call,) = world.database.calls("island_upgrade")
    assert (call["p_player_id"], call["p_island_owner"]) == (GUEST_ID, PLAYER_ID)
    assert_error(
        world.post("/api/island/upgrade", headers=GUEST, spot="wall_2", code="ISLE-K7Q2M"),
        409,
        "not_built",
    )


def test_your_own_code_builds_on_your_own_island():
    world = world_at(0)
    friends_island(world)

    assert world.build(code="ISLE-K7Q2M").status_code == 200
    assert world.database.calls("island_build") == []
    assert len(world.database.calls("islet_build")) == 1


def test_joining_a_friends_wave_opens_your_own_island_for_the_unlock_credit():
    world = world_at(0)

    assert world.join(headers=GUEST).status_code == 200
    assert world.database.calls("island_open")[0]["p_player_id"] == GUEST_ID


def test_a_visit_shows_the_levels_kinds_and_crew_so_every_visitor_simulates_the_same_island():
    world = world_at(0, crew_gunner=1, crew_lookout=1)
    island_of_owner(world)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_3", "building_type": "mortar", "level": 2}
    ]

    assert invite(world).status_code == 200
    body = world.visit("ISLE-K7Q2M", headers=GUEST).json()

    assert list(body) == ["code", "ownerName", "waveBest", "spots", "crew"]
    spot = next(spot for spot in body["spots"] if spot["id"] == "cannon_3")
    assert (spot["kind"], spot["level"], spot["built"]) == ("mortar", 2, True)
    assert body["crew"] == {"gunner": 1, "carpenter": 0, "lookout": 1}
    assert set(spot) == set(world.island().json()["spots"][0])
