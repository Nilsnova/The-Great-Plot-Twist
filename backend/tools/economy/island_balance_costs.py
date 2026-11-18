"""Catalogue prices and illustrative asset bills for the offline balance assessment.

Used by: tools.economy.island_balance, never by game services.
"""

from server.island.catalogue import IslandCatalogue, catalogue_for_flags
from server.island.rules import engineer_price


def cost_catalogue(catalogue: IslandCatalogue) -> dict:
    """Report catalogue prices; exclude retired offers from target purchase baskets."""
    return {
        "buildings": {
            kind.kind: {
                "incremental": list(kind.prices),
                "cumulative": [sum(kind.prices[:n]) for n in range(1, kind.max_level + 1)],
                "unlockBest": list(kind.level_waves),
                "engineerIncremental": [
                    engineer_price(catalogue, p, "engineer") for p in kind.prices
                ],
            }
            for kind in catalogue.kinds
        },
        "crew": {
            row.crew: {
                "price": row.coins,
                "cap": row.max,
                "unlockBest": row.unlock_wave,
                "retiredUnderFullRecovery": row.crew == "carpenter",
            }
            for row in catalogue.crew
        },
        "research": {
            row.branch: {
                "tiers": list(row.prices),
                "skill": row.skill_coins,
                "capstone": row.capstone_coins,
            }
            for row in catalogue.research
        },
        "towerTrees": {
            row.kind: {
                "tiers": list(row.prices),
                "unlockBest": list(row.waves),
                "oneFullPathAndOtherTierOne": sum(row.prices) + row.prices[0],
            }
            for row in catalogue.trees
        },
        "weapons": {
            row.weapon: {"price": row.coins, "unlockBest": row.unlock_wave}
            for row in catalogue.weapons
        },
        "wreckGoal": catalogue.wreck.goal,
        "captainUpgradeAndRespecTargetCoins": 0,
    }


def sample_bills(catalogue: IslandCatalogue) -> dict:
    prices = {kind.kind: kind.prices for kind in catalogue.kinds}
    quantities = {"wall": 12, "cannon": 4, "mortar": 3, "watchtower": 1}
    houses = 2 * sum(prices["house"])
    active_crew = sum(row.coins * row.max for row in catalogue.crew if row.crew != "carpenter")
    cannon_research = next(row for row in catalogue.research if row.branch == "cannon")
    trees = {row.kind: sum(row.prices) + row.prices[0] for row in catalogue.trees}
    return {
        "startingSixWallsFourCannons": 6 * prices["wall"][0] + 4 * prices["cannon"][0],
        "sevenLevelFiveCannonsOnly": 7 * sum(prices["cannon"]),
        "fourCannonsThreeMortarsTwelveWallsWatchtowerTwoMaxHouses": {
            str(level): sum(count * sum(prices[kind][:level]) for kind, count in quantities.items())
            + houses
            for level in (3, 4, 5)
        },
        "maxGunnersGuardsLookout": active_crew,
        "cannonAllResearchPlusSevenTierOneSkills": sum(cannon_research.prices)
        + 7 * cannon_research.skill_coins,
        "threeLevelFiveCannonRepairs": 3 * prices["cannon"][-1],
        "fourCannonThreeMortarFullTreePackages": 4 * trees["cannon"] + 3 * trees["mortar"],
        "allResearchBranchesBeforeTowerSkills": sum(sum(row.prices) for row in catalogue.research),
        "levelFiveCannonDemolition": {
            "actualPaid": sum(prices["cannon"]),
            "refund": sum(prices["cannon"]) // 2,
        },
    }


def flagged_options(catalogue: IslandCatalogue) -> dict:
    """Read optional prices without activating flags or changing the baseline catalogue."""
    optional = catalogue_for_flags(catalogue, {"defenses_v2": True, "more_tower_spots": True})
    base_kinds = {row.kind for row in catalogue.kinds}
    base_spots = {row.id for row in catalogue.spots}
    return {
        "additionalKinds": {
            row.kind: {
                "incremental": list(row.prices),
                "cumulativeMaximum": sum(row.prices),
                "unlockBest": list(row.level_waves),
            }
            for row in optional.kinds
            if row.kind not in base_kinds
        },
        "additionalSpots": {
            row.id: row.unlock_wave for row in optional.spots if row.id not in base_spots
        },
    }
