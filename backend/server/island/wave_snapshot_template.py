"""Static server wave geometry from already verified island facts.

Used by both legacy preparation and coherent shared preparation. This module
reads no wallet, account, profile, permission or mutable game state.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from server.island import layout, wall_health, wave_events
from server.island import rules as island_rules
from server.island.catalogue import (
    RESEARCH_CAPSTONES,
    IslandCatalogue,
    Weather,
    catalogue_for_existing_structures,
)
from server.island.rules import ResearchTier, SpotView
from server.island.structure_recovery_manifest import (
    MANIFEST_FILE,
    RECOVERY_MANIFEST,
    SUPPORTED_KINDS,
    max_structure_hp,
)


@dataclass(frozen=True)
class WaveDefense:
    """The combat-only subset of a coherent structure projection, without prices."""

    id: str
    kind: str
    built: bool
    level: int
    spec: str | None
    x: float | None
    z: float | None
    tree: tuple[int, int] | None


def static_template(
    catalogue: IslandCatalogue,
    spots: Sequence[SpotView | WaveDefense],
    crew: dict[str, int],
    research: dict[str, ResearchTier],
    weather: Weather,
    seed: int,
    kept_rules: list[str],
    expected_revision: int,
) -> dict[str, Any]:
    """Reuse the existing simulation inputs without deriving any financial state."""
    built_for_runtime = {spot.id: spot for spot in spots if spot.built}
    runtime_catalogue = catalogue_for_existing_structures(catalogue, built_for_runtime)
    geometry = layout.island_layout(runtime_catalogue.more_tower_spots)
    complete_geometry = layout.island_layout(more=True)
    defenses = []
    structure_config: dict[str, dict[str, Any]] = {}
    wall_tier = research.get("wall")
    wall_research = None if wall_tier is None else wall_tier.choice_2
    workshops = [
        spot
        for spot in spots
        if spot.built and spot.kind == "house" and spot.spec == "workshop" and spot.level >= 2
    ]
    for spot in spots:
        if not spot.built:
            continue
        item: dict[str, Any] = {
            "id": spot.id,
            "kind": spot.kind,
            "level": spot.level,
            "x": spot.x,
            "z": spot.z,
        }
        # The defense in the legacy client's shape (frontend island/spots.js defenses()), so both
        # wave systems fight the same island (fix/playtest-1117): a capstone counts only while it is
        # the island's tier-3 pick, the tier-2 pick of the kind rides as `bonus`, and the upgrade
        # tree is {a, b} (it was [a, b], which the sim's readTree read as no tree at all).
        tier = research.get(spot.kind)
        spec = spot.spec
        if (
            spec is not None
            and spec in RESEARCH_CAPSTONES.get(spot.kind, ())
            and (tier is None or tier.choice_3 != spec)
        ):
            spec = None
        if spec is not None:
            item["spec"] = spec
        if tier is not None and tier.choice_2 is not None:
            item["bonus"] = tier.choice_2
        if spot.tree is not None:
            item["tree"] = {"a": spot.tree[0], "b": spot.tree[1]}
        defenses.append(item)
        if spot.kind in SUPPORTED_KINDS:
            nearby_workshops = sum(
                1
                for house in workshops
                if house.x is not None
                and house.z is not None
                and spot.x is not None
                and spot.z is not None
                and (house.x - spot.x) ** 2 + (house.z - spot.z) ** 2 <= 10**2
            )
            selected_wall_spec = spec if spot.kind == "wall" else None
            selected_wall_research = wall_research if spot.kind == "wall" else None
            max_hp = max_structure_hp(
                spot.kind, spot.level, selected_wall_spec, selected_wall_research
            )
            # New protocol-2 snapshots keep the historical rate fields in their wire shape, but
            # automatic healing no longer operates between or during waves. Saved snapshots keep
            # their original rates; only new snapshots write a neutral multiplier.
            structure_config[spot.id] = {
                "kind": spot.kind,
                "level": spot.level,
                "maxHP": float(max_hp),
                "rateNumerator": 1,
                "rateDenominator": 1,
                "wallSpec": selected_wall_spec,
                "wallResearch": selected_wall_research,
                "nearbyWorkshops": nearby_workshops,
            }

    rule_options = {
        "tower_health": "towerHealth",
        "pathing": "pathing",
        "tower_obstacles": "towerObstacles",
        "rescue": "rescue",
        "defenses_v2": "defensesV2",
        "ship_fire": "shipFire",
    }
    create_wave: dict[str, Any] = {
        "weather": {"ships": weather.ships, "fog": weather.fog},
        "island": {"hp": 100},
        "defenses": defenses,
        "crew": dict(crew),
        "flagship": False,
        "countdown": 0,
        "coast": {"rx": geometry.rx, "rz": geometry.rz, "seed": geometry.seed},
        "lanes": [
            {"id": "east", "bearing": 0},
            {"id": "south", "bearing": 90},
            {"id": "west", "bearing": 180},
        ],
        "heart": {"x": geometry.heart[0], "z": geometry.heart[1], "ring": 12},
        "finishers": True,
        "finisherPreparation": True,
    }
    for rule_name, option_name in rule_options.items():
        create_wave[option_name] = rule_name in kept_rules or (
            rule_name == "defenses_v2" and any(spot.kind == "culverin" for spot in spots)
        )

    events = {
        str(number): wave_events.event_for(number, seed)
        for number in range(1, catalogue.waves.highest_wave + 1)
    }
    bosses = {
        str(number): number % catalogue.waves.boss_every == 0
        for number in range(1, catalogue.waves.highest_wave + 1)
    }
    recovery_config = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    recovery_config["baseRateUnitsPerSecond"] = [5000, 3]
    recovery_config["recoveryRateFactors"] = {
        "carpenterMultiplierPerWorker": 0,
        "carpenterMaximumWorkers": 2,
        "workshopPercentPerHouse": 0,
        "workshopPercentCap": 0,
        "workshopRadius": 10,
        "wallSpecRateFactors": {"quick_mend": [1, 1], "bastion": [1, 1]},
        "wallResearchRateFactors": {"mason_drill": [1, 1]},
    }
    default_positions = {spot.spot: {"x": spot.x, "z": spot.z} for spot in complete_geometry.spots}
    return {
        "expectedRevision": expected_revision,
        "weather": dict(create_wave["weather"]),
        "createWave": create_wave,
        "priceSchedule": island_rules.price_table(runtime_catalogue),
        "eventByWave": events,
        "bossByWave": bosses,
        "recoveryConfig": recovery_config,
        "defaultPositions": default_positions,
        "structureConfigBySpot": structure_config,
        "legacyWallRecoverSeconds": wall_health.RECOVERY_SECONDS,
        "configVersion": RECOVERY_MANIFEST.recovery_version,
        "supportedStructureKinds": list(SUPPORTED_KINDS),
    }

