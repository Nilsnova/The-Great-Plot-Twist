"""Strict facts returned by the single shared snapshot transaction.

Used by shared_snapshot; malformed or missing state never becomes a legacy fallback.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    model_validator,
)

from server.island.economy_progression_models import BuildingState, ResearchOutcome
from server.island.personal_captain import ProfileRow
from server.island.shared_crew import Counts
from server.island.treasury_store import EnvelopeRow, Unsigned


class StrictFacts(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class BuildingFacts(BuildingState):
    spot: StrictStr
    refundCoins: Unsigned | None
    refundReason: Literal["construction_basis_missing"] | None
    hpUnits: StrictInt | None = Field(ge=0, le=1000000)
    maxHP: Annotated[float, Field(strict=True, allow_inf_nan=False, gt=0)] | None

    @model_validator(mode="after")
    def valid_basis(self) -> Self:
        if (self.refundCoins is None) != (self.refundReason is not None):
            raise ValueError("Inconsistent refund basis.")
        return self


class LayoutFacts(StrictFacts):
    plot: StrictStr
    xHalf: StrictInt = Field(ge=-60, le=60)
    zHalf: StrictInt = Field(ge=-60, le=60)


class SnapshotFacts(StrictFacts):
    status: Literal["ok"]
    actorId: UUID
    owner: UUID
    code: StrictStr
    ownerName: StrictStr
    economy: EnvelopeRow
    admissionState: Literal["active", "paused"]
    waveBest: StrictInt = Field(ge=0)
    nextWave: StrictInt | None = Field(ge=1)
    flags: StrictInt = Field(ge=0)
    crew: Counts
    personal: ProfileRow | None
    buildings: list[BuildingFacts] = Field(max_length=50)
    research: list[ResearchOutcome] = Field(max_length=10)
    layout: list[LayoutFacts] = Field(max_length=50)
    wreckPaid: StrictInt = Field(ge=0)
    recoveryVersion: StrictInt = Field(ge=0, le=1)
    waveProtocol: StrictInt = Field(ge=1, le=2)
    serverNow: AwareDatetime
    reserved: StrictBool

    @model_validator(mode="after")
    def unique_and_scoped(self) -> Self:
        if self.economy.islandOwner != self.owner or self.waveProtocol != self.recoveryVersion + 1:
            raise ValueError("Inconsistent snapshot scope or policy.")
        for rows, field in (
            (self.buildings, "spot"),
            (self.research, "branch"),
            (self.layout, "plot"),
        ):
            if len({getattr(row, field) for row in rows}) != len(rows):
                raise ValueError("Duplicate snapshot row.")
        return self
