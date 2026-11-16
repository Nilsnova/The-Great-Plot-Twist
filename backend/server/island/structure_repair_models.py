"""The strict HTTP body for paid structure Repair now.

Used by: the future structure-repair route and focused request-validation tests.
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

ActionUid = Annotated[
    StrictStr, StringConstraints(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
]
SpotId = Annotated[
    StrictStr, StringConstraints(min_length=2, max_length=40, pattern=r"^[a-z][a-z0-9_]+$")
]


class RepairRequest(BaseModel):
    """A caller's quote and identity guards; it carries no price or HP authority."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    code: StrictStr | None = Field(default=None, max_length=32)
    spot: SpotId
    instance_id: UUID = Field(alias="instanceId")
    action_uid: ActionUid = Field(alias="actionUid")
    expected_epoch: UUID = Field(alias="expectedEpoch")
    expected_window: Literal["between_waves", "reserved_wave"] = Field(alias="expectedWindow")
    expected_wave_id: UUID | None = Field(default=None, alias="expectedWaveId")
    expected_level: StrictInt = Field(alias="expectedLevel", ge=1, le=5)
    expected_repair_seq: StrictInt = Field(alias="expectedRepairSeq", ge=0)
    quoted_price: StrictInt = Field(alias="quotedPrice", ge=1)
    wave_protocol: Literal[2] = Field(alias="waveProtocol")

    @model_validator(mode="after")
    def check_wave_guard(self) -> "RepairRequest":
        """Bind a reserved-window quote to its UUID and keep between-wave requests unbound."""
        has_wave = self.expected_wave_id is not None
        if has_wave != (self.expected_window == "reserved_wave"):
            raise ValueError("expectedWaveId must be present only for a reserved_wave quote.")
        return self
