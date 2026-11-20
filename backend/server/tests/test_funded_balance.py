"""Earned-income balance runner counterexamples, separate from its measured combat output.

Used by MP-ECO-19: no assumed victory, unavailable-house income or unearned Captain skills.
"""

import subprocess

import pytest

from server.island.catalogue import load_island, runtime_catalogue
from tools.economy.funded_play import (
    ROOT,
    Campaign,
    Combat,
    buy_adaptive,
    buy_queue,
    campaign,
    play_attempt,
    profiles_for,
    protocol_timing,
    source_inventory,
    wave_options,
)
from tools.economy.island_balance_plans import Purchase, building_plan


@pytest.fixture
def catalogue():
    return runtime_catalogue(load_island())


class DefeatedCombat:
    """A controlled failure for accounting tests; never used by the measurement command."""

    def play(self, options, profiles):
        return {"survived": False, "time": 17.5, "shipsSunk": 0,
                "islandHp": 0, "reason": "island_lost"}


def test_defeat_cannot_mint_assumed_loot_or_new_personal_progress(catalogue):
    game = Campaign(20)
    row = play_attempt(DefeatedCombat(), catalogue, game, 10, "mixed", 7919,
                       catalogue.weather[0])
    assert row["lootCoins"] == 0 and game.coins == 20
    assert game.best == 0 and game.next_wave == 1
    assert game.seconds == 17.5
    assert all(p["level"] == 1 and p["skills"] == [] for p in row["frozenProfiles"])


def test_new_captain_does_not_inherit_a_veterans_personal_record(catalogue):
    game = Campaign(200, personal_bests=[40, 0])
    row = play_attempt(DefeatedCombat(), catalogue, game, 2, "mixed", 7919,
                       catalogue.weather[0])
    assert [p["level"] for p in row["frozenProfiles"]] == [5, 1]
    assert row["frozenProfiles"][1]["skills"] == []
    assert game.best == 0 and game.personal_bests == [40, 0]


def test_no_house_is_funded_by_income_it_has_not_yet_earned(catalogue):
    game = Campaign(200)
    bought, blocked = buy_queue(catalogue, game, building_plan(True))
    assert len(bought) == 8  # Six 10-coin walls and two 30-coin cannons.
    assert game.coins == 80
    assert blocked["plot"] == "house_1" and blocked["reason"] == "locked"
    assert all(item.kind != "house" for item in game.buildings.values())


def test_alternative_priority_can_buy_defenses_behind_a_locked_house(catalogue):
    game = Campaign(200)
    bought, blocked = buy_adaptive(catalogue, game, building_plan(True))
    assert len(bought) == 10 and game.coins == 20
    assert sum(item.kind == "cannon" for item in game.buildings.values()) == 4
    assert all(item.level == 1 for item in game.buildings.values())
    assert blocked and all(item.kind != "house" for item in game.buildings.values())


def test_shared_income_never_scales_with_member_count(catalogue):
    combat = Combat()
    try:
        outcomes = []
        for count in (1, 10):
            game = Campaign(200)
            buy_queue(catalogue, game, building_plan(False))
            row = play_attempt(combat, catalogue, game, count, "veteran", 7919,
                               catalogue.weather[0])
            assert row["result"]["survived"]
            outcomes.append((row["lootCoins"], game.coins))
        assert outcomes == [(35, 55), (35, 55)]
    finally:
        combat.close()


def test_late_unlock_cannot_be_bought_with_cash_alone(catalogue):
    game = Campaign(10**6, best=9)
    _, blocked = buy_queue(catalogue, game, [Purchase("cannon_8", "cannon", 1)])
    assert blocked["reason"] == "locked"
    assert not game.ledger and not game.buildings and game.coins == 10**6


