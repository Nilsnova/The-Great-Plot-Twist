"""Flexible placement (T36, decision D041): move a build spot of your island on its build grid.

The rules are in backend/server/island/layout.py (pure) and placement.py (the flow), the grid and
the fixed spots in backend/content/island_layout.json, the database part in
supabase/migrations/20261114110000_island_layout.sql. Like every island route it needs a signed-in
player and the flag "islands" (404 feature_off while it is off). The flag "placement" is retired
(always on; the name stays accepted in FEATURE_FLAGS and changes nothing).
Answers carry `Cache-Control: private, no-store`.

POST /api/island/move  {"spot": "cannon_1", "x": -10, "z": -10.5, "code"?: "ISLE-K7Q2M"}
    -> the island after the move, in the shape of GET /api/island (the spot's "x" and "z" are the
    new cell; "layout.version" is 2). Any spot of the 22, built or empty, may move; what stands
    on it moves with it, with its level and tower skill. Free, between waves only. With "code":
    the island of a game you are a member of (403 not_member otherwise); without it your own.
    "x" and "z" are island units on the grid of half units. The rules, in this order:
      404 no_such_spot   not one of the island's 22 spots (26 with more_tower_spots, D060; Pirate
                         Point's spots do not move)
      422 off_grid       not a multiple of 0.5, or further out than 30 units
      409 not_on_land    the cell is in the sea
      409 off_path       a wall is outside the marked grass perimeter
      409 place_taken    the footprint (2 x 2 units for walls and towers, 3 x 3 for the
                         watchtower and houses) overlaps the heart, the cabin, the bell, the
                         Harbor, the Tech hub, the wreck or another spot; touching edges are fine
      409 blocks_route   towers, houses and the watchtower would close every way from the heart
                         to the beach (walls never count: boarders hack through them)
      409 wave_running   a wave runs on the island
      409 busy           another move came first twice in a row: try again
    Safe to repeat: a spot moved to where it stands already changes nothing. No click id.
    Errors also: 503 layout_unavailable (the layout migration is not applied yet; the island
    answer then says layout.movable false), 422 validation_error (a missing or extra field),
    429 too_many_requests (the build budget, 30 a minute), and the errors of GET /api/island.

Used by: the island scene's Move mode (frontend/src/island/move-mode.js).
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt

from server.island import placement
from server.island.service import IslandCatalogueDep
from server.routes.island import (
    CODE_MAX_LENGTH,
    ID_PATTERN,
    IslandPlayerDep,
    IslandResponse,
    island_out,
)
from server.supabase_admin import AdminDep

router = APIRouter()

# A coordinate is a number; JSON may send 10 or 10.5. Booleans and strings are refused.
Coordinate = StrictInt | StrictFloat


class MoveRequest(BaseModel):
    """What the browser sends to POST /api/island/move. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    x: Coordinate
    z: Coordinate
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


@router.post("/island/move")
async def post_move(
    body: MoveRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await placement.move(
        admin, catalogue, player.id, body.spot, float(body.x), float(body.z), body.code
    )
    return island_out(view, catalogue)
