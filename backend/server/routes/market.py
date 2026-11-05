"""Island Exchange routes: the price board, a player's portfolio and trading.

Fictional island companies whose play-money prices follow real markets, amplified. Play money
only: coins cannot be bought, cashed out or exchanged for real prizes, and every answer carries a
line that says so. The rules are in backend/server/market/ (rules.py for prices, trade_rules.py for
trades). The routes only check who is asking and which feature flags are on.

    GET /api/market                 anyone, no sign-in, works even while the flag "market" is off
    GET /api/market/portfolio       signed in; needs the flag "market"
    POST /api/market/trade          signed in; needs the flag "market"

While the flag "market" is off, the two player routes answer 404 feature_off. GET /api/market works
regardless, so the screen can show the prices (it tells the browser in `tradingEnabled`). Then it
only LOOKS: it saves no base, so the market does not start to move before the launch.

GET /api/market
    -> {"companies": [{"id", "name", "ticker", "follows", "tagline",
                       "price", "basePrice", "movePercent",
                       "status": "open" | "halted", "haltedUntil": time or null}, ...],
        "source": "live" | "cache" | "stale" | "replay",   where the real prices come from
        "fetchedAt": "2026-11-05T12:05:00Z",               when those prices are from
        "tradingEnabled": true or false,
        "rules": {...numbers the screen can show...},
        "attribution": "the credit line to show next to the prices",
        "licenceUrl": "https://..." while the replay plays, otherwise null}
    "price" is the game price in coins. "movePercent" is how far it is from "basePrice", the price
    the move is measured from; a company is paused when it reaches 30. A paused company ("halted")
    shows the price it is frozen at and when trading starts again. A pause never sells shares.
    "source" "stale" means Binance is not answering: the prices are old (see "fetchedAt") and
    NOBODY CAN TRADE until they are current again. "replay" only happens in demo mode.
    The answer is cached for 30 seconds ("Cache-Control: public, max-age=30, s-maxage=30"), so the
    address takes no query parameters (422 validation_error): a different address would skip the
    cache. Needs the migration. 503 source_unavailable: Binance has not answered once yet.

GET /api/market/portfolio    (Authorization: Bearer <token>)
    -> {"coins": 940, "positions": [{"companyId", "name", "ticker", "units", "avgPrice", "price",
        "value", "profitPercent", "sellableFrom", "canSellNow", "status"}, ...],
        "totalValue": 62, "boughtToday": 120, "dailyBuyCap": 2000, "source", "fetchedAt"}
    "value" is what the units would bring now before the fee, in whole coins (rounded down).

POST /api/market/trade       (Authorization: Bearer <token>)
    {"companyId": "harbor-trust", "side": "buy" | "sell", "units": 5, "actionUid": "q7x2k9m4"}
    -> {"companyId", "side", "units", "price", "gross", "fee", "coinsChange", "coins",
        "unitsHeld", "avgPrice"}
    The SERVER takes the price from the shared board and works out every coin; the browser sends
    only what the player wants. "actionUid" is made once per click (8 to 64 letters, digits, hyphens
    or underscores) and sent again if the request is repeated: the ledger reference is
    "market:<actionUid>", so a repeat can never trade twice.
    The price is the shared price of that moment, from real prices at most 5 seconds old. It can
    differ from the price on the player's screen, which may be a minute old.
    Errors (standard shape, see errors.py):
      401 unauthorized            no or bad sign-in
      404 feature_off             the flag "market" is off
      404 no_such_company         unknown company id
      409 already_applied         this actionUid was used before; nothing changed, treat as done.
                                  It is the first answer to a repeat, whatever else has changed.
      409 prices_stale            Binance is not answering, so the prices are old; trading is
                                  paused until they are current again. Nothing was changed.
      409 market_halted           the company is paused; try again later
      409 holding_time            shares can be sold 10 minutes after the latest purchase
      409 not_enough_units        selling more than the player holds
      409 daily_buy_cap           2000 coins of shares per market day (08:00 Lisbon time)
      409 insufficient_funds      not enough coins for shares plus fee
      422 validation_error        the request does not fit (a word where a number belongs, ...)
      422 trade_too_small         a trade must be worth at least 1 coin
      422 trade_too_big           a PURCHASE may be worth at most 500 coins (a sale has no limit)
      429 too_many_requests       more than 10 trades in 30 seconds; the Retry-After header says
                                  how many seconds to wait
      503 database_unavailable    the OUTCOME IS UNKNOWN; check the portfolio before trying again

Used by: the game client (the Island Exchange screen) once it exists.
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.auth import PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.market.exchange import (
    Board,
    CompanyQuote,
    MarketDep,
    PositionView,
    TradeOrder,
    TradeReceipt,
)
from server.market.rules import (
    BREAKER_PERCENT,
    CEILING_PERCENT_OF_START,
    FLOOR_PERCENT_OF_START,
    HALT_MINUTES,
    MARKET_DAY_START_HOUR,
    MARKET_TIMEZONE_NAME,
)
from server.market.trade_rules import (
    BUY,
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MAX_UNITS_PER_TRADE,
    MIN_HOLD_MINUTES,
)
from server.settings import Settings, SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

# How long a browser or the Vercel network may reuse the price board.
BOARD_CACHE_SECONDS = 30

# The length limits of an actionUid. With "market:" in front it must fit into a wallet ref (120).
ACTION_UID_MIN_LENGTH = 8
ACTION_UID_MAX_LENGTH = 64

PAUSE_NOTE = "A pause only stops trading. Your shares are not sold, and they stay yours."


def whole_seconds(moment: datetime | None) -> datetime | None:
    """A time without microseconds, so the JSON reads 2026-11-05T12:05:00Z like the contract."""
    return None if moment is None else moment.replace(microsecond=0)


class CompanyOut(BaseModel):
    """One company on the price board."""

    id: str
    name: str
    ticker: str
    follows: str
    tagline: str
    price: float
    basePrice: float  # camelCase on purpose: these are the exact JSON keys the browser reads
    movePercent: float
    status: Literal["open", "halted"]
    haltedUntil: datetime | None


class RulesOut(BaseModel):
    """The numbers of the rules, so the screen never has to guess them."""

    multiplier: int
    feePercent: float
    breakerPercent: int
    haltMinutes: int
    floorPercent: int  # the lowest price, in percent of the START price of the company
    ceilingPercent: int  # the highest price, in percent of the START price of the company
    minHoldMinutes: int
    maxTradeCoins: int
    dailyBuyCapCoins: int
    marketDayStarts: str
    pauseNote: str


class MarketResponse(BaseModel):
    """What GET /api/market returns. It contains no secrets and no player data."""

    companies: list[CompanyOut]
    source: Literal["live", "cache", "stale", "replay"]
    fetchedAt: datetime
    tradingEnabled: bool
    rules: RulesOut
    attribution: str
    licenceUrl: str | None  # the licence text of the replay, while the replay plays


class PositionOut(BaseModel):
    """One thing the signed-in player holds."""

    companyId: str
    name: str
    ticker: str
    units: int
    avgPrice: float
    price: float
    value: int
    profitPercent: float
    sellableFrom: datetime
    canSellNow: bool
    status: Literal["open", "halted"]


class PortfolioResponse(BaseModel):
    """What GET /api/market/portfolio returns."""

    coins: int
    positions: list[PositionOut]
    totalValue: int
    boughtToday: int
    dailyBuyCap: int
    source: Literal["live", "cache", "stale", "replay"]
    fetchedAt: datetime


class TradeRequest(BaseModel):
    """What the browser sends to POST /api/market/trade. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    # Company ids are lowercase letters, digits and hyphens (companies.json).
    companyId: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    side: Literal["buy", "sell"]
    # StrictInt: 5 is fine, but "5" and 5.5 are refused instead of quietly repaired.
    units: StrictInt = Field(ge=1, le=MAX_UNITS_PER_TRADE)
    # Made by the browser once per click. With "market:" in front it becomes the ledger ref.
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class TradeResponse(BaseModel):
    """What POST /api/market/trade returns after a finished trade."""

    companyId: str
    side: Literal["buy", "sell"]
    units: int
    price: float
    gross: int
    fee: int
    coinsChange: int  # a buy: minus (gross + fee). A sell: plus (gross - fee).
    coins: int  # the wallet balance after the trade
    unitsHeld: int  # units of this company held after the trade
    avgPrice: float | None  # None when nothing is left


