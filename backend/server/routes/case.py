"""Case and board/night intents for the verified player's own crew.

GET /api/case returns {case: view}, or {case: null} without an active or finished case.
POST /api/case/search accepts {routeId, actionUid, paidConfirmed?, expectedPrice?}.
POST /api/case/accuse accepts {suspect, actionUid}.
POST /api/board/pin accepts {cardId, actionUid};
/pair accepts {cards: [two distinct ids], actionUid}.
POST /api/finale/nightfall accepts {actionUid}; /post accepts {light, actionUid};
/signal accepts {light, bearing: finite number in [0, 360), actionUid}.
Board writes return earned deduction/payout details; night writes return countdowns and locks.
Only a successful three-light lock reveals the exact chart target.
Intents answer 200 with accepted, reason, message and a fresh case view, including repeats.
Bad input is 422, missing login 401, feature off 404, changed crew 409, rate limit 429,
and database/content errors 502 or 503. Every response is private and no-store.
Unheld cards and unearned reveal text never enter these response models.
"""

from fastapi import APIRouter

from server.auth import PlayerDep
from server.game.case_service import CaseDep
from server.routes.case_models import (
    AccuseIntent,
    CaseIntent,
    PairIntent,
    PinIntent,
    PostIntent,
    SearchIntent,
    SignalIntent,
)
from server.supabase_admin import AdminDep

router = APIRouter()


@router.get("/case")
async def get_case(case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.read(admin, player.id)


@router.post("/case/search")
async def search_case(
    body: SearchIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.search(
        admin, player.id, body.routeId, body.actionUid, body.paidConfirmed, body.expectedPrice
    )


@router.post("/case/accuse")
async def accuse_case(
    body: AccuseIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.accuse(admin, player.id, body.suspect, body.actionUid)


@router.post("/board/pin")
async def pin_case(body: PinIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.pin(admin, player.id, body.cardId, body.actionUid)


@router.post("/board/pair")
async def pair_case(body: PairIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.pair(admin, player.id, *body.cards, body.actionUid)


@router.post("/finale/nightfall")
async def nightfall_case(
    body: CaseIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.nightfall(admin, player.id, body.actionUid)


@router.post("/finale/post")
async def post_case(body: PostIntent, case: CaseDep, player: PlayerDep, admin: AdminDep) -> dict:
    return await case.post(admin, player.id, body.light, body.actionUid)


@router.post("/finale/signal")
async def signal_case(
    body: SignalIntent, case: CaseDep, player: PlayerDep, admin: AdminDep
) -> dict:
    return await case.signal(admin, player.id, body.light, body.bearing, body.actionUid)
