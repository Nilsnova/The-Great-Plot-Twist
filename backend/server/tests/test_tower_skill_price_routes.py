"""Tower skills cost coins (decision D051): POST /api/island/tower-skill with a price.

The server sends the price of islands.json (research.branches skillCoins) and the click id to
island_specialise(); the database takes the coins and sets the skill in one step. Nothing here
uses the network: the database is a FakeIslandDatabase (island_helpers.py). The SQL side (the
charge under the island lock, a repeat paid once) is island_sql/test_tower_skill_price_sql.py.
"""

from server.island.catalogue import load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import GUEST, GUEST_ID, PLAYER_ID
from server.tests.test_research_tiers_routes import researched
from server.tests.test_tech_hub_routes import game_of_owner, specialise, world_at

# The price table of D051 (islands.json): (a tier-1 skill, the tier-3 capstone) per tower kind.
PRICES = {"cannon": (150, 600), "mortar": (120, 480), "wall": (40, 160), "watchtower": (80, 320)}


def test_the_prices_come_from_islands_json_and_cannons_cost_the_most():
    catalogue = load_island()
    table = {e.branch: (e.skill_coins, e.capstone_coins) for e in catalogue.research}
    assert table == PRICES
    assert max(table.values()) == table["cannon"]


def test_recovery_v1_refuses_quick_mend_but_keeps_bastion_and_old_receipts():
    world = world_at(26)
    researched(world, wall=(3, "thick_walls", "bastion"))
    world.database.buildings[PLAYER_ID] = [
        {"plot": "wall_1", "building_type": "wall", "level": 1, "spec": None},
    ]
    world.database.recovery_policy_version = 1

    retired = specialise(world, spot="wall_1", spec="quick_mend")
    assert_error(retired, 409, "recovery_option_retired")
    assert world.database.calls("island_specialise") == []

    world.database.ledger_refs.add(("tower_skill", "towerskill:click-0001"))
    assert specialise(world, spot="wall_1", spec="quick_mend").status_code == 200
    assert world.database.calls("island_specialise") == []

    assert (
        specialise(world, spot="wall_1", spec="bastion", actionUid="click-0002").status_code
        == 200
    )
    (call,) = world.database.calls("island_specialise")
    assert call["p_spec"] == "bastion"


def test_the_island_answer_lists_the_prices_per_tower_kind():
    prices = world_at(9).island().json()["prices"]["towerSkills"]
    assert prices == {kind: {"skill": a, "capstone": b} for kind, (a, b) in PRICES.items()}


def test_a_new_skill_sends_its_price_and_the_click_id():
    world = world_at(26)
    researched(world, cannon=(3, "rapid_2", "broadside"), wall=(1, None, None))
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon"},
        {"plot": "wall_1", "building_type": "wall"},
    ]

    assert specialise(world, spec="heavy").status_code == 200
    assert specialise(world, spec="broadside", actionUid="click-0002").status_code == 200
    assert specialise(world, spot="wall_1", spec="stone", actionUid="click-0003").status_code == 200

    calls = world.database.calls("island_specialise")
    assert [(c["p_spec"], c["p_price"], c["p_action_uid"]) for c in calls] == [
        ("heavy", 150, "click-0001"),
        ("broadside", 600, "click-0002"),
        ("stone", 40, "click-0003"),
    ]


def test_not_enough_coins_is_a_409_that_names_the_skill_and_its_price():
    world = world_at(9)
    researched(world, cannon=(1, None, None))
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]
    world.database.paid_replies["island_specialise"] = {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": 150,
    }

    refused = specialise(world, spec="chain")
    assert_error(refused, 409, "insufficient_funds")
    assert refused.json()["error"]["message"] == "Chain shot costs 150 coins. You need more coins."


def test_a_repeated_click_id_is_answered_without_paying_again():
    world = world_at(9)
    researched(world, cannon=(1, None, None))
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]
    world.database.ledger_refs.add(("tower_skill", "towerskill:click-0001"))

    assert specialise(world, spec="rapid").status_code == 200
    assert world.database.calls("island_specialise") == []


def test_the_skill_the_tower_has_already_is_free_and_needs_no_click_id():
    world = world_at(9)
    researched(world, cannon=(1, None, None))
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon", "spec": "rapid"}
    ]

    assert specialise(world, spec="rapid").status_code == 200
    assert specialise(world, spec="rapid", actionUid=None).status_code == 200
    assert world.database.calls("island_specialise") == []


def test_an_old_tab_without_a_click_id_is_told_to_reload_and_pays_nothing():
    world = world_at(9)
    researched(world, cannon=(1, None, None))
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon", "spec": "rapid"}
    ]

    refused = specialise(world, spec="heavy", actionUid=None)
    assert_error(refused, 409, "reload")
    assert "Reload the page" in refused.json()["error"]["message"]
    assert world.database.calls("island_specialise") == []


def test_a_member_pays_with_their_own_coins_on_the_hosts_island():
    world = world_at(9)
    game_of_owner(world)
    researched(world, mortar=(1, None, None))
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "mortar"}]

    response = specialise(world, spec="cluster", headers=GUEST, code="ISLE-K7Q2M")

    assert response.status_code == 200
    (call,) = world.database.calls("island_specialise")
    assert (call["p_player_id"], call["p_island_owner"], call["p_price"]) == (
        GUEST_ID,
        PLAYER_ID,
        120,
    )


def test_a_house_role_stays_free_with_or_without_a_click_id():
    world = world_at(3)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "house_1", "building_type": "house", "level": 2}
    ]

    assert specialise(world, spot="house_1", spec="tavern", actionUid=None).status_code == 200
    assert specialise(world, spot="house_1", spec="barracks").status_code == 200
    calls = world.database.calls("island_specialise")
    assert [(c["p_price"], c["p_action_uid"]) for c in calls] == [(0, None), (0, None)]
