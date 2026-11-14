"""Arsenal routes (T40, T41, decision D042): the shared weapon rack of an island.

The rules are in backend/server/island/arsenal*.py, the prices in backend/content/islands.json,
the database part in supabase/migrations/20261114120000_arsenal.sql. Coins are play money only.

Every route needs a signed-in player and the flags "islands" AND "arsenal" (404 feature_off while
either is off, before the body is checked or the database is asked). The player id comes from the
verified login, never from the body. Answers carry `Cache-Control: private, no-store`. Writes share
the island routes' budget (30 a minute per player). "code" (optional, "ISLE-K7Q2M") names the
game's island; without it, your own island. Only an active member of that game may use its
arsenal (arsenal_policy.py; the host always).

GET /api/island/arsenal?code=ISLE-K7Q2M
    -> {"code": "ISLE-K7Q2M", "capacity": 20, "stored": 3, "mine": "<copy id>" | null,
        "carried": "pistols" | "musket", "waveRunning": false, "coins": 140, "unlockWave": 4,
        "copies": [{"id": "<uuid>", "no": 1, "weapon": "pistols", "name": "Pistols",
                    "holder": "<player id>" | null, "holderName": "Captain Gull" | null,
                    "away": false, "you": true}, ...],
        "types": [{"id": "musket", "name": "Musket", "price": 0, "unlockWave": 0,
                   "unlocked": true}, {"id": "pistols", ...}, ...]}
    "copies" lists every copy of the island in rack-number order: stored (holder null) or carried
    by one captain. "away": the holder left the game; the copy goes back on the rack the next time
    the arsenal is used and there is room. "carried" is what you shoot with on this island (the
    musket while you carry no copy). "types": what the arsenal sells, with your own unlock.
    The first read on an island converts its owner's old personal weapons into copies.
    Errors: 401, 403 not_member, 404 feature_off, 404 no_such_island, 429 too_many_requests,
            502 database_error, 503 database_unavailable

POST /api/island/arsenal/buy  {"weapon": "pistols", "actionUid": "...", "code"?: "ISLE-K7Q2M"}
    -> the arsenal. A new copy paid with YOUR coins (ledger ref arsenal:<actionUid>, reason
    weapon_purchase): into your hands when you carry none here, else onto the rack.
    Errors: 400 bad_weapon, 409 standard_weapon (the musket), 409 locked, 409 arsenal_full,
            409 insufficient_funds, 409 wave_running, 409 action_used, 403 not_member, 503
            database_unavailable (the OUTCOME IS UNKNOWN: read the arsenal, then repeat with the
            SAME actionUid)

POST /api/island/arsenal/take  {"copy": "<copy id>", "actionUid": "...", "code"?: "..."}
    -> the arsenal. The stored copy into your hands. If you carry one, it goes back on the rack
    in the same step (a swap: works on a full rack).
    Errors: 404 no_such_copy, 409 taken (another captain has it), 409 wave_running, 409
            action_used, 403 not_member

POST /api/island/arsenal/return  {"actionUid": "...", "code"?: "..."}
    -> the arsenal. The copy you carry back on the rack; you shoot with the musket again.
    Errors: 409 nothing_held, 409 arsenal_full (the copy stays in your hands: nothing is lost),
            409 wave_running, 409 action_used, 403 not_member

A repeated actionUid changes nothing and answers the arsenal as it is now.

Used by: the arsenal building of the island client (frontend/src/island/arsenal*.js).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player
from server.errors import ApiError
from server.flags import is_enabled
from server.island import arsenal
from server.island.arsenal import ArsenalView
from server.island.service import IslandCatalogueDep
from server.routes.island import ACTION_UID_PATTERN, CODE_MAX_LENGTH, IslandPlayerDep
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

COPY_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


async def require_arsenal(player: IslandPlayerDep, settings: SettingsDep) -> Player:
    """The island checks (login, flag "islands"), then the flag "arsenal" (404 while off)."""
    if not is_enabled("arsenal", settings.flags):
        raise ApiError(404, "feature_off", "The arsenal is not open yet.")
    return player


ArsenalPlayerDep = Annotated[Player, Depends(require_arsenal)]
Code = Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)]


class CopyOut(BaseModel):
    id: str
    no: int
    weapon: str
    name: str
    holder: str | None
    holderName: str | None
    away: bool
    you: bool


class TypeOut(BaseModel):
    id: str
    name: str
    price: int
    unlockWave: int
    unlocked: bool


class ArsenalResponse(BaseModel):
    """camelCase on purpose: these are the JSON keys of the contract above."""

    code: str
    capacity: int
    stored: int
    mine: str | None
    carried: str
    waveRunning: bool
    coins: int
    unlockWave: int
    copies: list[CopyOut]
    types: list[TypeOut]


class BuyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weapon: str = Field(min_length=1, max_length=40)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class TakeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    copy_id: str = Field(alias="copy", pattern=COPY_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class ReturnRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


def arsenal_out(view: ArsenalView) -> ArsenalResponse:
    return ArsenalResponse(
        code=view.code,
        capacity=view.capacity,
        stored=view.stored,
        mine=view.mine,
        carried=view.carried,
        waveRunning=view.wave_running,
        coins=view.coins,
        unlockWave=view.unlock_wave,
        copies=[
            CopyOut(
                id=c.id,
                no=c.no,
                weapon=c.weapon,
                name=c.name,
                holder=c.holder,
                holderName=c.holder_name,
                away=c.away,
                you=c.you,
            )
            for c in view.copies
        ],
        types=[
            TypeOut(
                id=t.weapon,
                name=t.name,
                price=t.coins,
                unlockWave=t.unlock_wave,
                unlocked=t.unlocked,
            )
            for t in view.types
        ],
    )


@router.get("/island/arsenal")
async def get_arsenal(
    player: ArsenalPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
    code: Code = None,
) -> ArsenalResponse:
    # A code is looked up, so reads share the visit budget: guessing codes stays slow.
    request.app.state.island_visit_budget.spend(player.id)
    return arsenal_out(await arsenal.look(admin, catalogue, player.id, code))


@router.post("/island/arsenal/buy")
async def post_arsenal_buy(
    body: BuyRequest,
    player: ArsenalPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> ArsenalResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await arsenal.buy(admin, catalogue, player.id, body.weapon, body.actionUid, body.code)
    return arsenal_out(view)


@router.post("/island/arsenal/take")
async def post_arsenal_take(
    body: TakeRequest,
    player: ArsenalPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> ArsenalResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await arsenal.take(admin, catalogue, player.id, body.copy_id, body.actionUid, body.code)
    return arsenal_out(view)


@router.post("/island/arsenal/return")
async def post_arsenal_return(
    body: ReturnRequest,
    player: ArsenalPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> ArsenalResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await arsenal.give_back(admin, catalogue, player.id, body.actionUid, body.code)
    return arsenal_out(view)
