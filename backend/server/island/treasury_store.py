"""Strict database replies for island treasury primitives; never fall back on failure.

Used by treasury.py. All amounts/revisions crossing JSON are exact decimal strings.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StrictBool, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.island.treasury_models import (
    TreasuryAccount,
    TreasuryReceipt,
    TreasuryResult,
    decimal_integer,
)
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

Unsigned = Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
Signed = Annotated[StrictStr, Field(pattern=r"^(0|-?[1-9][0-9]*)$")]


class MoneyRow(BaseModel):
    balanceCoins: Unsigned
    committedCoins: Unsigned
    availableCoins: Unsigned


class EnvelopeRow(BaseModel):
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID
    revision: Unsigned
    treasury: MoneyRow


class ReceiptRow(BaseModel):
    id: UUID
    accountId: UUID
    runEpoch: UUID
    actorId: UUID
    actionUid: Annotated[StrictStr, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")]
    kind: Literal["credit", "spend", "reserve", "settle"]
    reason: StrictStr
    reference: StrictStr
    balanceDelta: Signed
    committedDelta: Signed
    balanceAtCommit: Unsigned
    committedAtCommit: Unsigned
    revisionAtCommit: Unsigned
    sourceReservationId: UUID | None


class DoneRow(BaseModel):
    status: Literal["done"]
    repeat: StrictBool
    currentEconomy: EnvelopeRow
    accountState: Literal["active", "retired"]
    admissionState: Literal["active", "paused"] | None
    receipt: ReceiptRow


REFUSALS = {
    "invalid_change": (422, "invalid_transaction", "The treasury change is not valid."),
    "not_member": (403, "not_member", "Join this game before spending its coins."),
    "not_owner": (403, "not_owner", "Only the island owner may admit its economy."),
    "account_missing": (409, "economy_context_required", "Reload this island's treasury."),
    "epoch_mismatch": (409, "economy_epoch_mismatch", "This island has started another run."),
    "path_unavailable": (409, "economy_path_unavailable", "This treasury action is unavailable."),
    "action_conflict": (409, "idempotency_conflict", "This action already has other inputs."),
    "already_admitted": (409, "economy_already_admitted", "This island already has a treasury."),
    "wave_running": (409, "wave_running", "Wait until this island's wave ends."),
    "insufficient_funds": (409, "insufficient_funds", "The island has too few available coins."),
    "reservation_missing": (409, "economy_reservation_missing", "This held stake was not found."),
    "reservation_settled": (409, "economy_reservation_settled", "This stake was already settled."),
}


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an unreadable island treasury answer.")


def check_status(value: object) -> dict:
    if not isinstance(value, dict):
        raise unreadable()
    if value.get("status") == "missing_island":
        raise ApiError(404, "no_such_island", "That island does not exist.")
    if value.get("status") == "refused":
        refusal = REFUSALS.get(value.get("reason"))
        if refusal is None:
            raise unreadable()
        raise ApiError(*refusal)
    return value


def account_from_row(
    row: EnvelopeRow,
    state: Literal["active", "retired"] = "active",
    admission: Literal["active", "paused"] | None = "active",
) -> TreasuryAccount:
    money = row.treasury
    try:
        account = TreasuryAccount(
            str(row.accountId),
            str(row.islandOwner),
            str(row.runEpoch),
            decimal_integer(money.balanceCoins),
            decimal_integer(money.committedCoins),
            decimal_integer(row.revision),
            state,
            admission,
        )
        if account.available_coins < 0 or account.available_coins != decimal_integer(
            money.availableCoins
        ):
            raise unreadable()
        return account
    except ValueError as error:
        raise unreadable() from error


def read_envelope(value: object) -> TreasuryAccount:
    try:
        return account_from_row(EnvelopeRow.model_validate(value))
    except ValidationError as error:
        raise unreadable() from error


def read_result(value: object) -> TreasuryResult:
    value = check_status(value)
    try:
        row = DoneRow.model_validate(value)
        account = account_from_row(row.currentEconomy, row.accountState, row.admissionState)
        source = row.receipt
        receipt = TreasuryReceipt(
            str(source.id),
            str(source.accountId),
            str(source.runEpoch),
            str(source.actorId),
            source.actionUid,
            source.kind,
            source.reason,
            source.reference,
            decimal_integer(source.balanceDelta),
            decimal_integer(source.committedDelta),
            decimal_integer(source.balanceAtCommit),
            decimal_integer(source.committedAtCommit),
            decimal_integer(source.revisionAtCommit),
            str(source.sourceReservationId) if source.sourceReservationId else None,
        )
        if (receipt.account_id, receipt.run_epoch) != (account.account_id, account.run_epoch):
            raise unreadable()
        if receipt.balance_at_commit < receipt.committed_at_commit:
            raise unreadable()
        if receipt.revision_at_commit < 1 or receipt.revision_at_commit > account.revision:
            raise unreadable()
        if not valid_effect(receipt):
            raise unreadable()
        return TreasuryResult(receipt, account, row.repeat)
    except (ValidationError, ValueError) as error:
        raise unreadable() from error


def valid_effect(receipt: TreasuryReceipt) -> bool:
    cash, held, source = (
        receipt.balance_delta,
        receipt.committed_delta,
        receipt.source_reservation_id,
    )
    if receipt.kind == "credit":
        return cash >= 0 and held == 0 and source is None
    if receipt.kind == "spend":
        return cash < 0 and held == 0 and source is None
    if receipt.kind == "reserve":
        return cash <= 0 and held > 0 and source is None
    return held < 0 and source is not None and cash - held >= 0


async def call(admin: SupabaseAdmin, name: str, parameters: dict) -> TreasuryResult:
    return read_result(await admin.call_function(name, parameters))
