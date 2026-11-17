"""Protocol-2 input journal and health checkpoint endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.errors import ApiError
from server.island import wave_recovery
from server.routes.island import IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()
WaveId = Annotated[UUID, Path()]


class InputBatchOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: list[wave_recovery.RecoveryEvent]
    head_seq: int = Field(alias="headSeq", ge=0)


class HealthOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    accepted: bool
    repeated: bool = False
    through_tick: int = Field(alias="throughTick", ge=0)
    input_head_seq: int = Field(alias="inputHeadSeq", ge=0)
    last_repair_seq: int = Field(alias="lastRepairSeq", ge=0)
    hp_units: dict[UUID, int] = Field(alias="hpUnits")


@router.post("/waves/{wave_id}/inputs", response_model=InputBatchOut)
async def post_inputs(
    wave_id: WaveId,
    body: wave_recovery.RecoveryInputBatch,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> InputBatchOut:
    if body.waveProtocol != 2:
        raise ApiError(409, "client_update_required", "Reload to join this recovery wave.")
    request.app.state.recovery_write_budget.spend(player.id)
    result = await wave_recovery.append_inputs(admin, player.id, wave_id, body.inputs)
    return InputBatchOut.model_validate(result.model_dump(by_alias=True))


@router.get(
    "/waves/{wave_id}/events",
    response_model=wave_recovery.RecoveryEventPage,
    response_model_exclude_none=True,
)
async def get_events(
    wave_id: WaveId,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
    after: Annotated[int, Query(ge=0)] = 0,
    through: Annotated[int | None, Query(ge=0)] = None,
) -> wave_recovery.RecoveryEventPage:
    request.app.state.recovery_read_budget.spend(player.id)
    return await wave_recovery.read_events(admin, player.id, wave_id, after, through)


@router.post("/waves/{wave_id}/health", response_model=HealthOut)
async def post_health(
    wave_id: WaveId,
    body: wave_recovery.RecoveryHealthRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> HealthOut:
    if body.waveProtocol != 2:
        raise ApiError(409, "client_update_required", "Reload to join this recovery wave.")
    request.app.state.recovery_write_budget.spend(player.id)
    result = await wave_recovery.report_health(admin, player.id, wave_id, body)
    return HealthOut.model_validate(result.model_dump(by_alias=True))
