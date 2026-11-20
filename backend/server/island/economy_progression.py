"""Catalogue rules and atomic shared research/tower/wreck submission.

Used by future shared island routes. No personal wallet or Engineer discount is used.
State, membership, phase, price and idempotency are checked together in PostgreSQL.
"""

from pydantic import TypeAdapter, ValidationError

from server.errors import ApiError
from server.island.catalogue import (
    HOUSE_ROLES,
    RESEARCH_TIER_ITEMS,
    IslandCatalogue,
    catalogue_for_existing_structures,
)
from server.island.economy_operations import root_action_uid
from server.island.economy_progression_models import (
    ProgressionIntent,
    ProgressionResult,
    ProgressionSnapshot,
    ResearchIntent,
    SpecialiseIntent,
    TreeIntent,
    WreckIntent,
)
from server.island.rules import Built, branch_of_spec, find_spot, research_named
from server.island.treasury import EconomyContext, amount, operation, scope
from server.island.treasury_store import REFUSALS, read_envelope
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

INTENTS = TypeAdapter(ProgressionIntent)


def invalid() -> ApiError:
    return ApiError(422, "invalid_progression", "This island progression intent is not valid.")


def parse_intent(value: object) -> ProgressionIntent:
    try:
        return INTENTS.validate_python(value)
    except ValidationError as error:
        raise invalid() from error


def catalogue_rule(catalogue: IslandCatalogue, intent: ProgressionIntent) -> dict:
    """Build trusted current rules without preempting an old request's immutable replay."""
    if isinstance(intent, ResearchIntent):
        entry = research_named(catalogue, intent.branch)
        if (intent.tier == 1 and intent.choice is not None) or (
            intent.tier > 1 and intent.choice not in entry.options_of(intent.tier)
        ):
            raise invalid()
        return {
            "price": amount(entry.price_of(intent.tier)),
            "unlockWave": catalogue.campaign.wave_of(RESEARCH_TIER_ITEMS[intent.tier - 1]),
        }
    if isinstance(intent, WreckIntent):
        if intent.amount not in catalogue.wreck.gifts:
            raise invalid()
        return {"goal": catalogue.wreck.goal, "unlockWave": catalogue.campaign.wave_of("wreck")}
    spot = find_spot(catalogue, intent.spot)
    if intent.expected.kind not in spot.kinds:
        raise invalid()
    if isinstance(intent, SpecialiseIntent):
        branch = "house" if intent.spec in HOUSE_ROLES else branch_of_spec(intent.spec)
        if branch is None or branch != intent.expected.kind:
            raise invalid()
        entry = None if branch == "house" else research_named(catalogue, branch)
        return {
            "price": amount(entry.pick_price(intent.spec), zero=True) if entry else "0",
            "branch": branch,
            "capstone": bool(entry and intent.spec in entry.options_of(3)),
            "unlockWave": max(spot.unlock_wave, catalogue.campaign.spot_wave(intent.spot)),
        }
    if isinstance(intent, TreeIntent):
        tree = catalogue.tree_of(intent.expected.kind)
        if tree is None or tree.path_named(intent.path) is None:
            raise invalid()
        return {
            "price": amount(tree.prices[intent.tier - 1]),
            "level": tree.level,
            "unlockWave": max(
                tree.waves[intent.tier - 1],
                spot.unlock_wave,
                catalogue.campaign.spot_wave(intent.spot),
            ),
        }
    raise invalid()


PROGRESSION_ERRORS = {
    "invalid_progression": (422, "invalid_progression", "This progression intent is not valid."),
    "stale_progression_quote": (
        409,
        "stale_progression_quote",
        "The island changed. Reload this choice.",
    ),
    "recovery_state_incomplete": (
        409,
        "economy_path_unavailable",
        "Island recovery state is unavailable.",
    ),
    "recovery_option_retired": (
        409,
        "recovery_option_retired",
        "This repair-only choice is unavailable under this island's recovery policy.",
    ),
    **{
        code: (409, code, message)
        for code, message in {
            "known": "This progression step is already active.",
            "needs_tier": "Buy the previous tier first.",
            "closed": "This choice requires an explicit switch.",
            "locked": "Win the required island wave first.",
            "not_built": "Build this structure first.",
            "needs_level": "Upgrade the structure first.",
            "not_researched": "Complete the required island research first.",
            "repaired": "The wreck is already repaired.",
        }.items()
    },
}


