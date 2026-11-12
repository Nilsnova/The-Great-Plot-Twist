"""The research tiers of the Tech hub (docs/GAME-V3.md section 5.1): POST /api/island/research with
a tier and a choice, and the tiers in GET /api/island.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py); the
prices, the options and the unlock waves come from the real islands.json and campaign.json. The SQL
side of the same rules is in island_sql/test_research_tiers_sql.py.
"""

import pytest

from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER_ID
from server.tests.test_tech_hub_routes import research, specialise, world_at


def researched(world, **branches):
    """Research rows: branch=(tier, choice_2, choice_3)."""
    world.database.research = [
        {"branch": branch, "tier": tier, "choice_2": two, "choice_3": three}
        for branch, (tier, two, three) in branches.items()
    ]


def test_tier_two_opens_after_wave_fifteen_at_twice_the_price():
    early = world_at(14)
    researched(early, cannon=(1, None, None))
    locked = research(early, tier=2, choice="long_guns")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Opens after wave 15."
    assert early.database.calls("island_research") == []

    world = world_at(15)
    researched(world, cannon=(1, None, None))
    assert research(world, tier=2, choice="long_guns").status_code == 200
    (call,) = world.database.calls("island_research")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": PLAYER_ID,
        "p_branch": "cannon",
        "p_action_uid": "click-0001",
        "p_price": 360,
        "p_unlock_wave": 15,
        "p_tier": 2,
        "p_choice": "long_guns",
        "p_change": False,
    }


def test_tier_three_opens_after_wave_twenty_five_at_three_and_a_half_times():
    assert_error(
        research(world_at(24), "wall", tier=3, choice="bastion"),
        409,
        "locked",
    )
    world = world_at(25)
    researched(world, wall=(2, "thick_walls", None))
    assert research(world, "wall", tier=3, choice="bastion").status_code == 200
    (call,) = world.database.calls("island_research")
    assert (call["p_price"], call["p_unlock_wave"], call["p_tier"]) == (420, 25, 3)


def test_the_other_option_is_closed_unless_the_crew_pays_to_change():
    world = world_at(20)
    researched(world, cannon=(2, "long_guns", None))

    closed = research(world, tier=2, choice="rapid_2")
    assert_error(closed, 409, "closed")
    assert closed.json()["error"]["message"] == (
        "Closed: your crew chose Long guns. Change it to switch."
    )
    assert_error(research(world, tier=2, choice="long_guns"), 409, "known")
    assert world.database.calls("island_research") == []

    assert research(world, tier=2, choice="rapid_2", change=True).status_code == 200
    (call,) = world.database.calls("island_research")
    assert (call["p_price"], call["p_change"], call["p_choice"]) == (360, True, "rapid_2")


def test_tiers_go_one_at_a_time_never_above_three_and_only_with_an_option_of_the_tier():
    world = world_at(30)
    assert_error(research(world, tier=2, choice="rapid_2"), 409, "needs_tier")
    researched(world, cannon=(1, None, None))
    assert_error(research(world, tier=3, choice="broadside"), 409, "needs_tier")
    assert_error(research(world, tier=4), 409, "top_tier")
    for body in (
        {"tier": 2},
        {"tier": 2, "choice": "heavy_shells"},
        {"tier": 3, "choice": "long_guns"},
        {"tier": 1, "choice": "rapid_2"},
        {"tier": 0},
    ):
        response = research(world, **body)
        assert response.status_code in (400, 422), body
    assert world.database.calls("island_research") == []


@pytest.mark.parametrize(
    "reason,status",
    [("closed", 409), ("needs_tier", 409), ("top_tier", 409), ("known", 409)],
)
def test_the_database_has_the_last_word_on_the_tiers(reason, status):
    world = world_at(20)
    researched(world, cannon=(1, None, None))
    world.database.paid_replies["island_research"] = {"status": "refused", "reason": reason}
    assert_error(research(world, tier=2, choice="rapid_2"), status, reason)


def test_the_island_shows_every_branch_tier_and_the_options_with_their_prices():
    world = world_at(26)
    researched(world, cannon=(3, "rapid_2", "grapeshot"), mortar=(1, None, None))
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "cannon", "level": 4, "spec": "grapeshot"},
    ]

    body = world.island().json()

    research_out = body["campaign"]["research"]
    assert research_out["done"] == ["cannon", "mortar"]
    assert research_out["tierWaves"] == [8, 15, 25]
    assert research_out["tiers"] == {
        "cannon": {"tier": 3, "tier2": "rapid_2", "tier3": "grapeshot"},
        "mortar": {"tier": 1, "tier2": None, "tier3": None},
        "wall": {"tier": 0, "tier2": None, "tier3": None},
        "watchtower": {"tier": 0, "tier2": None, "tier3": None},
    }
    cannon = research_out["branches"][0]
    assert cannon["prices"] == [180, 360, 630]
    assert [option["name"] for option in cannon["tier2"]] == ["Rapid II", "Long guns"]
    assert [option["id"] for option in cannon["tier3"]] == ["broadside", "grapeshot"]
    spots = {spot["id"]: spot for spot in body["spots"]}
    assert spots["cannon_1"]["spec"] == "grapeshot"


def test_a_tower_picks_a_capstone_only_once_its_island_chose_it():
    world = world_at(26)
    world.database.buildings[PLAYER_ID] = [{"plot": "cannon_1", "building_type": "cannon"}]
    researched(world, cannon=(2, "rapid_2", None))

    not_yet = specialise(world, spec="broadside")
    assert_error(not_yet, 409, "not_researched")
    assert not_yet.json()["error"]["message"] == "Pick Broadside at tier 3 of the Tech hub first."
    researched(world, cannon=(3, "rapid_2", "grapeshot"))
    assert_error(specialise(world, spec="broadside"), 409, "not_researched")
    assert specialise(world, spec="grapeshot").status_code == 200
    (call,) = world.database.calls("island_specialise")
    assert call["p_spec"] == "grapeshot"
