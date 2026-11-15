"""The own boat's games (decision D057, docs/GAME-V3.md section 4.5). The rules are in
backend/server/island/boat.py and backend/content/boat.json; the games are played in the browser
(frontend/src/pirates/boat/). Like every island route it needs a signed-in player and the flag
"islands" (404 feature_off). Answers carry `Cache-Control: private, no-store`.

GET /api/island/boat?code=ISLE-K7Q2M
    -> {"open": true, "reason": null, "message": null, "wave": 31, "unlockWave": 30,
        "wreck": {"paid": 500, "goal": 500},
        "games": [{"id": "broadside", "paid": false, "best": 36}, {"id": "dash", ...}]}
    Whether the island's boat sails (its best won wave reached the "ship" step and the wreck is
    repaired; else reason locked or not_repaired with the sentence to show), and for each game
    whether it paid this player at this wave already and what 3 stars pay. Without "code" your own
    island; with it the game's island (403 not_member for a stranger, 404 no_such_island).

POST /api/island/boat  {"game": "dash", "stars": 2, "code"?: "ISLE-K7Q2M"}
    -> {"game": "dash", "stars": 2, "coins": 24, "paid": true, "already": false,
        "balance": 1264, "wave": 31}
    One finished round. The coins are the server's (stars x (6 + wave // 5)), paid once per game,
    player, island and best won wave (ledger reason boat_game, ref boat:<owner>:<wave>:<game>); a
    round that has nothing to pay answers paid false and moves no coins. 400 bad_game, 422
    bad_stars, 409 locked, 409 not_repaired, 403 not_member, 404 no_such_island, 429 (the build
    budget, 30 a minute).

Used by: frontend/src/island/api.js (boatStatus, boatReward).
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.island import boat
from server.island.service import IslandCatalogueDep
from server.routes.island import CODE_MAX_LENGTH, ID_PATTERN, IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


class BoatGameOut(BaseModel):
    id: str
    paid: bool
    best: int


class BoatWreckOut(BaseModel):
    paid: int
    goal: int


class BoatStatusOut(BaseModel):
    open: bool
    reason: str | None
    message: str | None
    wave: int
    unlockWave: int  # noqa: N815 - the JSON name the browser reads
    wreck: BoatWreckOut
    games: list[BoatGameOut]


class BoatRequest(BaseModel):
    """What the browser sends after a round. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    game: str = Field(pattern=ID_PATTERN)
    stars: StrictInt
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class BoatRewardOut(BaseModel):
    game: str
    stars: int
    coins: int
    paid: bool
    already: bool
    balance: int | None
    wave: int


@router.get("/island/boat")
async def get_boat(
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> BoatStatusOut:
    request.app.state.island_build_budget.spend(player.id)
    view = await boat.boat_status(admin, catalogue, player.id, code)
    return BoatStatusOut(
        open=view.open,
        reason=view.reason,
        message=view.message,
        wave=view.wave,
        unlockWave=view.unlock_wave,
        wreck=BoatWreckOut(paid=view.wreck_paid, goal=view.wreck_goal),
        games=[BoatGameOut(id=item.game, paid=item.paid, best=item.best) for item in view.games],
    )


@router.post("/island/boat")
async def post_boat(
    body: BoatRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> BoatRewardOut:
    request.app.state.island_build_budget.spend(player.id)
    reward = await boat.boat_reward(admin, catalogue, player.id, body.game, body.stars, body.code)
    return BoatRewardOut(
        game=reward.game,
        stars=reward.stars,
        coins=reward.coins,
        paid=reward.paid,
        already=reward.already,
        balance=reward.balance,
        wave=reward.wave,
    )