def check_status(value: object) -> None:
    if isinstance(value, dict) and value.get("status") == "refused":
        refusal = PROGRESSION_ERRORS.get(value.get("reason")) or REFUSALS.get(value.get("reason"))
        if refusal is not None:
            raise ApiError(*refusal)


def read_result(value: object) -> ProgressionResult:
    check_status(value)
    try:
        result = ProgressionResult.model_validate(value)
        if result.currentEconomy is not None:
            account = read_envelope(result.currentEconomy.model_dump(mode="json"))
            origin = result.receipt.origin
            if (account.account_id, account.run_epoch, account.island_owner) != (
                str(origin.accountId),
                str(origin.runEpoch),
                str(origin.islandOwner),
            ):
                raise ValueError("origin mismatch")
        effect = result.receipt.result
        if (effect.chargedCoins == "0") != (effect.treasuryReceiptId is None):
            raise ValueError("financial receipt mismatch")
        expected_outcomes = {
            "research": (True, False, False),
            "specialise": (False, True, False),
            "tower_tree": (False, True, False),
            "wreck": (False, False, True),
        }
        if (
            effect.research is not None,
            effect.building is not None,
            effect.wreckPaid is not None,
        ) != (expected_outcomes[result.receipt.action]):
            raise ValueError("domain outcome mismatch")
        return result
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable progression reply.") from error


async def mutate(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    context: EconomyContext,
    action_uid: str,
    value: object,
) -> ProgressionResult:
    parameters = scope(context)
    operation(action_uid, "progression")
    root_action_uid(action_uid)
    intent = parse_intent(value)
    if isinstance(intent, (SpecialiseIntent, TreeIntent)):
        # This restores known saved options, not ownership. SQL proves the exact
        # current instance, kind, level and revision before any charge or change.
        catalogue = catalogue_for_existing_structures(
            catalogue, {intent.spot: Built(intent.expected.kind, intent.expected.level)}
        )
    try:
        rule = catalogue_rule(catalogue, intent)
    except ApiError:
        # A removed offer cannot invalidate an immutable receipt. SQL resolves
        # the original operation first and refuses unavailable offers for new intents.
        rule = {"unavailable": True}
    result = read_result(
        await admin.call_function(
            "island_economy_progression",
            {
                **parameters,
                "p_action_uid": action_uid,
                "p_intent": intent.model_dump(mode="json"),
                "p_rule": rule,
            },
        )
    )
    receipt = result.receipt
    if (
        str(receipt.actorId),
        receipt.actionUid,
        receipt.action,
        str(receipt.origin.accountId),
        str(receipt.origin.runEpoch),
        str(receipt.origin.islandOwner),
    ) != (
        context.actor_id,
        action_uid,
        intent.action,
        context.account_id,
        context.run_epoch,
        context.island_owner,
    ):
        raise SupabaseRejected("The database returned another progression action.")
    return result


async def read_state(admin: SupabaseAdmin, context: EconomyContext) -> ProgressionSnapshot:
    """Get bounded current state for exact intents; legacy projections omit CAS revisions."""
    value = await admin.call_function("island_economy_progression_state", scope(context))
    check_status(value)
    try:
        result = ProgressionSnapshot.model_validate(value)
        account = read_envelope(result.economy.model_dump(mode="json"))
        if (account.account_id, account.run_epoch, account.island_owner) != (
            context.account_id,
            context.run_epoch,
            context.island_owner,
        ):
            raise ValueError("origin mismatch")
        if len({row.branch for row in result.research}) != len(result.research):
            raise ValueError("duplicate research")
        if len({row.spot for row in result.buildings}) != len(result.buildings):
            raise ValueError("duplicate building")
        return result
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent unreadable island progression state.") from error
