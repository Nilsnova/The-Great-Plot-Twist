"""Checked shared crew reads and atomic hire intents for future shared-island routes.

The database owns membership, phase, progression, treasury and crew in one transaction.
No legacy wallet or separate asset write is used by this adapter.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island import treasury_store
from server.island.catalogue import IslandCatalogue
from server.island.economy_operations import root_action_uid
from server.island.shared_crew_rules import HireIntent, crew_offers, manifest
from server.island.treasury import EconomyContext, scope
from server.island.treasury_store import Unsigned
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

Count = Annotated[StrictInt, Field(ge=0, le=10)]


class Counts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gunner: Count
    carpenter: Count
    lookout: Count
    guard: Count


class Origin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class Effect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    crew: Literal["gunner", "lookout", "guard"]
    previousCount: Count
    count: Count
    chargedCoins: Unsigned
    treasuryReceiptId: UUID


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receiptId: UUID
    actionUid: str
    action: Literal["hire"]
    actorId: UUID
    origin: Origin
    result: Effect


class Reply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["done"]
    repeat: StrictBool
    currentEconomy: treasury_store.EnvelopeRow | None
    currentCrew: Counts | None
    currentWaveBest: StrictInt | None = Field(ge=0)
    receipt: Receipt


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"]
    currentEconomy: treasury_store.EnvelopeRow
    crew: Counts
    waveBest: StrictInt = Field(ge=0)


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable shared crew answer.")


def check_status(value: object) -> None:
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if reason in {"invalid_crew", "crew_unavailable", "crew_full", "locked"}:
            raise ApiError(
                422 if reason == "invalid_crew" else 409,
                reason,
                "Reload this island's crew before trying again.",
            )
        treasury_store.check_status(value)
        raise unreadable()


def identity(context: EconomyContext) -> tuple[str, str | None, str | None]:
    return context.island_owner, context.account_id, context.run_epoch


def check_current(value: treasury_store.EnvelopeRow, context: EconomyContext) -> None:
    account = treasury_store.account_from_row(value)
    if (account.island_owner, account.account_id, account.run_epoch) != identity(context):
        raise unreadable()


def read_result(
    value: object, context: EconomyContext, action_uid: str, intent: HireIntent
) -> dict:
    check_status(value)
    try:
        row = Reply.model_validate(value)
        receipt, effect = row.receipt, row.receipt.result
        origin = receipt.origin
        if (
            (str(origin.islandOwner), str(origin.accountId), str(origin.runEpoch))
            != identity(context)
            or str(receipt.actorId) != context.actor_id
            or receipt.actionUid != action_uid
            or effect.crew != intent.crew
            or effect.count != effect.previousCount + 1
            or effect.chargedCoins == "0"
        ):
            raise unreadable()
        present = [
            row.currentEconomy is not None,
            row.currentCrew is not None,
            row.currentWaveBest is not None,
        ]
        if not all(present):
            if any(present) or not row.repeat:
                raise unreadable()
        else:
            check_current(row.currentEconomy, context)
            if getattr(row.currentCrew, effect.crew) < effect.count:
                raise unreadable()
        return row.model_dump(mode="json")
    except ValidationError as error:
        raise unreadable() from error


async def hire(
    admin: SupabaseAdmin,
    context: EconomyContext,
    action_uid: str,
    intent: HireIntent,
    catalogue: IslandCatalogue,
) -> dict:
    """One RPC owns the root claim, charge, crew count and immutable receipt."""
    root_action_uid(action_uid)
    parameters = {
        **scope(context),
        "p_action_uid": action_uid,
        "p_crew": intent.crew,
        "p_catalogue": manifest(catalogue),
    }
    return read_result(
        await admin.call_function("island_economy_hire", parameters), context, action_uid, intent
    )


async def read(admin: SupabaseAdmin, context: EconomyContext, catalogue: IslandCatalogue) -> dict:
    """Every client reads the same target counts, independent of Captain presence."""
    value = await admin.call_function("island_economy_crew", scope(context))
    check_status(value)
    try:
        row = Snapshot.model_validate(value)
        check_current(row.currentEconomy, context)
        available = treasury_store.account_from_row(row.currentEconomy).available_coins
        return {
            **row.model_dump(mode="json"),
            "offers": crew_offers(catalogue, row.crew.model_dump(), row.waveBest, available),
        }
    except ValidationError as error:
        raise unreadable() from error
