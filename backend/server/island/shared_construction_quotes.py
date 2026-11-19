"""Exact build/upgrade/refund display intents from one locked shared snapshot.

Used by shared_snapshot; saved gated structures remain visible without reopening purchases.
"""

from server.island import rules
from server.island.catalogue import IslandCatalogue, catalogue_for_existing_structures
from server.island.shared_quote_rules import phase_reason, quote, refusal
from server.island.shared_snapshot_models import BuildingFacts, SnapshotFacts
from server.island.treasury_models import decimal_string


def purchase_reason(facts: SnapshotFacts, base: int, price: int) -> str | None:
    if facts.personal is None:
        return "captain_not_initialized"
    if price < base and facts.personal.captain.assignmentWaveId is not None:
        return "captain_assigned"
    return None


def purchase_price(facts: SnapshotFacts, catalogue: IslandCatalogue, base: int) -> int:
    if facts.personal is None:
        raise ValueError("Personal pricing state is required.")
    return rules.engineer_price(catalogue, base, facts.personal.captain.role)


def existing_intent(building: BuildingFacts, coins: int | str) -> dict:
    return {
        "spot": building.spot,
        "kind": building.kind,
        "instanceId": str(building.instanceId),
        "expectedLevel": building.level,
        "quotedCoins": coins if isinstance(coins, str) else decimal_string(coins),
    }


def construction_quotes(facts: SnapshotFacts, catalogue: IslandCatalogue) -> dict:
    built = {
        row.spot: rules.Built(row.kind, row.level, row.spec, row.treeA, row.treeB)
        for row in facts.buildings
    }
    saved = {row.spot: row for row in facts.buildings}
    existing = catalogue_for_existing_structures(catalogue, built)
    offers = {spot.id: spot for spot in catalogue.spots}
    result = {"build": [], "upgrade": [], "demolish": []}
    for spot in existing.spots:
        for kind in spot.kinds:
            target = {"spot": spot.id, "kind": kind}
            active = offers.get(spot.id)
            if active is None or kind not in active.kinds:
                result["build"].append(quote(facts, target, None, "economy_path_unavailable"))
                continue
            entry = rules.kind_of(catalogue, kind)
            if facts.personal is None:
                result["build"].append(quote(facts, target, None, "captain_not_initialized"))
                continue
            price = purchase_price(facts, catalogue, entry.prices[0])
            intent = {
                **target,
                "instanceId": None,
                "expectedLevel": 0,
                "quotedCoins": decimal_string(price),
            }
            reason = refusal(
                lambda spot=spot, kind=kind: rules.check_build(
                    catalogue, spot.id, kind, built, facts.waveBest
                )
            )
            reason = reason or purchase_reason(facts, entry.prices[0], price)
            result["build"].append(quote(facts, target, intent, reason, charge=price))
        target = {"spot": spot.id}
        row = saved.get(spot.id)
        if row is None:
            for group in ("upgrade", "demolish"):
                result[group].append(quote(facts, target, None, "not_built"))
            continue
        if row.refundCoins is None:
            for group in ("upgrade", "demolish"):
                result[group].append(quote(facts, target, None, "construction_basis_missing"))
            continue
        unlock = max(spot.unlock_wave, existing.campaign.spot_wave(spot.id))
        reason = "locked" if facts.waveBest < unlock else None
        result["demolish"].append(
            quote(facts, target, existing_intent(row, row.refundCoins), reason)
        )
        entry = rules.kind_of(existing, row.kind)
        if row.level >= entry.max_level:
            result["upgrade"].append(quote(facts, target, None, "max_level"))
            continue
        if facts.personal is None:
            result["upgrade"].append(quote(facts, target, None, "captain_not_initialized"))
            continue
        base = entry.prices[row.level]
        price = purchase_price(facts, existing, base)
        reason = phase_reason(facts) or refusal(
            lambda spot=spot: rules.check_upgrade(existing, spot.id, built, facts.waveBest)
        )
        reason = reason or purchase_reason(facts, base, price)
        if (
            reason is None
            and facts.recoveryVersion == 1
            and row.kind in {"wall", "cannon", "mortar", "harpoon", "culverin", "swivel"}
            and row.hpUnits != 1000000
        ):
            reason = "needs_repair"
        result["upgrade"].append(
            quote(facts, target, existing_intent(row, price), reason, charge=price)
        )
    return result
