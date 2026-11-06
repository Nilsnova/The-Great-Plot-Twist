"""Own-crew board intents: POST /api/board/pin and /pair.

Bodies are {cardId, actionUid} and {cards: [cardA, cardB], actionUid}. Signed-in players
with case enabled receive the shared intent answer and fresh private case view.
"""

from fastapi import APIRouter

from server.auth import PlayerDep
from server.game.case_service import CaseDep
from server.routes.case_models import PairIntent, PinIntent
from server.supabase_admin import AdminDep

router = APIRouter()


@router.post("/board/pin")
async def pin_card(body: PinIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.pin(admin, player.id, body.cardId, body.actionUid)


@router.post("/board/pair")
async def pair_cards(body: PairIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.pair(admin, player.id, *body.cards, body.actionUid)
