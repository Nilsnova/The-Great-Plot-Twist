"""Strict free-revival intent and immutable common receipt; never combat proof from a client."""

from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, model_validator

from server.island.economy_http_models import ActionUid, SharedEconomy
from server.island.treasury_store import Unsigned


class SharedRevivalRequest(BaseModel):
    """Current fall identity and refreshable controller/hold fences, with no claimed state."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    economy: SharedEconomy
    actionUid: ActionUid
    waveId: UUID
    targetToken: UUID
    fallId: UUID
    holdId: UUID
    sessionId: UUID
    connectionGeneration: Unsigned


class RevivalOrigin(SharedEconomy):
    accountId: UUID


class RevivalResult(BaseModel):
    """Original journal effect facts; restored HP is not a current Captain projection."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    waveId: UUID
    targetToken: UUID
    fallId: UUID
    holdId: UUID
    downAtTick: StrictInt = Field(ge=0, le=18_000)
    eventSeq: StrictInt = Field(ge=1)
    reviveSeq: StrictInt = Field(ge=1)
    restoredHPUnits: StrictInt = Field(ge=1, le=1_000_000)

    @model_validator(mode="after")
    def event_is_revive_basis(self) -> Self:
        if self.eventSeq != self.reviveSeq:
            raise ValueError("Revival basis must be its committed journal event.")
        return self


class RevivalReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    receiptId: UUID
    actionUid: ActionUid
    action: Literal["wave_revive"]
    actorId: UUID
    origin: RevivalOrigin
    result: RevivalResult


class SharedRevivalReply(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    status: Literal["done"]
    repeat: StrictBool
    receipt: RevivalReceipt
