"""The strict HTTP body for paid structure Repair now.

Used by: the paid structure-repair route and focused request-validation tests.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    StringConstraints,
    model_validator,
)

from server.island.codes import MAX_TYPED_LENGTH
from server.wallet import MAX_DELTA

ActionUid = Annotated[
    StrictStr, StringConstraints(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
]
SpotId = Annotated[
    StrictStr, StringConstraints(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_]+$")
]


class RepairRequest(BaseModel):
    """A caller's quote and identity guards; it carries no price or HP authority."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    code: StrictStr | None = Field(default=None, max_length=MAX_TYPED_LENGTH)
    spot: SpotId
    instance_id: UUID = Field(alias="instanceId")
    action_uid: ActionUid = Field(alias="actionUid")
    expected_epoch: UUID = Field(alias="expectedEpoch")
    expected_window: Literal["between_waves", "reserved_wave"] = Field(alias="expectedWindow")
    expected_wave_id: UUID | None = Field(default=None, alias="expectedWaveId")
    expected_level: StrictInt = Field(alias="expectedLevel", ge=1, le=5)
    expected_repair_seq: StrictInt = Field(
        alias="expectedRepairSeq", ge=0, le=9_223_372_036_854_775_807
    )
    quoted_price: StrictInt = Field(alias="quotedPrice", ge=1, le=MAX_DELTA)
    wave_protocol: Literal[2] = Field(alias="waveProtocol")

    @model_validator(mode="after")
    def check_wave_guard(self) -> "RepairRequest":
        """Bind a reserved-window quote to its UUID and keep between-wave requests unbound."""
        has_wave = self.expected_wave_id is not None
        if has_wave != (self.expected_window == "reserved_wave"):
            raise ValueError("expectedWaveId must be present only for a reserved_wave quote.")
        return self


class RepairReceipt(BaseModel):
    """Immutable facts of one successful charge, separate from current state and wallet."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    action_uid: ActionUid = Field(alias="actionUid")
    spot: SpotId
    instance_id: UUID = Field(alias="instanceId")
    kind: Literal["wall", "cannon", "mortar", "harpoon", "culverin", "swivel"]
    level: StrictInt = Field(ge=1, le=5)
    charged_price: StrictInt = Field(alias="chargedPrice", ge=1, le=MAX_DELTA)
    balance_at_commit: StrictInt = Field(alias="balanceAtCommit", ge=0)
    wave_id: UUID | None = Field(alias="waveId")
    use_ordinal: StrictInt | None = Field(alias="useOrdinal", ge=1, le=3)
    event_seq: StrictInt | None = Field(alias="eventSeq", ge=1, le=9_223_372_036_854_775_807)
    repair_seq: StrictInt = Field(alias="repairSeq", ge=1, le=9_223_372_036_854_775_807)

    @model_validator(mode="after")
    def check_quota_receipt(self) -> "RepairReceipt":
        """A wave UUID, shared quota ordinal and event sequence are an all-or-none set."""
        values = (self.wave_id, self.use_ordinal, self.event_seq)
        if any(value is None for value in values) and any(value is not None for value in values):
            raise ValueError("Wave quota receipt fields must be present together.")
        return self


class RepairResponse(BaseModel):
    """One retry-safe receipt plus separately current caller balance and canonical state."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    receipt: RepairReceipt
    current_state: dict[str, object] = Field(alias="currentState")
    coins: StrictInt = Field(ge=0)
