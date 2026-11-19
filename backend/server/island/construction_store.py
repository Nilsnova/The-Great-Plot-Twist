"""Service-only construction intents and strict combined transaction receipts.

Used by future shared routes; the database alone changes treasury and structures together.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island import treasury_store
from server.island.catalogue import IslandCatalogue, catalogue_for_existing_structures
from server.island.construction_rules import ConstructionIntent, Unsigned, catalogue_manifest
from server.island.economy_operations import root_action_uid
from server.island.rules import Built
from server.island.treasury import EconomyContext, scope
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class Origin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class Effect(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str
    kind: str
    level: StrictInt = Field(ge=1, le=5)
    instanceId: UUID
    chargedCoins: Unsigned
    refundedCoins: Unsigned
    engineerCommitmentId: UUID | None
    treasuryReceiptId: UUID | None


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receiptId: UUID
    actionUid: Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")]
    action: Literal["build", "upgrade", "demolish"]
    actorId: UUID
    origin: Origin
    result: Effect


class Reply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["done"]
    repeat: StrictBool
    currentEconomy: treasury_store.EnvelopeRow | None
    receipt: Receipt


REFUSALS = {
    "invalid_construction",
    "construction_basis_missing",
    "wave_running",
    "locked",
    "protected",
    "spot_taken",
    "not_built",
    "stale_construction_quote",
    "max_level",
    "needs_repair",
    "captain_not_initialized",
    "captain_assigned",
    "captain_conversion_required",
    "engineer_required",
}


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable shared construction answer.")


def check_effect(row: Reply, request: ConstructionIntent) -> None:
    effect = row.receipt.result
    removing = request.action == "demolish"
    level = request.expectedLevel if removing else request.expectedLevel + 1
    if (
        row.receipt.action != request.action
        or effect.spot != request.spot
        or effect.kind != request.kind
        or effect.level != level
        or (request.instanceId is not None and effect.instanceId != request.instanceId)
    ):
        raise unreadable()
    charge, refund = ("0", request.quotedCoins) if removing else (request.quotedCoins, "0")
    if (effect.chargedCoins, effect.refundedCoins) != (charge, refund):
        raise unreadable()
    paid = request.quotedCoins != "0"
    if (effect.treasuryReceiptId is not None) != paid:
        raise unreadable()
    if removing and effect.engineerCommitmentId is not None:
        raise unreadable()


def read_result(
    value: object, context: EconomyContext, action_uid: str, request: ConstructionIntent
) -> dict:
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if reason in REFUSALS:
            raise ApiError(
                422 if reason == "invalid_construction" else 409,
                reason,
                "Reload this island's construction quote before trying again.",
            )
        treasury_store.check_status(value)
        raise unreadable()
    try:
        row = Reply.model_validate(value)
        receipt, origin = row.receipt, row.receipt.origin
        expected = (context.island_owner, context.account_id, context.run_epoch)
        actual = (str(origin.islandOwner), str(origin.accountId), str(origin.runEpoch))
        if (
            actual != expected
            or str(receipt.actorId) != context.actor_id
            or receipt.actionUid != action_uid
        ):
            raise unreadable()
        check_effect(row, request)
        if row.currentEconomy is None:
            if not row.repeat:
                raise unreadable()
        else:
            account = treasury_store.account_from_row(row.currentEconomy)
            if (account.island_owner, account.account_id, account.run_epoch) != expected:
                raise unreadable()
        return row.model_dump(mode="json")
    except ValidationError as error:
        raise unreadable() from error


async def construct(
    admin: SupabaseAdmin,
    context: EconomyContext,
    action_uid: str,
    intent: ConstructionIntent,
    catalogue: IslandCatalogue,
) -> dict:
    """One domain RPC; neither a wallet call nor an asset write can happen separately."""
    root_action_uid(action_uid)
    if intent.action != "build":
        # This supplies known saved kinds/plots, not ownership. SQL independently
        # checks the exact current instance, kind, level and actual payment basis.
        catalogue = catalogue_for_existing_structures(
            catalogue, {intent.spot: Built(intent.kind, intent.expectedLevel)}
        )
    parameters = {
        **scope(context),
        "p_action_uid": action_uid,
        "p_intent": intent.model_dump(mode="json"),
        "p_catalogue": catalogue_manifest(catalogue),
    }
    value = await admin.call_function("island_economy_construct", parameters)
    return read_result(value, context, action_uid, intent)
