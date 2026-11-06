"""Own-crew finale intents: POST /api/finale/nightfall, /post and /signal.

Bodies carry actionUid, plus light for a post, or light and finite [0,360) bearing for
signal. The case flag, verified login, and shared private intent/repeat contracts apply.
"""

from fastapi import APIRouter

from server.auth import PlayerDep
from server.game.case_service import CaseDep
from server.routes.case_models import CaseIntent, PostIntent, SignalIntent
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/finale/nightfall")
async def call_nightfall(
    body: CaseIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.nightfall(admin, player.id, body.actionUid)


@router.post("/finale/post")
async def take_post(body: PostIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.take_post(admin, player.id, body.light, body.actionUid)


@router.post("/finale/signal")
async def aim_light(body: SignalIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.signal(admin, player.id, body.light, body.bearing, body.actionUid)
