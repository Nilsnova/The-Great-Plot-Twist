"""POST /api/crews/me/orders gives one crew partner a minimum fetch or man-light order.

Body: {seat: 1..4, order: fetch|man_light, target, allowPaid: false, actionUid}.
The signed-in player's case service owns every decision, bank line, reward and receipt.
Replies are private/no-store, with the shared accepted/refused/repeat case answer shape.
Accepted replies add the fixed stored order, line and any immediate pin reward. Refusals
use only busy, wrong_kit, locked_window or not_ready. Invalid paid errands give 422;
player seats give 409 not_a_partner. This route never permits NPC pairing or accusation.
"""

from fastapi import APIRouter

from server.auth import PlayerDep
from server.game.case_service import CaseDep
from server.routes.case_models import OrderIntent
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/crews/me/orders")
async def order_partner(
    body: OrderIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.order(
        admin, player.id, body.seat, body.order, body.target, body.allowPaid, body.actionUid
    )
