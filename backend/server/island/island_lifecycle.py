"""Checked reset receipts for future complete island lifecycle transactions.

This module parses historical effects and separately scoped current funds. It exposes
no reset RPC, grant authority, account creation or asset/session cleanup operation.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    ValidationError,
    model_validator,
)

from server.island.treasury import EconomyContext
from server.island.treasury_models import decimal_integer
from server.island.treasury_store import EnvelopeRow, MoneyRow, Unsigned, account_from_row
from server.supabase_admin import SupabaseRejected


class StrictRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Origin(StrictRow):
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class RetiredTreasury(MoneyRow):
    model_config = ConfigDict(extra="forbid", frozen=True)
    revision: Unsigned

    @model_validator(mode="after")
    def conserve(self) -> Self:
        balance = decimal_integer(self.balanceCoins)
        committed = decimal_integer(self.committedCoins)
        if balance - committed != decimal_integer(self.availableCoins):
            raise ValueError("Retired cash and principal do not reconcile.")
        return self


class ResetEffect(StrictRow):
    newAccountId: UUID
    newRunEpoch: UUID
    retiredTreasury: RetiredTreasury
    startingCoins: Unsigned
    grantReceiptId: UUID
    grantPolicyVersion: Annotated[str, Field(strict=True, min_length=1, max_length=80)]
    effects: dict[str, Annotated[StrictInt, Field(ge=0)]]


class ResetReceipt(StrictRow):
    receiptId: UUID
    actorId: UUID
    actionUid: Annotated[str, Field(strict=True, pattern=r"^[A-Za-z0-9_-]{8,64}$")]
    action: Literal["reset"]
    origin: Origin
    result: ResetEffect

    @model_validator(mode="after")
    def distinct_run(self) -> Self:
        if (
            self.actorId != self.origin.islandOwner
            or self.result.newAccountId == self.origin.accountId
            or self.result.newRunEpoch == self.origin.runEpoch
        ):
            raise ValueError("A reset must replace its owner's original account and epoch.")
        return self


class ResetResult(StrictRow):
    status: Literal["done"]
    repeat: StrictBool
    currentEconomy: EnvelopeRow | None
    receipt: ResetReceipt


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable island reset receipt.")


def read_result(value: object, context: EconomyContext, action_uid: str) -> dict:
    """Validate original owner/run identity without interpreting old cash as new funds."""
    try:
        row = ResetResult.model_validate(value)
        receipt, origin, effect = row.receipt, row.receipt.origin, row.receipt.result
        if (
            context.mode != "island_shared"
            or context.version != 1
            or (str(origin.islandOwner), str(origin.accountId), str(origin.runEpoch))
            != (context.island_owner, context.account_id, context.run_epoch)
            or str(receipt.actorId) != context.actor_id
            or receipt.actionUid != action_uid
        ):
            raise ValueError("The receipt belongs to another actor or originating run.")
        if row.currentEconomy is None:
            if not row.repeat:
                raise ValueError("A new reset requires its replacement projection.")
        else:
            current = account_from_row(row.currentEconomy)
            if (current.island_owner, current.account_id, current.run_epoch) != (
                str(origin.islandOwner),
                str(effect.newAccountId),
                str(effect.newRunEpoch),
            ):
                raise ValueError("The current projection belongs to another replacement.")
            if not row.repeat and (
                current.balance_coins != decimal_integer(effect.startingCoins)
                or current.committed_coins != 0
                or current.revision != 1
            ):
                raise ValueError("A new run must contain only its once-only starting grant.")
        return row.model_dump(mode="json")
    except (ValidationError, ValueError) as error:
        raise unreadable() from error
