"""Read the server's normalized current structure health and repair quote context."""

from typing import Annotated

from fastapi import APIRouter, Query

from server.island import structure_recovery
from server.island.service import IslandCatalogueDep
from server.routes.island import CODE_MAX_LENGTH, IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


@router.get("/island/structures", response_model=structure_recovery.StructureRecoveryView)
async def get_structures(
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> structure_recovery.StructureRecoveryView:
    """Return shared v1 state for the caller's island or a member island named by code."""
    island = await structure_recovery.resolve_target_island(admin, catalogue, player.id, code)
    return await structure_recovery.read_state(admin, catalogue, island.owner)
