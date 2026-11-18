"""Authenticated canonical session metadata and generation-fenced controller actions.

GET /island/session is read-only. Attach, heartbeat, disconnect, leave and settings
use the actual session RPCs; they never select a legacy writer. Historical attach
metadata is followed by a fresh read before clients apply controller authority.
The application owner registers this router with the existing /api prefix.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from server.island import shared_lifecycle, shared_session_api
from server.island.economy_http import require_economy_capability
from server.island.service import IslandCatalogueDep
from server.island.shared_session_models import (
    Positive,
    SessionAttach,
    SessionLeave,
    SessionSettings,
)
from server.island.shared_wave_http import SharedWaveProof
from server.routes.island import IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


async def gate(request: Request, admin: AdminDep, actor: str, *, read: bool = False) -> None:
    require_economy_capability(request)
    budget = (
        request.app.state.island_visit_budget if read else request.app.state.island_build_budget
    )
    budget.spend(actor)
    await shared_lifecycle.ensure_not_deleted(admin, actor)


@router.get("/island/session")
async def read_session(
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
    island_owner: Annotated[UUID, Query(alias="islandOwner")],
    run_epoch: Annotated[UUID, Query(alias="runEpoch")],
    session_id: Annotated[UUID | None, Query(alias="sessionId")] = None,
    connection_generation: Annotated[Positive | None, Query(alias="connectionGeneration")] = None,
) -> dict:
    await gate(request, admin, player.id, read=True)
    return await shared_session_api.read_session(
        admin,
        player.id,
        str(island_owner),
        str(run_epoch),
        session_id=str(session_id) if session_id is not None else None,
        connection_generation=connection_generation,
    )


@router.post("/island/session/attach")
async def attach_session(
    body: SessionAttach,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
    catalogue: IslandCatalogueDep,
) -> dict:
    await gate(request, admin, player.id)
    return await shared_session_api.session_call(admin, player.id, "attach", body, catalogue)


@router.post("/island/session/heartbeat")
async def heartbeat_session(
    body: SharedWaveProof, player: IslandPlayerDep, admin: AdminDep, request: Request
) -> dict:
    await gate(request, admin, player.id)
    return await shared_session_api.session_call(admin, player.id, "heartbeat", body)


@router.post("/island/session/disconnect")
async def disconnect_session(
    body: SharedWaveProof, player: IslandPlayerDep, admin: AdminDep, request: Request
) -> dict:
    await gate(request, admin, player.id)
    return await shared_session_api.session_call(admin, player.id, "disconnect", body)


@router.post("/island/session/leave")
async def leave_session(
    body: SessionLeave, player: IslandPlayerDep, admin: AdminDep, request: Request
) -> dict:
    await gate(request, admin, player.id)
    return await shared_session_api.session_call(admin, player.id, "leave", body)


@router.post("/island/session/settings")
async def change_settings(
    body: SessionSettings, player: IslandPlayerDep, admin: AdminDep, request: Request
) -> dict:
    await gate(request, admin, player.id)
    return await shared_session_api.session_call(admin, player.id, "settings", body)
