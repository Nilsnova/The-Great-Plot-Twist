"""Strict shared repair request and common domain receipt; used by the gated repair adapter."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from server.island.structure_repair_models import ActionUid, SpotId
from server.island.treasury_store import EnvelopeRow, ReceiptRow
from server.wallet import MAX_DELTA

DecimalCoins = Annotated[StrictStr, Field(pattern=r"^[1-9][0-9]*$")]


class RepairEconomyIntent(BaseModel):
    """Only the published client context; the server resolves the paying account."""

    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class SharedRepairRequest(BaseModel):
    """A shared intent targets only its common origin, never a mutable navigation code."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    spot: SpotId
    instance_id: UUID = Field(alias="instanceId")
    action_uid: ActionUid = Field(alias="actionUid")
    expected_epoch: UUID = Field(alias="expectedEpoch")
    economy: RepairEconomyIntent
    expected_window: Literal["reserved_wave"] = Field(alias="expectedWindow")
    expected_wave_id: UUID = Field(alias="expectedWaveId")
    expected_level: StrictInt = Field(alias="expectedLevel", ge=1, le=5)
    expected_repair_seq: StrictInt = Field(
        alias="expectedRepairSeq", ge=0, le=9_223_372_036_854_775_807
    )
    quoted_price: StrictInt = Field(alias="quotedPrice", ge=1, le=MAX_DELTA)
    wave_protocol: Literal[2] = Field(alias="waveProtocol")


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
