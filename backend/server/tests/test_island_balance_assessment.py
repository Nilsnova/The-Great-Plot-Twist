"""Independent arithmetic checks for the offline shared-island balance report.

Used by: reviewers regenerating the MP-ECO-19 evidence, not game routes.
"""

import pytest

from server.island.catalogue import load_island
from tools.economy.island_balance import (
    income,
    repeat_cycle,
    reset_wager_sensitivity,
    revenue_bounds,
    shared_resources,
    ship_improvements,
)
from tools.economy.island_balance_plans import Purchase, building_plan, simulate_plan


@pytest.mark.parametrize(
    ("wave", "houses", "expected"),
    [
        (1, 0, 35),
        (5, 2, 285),
        (30, 0, 975),
        (31, 0, 329),
        (40, 0, 1825),
        (41, 0, 553),
        (45, 6, 2001),
        (100, 0, 2721),
    ],
)
def test_income_uses_current_boss_and_late_wave_rules(wave, houses, expected):
    assert income(load_island(), wave, houses) == expected


@pytest.mark.parametrize("captains", [1, 2, 4, 10])
def test_one_treasury_does_not_multiply_grants_or_income(captains):
    assert shared_resources(load_island(), captains, 5) == {
        "captains": captains,
        "startCoins": 200,
        "waveIncome": 425,
        "totalBeforeSpending": 625,
        "pistolsForEveryCaptain": 60 * captains,
        "longRiflesForEveryCaptain": 200 * captains,
        "formerPersonalUpgradeBill": 300 * captains,
    }


def test_houses_wait_for_unlock_and_cannot_fund_their_own_purchase():
    plan = simulate_plan(load_island(), [Purchase("house_1", "house", 1)], last_wave=2)
    assert plan[0]["houseLevelsAtBell"] == 0
    assert plan[0]["purchases"] == []
    assert plan[0]["closingCoins"] == 235
    assert plan[1]["houseLevelsAtBell"] == 1
    assert plan[1]["purchases"][0]["paidCoins"] == 50
    assert plan[1]["income"] == 55
    assert plan[1]["closingCoins"] == 240


def test_a_funded_upgrade_waits_until_its_campaign_unlock():
    queue = [Purchase("cannon_1", "cannon", 1), Purchase("cannon_1", "cannon", 2)]
    plan = simulate_plan(load_island(), queue, last_wave=3)
    assert plan[0]["purchases"] == [
        {"plot": "cannon_1", "kind": "cannon", "level": 1, "unlockBest": 0, "paidCoins": 30}
    ]
    assert plan[1]["purchases"] == []
    assert plan[2]["purchases"][0]["paidCoins"] == 60


def test_unaffordable_priority_waits_without_negative_money():
    queue = [
        Purchase("cannon_1", "cannon", 1),
        Purchase("cannon_1", "cannon", 2),
        Purchase("cannon_1", "cannon", 3),
    ]
    plan = simulate_plan(load_island(), queue, last_wave=6, reserve_coins=150)
    assert plan[2]["closingCoins"] == 245
    assert plan[4]["purchases"] == []
    assert plan[5]["purchases"][0]["paidCoins"] == 120
    assert min(row["beforeIncomeCoins"] for row in plan) >= 150
    assert plan[-1]["closingCoins"] == 200 + sum(row["income"] for row in plan) - 210


@pytest.mark.parametrize(
    "purchase", [Purchase("house_1", "cannon", 1), Purchase("cannon_1", "cannon", 2)]
)
def test_invalid_spots_and_skipped_levels_are_refused(purchase):
    with pytest.raises(ValueError):
        simulate_plan(load_island(), [purchase], last_wave=1)


def test_plan_cannot_change_the_kind_of_a_standing_tower():
    queue = [Purchase("cannon_1", "cannon", 1), Purchase("cannon_1", "mortar", 2)]
    with pytest.raises(ValueError, match="kind"):
        simulate_plan(load_island(), queue, last_wave=3)


def test_ship_payments_only_improve_each_game_record():
    assert ship_improvements(30, [1, 3, 3, 2, 0]) == [12, 24, 0, 0, 0]
    assert ship_improvements(100, [3, 1]) == [78, 0]


@pytest.mark.parametrize("score", [-1, 4, True, 1.5])
def test_ship_sensitivity_refuses_scores_outside_the_catalogue(score):
    with pytest.raises(ValueError):
        ship_improvements(30, [score])


def test_conditional_event_bonuses_respect_early_unlock_and_boss_multipliers():
    bounds = {row["wave"]: row for row in revenue_bounds(load_island())}
    assert bounds[5]["conditionalGalleonExtra"] == 0
    assert bounds[40]["conditionalFinisherExtra"] == 675
    assert bounds[40]["conditionalGalleonExtra"] == 900


def test_loss_replay_income_needs_fresh_attempts_but_no_new_record():
    assert repeat_cycle(load_island(), 5, 6) == {
        "existingRecord": 5,
        "houseLevelsAlreadyPurchased": 6,
        "lostWave": 6,
        "subsequentWonWaves": [3, 4, 5],
        "earnedCoins": 645,
        "newRecordOrMilestone": False,
    }


def test_reset_wager_example_requires_harbor_progress_and_carries_no_old_coins():
    example = reset_wager_sensitivity(load_island())
    assert example["assumedWonWavesBeforeHarbor"] == 4
    assert example["availableBeforeWager"] == 220
    assert example["afterConditionalWin"] == 440
    assert example["afterFullLoss"] == 0
    assert example["replacementEpochStartingCoins"] == 200
    assert example["oldEpochMoneyTransferred"] == 0


@pytest.mark.parametrize("income_first", [False, True])
def test_complete_plans_conserve_funds_and_buy_all_106_building_levels(income_first):
    rows = simulate_plan(load_island(), building_plan(income_first))
    assert min(row["beforeIncomeCoins"] for row in rows) >= 0
    assert rows[-1]["buildingLevels"] == 106
    assert rows[-1]["remainingPurchases"] == 0
    assert sum(p["paidCoins"] for row in rows for p in row["purchases"]) == 14960
    assert rows[-1]["closingCoins"] == 200 + sum(row["income"] for row in rows) - 14960
    assert all(p["unlockBest"] <= row["bestAtPurchase"] for row in rows for p in row["purchases"])
