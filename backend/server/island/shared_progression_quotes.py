"""Exact research, tower and wreck display intents from coherent shared facts.

Used by shared_snapshot. Prices come from the server catalogue; domain SQL checks them again.
"""

from server.errors import ApiError
from server.island import rules
from server.island.catalogue import HOUSE_ROLES, IslandCatalogue, catalogue_for_existing_structures
from server.island.economy_progression import catalogue_rule, parse_intent
from server.island.shared_quote_rules import quote, refusal
from server.island.shared_snapshot_models import BuildingFacts, SnapshotFacts
from server.island.treasury_models import decimal_string


def building_expected(row: BuildingFacts) -> dict:
    return row.model_dump(
        mode="json", include={"instanceId", "kind", "level", "spec", "treeA", "treeB", "revision"}
    )


def research_quotes(facts: SnapshotFacts, catalogue: IslandCatalogue) -> list[dict]:
    stored = {row.branch: row for row in facts.research}
    done = {
        row.branch: rules.ResearchTier(row.tier, row.choice2, row.choice3)
        for row in facts.research
        if row.tier
    }
    offers = []
    for entry in catalogue.research:
        state = stored.get(entry.branch)
        expected = (
            state.model_dump(mode="json", include={"tier", "choice2", "choice3", "revision"})
            if state
            else {"tier": 0, "choice2": None, "choice3": None, "revision": "0"}
        )
        for tier in (1, 2, 3):
            choices = (None,) if tier == 1 else entry.options_of(tier)
            for choice in choices:
                for change in (False,) if tier == 1 else (False, True):
                    target = {
                        "branch": entry.branch,
                        "tier": tier,
                        "choice": choice,
                        "change": change,
                    }
                    price = entry.price_of(tier)
                    intent = {**target, "expected": expected, "quotedCoins": decimal_string(price)}
                    reason = refusal(
                        lambda entry=entry, tier=tier, choice=choice, change=change: (
                            rules.check_research(
                                catalogue, entry.branch, done, facts.waveBest, tier, choice, change
                            )
                        )
                    )
                    if (
                        reason is None
                        and facts.recoveryVersion == 1
                        and entry.branch == "wall"
                        and tier == 2
                        and choice == "mason_drill"
                    ):
                        reason = "recovery_option_retired"
                    offers.append(quote(facts, target, intent, reason, charge=price))
    return offers


def progression_rule_reason(catalogue: IslandCatalogue, intent: dict, best: int) -> str | None:
    try:
        rule = catalogue_rule(catalogue, parse_intent(intent))
    except ApiError:
        return "economy_path_unavailable"
    return "locked" if best < rule["unlockWave"] else None


def tower_quotes(facts: SnapshotFacts, catalogue: IslandCatalogue) -> dict:
    built = {
        row.spot: rules.Built(row.kind, row.level, row.spec, row.treeA, row.treeB)
        for row in facts.buildings
    }
    done = {
        row.branch: rules.ResearchTier(row.tier, row.choice2, row.choice3)
        for row in facts.research
        if row.tier
    }
    existing = catalogue_for_existing_structures(catalogue, built)
    offers = {"towerSkill": [], "towerTree": []}
    for row in facts.buildings:
        specs = sorted(HOUSE_ROLES) if row.kind == "house" else rules.tower_specs(row.kind)
        for spec in specs:
            target = {"spot": row.spot, "spec": spec}
            if row.spec == spec:
                offers["towerSkill"].append(quote(facts, target, None, "known"))
                continue
            price = 0 if row.kind == "house" else rules.tower_skill_price(existing, row.kind, spec)
            intent = {
                **target,
                "expected": building_expected(row),
                "quotedCoins": decimal_string(price),
            }
            reason = refusal(
                lambda row=row, spec=spec: rules.check_specialise(
                    existing, row.spot, spec, built, done
                )
            )
            reason = reason or progression_rule_reason(
                existing, {"action": "specialise", **intent}, facts.waveBest
            )
            if (
                reason is None
                and facts.recoveryVersion == 1
                and row.spec != spec
                and spec in {"workshop", "quick_mend"}
            ):
                reason = "recovery_option_retired"
            offers["towerSkill"].append(quote(facts, target, intent, reason, charge=price))
        tree = existing.tree_of(row.kind)
        if tree is None:
            continue
        for path in ("a", "b"):
            for tier in (1, 2, 3):
                target = {"spot": row.spot, "path": path, "tier": tier}
                price = tree.prices[tier - 1]
                intent = {
                    **target,
                    "expected": building_expected(row),
                    "quotedCoins": decimal_string(price),
                }
                reason = refusal(
                    lambda row=row, path=path, tier=tier: rules.check_tree(
                        existing, row.spot, path, tier, built, facts.waveBest
                    )
                )
                reason = reason or progression_rule_reason(
                    existing, {"action": "tower_tree", **intent}, facts.waveBest
                )
                offers["towerTree"].append(quote(facts, target, intent, reason, charge=price))
    return offers


def wreck_quotes(facts: SnapshotFacts, catalogue: IslandCatalogue) -> list[dict]:
    offers = []
    for amount in catalogue.wreck.gifts:
        target = {"amount": amount}
        if facts.wreckPaid >= catalogue.wreck.goal:
            offers.append(quote(facts, target, None, "repaired"))
            continue
        price = min(amount, catalogue.wreck.goal - facts.wreckPaid)
        intent = {**target, "quotedCoins": decimal_string(price)}
        reason = refusal(
            lambda amount=amount: rules.check_wreck_gift(
                catalogue, amount, facts.wreckPaid, facts.waveBest
            )
        )
        offers.append(quote(facts, target, intent, reason, charge=price))
    return offers
