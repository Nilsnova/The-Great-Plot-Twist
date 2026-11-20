"""Free shared revival completion; registered by the coordinated common runtime integration."""

from fastapi import APIRouter, Request

from server.island import shared_revival
from server.island.economy_http import require_economy_capability
from server.island.economy_operations import root_action_uid
from server.island.shared_lifecycle import ensure_not_deleted
from server.island.shared_revival_models import SharedRevivalReply, SharedRevivalRequest
from server.routes.island import IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/island/revive", response_model=SharedRevivalReply)
async def post_shared_revival(
    body: SharedRevivalRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> SharedRevivalReply:
    require_economy_capability(request)
    root_action_uid(body.actionUid)
    request.app.state.wave_budget.spend(player.id)
    await ensure_not_deleted(admin, player.id)
    return await shared_revival.revive_shared(admin, player.id, body)
