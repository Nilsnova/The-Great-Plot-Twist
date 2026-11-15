"""Start fresh (decision D054): a signed-in player resets their OWN island.

The flow is backend/server/island/reset.py, the database part
supabase/migrations/20261116010000_island_reset.sql. Like every island route it needs a signed-in
player and the flag "islands" (404 feature_off while it is off). Answers carry
`Cache-Control: private, no-store`.

POST /api/island/reset  {"confirm": "RESET", "actionUid": "..."}
    -> your island after the reset, in the shape of GET /api/island: no buildings, the fixed
    spots, no research, crew 0, captain level 1 with no skills, role or bought weapons, best
    wave 0 (the next bell rings wave 1), and "coins" at the starting coins (islands.json, 100).
    Always your own island; there is no "code". "confirm" must be exactly "RESET" (the browser's
    type-to-confirm), else 422 validation_error. The wallet moves through the ledger (reason
    island_reset, ref reset:<actionUid>); a repeated actionUid changes nothing and answers the
    island as it is now. The other members of your game are removed from it (they may join again
    with the code), every wave run on the island is deleted (so its old scores leave the
    leaderboard) and the island's arsenal copies are gone. The account, captain name, island
    code, ledger history and your games on other islands stay.
    Errors: 401, 403 demo_closed, 403 sign_in_needed (a class-demo guest: sign in with GitHub or
            email first), 404 feature_off, 404 player_not_set_up, 404 no_island (no island
            yet), 409 wave_running (between waves only), 422 validation_error, 429
            too_many_requests (the build budget), 502 database_error, 503 database_unavailable
            (the OUTCOME IS UNKNOWN: repeat with the SAME actionUid).

Used by: the Settings page's Account section (frontend/src/island/island-reset.js).
"""

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from server.errors import ApiError
from server.island import reset
from server.island.service import IslandCatalogueDep
from server.routes.island import ACTION_UID_PATTERN, IslandPlayerDep, IslandResponse, island_out
from server.supabase_admin import AdminDep

router = APIRouter()


class ResetRequest(BaseModel):
    """What the browser sends to POST /api/island/reset. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    confirm: Literal["RESET"]
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


@router.post("/island/reset")
async def post_reset(
    body: ResetRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    if player.is_anonymous:
        raise ApiError(
            403, "sign_in_needed", "Sign in with GitHub or email to reset an island of your own."
        )
    request.app.state.island_build_budget.spend(player.id)
    view = await reset.reset_own(admin, catalogue, player.id, body.actionUid)
    return island_out(view, catalogue)
