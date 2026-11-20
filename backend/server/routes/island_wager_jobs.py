"""POST /api/internal/island-wagers/settle: CRON_SECRET-only durable queue wake-up.

No player token, outcome, payout, actor or account body is accepted. The endpoint continues
settling persisted origins if offer flags are disabled. It never enables an island economy.
"""

from fastapi import APIRouter, Request

from server.errors import ApiError
from server.island.wager_jobs import settle_due_jobs
from server.routes.keepalive import check_secret
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/internal/island-wagers/settle")
async def settle_jobs(request: Request, settings: SettingsDep, admin: AdminDep) -> dict:
    check_secret(request.headers.get("Authorization"), settings.cron_secret.get_secret_value())
    if request.query_params or await request.body():
        raise ApiError(422, "validation_error", "This scheduler address takes no request data.")
    sports = getattr(request.app.state, "sports", None)
    return await settle_due_jobs(admin, getattr(request.app.state, "market", None),
                                 sports.source if sports is not None else None)
