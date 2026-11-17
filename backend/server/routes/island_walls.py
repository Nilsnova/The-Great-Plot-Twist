"""Strict authenticated perimeter offers. The server selects policy, identities and prices."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt

from server.island import wall_build
from server.island.service import IslandCatalogueDep
from server.routes.island import CODE_MAX_LENGTH, IslandPlayerDep, IslandResponse, island_out
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()


class EnableRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class WallCell(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    x: StrictInt | StrictFloat = Field(ge=-30, le=30)
    z: StrictInt | StrictFloat = Field(ge=-30, le=30)


class QuoteRequest(EnableRequest):
    cells: list[WallCell] = Field(min_length=1, max_length=32)


class PlacementOut(WallCell):
    spot: str


class QuoteOut(BaseModel):
    placements: list[PlacementOut]
    unitCost: int
    totalCost: int
    remaining: int
    wallRuleVersion: Literal[1]
    wallCapacity: Literal[128]
    islandEpoch: UUID


@router.post("/island/walls/enable")
async def post_enable(
    body: EnableRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await wall_build.enable(admin, catalogue, player.id, settings.flags, body.code)
    return island_out(view, catalogue)


@router.post("/island/walls/quote")
async def post_quote(
    body: QuoteRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> QuoteOut:
    request.app.state.island_build_budget.spend(player.id)
    quoted = await wall_build.quote(
        admin,
        catalogue,
        player.id,
        settings.flags,
        [(cell.x, cell.z) for cell in body.cells],
        body.code,
    )
    return QuoteOut(**quoted.wire())
