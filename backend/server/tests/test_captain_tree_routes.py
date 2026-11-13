"""Tests for the captain tree: forks, capstones, roles, respec, the engineer's prices and the
lobby's role icons (docs/GAME-V3.md, Captain tree and roles). The database is a
FakeIslandDatabase (island_helpers.py); the SQL side is island_sql/test_captain_tree_sql.py."""

from server.island import rules
from server.island.catalogue import ROLE_IDS, load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, World
from server.wallet import WALLET_REASONS

CATALOGUE = load_island()


def world_at(won: int = 0, **progress) -> World:
    world = World(settings=ISLAND_SETTINGS)
    world.database.progress.update(won_wave_best=won, wave_best=won, **progress)
    return world


def skill(world: World, name: str, uid: str = "click-0001"):
    return world.post("/api/island/skill", skill=name, actionUid=uid)


def pick(world: World, role: str):
    return world.client.post("/api/island/role", json={"role": role}, headers=PLAYER)


def test_the_tree_has_five_tiers_two_forks_and_a_role_capstone_in_every_branch():
    tree = CATALOGUE.skills.tree
    for branch in ("marksman", "brawler", "shipwright"):
        tiers = [item for item in tree if item.branch == branch]
        assert sorted({item.tier for item in tiers}) == [1, 2, 3, 4, 5]
        forks = [item for item in tiers if item.excludes]
        assert sorted(item.tier for item in forks) == [2, 2, 4, 4]
        assert [item.role for item in tiers if item.tier == 5] != [None]
    assert [role.role for role in CATALOGUE.skills.roles] == list(ROLE_IDS)
    assert ("captain_respec", "spend") in WALLET_REASONS


def test_a_fork_closes_its_twin_and_the_tier_above_needs_either_pick():
    entry = rules.check_skill(CATALOGUE, "heavy_blade", ("cutlass",), 20)
    assert entry.excludes == "sweep"
    assert_error_of(
        lambda: rules.check_skill(CATALOGUE, "sweep", ("cutlass", "heavy_blade"), 20), "closed"
    )
    assert_error_of(lambda: rules.check_skill(CATALOGUE, "second_wind", ("cutlass",), 20), "locked")
    assert rules.check_skill(CATALOGUE, "second_wind", ("cutlass", "heavy_blade"), 20)


def test_a_capstone_needs_the_role_of_its_branch():
    known = ("steady_aim", "long_barrel", "quick_hands", "far_sight")
    assert_error_of(lambda: rules.check_skill(CATALOGUE, "dead_eye", known, 40, None), "wrong_role")
    assert_error_of(
        lambda: rules.check_skill(CATALOGUE, "dead_eye", known, 40, "medic"), "wrong_role"
    )
    assert rules.check_skill(CATALOGUE, "dead_eye", known, 40, "gunner")


def assert_error_of(call, code: str):
    from server.errors import ApiError

    try:
        call()
    except ApiError as error:
        assert error.code == code
        return
    raise AssertionError(f"expected {code}")


def test_a_closed_skill_answers_409_closed_and_never_reaches_the_database():
    world = world_at(20, captain_skills=["steady_aim", "hot_shot"])
    assert_error(skill(world, "long_barrel"), 409, "closed")
    assert world.database.calls("island_learn_skill") == []


def test_a_capstone_of_another_role_answers_wrong_role():
    world = world_at(60, captain_skills=["cutlass", "sweep", "second_wind", "snap_shot"],
                     captain_role="gunner")  # fmt: skip
    assert_error(skill(world, "field_surgeon"), 409, "wrong_role")


def test_the_role_is_picked_once_from_captain_level_three():
    low = world_at(0, captain_level=2)
    assert_error(pick(low, "medic"), 409, "locked")
    assert_error(pick(low, "pirate"), 400, "bad_role")
    ok = world_at(0, captain_level=3)
    assert pick(ok, "medic").status_code == 200
    (call,) = ok.database.calls("island_pick_role")
    assert (call["p_role"], call["p_min_level"]) == ("medic", 3)
    again = world_at(0, captain_level=3, captain_role="medic")
    assert pick(again, "medic").status_code == 200
    assert again.database.calls("island_pick_role") == []
    assert_error(pick(again, "gunner"), 409, "role_known")


def test_the_island_shows_role_roles_and_the_respec_price():
    body = world_at(0, captain_level=3, captain_role="engineer").island().json()
    assert body["skills"]["role"] == "engineer"
    assert body["skills"]["roleLevel"] == 3
    assert [role["id"] for role in body["skills"]["roles"]] == list(ROLE_IDS)
    assert body["skills"]["respecPrice"] == 300


def test_a_respec_costs_coins_scaled_by_level_and_is_checked_on_the_server():
    world = world_at(8, captain_level=4, captain_skills=["steady_aim"])
    assert world.post("/api/island/respec", actionUid="click-0009").status_code == 200
    (call,) = world.database.calls("island_respec")
    # The server sends the price PER LEVEL; the database multiplies by the level under lock.
    assert (call["p_per_level"], call["p_action_uid"]) == (100, "click-0009")
    assert "p_price" not in call
    nothing = world_at(8)
    assert_error(
        nothing.post("/api/island/respec", actionUid="click-0009"), 409, "nothing_to_reset"
    )
    poor = world_at(8, captain_skills=["steady_aim"])
    poor.database.paid_replies["island_respec"] = {
        "status": "refused", "reason": "insufficient_funds", "price": 100,
    }  # fmt: skip
    assert_error(poor.post("/api/island/respec", actionUid="click-0009"), 409, "insufficient_funds")
    running = world_at(8, captain_skills=["steady_aim"])
    running.database.paid_replies["island_respec"] = {"status": "refused", "reason": "wave_running"}
    response = running.post("/api/island/respec", actionUid="click-0009")
    assert_error(response, 409, "wave_running")
    assert "between waves" in response.json()["error"]["message"].lower()
    repeat = world_at(8, captain_skills=["steady_aim"])
    repeat.database.ledger_refs.add(("captain_respec", "respec:click-0009"))
    assert repeat.post("/api/island/respec", actionUid="click-0009").status_code == 200
    assert repeat.database.calls("island_respec") == []


def test_an_engineer_pays_ten_percent_less_to_upgrade_and_sees_it_on_the_spots():
    assert rules.engineer_price(CATALOGUE, 10, "engineer") == 9
    assert rules.engineer_price(CATALOGUE, 10, "medic") == 10
    world = world_at(0, captain_role="engineer")
    spots = world.island().json()["spots"]
    wall = next(item for item in spots if item["kind"] == "wall")
    price = rules.price_of(CATALOGUE, "wall")
    assert wall["cost"] == rules.engineer_price(CATALOGUE, price, "engineer")
