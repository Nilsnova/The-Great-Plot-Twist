"""Market call routes: the Harbor market stall, "Up or down in 5 minutes?" (decision D034).

The rules are in backend/server/market/calls.py, the database part in
supabase/migrations/20261111010000_market_calls.sql. Coins are play money only.

Both routes need a signed-in player (GitHub, email, or a guest admitted with the class code), then
the flag "market" (404 feature_off while it is off). The player id comes from the verified login.
Answers carry `Cache-Control: private, no-store`. POST has a budget of 20 calls a minute per
player, GET one of 60 (per server instance).

GET /api/market/calls
    -> {"assets": [{"id": "harbor-trust", "name": "Bitcoin", "price": 76159.21,
                    "priceAt": "2026-11-11T12:00:00Z", "open": true, "closedReason": null}, ...],
        "calls": [{"id": "6f1c...", "asset": "harbor-trust", "direction": "up", "stake": 10,
                   "openPrice": 76159.21, "openedAt": "2026-11-11T12:00:00Z",
                   "settleAt": "2026-11-11T13:00:00Z", "status": "open",
                   "settlePrice": null, "payout": null}, ...],
        "balance": 90}
    The five assets in this order: harbor-trust (Bitcoin), tidewright-works (Ether),
    greyfathom-salvage (Gold), apple, nvidia. "open" is true while a call can be made (a live
    price now); "closedReason" says why not (for example "weekend", "source_off", "demo",
    "quote_old"). "price" and "priceAt" are null when there is no price. "calls" lists the open
    calls (oldest first), then the 10 newest decided ones; "status" is open, won, lost or refunded.
    Before answering, every open call past settleAt is decided with the price the server reads
    now (the first price at or after settleAt, not the exact price at that second; for a stock
    outside New York hours, the last close). A call with no such price within 24 hours after
    settleAt is refunded.

POST /api/market/calls  {"asset": "harbor-trust", "direction": "up", "stake": 10,
                         "actionUid": "k3j9x2m4q8w1z7a0"}
    -> the new call in the shape of a "calls" entry, plus "balance" (the coins after the stake).
    A repeated actionUid answers the call it made (no second charge). Errors:
      404 no_such_asset       not one of the five assets
      409 insufficient_funds  not enough coins for the stake
      409 market_closed       the asset has no live price right now
      409 too_many_calls      3 calls are open already
      422 bad_stake           the stake is not 5, 10 or 25
      422 validation_error    a missing or extra field, a bad direction or actionUid
      429 too_many_requests   more than 20 calls a minute

Both: 401, 403 demo_closed, 404 feature_off, 502 database_error, 503 database_unavailable (on
POST the outcome is unknown: read GET, then repeat with the SAME actionUid), 503
market_unavailable (the market data files could not be read).

Used by: the market stall card of the Harbor (lane H).
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.auth import PlayerDep
from server.market import calls
from server.market.calls_store import CallRow
from server.market.exchange import MarketDep
from server.routes.market import MarketOnDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()

NO_STORE = "private, no-store"
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
ASSET_PATTERN = r"^[a-z][a-z0-9-]{1,39}$"


class CallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str = Field(pattern=ASSET_PATTERN)
    direction: Literal["up", "down"]
    stake: StrictInt
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class AssetOut(BaseModel):
    id: str
    name: str
    price: float | None
    priceAt: str | None
    open: bool
    closedReason: str | None


class CallOut(BaseModel):
    id: str
    asset: str
    direction: str
    stake: int
    openPrice: float
    openedAt: str
    settleAt: str
    status: Literal["open", "won", "lost", "refunded"]
    settlePrice: float | None
    payout: int | None


class CallsResponse(BaseModel):
    assets: list[AssetOut]
    calls: list[CallOut]
    balance: int


class NewCallResponse(CallOut):
    balance: int


def time_or_none(moment: datetime | None) -> str | None:
    return None if moment is None else format_utc_time(moment)


def call_fields(row: CallRow) -> dict:
    return {
        "id": row.id,
        "asset": row.asset,
        "direction": row.direction,
        "stake": row.stake,
        "openPrice": float(row.open_price),
        "openedAt": format_utc_time(row.opened_at),
        "settleAt": format_utc_time(row.settle_at),
        "status": row.outcome or "open",
        "settlePrice": None if row.settle_price is None else float(row.settle_price),
        "payout": row.payout,
    }


def asset_out(asset: calls.AssetView) -> AssetOut:
    return AssetOut(
        id=asset.id,
        name=asset.name,
        price=None if asset.price is None else float(asset.price),
        priceAt=time_or_none(asset.price_at),
        open=asset.is_open,
        closedReason=asset.closed_reason,
    )


@router.get("/market/calls")
async def get_calls(
    player: PlayerDep,
    market_on: MarketOnDep,
    market: MarketDep,
    admin: AdminDep,
    request: Request,
    response: Response,
) -> CallsResponse:
    request.app.state.call_read_budget.spend(player.id)
    view = await calls.look(admin, market, player.id)
    response.headers["Cache-Control"] = NO_STORE
    return CallsResponse(
        assets=[asset_out(asset) for asset in view.assets],
        calls=[CallOut(**call_fields(row)) for row in view.calls],
        balance=view.balance,
    )


@router.post("/market/calls")
async def post_call(
    body: CallRequest,
    player: PlayerDep,
    market_on: MarketOnDep,
    market: MarketDep,
    admin: AdminDep,
    request: Request,
    response: Response,
) -> NewCallResponse:
    request.app.state.call_budget.spend(player.id)
    row, balance = await calls.open_call(
        admin, market, player.id, body.asset, body.direction, body.stake, body.actionUid
    )
    response.headers["Cache-Control"] = NO_STORE
    return NewCallResponse(**call_fields(row), balance=balance)
