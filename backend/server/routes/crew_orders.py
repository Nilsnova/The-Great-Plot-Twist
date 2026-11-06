"""POST /api/crews/me/orders gives a partner in the signed-in player's crew an errand.

Body: {seat: 1..4, order: fetch|man_light, target, allowPaid?: false, actionUid}.
Paid requests give 422 paid_errands_off; other game refusals use four minimum groups.
Accepted orders and repeats return server-picked bank dialogue and a private fresh case view.
"""

from typing import Literal

from fastapi import APIRouter
from pydantic import Field, StrictBool, StrictInt

from server.auth import PlayerDep
from server.game.case_service import CaseDep
from server.routes.case_models import CaseIntent
from server.supabase_admin import AdminDep

router = APIRouter()


class PartnerOrderIntent(CaseIntent):
    seat: StrictInt = Field(ge=1, le=4)
    order: Literal["fetch", "man_light"]
    target: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{1,63}$", strict=True)
    allowPaid: StrictBool = False


@router.post("/crews/me/orders")
async def give_partner_order(
    body: PartnerOrderIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.order_partner(
        admin, player.id, body.seat, body.order, body.target, body.actionUid, body.allowPaid
    )
