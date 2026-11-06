"""Sports API, behind sports: public board, private stakes and provider-only settlement.

GET /api/sports takes no query; GET /api/sports/mine refreshes the caller's final games.
POST /api/sports/stake {fixtureId,pick,amount,stakeId}; POST /api/sports/settle {fixtureId}.
No endpoint accepts an outcome, score, payout, player id or remote address from a client.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.auth import PlayerDep
from server.errors import ApiError
from server.settings import SettingsDep
from server.sports.service import SportsService
from server.supabase_admin import AdminDep

router = APIRouter()
FixtureId = Annotated[str, Field(strict=True, pattern=r"^(fd|bdl)-[1-9][0-9]{0,14}$")]


class FixtureIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fixtureId: FixtureId


class StakeIntent(FixtureIntent):
    pick: Literal["home", "draw", "away"]
    amount: StrictInt = Field(ge=1, le=50)
    stakeId: str = Field(strict=True, pattern=r"^[A-Za-z0-9_-]{8,64}$")


def get_sports(request: Request, settings: SettingsDep) -> SportsService:
    if not settings.flags.get("sports", False):
        raise ApiError(404, "feature_off", "Sports predictions are not available yet.")
    service = getattr(request.app.state, "sports", None)
    if service is None:
        raise ApiError(
            503, "sports_unavailable", "Current sports results are not available right now."
        )
    return service


SportsDep = Annotated[SportsService, Depends(get_sports)]


def no_query(request: Request) -> None:
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")


@router.get("/sports")
async def get_board(
    request: Request, response: Response, sports: SportsDep, admin: AdminDep
) -> dict:
    no_query(request)
    answer = await sports.board(admin)
    response.headers["Cache-Control"] = "public, max-age=30, s-maxage=30"
    return answer


@router.get("/sports/mine")
async def get_mine(
    request: Request, response: Response, sports: SportsDep, player: PlayerDep, admin: AdminDep
) -> dict:
    no_query(request)
    response.headers["Cache-Control"] = "private, no-store"
    return await sports.mine(admin, player.id)


@router.post("/sports/stake")
async def place_stake(
    body: StakeIntent, response: Response, sports: SportsDep, player: PlayerDep, admin: AdminDep
) -> dict:
    response.headers["Cache-Control"] = "private, no-store"
    return await sports.stake(
        admin, player.id, body.fixtureId, body.pick, body.amount, body.stakeId
    )


@router.post("/sports/settle")
async def settle_fixture(
    body: FixtureIntent, response: Response, sports: SportsDep, player: PlayerDep, admin: AdminDep
) -> dict:
    response.headers["Cache-Control"] = "private, no-store"
    return await sports.settle(admin, player.id, body.fixtureId)