def require_market_open(settings: Settings) -> None:
    """Trading and portfolios exist only while the flag "market" is on."""
    if not is_enabled("market", settings.flags):
        raise ApiError(404, "feature_off", "The Island Exchange is not open yet.")


def company_out(quote: CompanyQuote) -> CompanyOut:
    company = quote.company
    look = quote.evaluation
    return CompanyOut(
        id=company.id,
        name=company.name,
        ticker=company.ticker,
        follows=company.follows,
        tagline=company.tagline,
        price=float(look.price),
        basePrice=float(look.base.game_price),
        movePercent=float(look.move_percent),
        status="halted" if quote.is_halted else "open",
        haltedUntil=whole_seconds(look.halted_until),
    )


def rules_out(multiplier: int) -> RulesOut:
    return RulesOut(
        multiplier=multiplier,
        feePercent=FEE_BASIS_POINTS / 100,  # 100 basis points are 1 percent
        breakerPercent=int(BREAKER_PERCENT),
        haltMinutes=HALT_MINUTES,
        floorPercent=int(FLOOR_PERCENT_OF_START),
        ceilingPercent=int(CEILING_PERCENT_OF_START),
        minHoldMinutes=MIN_HOLD_MINUTES,
        maxTradeCoins=MAX_TRADE_COINS,
        dailyBuyCapCoins=DAILY_BUY_CAP_COINS,
        marketDayStarts=f"{MARKET_DAY_START_HOUR:02d}:00 {MARKET_TIMEZONE_NAME}",
        pauseNote=PAUSE_NOTE,
    )


