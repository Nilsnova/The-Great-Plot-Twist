"""Pirate Point routes: the shared buildings of the joint island (docs/TOWER-DEFENSE.md 5 and 7).

Every route needs a signed-in player (admitted guests too) and the flag "islands", like
routes/island.py. The rules are in backend/server/island/pirate_point.py, the prices in
backend/content/islands.json (the same as on your island), the database part in
supabase/migrations/20261111030000_tower_defense.sql.

GET /api/pirate-point
    -> {"spots": [{"id": "pp_wall_1", "kind": "wall", "kinds": ["wall"], "built": false,
                   "level": 0, "cost": 10, "upgradeCost": null}, ...],
        "waveBest": 4, "coins": 85}
    The 10 spots in the order of islands.json: pp_wall_1..pp_wall_4 (wall), pp_tower_1..
    pp_tower_6 (cannon or mortar). waveBest is the best wave won on Pirate Point; coins are the
    coins of the player who asks. Budget: 30 a minute per player (shared with the visits).

POST /api/pirate-point/build    {"spot": "pp_tower_1", "kind": "mortar", "actionUid": "..."}
POST /api/pirate-point/upgrade  {"spot": "pp_tower_1", "actionUid": "...", "kind"?: "mortar"}
    -> the Pirate Point state (as GET). The player who clicks pays with their own coins (ledger
    ref pp:<actionUid>, reason building_purchase); the building belongs to Pirate Point. Their own
    unlock wave decides what they may build or upgrade. A repeated actionUid answers the state
    as it is and charges nothing. Budget: the build budget of the island (30 a minute).
    Errors: 404 no_such_spot, 409 spot_taken, 409 not_built, 409 max_level, 409 locked,
            409 insufficient_funds, 422 wrong_kind, 422 validation_error, 429 too_many_requests

Used by: the Pirate Point scene of the game client.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from server.island import pirate_point
from server.island.pirate_point import PointView
from server.island.service import IslandCatalogueDep
from server.routes.island import ACTION_UID_PATTERN, ID_PATTERN, IslandPlayerDep, SpotOut, spots_out
from server.supabase_admin import AdminDep

router = APIRouter()


class PointBuildRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    kind: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class PointUpgradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    kind: str | None = Field(default=None, pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class PointResponse(BaseModel):
    spots: list[SpotOut]
    waveBest: int
    coins: int


def point_out(view: PointView) -> PointResponse:
    return PointResponse(spots=spots_out(view.spots), waveBest=view.wave_best, coins=view.coins)


@router.get("/pirate-point")
async def get_pirate_point(
    player: IslandPlayerDep, catalogue: IslandCatalogueDep, admin: AdminDep, request: Request
) -> PointResponse:
    request.app.state.island_visit_budget.spend(player.id)
    return point_out(await pirate_point.look(admin, catalogue, player.id))


@router.post("/pirate-point/build")
async def post_point_build(
    body: PointBuildRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> PointResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await pirate_point.build(
        admin, catalogue, player.id, body.spot, body.kind, body.actionUid
    )
    return point_out(view)


@router.post("/pirate-point/upgrade")
async def post_point_upgrade(
    body: PointUpgradeRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> PointResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await pirate_point.upgrade(
        admin, catalogue, player.id, body.spot, body.kind, body.actionUid
    )
    return point_out(view)
