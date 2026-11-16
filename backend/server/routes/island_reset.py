"""Reset my island (T53, docs/GAME-V3.md "Reset my island"). The rules are in
backend/server/island/fresh_start.py and 20261116070000_island_fresh_start.sql. Like every island
route it needs a signed-in player (a guest too, once let in with the class code) and the flag
"islands" (404 feature_off). Answers carry `Cache-Control: private, no-store`.

POST /api/island/fresh-start  {"confirmCode": "ISLE-K7Q2M", "actionUid": "..."}
    -> {"reset": true, "repeat": false, "balance": 200,
        "counts": {"coins": -800, "saves": 1, "buildings": 6, "research": 1, "layout": 0,
                   "arsenalMoves": 0, "arsenalCopies": 0, "wallRecords": 3, "waveRules": 3,
                   "waves": 3, "membersKept": 2}}
    Resets YOUR OWN island to a fresh start: the coins of a brand-new player (islands.json
    startingCoins, 🪙 200 today), no buildings but the cabin, wave 0, no
    research, the wreck, the arsenal and the captain back to the start. The game's members stay.
    "confirmCode" is your island's code, typed to confirm (with or without ISLE-, any case).
    "actionUid" is made once per click: a repeat answers the first reset (repeat true) and
    resets nothing again. Errors: 400 wrong_code (not your island's code), 403 not_owner (you
    have no island, or the code is of a friend's game: only its host may reset it), 409
    wave_running (between waves only), 404 player_not_set_up, 422 validation_error, 429 (the
    build budget, 30 a minute).

Used by: frontend/src/island/api.js (freshStart) and the Settings section of
frontend/src/island/reset.js.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from server.island import fresh_start
from server.island.service import IslandCatalogueDep
from server.routes.island import ACTION_UID_PATTERN, CODE_MAX_LENGTH, IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


class FreshStartRequest(BaseModel):
    """What the browser sends. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    confirmCode: str = Field(max_length=CODE_MAX_LENGTH)  # noqa: N815 - the JSON name
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)  # noqa: N815


class FreshStartOut(BaseModel):
    reset: bool
    repeat: bool
    balance: int
    counts: fresh_start.CountsRow


@router.post("/island/fresh-start")
async def post_fresh_start(
    body: FreshStartRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> FreshStartOut:
    request.app.state.island_build_budget.spend(player.id)
    done = await fresh_start.fresh_start(
        admin, catalogue, player.id, body.confirmCode, body.actionUid
    )
    return FreshStartOut(reset=True, repeat=done.repeat, balance=done.balance, counts=done.counts)