def position_out(view: PositionView) -> PositionOut:
    company = view.quote.company
    return PositionOut(
        companyId=company.id,
        name=company.name,
        ticker=company.ticker,
        units=view.row.units,
        avgPrice=float(view.row.avg_price),
        price=float(view.quote.price),
        value=view.value,
        profitPercent=float(view.profit_percent),
        sellableFrom=whole_seconds(view.sellable_from),
        canSellNow=view.can_sell_now,
        status="halted" if view.quote.is_halted else "open",
    )


def trade_response(receipt: TradeReceipt) -> TradeResponse:
    amounts = receipt.amounts
    if receipt.side == BUY:
        coins_change = -amounts.paid_by_player
    else:
        coins_change = amounts.received_by_player
    return TradeResponse(
        companyId=receipt.company.id,
        side=receipt.side,
        units=receipt.units,
        price=float(receipt.price),
        gross=amounts.gross,
        fee=amounts.fee,
        coinsChange=coins_change,
        coins=receipt.balance,
        unitsHeld=receipt.units_after,
        avgPrice=None if receipt.avg_price is None else float(receipt.avg_price),
    )


@router.get("/market")
async def get_market(
    request: Request,
    response: Response,
    settings: SettingsDep,
    market: MarketDep,
    admin: AdminDep,
) -> MarketResponse:
    # The answer is cached by address. A made-up query string would skip the cache, so every
    # request would make the server look again.
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")
    trading_enabled = is_enabled("market", settings.flags)
    board: Board = await market.board(admin, save=trading_enabled)
    response.headers["Cache-Control"] = (
        f"public, max-age={BOARD_CACHE_SECONDS}, s-maxage={BOARD_CACHE_SECONDS}"
    )
    return MarketResponse(
        companies=[company_out(quote) for quote in board.quotes],
        source=board.snapshot.source,
        fetchedAt=whole_seconds(board.snapshot.as_of),
        tradingEnabled=trading_enabled,
        rules=rules_out(market.multiplier),
        attribution=market.feed.attribution(board.snapshot.source),
        licenceUrl=market.feed.licence_url(board.snapshot.source),
    )


@router.get("/market/portfolio")
async def get_portfolio(
    player: PlayerDep, settings: SettingsDep, market: MarketDep, admin: AdminDep
) -> PortfolioResponse:
    require_market_open(settings)
    portfolio = await market.portfolio(admin, player.id)
    positions = [position_out(view) for view in portfolio.positions]
    snapshot = portfolio.board.snapshot
    return PortfolioResponse(
        coins=portfolio.coins,
        positions=positions,
        totalValue=sum(position.value for position in positions),
        boughtToday=portfolio.bought_today,
        dailyBuyCap=DAILY_BUY_CAP_COINS,
        source=snapshot.source,
        fetchedAt=whole_seconds(snapshot.as_of),
    )


@router.post("/market/trade")
async def post_trade(
    request: TradeRequest,
    player: PlayerDep,
    settings: SettingsDep,
    market: MarketDep,
    admin: AdminDep,
) -> TradeResponse:
    require_market_open(settings)
    order = TradeOrder(request.companyId, request.side, request.units, request.actionUid)
    receipt = await market.trade(admin, player.id, order)
    return trade_response(receipt)
