"""Protocol-2 input journal and health checkpoint endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.errors import ApiError
from server.flags import is_enabled
from server.island import shared_lifecycle, wave_recovery
from server.island.shared_wave_http import SharedWaveProof, require_shared_wave_client
from server.routes.island import IslandPlayerDep
from server.settings import SettingsDep
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


class SharedInputBatch(SharedWaveProof, wave_recovery.RecoveryInputBatch):
    """Only a current controller may append native combat inputs."""


class SharedHealthRequest(SharedWaveProof, wave_recovery.RecoveryHealthRequest):
    """Structure checkpoint identity accompanies the current controller proof."""


@router.post("/waves/{wave_id}/inputs", response_model=InputBatchOut)
async def post_inputs(
    wave_id: WaveId,
    body: SharedInputBatch | wave_recovery.RecoveryInputBatch,
    player: IslandPlayerDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> InputBatchOut:
    if body.waveProtocol != 2:
        raise ApiError(409, "client_update_required", "Reload to join this recovery wave.")
    request.app.state.recovery_write_budget.spend(player.id)
    if isinstance(body, SharedInputBatch):
        require_shared_wave_client(request, body.waveProtocol)
    await shared_lifecycle.ensure_not_deleted(admin, player.id)
    if isinstance(body, SharedInputBatch):
        from server.island import shared_session_api

        result = await shared_session_api.append_inputs(
            admin, player.id, wave_id, str(body.economy.islandOwner),
            str(body.economy.runEpoch), str(body.sessionId), body.connectionGeneration,
            body.inputs,
        )
        return InputBatchOut.model_validate(result.model_dump(by_alias=True))
    result = await wave_recovery.append_inputs(
        admin, player.id, wave_id, body.inputs, arsenal=is_enabled("arsenal", settings.flags)
    )
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
    sealed_through_tick: Annotated[int | None, Query(alias="sealedThroughTick", ge=-1)] = None,
    island_owner: Annotated[UUID | None, Query(alias="islandOwner")] = None,
    run_epoch: Annotated[UUID | None, Query(alias="runEpoch")] = None,
    session_id: Annotated[UUID | None, Query(alias="sessionId")] = None,
    connection_generation: Annotated[
        str | None, Query(alias="connectionGeneration", pattern=r"^[1-9][0-9]*$")
    ] = None,
) -> wave_recovery.RecoveryEventPage:
    if (through is None) != (sealed_through_tick is None):
        raise ApiError(
            422,
            "validation_error",
            "through and sealedThroughTick must be provided together for a fixed event page.",
        )
    if (island_owner is None) != (run_epoch is None) or (
        (session_id is None) != (connection_generation is None)
    ) or (session_id is not None and island_owner is None):
        raise ApiError(422, "validation_error", "Provide a complete shared journal origin.")
    request.app.state.recovery_read_budget.spend(player.id)
    if island_owner is not None:
        require_shared_wave_client(request, 2)
    await shared_lifecycle.ensure_not_deleted(admin, player.id)
    if island_owner is not None:
        from server.island import shared_session_api

        result = await shared_session_api.read_events(
            admin, player.id, wave_id, str(island_owner), str(run_epoch),
            str(session_id) if session_id is not None else None, connection_generation,
            after=after, through=through, sealed_through_tick=sealed_through_tick,
        )
        return wave_recovery.RecoveryEventPage.model_validate(result)
    return await wave_recovery.read_events(
        admin, player.id, wave_id, after, through, sealed_through_tick
    )


@router.post("/waves/{wave_id}/health", response_model=HealthOut)
async def post_health(
    wave_id: WaveId,
    body: SharedHealthRequest | wave_recovery.RecoveryHealthRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> HealthOut:
    if body.waveProtocol != 2:
        raise ApiError(409, "client_update_required", "Reload to join this recovery wave.")
    request.app.state.recovery_write_budget.spend(player.id)
    if isinstance(body, SharedHealthRequest):
        require_shared_wave_client(request, body.waveProtocol)
    await shared_lifecycle.ensure_not_deleted(admin, player.id)
    if isinstance(body, SharedHealthRequest):
        from server.island import shared_session_api

        result = await shared_session_api.report_health(
            admin, player.id, wave_id, str(body.economy.islandOwner),
            str(body.economy.runEpoch), str(body.sessionId), body.connectionGeneration,
            body.model_dump(mode="json", exclude={
                "economy", "sessionId", "connectionGeneration",
            }),
        )
        return HealthOut.model_validate(result.model_dump(by_alias=True))
    result = await wave_recovery.report_health(admin, player.id, wave_id, body)
    return HealthOut.model_validate(result.model_dump(by_alias=True))
