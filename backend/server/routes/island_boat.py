"""Authenticated boat status, atomic legacy rewards and server-bound shared rounds.

GET /island/boat?code= returns explicit player/island reward scope. Shared status and
POST /island/boat/start|claim require X-Island-Economy-Version:1. Start/claim accept common
intent plus game or round/stars and actionUid; actor comes only from verified authentication.
Both use common immutable receipts. POST /island/boat keeps legacy first-score rewards with
an atomic persisted-mode guard; shared admission can never fall back to a personal payout.
All routes require islands and the existing admitted-guest/login gate; cache is private/no-store.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.island import boat, boat_runtime
from server.island.economy_http import require_economy_capability
from server.island.shared_boat_store import ClaimRow, StartRow
from server.routes.island import CODE_MAX_LENGTH, ID_PATTERN, IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


class BoatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    game: str = Field(pattern=ID_PATTERN)
    stars: StrictInt
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


@router.get("/island/boat")
async def get_boat(
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> boat_runtime.BoatStatusOut | boat_runtime.SharedBoatStatusOut:
    request.app.state.island_build_budget.spend(player.id)
    view = await boat_runtime.status(admin, player.id, code)
    if isinstance(view, boat_runtime.SharedBoatStatusOut):
        require_economy_capability(request)
    return view


@router.post("/island/boat")
async def post_boat(
    body: BoatRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> boat_runtime.LegacyRewardOut:
    request.app.state.island_build_budget.spend(player.id)
    boat.check_claim(body.game, body.stars)
    return await boat_runtime.legacy_reward(admin, player.id, body.game, body.stars, body.code)


@router.post("/island/boat/start")
async def start_boat(
    body: boat_runtime.StartRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> StartRow:
    require_economy_capability(request)
    request.app.state.island_build_budget.spend(player.id)
    return await boat_runtime.start(admin, player.id, body)


@router.post("/island/boat/claim")
async def claim_boat(
    body: boat_runtime.ClaimRequest,
    player: IslandPlayerDep,
    admin: AdminDep,
    request: Request,
) -> ClaimRow:
    require_economy_capability(request)
    request.app.state.island_build_budget.spend(player.id)
    return await boat_runtime.claim(admin, player.id, body)
