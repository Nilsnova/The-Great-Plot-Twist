"""Strict shared ship-round/receipt DTO readers; no malformed-response fallback.

Used by shared_boat.py. Exact numeric strings use the common treasury parser, and replay
receipts carry no fresh account projection when current membership is no longer established.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError

from server.errors import ApiError
from server.island.boat import BOAT, coins_for
from server.island.treasury_models import TreasuryAccount, decimal_integer
from server.island.treasury_store import Unsigned, check_status, read_envelope, unreadable


class OriginRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class BoatRoundRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    actorId: UUID
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID
    game: Literal["broadside", "dash"]
    recordWave: StrictInt = Field(ge=30)
    maximumCoins: Unsigned


class StartResultRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round: BoatRoundRow


class StartReceiptRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    receiptId: UUID
    actionUid: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    action: Literal["boat:start"]
    actorId: UUID
    origin: OriginRow
    result: StartResultRow


class StartRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["started"]
    repeat: StrictBool
    receipt: StartReceiptRow


class BoatResultRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    roundId: UUID
    game: Literal["broadside", "dash"]
    recordWave: StrictInt = Field(ge=30)
    stars: StrictInt = Field(ge=0, le=3)
    coins: Unsigned
    cumulativeCoins: Unsigned
    maximumCoins: Unsigned
    treasuryReceiptId: UUID | None


class BoatReceiptRow(BaseModel):
    """The common #493 immutable domain receipt header and route-specific result."""

    model_config = ConfigDict(extra="forbid")

    receiptId: UUID
    actionUid: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    action: Literal["boat:claim"]
    actorId: UUID
    origin: OriginRow
    result: BoatResultRow


class ClaimRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["done"]
    repeat: StrictBool
    receipt: BoatReceiptRow
    currentEconomy: dict | None


DOMAIN_REFUSALS = {
    "locked": (409, "locked", "The island ship opens after wave 30."),
    "not_repaired": (409, "not_repaired", "Finish repairing the island wreck first."),
    "round_missing": (404, "no_such_round", "That boat round does not exist."),
    "round_completed": (409, "round_completed", "This boat round already has a result."),
    "not_round_actor": (403, "not_round_actor", "This boat round belongs to another player."),
}


def checked_reply(value: object) -> dict:
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if not isinstance(reason, str):
            raise unreadable()
        refusal = DOMAIN_REFUSALS.get(reason)
        if refusal is not None:
            raise ApiError(*refusal)
    return check_status(value)


def read_start(value: object) -> StartRow:
    value = checked_reply(value)
    try:
        row = StartRow.model_validate(value)
        source = row.receipt.result.round
        origin = row.receipt.origin
        maximum = decimal_integer(source.maximumCoins)
        if maximum != coins_for(BOAT.stars, source.recordWave):
            raise unreadable()
        if (source.actorId, source.islandOwner, source.accountId, source.runEpoch) != (
            row.receipt.actorId,
            origin.islandOwner,
            origin.accountId,
            origin.runEpoch,
        ):
            raise unreadable()
        return row
    except (ValidationError, ValueError) as error:
        raise unreadable() from error


def read_claim(value: object) -> tuple[ClaimRow, TreasuryAccount | None]:
    value = checked_reply(value)
    try:
        row = ClaimRow.model_validate(value)
        result = row.receipt.result
        origin = row.receipt.origin
        coins = decimal_integer(result.coins)
        cumulative = decimal_integer(result.cumulativeCoins)
        maximum = decimal_integer(result.maximumCoins)
        if (
            not 0 <= coins <= cumulative <= maximum
            or maximum != coins_for(BOAT.stars, result.recordWave)
            or coins > coins_for(result.stars, result.recordWave)
        ):
            raise unreadable()
        if (coins == 0) != (result.treasuryReceiptId is None):
            raise unreadable()
        if row.repeat and row.currentEconomy is not None:
            raise unreadable()
        account = None if row.currentEconomy is None else read_envelope(row.currentEconomy)
        if (not row.repeat and account is None) or (
            account is not None
            and (
                account.account_id != str(origin.accountId)
                or account.run_epoch != str(origin.runEpoch)
                or account.island_owner != str(origin.islandOwner)
            )
        ):
            raise unreadable()
        return row, account
    except (ValidationError, ValueError) as error:
        raise unreadable() from error
