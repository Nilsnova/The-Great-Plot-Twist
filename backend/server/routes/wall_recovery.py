"""Wall recovery routes (tasks T29-T32 and T47, decision D039, proposed;
specs/T29-T32-wall-recovery.md): damage that stays after a wave, and the paid Repair/Rebuild.

Every route needs a signed-in player and the flags "islands" and "wall_recovery" (404
feature_off while either is off, before the body is checked or the database is asked). The
flag stays off until supabase/migrations/20261114100000_wall_recovery.sql has been applied.

GET /api/island/walls?code=ISLE-K7Q2M   (code optional: your own island)
    -> {"coins": 120, "walls": [{"spot": "wall_1", "level": 2, "health": 40,
        "recoversAt": "2026-11-14T12:10:00Z", "repairCost": 6}, ...]}
    Every built wall of the island with its health in percent after its last wave (0 =
    destroyed, 100 = whole), when it mends by itself (10 minutes after that wave; null while it
    is whole) and what a Repair (damaged) or Rebuild (destroyed) costs YOU now (null while it is
    whole): 30% of the catalogue prices of its levels, rounded up, times the missing share, at
    least 1 coin, less for an engineer. "coins" are your own. Changes nothing.
    Errors: 404 no_such_island, and the errors of GET /api/island

POST /api/island/repair  {"spot": "wall_1", "actionUid": "...", "code"?: "ISLE-K7Q2M"}
    -> the answer of GET /api/island/walls after it. Repairs a damaged wall or Rebuilds a
    destroyed one at its kind and level, paid by the caller, between waves only. With "code"
    on the island of a game you are a member of (as for a co-op build). Ledger reason
    building_purchase, ref wallfix:<actionUid>: a repeat charges nothing.
    Errors: 404 no_such_spot, 404 no_such_island, 403 not_member, 409 not_built, 422
            wrong_kind, 409 intact, 409 wave_running, 409 insufficient_funds, 429
            too_many_requests, 503 database_unavailable (outcome unknown: repeat with the
            SAME actionUid)

While the flag is on, POST /api/island/upgrade refuses a damaged wall (409 needs_repair) and
the wave routes carry "walls" (routes/waves.py).

Used by: the wall card of the game client (frontend/src/island/wall-recovery.js).
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player
from server.clock import ClockDep
from server.errors import ApiError
from server.flags import is_enabled
from server.island import wall_repair
from server.island.service import IslandCatalogueDep
from server.island.wall_repair import WallsView
from server.routes.island import (
    ACTION_UID_PATTERN,
    CODE_MAX_LENGTH,
    ID_PATTERN,
    IslandPlayerDep,
)
from server.settings import Settings, SettingsDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()
FLAG = "wall_recovery"


def walls_on(settings: Settings) -> bool:
    """True while lasting wall damage is switched on (the migration is applied)."""
    return is_enabled(FLAG, settings.flags)


async def require_walls(player: IslandPlayerDep, settings: SettingsDep) -> Player:
    if not walls_on(settings):
        raise ApiError(404, "feature_off", "Wall repairs are not open yet.")
    return player


WallsPlayerDep = Annotated[Player, Depends(require_walls)]


class RepairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class WallOut(BaseModel):
    spot: str
    level: int
    health: int
    recoversAt: str | None
    repairCost: int | None


class WallsResponse(BaseModel):
    coins: int
    walls: list[WallOut]


def time_or_none(value: datetime | None) -> str | None:
    return None if value is None else format_utc_time(value)


def walls_out(view: WallsView) -> WallsResponse:
    return WallsResponse(
        coins=view.coins,
        walls=[
            WallOut(
                spot=wall.plot,
                level=wall.level,
                health=wall.health,
                recoversAt=time_or_none(wall.recovers_at),
                repairCost=wall.repair_cost,
            )
            for wall in view.walls
        ],
    )


@router.get("/island/walls")
async def get_walls(
    player: WallsPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    now: ClockDep,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> WallsResponse:
    return walls_out(await wall_repair.look(admin, catalogue, player.id, now(), code))


@router.post("/island/repair")
async def post_repair(
    body: RepairRequest,
    player: WallsPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    now: ClockDep,
    request: Request,
) -> WallsResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await wall_repair.restore(
        admin, catalogue, player.id, body.spot, body.actionUid, now(), body.code
    )
    return walls_out(view)
