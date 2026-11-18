"""Reproducible shared-island coin-flow assessment, never a gameplay simulation.

Used by: MP-ECO-19 reviewers. Run from backend: python -m tools.economy.island_balance.
Reads checked local catalogues only; prints JSON and never connects to game services.
"""

import hashlib
import json
from pathlib import Path

from server.island.boat import BOAT, coins_for
from server.island.catalogue import IslandCatalogue, load_island
from server.island.rules import is_boss, loot_cap
from server.island.wave_events import bonus_base
from tools.economy.island_balance_costs import cost_catalogue, flagged_options, sample_bills
from tools.economy.island_balance_plans import building_plan, simulate_plan

ROOT = Path(__file__).resolve().parents[3]
CHECKPOINTS = (1, 5, 10, 20, 30, 40, 50, 75, 100)
CAPTAINS = (1, 2, 4, 10)
SOURCES = (
    "backend/content/islands.json",
    "backend/content/campaign.json",
    "backend/content/boat.json",
    "backend/content/tower_trees.json",
    "backend/content/defenses_v2.json",
    "backend/content/wave_events.json",
    "backend/server/island/rules.py",
    "backend/server/island/catalogue.py",
    "backend/server/island/boat.py",
    "backend/server/island/wave_events.py",
    "supabase/migrations/20261117025000_legacy_wave_locks.sql",
    "frontend/src/pirates/sim.js",
    "frontend/tests/pirates/balance-fixture.js",
)


def income(catalogue: IslandCatalogue, wave: int, houses: int = 0) -> int:
    return loot_cap(catalogue.loot, wave, houses, boss=is_boss(catalogue, wave))


def shared_resources(catalogue: IslandCatalogue, captains: int, wave: int) -> dict:
    """No per-player income; weapons are optional simultaneous physical copies."""
    earned = sum(income(catalogue, number) for number in range(1, wave + 1))
    weapons = {weapon.weapon: weapon.coins for weapon in catalogue.weapons}
    return {
        "captains": captains,
        "startCoins": catalogue.starting_coins,
        "waveIncome": earned,
        "totalBeforeSpending": catalogue.starting_coins + earned,
        "pistolsForEveryCaptain": weapons["pistols"] * captains,
        "longRiflesForEveryCaptain": weapons["long_rifle"] * captains,
        "formerPersonalUpgradeBill": sum(catalogue.captain.prices) * captains,
    }


def ship_improvements(wave: int, scores: list[int]) -> list[int]:
    """Selected shared rule: delta over the best score for one game and one record."""
    best, paid = 0, []
    for score in scores:
        if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= BOAT.stars:
            raise ValueError("A star score must fit the current boat catalogue.")
        new_best = max(best, score)
        paid.append(coins_for(new_best, wave) - coins_for(best, wave))
        best = new_best
    return paid


def revenue_bounds(catalogue: IslandCatalogue) -> list[dict]:
    """Fixed houses from wave 1 are hypothetical; no purchases or survival are proved."""
    return [
        {
            "wave": wave,
            "rewardWithoutHouses": income(catalogue, wave),
            "bossMultiplier": catalogue.loot.multiplier_for(wave)
            if is_boss(catalogue, wave)
            else 1,
            "cumulativeIncomeByFixedHouseLevels": {
                str(houses): sum(income(catalogue, n, houses) for n in range(1, wave + 1))
                for houses in (0, 2, 4, 6)
            },
            "conditionalFinisherExtra": bonus_base(["finisher"], wave)
            * catalogue.loot.multiplier_for(wave)
            if is_boss(catalogue, wave)
            else 0,
            "conditionalGalleonExtra": (
                bonus_base(["galleon"], wave)
                * (catalogue.loot.multiplier_for(wave) if is_boss(catalogue, wave) else 1)
                if wave >= 9
                else 0
            ),
        }
        for wave in CHECKPOINTS
    ]


