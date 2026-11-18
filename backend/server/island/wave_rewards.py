"""Recover only saved, unpaid protocol-2 results. Used by the return/reconnect route."""

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

from server.island.wave_recovery import call_lifecycle_rpc
from server.supabase_admin import SupabaseAdmin, SupabaseRejected
from server.wallet import MAX_DELTA

MAX_RECOVERED_WAVES = 20


class RecoveredWave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveId: UUID
    wave: StrictInt = Field(ge=1, le=1000)
    survived: StrictBool
    loot: StrictInt = Field(ge=0, le=MAX_DELTA)

    @model_validator(mode="after")
    def lost_waves_have_no_loot(self) -> "RecoveredWave":
        if not self.survived and self.loot != 0:
            raise ValueError("A lost wave cannot pay victory loot.")
        return self


class RewardRecoveryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coins: StrictInt = Field(ge=0)
    wonWaveBest: StrictInt = Field(ge=0, le=1000)
    recovered: list[RecoveredWave] = Field(max_length=MAX_RECOVERED_WAVES)
    hasMore: StrictBool

    @model_validator(mode="after")
    def wave_receipts_are_unique(self) -> "RewardRecoveryResponse":
        if len({row.waveId for row in self.recovered}) != len(self.recovered):
            raise ValueError("A recovered wave must appear only once.")
        if self.hasMore and not self.recovered:
            raise ValueError("A continued batch must make settlement progress.")
        return self


async def recover_rewards(admin: SupabaseAdmin, player_id: str) -> RewardRecoveryResponse:
    """The database owns eligibility, amounts and settlement; no current island is needed."""
    reply = await call_lifecycle_rpc(
        admin, "recovery_wave_recover_rewards", {"p_player_id": player_id}, statuses={"done"}
    )
    try:
        return RewardRecoveryResponse.model_validate(
            {name: reply.get(name) for name in RewardRecoveryResponse.model_fields}
        )
    except ValidationError as error:
        raise SupabaseRejected("The saved wave rewards could not be read.") from error
