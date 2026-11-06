"""POST /api/host/case/clock moves only the host's own active crew's case clock.

Body: {seconds: 1..3600, actionUid}. HostDep supplies the verified host, never a body id.
It uses the same 200 intent/repeat shape and refusal codes as the other case routes.
"""

from fastapi import APIRouter

from server.game.case_service import CaseDep
from server.hosts import HostDep
from server.routes.case_models import ClockIntent
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/host/case/clock")
async def move_case_clock(body: ClockIntent, case: CaseDep, host: HostDep, admin: AdminDep) -> dict:
    return await case.clock_forward(admin, host.id, body.seconds, body.actionUid)
