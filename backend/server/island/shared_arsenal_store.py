"""Strict shared arsenal domain RPC adapter. Used by future authorized route integration.

The caller supplies authenticated actor and persisted original context, including for replay.
The SQL transaction rechecks new-operation authority; no separate debit or preflight is needed.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue
from server.island.economy_operations import root_action_uid
from server.island.treasury import EconomyContext, identifier
from server.island.treasury_models import decimal_integer, decimal_string
from server.island.treasury_store import REFUSALS, read_envelope
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

Unsigned = Annotated[str, Field(strict=True, pattern=r"^(0|[1-9][0-9]*)$")]
Action = Literal["arsenal_buy", "arsenal_withdraw", "arsenal_return"]
ACTIONS = {"buy": "arsenal_buy", "take": "arsenal_withdraw", "return": "arsenal_return"}


class Origin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class Effect(BaseModel):
    model_config = ConfigDict(extra="forbid")
    copyId: UUID
    weapon: str = Field(strict=True, min_length=1)
    holderGeneration: Unsigned
    priceCoins: Unsigned
    financialReceiptId: UUID | None


class Receipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receiptId: UUID
    actionUid: str = Field(strict=True, pattern=r"^[A-Za-z0-9_-]{8,64}$")
    action: Action
    actorId: UUID
    origin: Origin
    result: Effect


class Done(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["done"]
    repeat: StrictBool
    operationId: UUID
    receipt: Receipt
    currentEconomy: dict | None


def read_result(value: object) -> dict:
    """Keep original common receipt and separately authorized current state distinct."""
    if isinstance(value, dict) and value.get("status") == "refused":
        own = {
            "locked": (409, "locked", "This island has not unlocked the weapon."),
            "arsenal_full": (409, "arsenal_full", "The total arsenal inventory is full."),
            "stale_holder": (409, "stale_holder", "That copy changed hands. Refresh the arsenal."),
            "taken": (409, "taken", "Another Captain holds that copy."),
            "nothing_held": (409, "nothing_held", "You no longer hold that copy."),
            "no_such_copy": (404, "no_such_copy", "That copy is not in this island's arsenal."),
        }
        reason = value.get("reason")
        refusal = {**REFUSALS, **own}.get(reason) if isinstance(reason, str) else None
        if refusal is not None and set(value) == {"status", "reason"}:
            raise ApiError(*refusal)
        raise SupabaseRejected("The database sent an unreadable arsenal refusal.")
    try:
        row = Done.model_validate(value)
        receipt, effect = row.receipt, row.receipt.result
        if row.operationId != receipt.receiptId:
            raise ValueError("The domain receipt has a different operation identity.")
        is_buy = receipt.action == "arsenal_buy"
        if is_buy != (decimal_integer(effect.priceCoins) > 0):
            raise ValueError("An arsenal charge must match the purchase effect.")
        if is_buy != (effect.financialReceiptId is not None):
            raise ValueError("A financial child must identify the purchase debit.")
        if row.repeat:
            if row.currentEconomy is not None:
                raise ValueError("Historical replay cannot expose fresh island state.")
        else:
            account = read_envelope(row.currentEconomy)
            origin = receipt.origin
            if (account.account_id, account.run_epoch, account.island_owner) != (
                str(origin.accountId),
                str(origin.runEpoch),
                str(origin.islandOwner),
            ):
                raise ValueError("The fresh snapshot has a different origin.")
        return row.model_dump(mode="json")
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable shared arsenal result.") from error


async def mutate(
    admin: SupabaseAdmin,
    context: EconomyContext,
    action_uid: str,
    kind: str,
    *,
    weapon: str | None = None,
    copy_id: str | None = None,
    generation: int | None = None,
    catalogue: IslandCatalogue | None = None,
) -> dict:
    """One atomic RPC, including receipt-first replay after a catalogue or membership change."""
    if (
        context.mode != "island_shared"
        or type(context.version) is not int
        or context.version != 1
        or not context.account_id
        or not context.run_epoch
    ):
        raise ApiError(409, "economy_context_required", "Use the original shared island context.")
    if (
        not isinstance(kind, str)
        or kind not in ACTIONS
        or (
            kind != "buy"
            and (
                type(generation) is not int
                or generation < 0
                or copy_id is None
                or weapon is not None
            )
        )
        or (
            kind == "buy"
            and (
                not isinstance(weapon, str)
                or not weapon
                or copy_id is not None
                or generation is not None
            )
        )
    ):
        raise ApiError(422, "invalid_transaction", "The arsenal intent is not valid.")
    entry = (
        next((entry for entry in catalogue.weapons if entry.weapon == weapon), None)
        if catalogue
        else None
    )
    parameters = {
        "p_actor_id": identifier(context.actor_id),
        "p_island_owner": identifier(context.island_owner),
        "p_account_id": identifier(context.account_id),
        "p_run_epoch": identifier(context.run_epoch),
        "p_action_uid": root_action_uid(action_uid),
        "p_kind": kind,
        "p_weapon": weapon,
        "p_copy_id": identifier(copy_id) if copy_id else None,
        "p_expected_generation": decimal_string(generation) if generation is not None else None,
        "p_price": decimal_string(entry.coins) if entry else None,
        "p_unlock_wave": entry.unlock_wave if entry else None,
    }
    result = read_result(await admin.call_function("island_shared_arsenal_mutate", parameters))
    receipt, origin = result["receipt"], result["receipt"]["origin"]
    if (
        receipt["actorId"],
        receipt["actionUid"],
        receipt["action"],
        origin["islandOwner"],
        origin["accountId"],
        origin["runEpoch"],
    ) != (
        parameters["p_actor_id"],
        action_uid,
        ACTIONS[kind],
        parameters["p_island_owner"],
        parameters["p_account_id"],
        parameters["p_run_epoch"],
    ):
        raise SupabaseRejected("The arsenal result belongs to a different operation.")
    effect = receipt["result"]
    if not result["repeat"] and kind == "buy" and effect["priceCoins"] != parameters["p_price"]:
        raise SupabaseRejected("The arsenal result changed the authoritative purchase price.")
    if (kind == "buy" and effect["weapon"] != weapon) or (
        kind != "buy"
        and (
            effect["copyId"] != parameters["p_copy_id"]
            or decimal_integer(effect["holderGeneration"]) != generation + 1
        )
    ):
        raise SupabaseRejected("The arsenal result changed the requested copy effect.")
    return result
