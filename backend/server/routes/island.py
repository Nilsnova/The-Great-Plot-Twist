"""Island routes: your own island, building on it, and visiting a friend's island by its code.

The contract is docs/BUILD-PLAN.md section 3.4 (lane 0, task 0.2). The rules are in
backend/server/island/, the prices in backend/content/islands.json, the database part in
supabase/migrations/20261110010000_islands_and_waves.sql. Coins are play money only.

Every route needs a signed-in player (a GitHub or email player, or a guest admitted with the class
code: auth.py lets both through), then the feature flag "islands" (404 feature_off while it is off,
before the body is checked or the database is asked). The player id always comes from the verified
login, never from the body. Answers carry `Cache-Control: private, no-store`.

GET /api/island
    -> {"code": "ISLE-K7Q2M", "coins": 100, "waveBest": 0, "flags": 0,
        "spots": [{"id": "wall_1", "kind": "wall", "built": false, "cost": 10}, ...]}
    The first call makes the player's island with a new code and, for a brand-new player whose
    wallet never moved, pays the starting coins (100, once). The spots come in the order of
    islands.json: wall_1..wall_4, cannon_1..cannon_4, tower_1, house_1, house_2. The cabin stands
    from the start and is not a build spot. "cost" is the price of the spot's kind, also once built.
    Errors: 401, 403 demo_closed (a guest without the class code), 404 feature_off,
            404 player_not_set_up, 502 database_error, 503 island_unavailable, database_unavailable

POST /api/island/build  {"spot": "cannon_1", "kind": "cannon", "actionUid": "k3j9x2m4q8w1z7a0"}
    -> the island after the build, in the shape of GET /api/island
    The price comes from islands.json. "actionUid" is made once per click (8 to 64 letters, digits,
    hyphens or underscores); the ledger ref is "island:<actionUid>", so a repeat never builds or
    charges twice and is answered with the island as it is now. Anything extra is a 422.
    Errors: 404 no_such_spot, 409 spot_taken (also the cabin), 409 insufficient_funds,
            422 wrong_kind (that kind does not belong on that spot), 422 validation_error,
            429 too_many_requests, 503 database_unavailable (the OUTCOME IS UNKNOWN: read the
            island, then repeat with the SAME actionUid), and the errors of GET /api/island

GET /api/island/visit/{code}
    -> {"code": "ISLE-K7Q2M", "ownerName": "Captain Gull", "waveBest": 3, "spots": [...]}
    The code may be written with or without "ISLE-", in any case. Your own code works too.
    Errors: 404 no_such_island, 429 too_many_requests, and the errors of GET /api/island

Used by: the island scene and the friends panel of the game client (lanes P and U).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player, PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.island import service
from server.island.rules import SpotView
from server.island.service import IslandCatalogueDep, IslandView
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

NO_STORE = "private, no-store"
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
ID_PATTERN = r"^[a-z][a-z0-9_]{1,39}$"
# A typed code is short (codes.MAX_TYPED_LENGTH); a longer path is refused before any lookup.
CODE_MAX_LENGTH = 32


async def require_islands(player: PlayerDep, settings: SettingsDep, response: Response) -> Player:
    """Every island and wave route: the signed-in player (401/403), then the flag (404)."""
    if not is_enabled("islands", settings.flags):
        raise ApiError(404, "feature_off", "Islands are not open yet.")
    response.headers["Cache-Control"] = NO_STORE
    return player


# Write `player: IslandPlayerDep` in a route and FastAPI checks the login and the flag for you.
IslandPlayerDep = Annotated[Player, Depends(require_islands)]


class SpotOut(BaseModel):
    id: str
    kind: str
    built: bool
    cost: int


class IslandResponse(BaseModel):
    """camelCase on purpose: these are the JSON keys of BUILD-PLAN 3.4."""

    code: str
    coins: int
    waveBest: int
    flags: int
    spots: list[SpotOut]


class VisitResponse(BaseModel):
    code: str
    ownerName: str
    waveBest: int
    spots: list[SpotOut]


class BuildRequest(BaseModel):
    """What the browser sends to POST /api/island/build. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    kind: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


def spots_out(spots: tuple[SpotView, ...]) -> list[SpotOut]:
    return [SpotOut(id=spot.id, kind=spot.kind, built=spot.built, cost=spot.cost) for spot in spots]


def island_out(view: IslandView) -> IslandResponse:
    return IslandResponse(
        code=view.code,
        coins=view.coins,
        waveBest=view.wave_best,
        flags=view.flags,
        spots=spots_out(view.spots),
    )


@router.get("/island")
async def get_island(
    player: IslandPlayerDep, catalogue: IslandCatalogueDep, admin: AdminDep
) -> IslandResponse:
    return island_out(await service.look(admin, catalogue, player.id))


@router.post("/island/build")
async def post_build(
    body: BuildRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.build(admin, catalogue, player.id, body.spot, body.kind, body.actionUid)
    return island_out(view)


@router.get("/island/visit/{code}")
async def get_visit(
    code: Annotated[str, Path(max_length=CODE_MAX_LENGTH)],
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> VisitResponse:
    # A budget, because a visit looks a code up: guessing codes stays slow.
    request.app.state.island_visit_budget.spend(player.id)
    view = await service.visit(admin, catalogue, code)
    return VisitResponse(
        code=view.code,
        ownerName=view.owner_name,
        waveBest=view.wave_best,
        spots=spots_out(view.spots),
    )
