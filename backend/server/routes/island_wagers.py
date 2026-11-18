"""Shared Harbor routes; private member snapshots and versioned exact-amount wager intents.

GET /api/island/wagers?islandOwner=UUID&product=market_call|football&runEpoch?&cursor?
POST /api/island/wagers/market {economy,actionUid,asset,direction,stake:decimal string}
POST /api/island/wagers/football {economy,actionUid,fixtureId,pick,stake:decimal string}
Actor is verified login; account and payout never come from a browser. Legacy routes are separate.
"""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from server.errors import ApiError
from server.island import wager_reads, wager_service
from server.island.economy_http import require_economy_capability
from server.island.economy_operations import root_action_uid
from server.island.treasury_models import decimal_integer
from server.market.calls import CALL_ASSETS, asset_view
from server.routes.island import IslandPlayerDep
from server.settings import SettingsDep
from server.sports.rules import closes_at, picking_open
from server.supabase_admin import AdminDep

router = APIRouter()


class EconomyIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class Intent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    economy: EconomyIntent | None = None
    actionUid: StrictStr = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    stake: StrictStr = Field(pattern=r"^[1-9][0-9]*$")


class MarketIntent(Intent):
    asset: StrictStr
    direction: Literal["up", "down"]


class FootballIntent(Intent):
    fixtureId: StrictStr = Field(pattern=r"^fd-[1-9][0-9]{0,14}$")
    pick: Literal["home", "draw", "away"]


def require_request(request: Request, settings, product: str) -> None:
    require_economy_capability(request)
    flag = "market" if product == "market_call" else "sports"
    if not settings.flags.get(flag, False):
        raise ApiError(404, "feature_off", "This Harbor stall is not available.")


async def choices(request: Request, product: str, admin) -> list[dict]:
    try:
        if product == "market_call":
            market = request.app.state.market
            if market is None:
                return []
            snapshot = await market.snapshot(admin, trading_enabled=True)
            result = []
            for asset, name in CALL_ASSETS:
                state = snapshot.find(asset)
                if state is None:
                    continue
                view = asset_view(state, name)
                result.append({"id": asset, "name": name, "open": view.is_open,
                               "reason": view.closed_reason,
                               "options": [{"id": "up", "label": "Up"},
                                           {"id": "down", "label": "Down"}]})
            return result
        sports = getattr(request.app.state, "sports", None)
        if sports is None:
            return []
        source = sports.source
        board = await source.board()
        return [{"id": match.id, "name": match.home + " v " + match.away,
                 "open": board.source == "live" and picking_open(match, source.clock()),
                 "reason": None, "closesAt": closes_at(match).isoformat(),
                 "options": [{"id": "home", "label": match.home},
                             {"id": "draw", "label": "Draw"},
                             {"id": "away", "label": match.away}]}
                for match in board.matches
                if match.sport == "football" and match.id.startswith("fd-")]
    except ApiError:
        return []


@router.get("/island/wagers")
async def get_wagers(
    request: Request, player: IslandPlayerDep, settings: SettingsDep, admin: AdminDep,
    islandOwner: Annotated[UUID, Query()],
    product: Literal["market_call", "football"] = "market_call",
    runEpoch: Annotated[UUID | None, Query()] = None,
    cursor: Annotated[UUID | None, Query()] = None,
) -> dict:
    require_request(request, settings, product)
    page = await wager_reads.read_page(admin, player.id, str(islandOwner), product,
                                      epoch=str(runEpoch) if runEpoch else None,
                                      cursor=str(cursor) if cursor else None)
    page["choices"] = await choices(request, product, admin)
    return page


@router.post("/island/wagers/market")
async def post_market(
    body: MarketIntent, request: Request, player: IslandPlayerDep, settings: SettingsDep,
    admin: AdminDep,
) -> dict:
    require_request(request, settings, "market_call")
    if body.economy is None:
        raise ApiError(409, "economy_context_required", "Reload this island's economy context.")
    root_action_uid(body.actionUid)
    market = request.app.state.market
    if market is None:
        raise ApiError(503, "market_unavailable", "Current market prices are unavailable.")
    reply = await wager_service.open_market_call(
        admin, market, player.id, str(body.economy.islandOwner), str(body.economy.runEpoch),
        body.actionUid, body.asset, body.direction, decimal_integer(body.stake),
    )
    return reply.model_dump(mode="json")


@router.post("/island/wagers/football")
async def post_football(
    body: FootballIntent, request: Request, player: IslandPlayerDep, settings: SettingsDep,
    admin: AdminDep,
) -> dict:
    require_request(request, settings, "football")
    if body.economy is None:
        raise ApiError(409, "economy_context_required", "Reload this island's economy context.")
    root_action_uid(body.actionUid)
    reply = await wager_service.open_football_bet(
        admin, request.app.state.sports.source, player.id, str(body.economy.islandOwner),
        str(body.economy.runEpoch), body.actionUid, body.fixtureId, body.pick,
        decimal_integer(body.stake),
    )
    return reply.model_dump(mode="json")
