"""Read the server's normalized current structure health and repair quote context."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from server.island import shared_repair_runtime, structure_recovery
from server.island.service import IslandCatalogueDep
from server.island.treasury import resolve_economy_context
from server.routes.island import CODE_MAX_LENGTH, IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


@router.get(
    "/island/structures",
    response_model=(
        shared_repair_runtime.SharedStructureRecoveryView | structure_recovery.StructureRecoveryView
    ),
)
async def get_structures(
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> shared_repair_runtime.SharedStructureRecoveryView | structure_recovery.StructureRecoveryView:
    """Return shared v1 state for the caller's island or a member island named by code."""
    island = await structure_recovery.resolve_target_island(admin, catalogue, player.id, code)
    context = await resolve_economy_context(admin, player.id, island.owner)
    if context.mode != "personal_legacy":
        return await shared_repair_runtime.read_shared_structures(
            admin,
            catalogue,
            player.id,
            island.owner,
            request,
        )
    return await structure_recovery.read_state(admin, catalogue, island.owner)