def repeat_cycle(catalogue: IslandCatalogue, record: int, houses: int) -> dict:
    """Conditional legacy restart cycle: lose the next wave, then win back to the record."""
    first = max(1, record - catalogue.waves.restart_back)
    wins = list(range(first, record + 1))
    return {
        "existingRecord": record,
        "houseLevelsAlreadyPurchased": houses,
        "lostWave": record + 1,
        "subsequentWonWaves": wins,
        "earnedCoins": sum(income(catalogue, wave, houses) for wave in wins),
        "newRecordOrMilestone": False,
    }


def reset_wager_sensitivity(catalogue: IslandCatalogue) -> dict:
    """Conditional fee-free 2x payoff only, without product/odds or gameplay claims."""
    unlock = catalogue.campaign.wave_of("market_calls")
    assert unlock is not None
    prices = {row.kind: row.prices for row in catalogue.kinds}
    built = 6 * prices["wall"][0] + 4 * prices["cannon"][0]
    earned = sum(income(catalogue, wave) for wave in range(1, unlock + 1))
    available = catalogue.starting_coins + earned - built
    return {
        "assumedWonWavesBeforeHarbor": unlock,
        "startGrant": catalogue.starting_coins,
        "actualBuildSpend": built,
        "earnedLoot": earned,
        "availableBeforeWager": available,
        "committedBeforeWager": 0,
        "assumedOpeningFee": 0,
        "conditionalTotalReturnMultiplier": 2,
        "afterConditionalWin": 2 * available,
        "afterFullLoss": 0,
        "replacementEpochStartingCoins": catalogue.starting_coins,
        "oldEpochMoneyTransferred": 0,
    }


def run() -> dict:
    catalogue = load_island()
    return {
        "evidenceClass": "OFFLINE ARITHMETIC; NO SHARED-MODE PLAY OR LIVE ACTIVATION",
        "sourceSha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCES
        },
        "assumptions": [
            "One configured island grant; one win per sequential played wave; no party multiplier.",
            "Timelines omit bonuses, bets, ships, Engineer discount, refunds and paid repairs.",
            "Strict queues buy unlocked levels with prior funds before the next bell.",
            "All wins are assumptions, including waves fought with incomplete planned defenses.",
            "Fixed-house bounds assume houses from wave1 and subtract no expenses.",
            "Base seven tower spots; extra spots/culverin remain separately flagged options.",
            "Carpenter and repair-only effects remain undecided; no invented replacement.",
        ],
        "catalogue": cost_catalogue(catalogue),
        "flaggedOptionsOutsideBaseline": flagged_options(catalogue),
        "sampleBills": sample_bills(catalogue),
        "revenueBounds": revenue_bounds(catalogue),
        "partyComparisonWithoutHouses": [
            {
                "throughWave": wave,
                "parties": [shared_resources(catalogue, count, wave) for count in CAPTAINS],
            }
            for wave in (5, 20, 50, 100)
        ],
        "fundedPlans": {
            name: simulate_plan(catalogue, building_plan(first))
            for name, first in (("defense_first", False), ("income_first", True))
        },
        "shipRecordCaps": [
            {
                "best": wave,
                "oneGame": coins_for(BOAT.stars, wave),
                "bothGames": len(BOAT.games) * coins_for(BOAT.stars, wave),
                "oneThenThreeThenDuplicate": ship_improvements(wave, [1, 3, 3]),
            }
            for wave in (30, 40, 50, 75, 100)
        ],
        "shipPerfectEveryNewRecord30Through100": sum(
            len(BOAT.games) * coins_for(BOAT.stars, wave) for wave in range(30, 101)
        ),
        "repeatAttemptSensitivity": [
            {
                "playedWave": wave,
                "houseLevels": houses,
                "oneWin": income(catalogue, wave, houses),
                "tenSeparateWins": 10 * income(catalogue, wave, houses),
            }
            for wave, houses in ((1, 0), (1, 2), (5, 0), (5, 6), (10, 0), (10, 6))
        ],
        "conditionalLossAndReplayCycles": [
            repeat_cycle(catalogue, record, houses)
            for record, houses in ((1, 0), (1, 2), (5, 0), (5, 6), (10, 6))
        ],
        "conditionalResetGrantWagerExample": reset_wager_sensitivity(catalogue),
    }


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, ensure_ascii=True))
