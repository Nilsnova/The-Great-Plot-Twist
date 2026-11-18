"""Strict shared repair request and common domain receipt; used by the gated repair adapter."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from server.island.structure_repair_models import RepairRequest
from server.island.treasury_store import EnvelopeRow, ReceiptRow

DecimalCoins = Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


class RepairEconomyIntent(BaseModel):
    """Only the published client context; the server resolves the paying account."""

    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class SharedRepairRequest(RepairRequest):
    """A shared request always belongs to an accepted reservation, including countdown."""

    economy: RepairEconomyIntent
    expected_window: Literal["reserved_wave"] = Field(alias="expectedWindow")
    expected_wave_id: UUID = Field(alias="expectedWaveId")


class RepairOrigin(RepairEconomyIntent):
    """The immutable server-resolved account inside the common domain receipt."""

    accountId: UUID


class RepairFacts(BaseModel):
    """Domain facts and the original nested treasury receipt, never a mutable balance."""

    model_config = ConfigDict(extra="forbid")
    recoveryEpoch: UUID
    spot: StrictStr
    instanceId: UUID
    kind: Literal["wall", "cannon", "mortar", "harpoon", "culverin", "swivel"]
    level: StrictInt = Field(ge=1, le=5)
    chargedPrice: DecimalCoins
    waveId: UUID
    useOrdinal: StrictInt = Field(ge=1, le=3)
    eventSeq: StrictInt = Field(ge=1)
    repairSeq: StrictInt = Field(ge=1)
    financialReceipt: ReceiptRow


class SharedRepairReceipt(BaseModel):
    """The published receipt header, with repair-specific facts in result."""

    model_config = ConfigDict(extra="forbid")
    receiptId: UUID
    actionUid: StrictStr
    action: Literal["structure_repair"]
    actorId: UUID
    origin: RepairOrigin
    result: RepairFacts


class SharedRepairReply(BaseModel):
    """Receipt plus a separately authorized fresh treasury view only for a new mutation."""

    model_config = ConfigDict(extra="forbid")
    status: Literal["done"]
    repeat: bool = Field(strict=True)
    receipt: SharedRepairReceipt
    currentEconomy: EnvelopeRow | None = None