def test_kind_change_and_skipped_upgrade_never_enter_the_measured_plan(catalogue):
    game = Campaign(1000)
    buy_queue(catalogue, game, [Purchase("cannon_1", "cannon", 1)])
    with pytest.raises(ValueError, match="replaces a standing"):
        buy_queue(catalogue, game, [Purchase("cannon_1", "mortar", 2)])
    with pytest.raises(ValueError, match="skips a building"):
        buy_queue(catalogue, game, [Purchase("cannon_1", "cannon", 3)])


def test_earned_skill_budget_has_no_retired_or_unearned_branch(catalogue):
    assert profiles_for(catalogue, 1, "veteran", 0)[0]["skills"] == []
    for best in (1, 2, 8, 20, 40):
        row = profiles_for(catalogue, 1, "veteran", best)[0]
        tree = {item.skill: item for item in catalogue.skills.tree}
        known = [name for name in row["skills"] if name != "gunner"]
        assert sum(tree[name].cost for name in known) <= best // catalogue.skills.waves_per_point
        assert not set(known) & {"quick_fix", "master_shipwright", "grand_engineer"}
        for name in known:
            assert not tree[name].needs or set(tree[name].needs) & set(known)


def test_measured_wave_uses_current_recovery_and_funded_defenses(catalogue):
    game = Campaign(200)
    buy_queue(catalogue, game, building_plan(False))
    options = wave_options(catalogue, game, 7919, catalogue.weather[0])
    assert options["recoveryVersion"] == 1 and options["waveProtocol"] == 2
    assert options["towerHealth"] and options["pathing"] and options["shipFire"]
    assert len(options["defenses"]) == 10 and options["crew"]["carpenter"] == 0
    assert all(row["level"] == 1 for row in options["defenses"])


def test_production_combat_is_deterministic_for_identical_funded_state(catalogue):
    game = Campaign(200)
    buy_queue(catalogue, game, building_plan(False))
    combat = Combat()
    try:
        options = wave_options(catalogue, game, 15401, catalogue.weather[0])
        profiles = profiles_for(catalogue, 2, "mixed", 0)
        assert combat.play(options, profiles) == combat.play(options, profiles)
    finally:
        combat.close()


def test_scripted_movement_cannot_cross_water_or_a_wall_or_exceed_tick_speed():
    program = """
      import assert from 'node:assert/strict';
      import {legalMovement} from './frontend/scripts/economy-funded-wave.mjs';
      import {canStand} from './frontend/src/player/collision.js';
      import {placeGround} from './frontend/src/world/places/surfaces.js';
      const ground=placeGround('home_islet');
      let point={x:0,z:2};
      for(let i=0;i<160;i++){
        const next=legalMovement(point,{x:100,z:2},.25);
        assert.ok(canStand(next.x,next.z,[],ground),'Captain entered the water');
        assert.ok(Math.hypot(next.x-point.x,next.z-point.z)<=1.26,'Captain exceeded 5 units/s');
        point=next;
      }
      assert.ok(point.x<22,'Captain crossed the coast');
      const wall={x:3,z:2,width:2,depth:2};
      point={x:0,z:2};
      for(let i=0;i<20;i++)point=legalMovement(point,{x:6,z:2},.25,[wall]);
      assert.ok(point.x<2,'Captain crossed the funded wall');
      assert.ok(canStand(point.x,point.z,[wall],ground));
    """
    result = subprocess.run(["node", "--input-type=module", "--eval", program],
                            cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


def test_pacing_projection_uses_native_shared_default_instead_of_catalogue(catalogue):
    assert catalogue.waves.countdown_seconds == 5
    assert protocol_timing(catalogue) == {
        "countdownSeconds": 10, "minimumSeconds": 10, "wonBreakSeconds": 8}
    row = campaign(DefeatedCombat(), catalogue, count=1, policy="novice", priority="defense",
                   seed=7919, attempts=1, target=40, weather_kind="calm")
    assert row["simSeconds"] == 17.5
    assert row["calculatedProtocolFloorSeconds"] == 27.5


def test_source_manifest_includes_the_imported_purchase_planner():
    assert "backend/tools/economy/island_balance_plans.py" in source_inventory()
