"""Island Exchange routes: the price board, a player's portfolio, and opening and closing positions.

Real companies at real prices, one to one. Every investment is a position: a stake of coins at 10x,
rising or falling. A position whose stake is used up (the price moved 10 % against it) closes by
itself at zero. Play money only: coins cannot be bought, cashed out or exchanged for real prizes,
and every board carries a line that says so. The rules are in backend/server/market/ (positions.py
for the money, states.py for the status of a company). The routes only check who is asking and
which feature flag is on.

    GET  /api/market             anyone, no sign-in, works even while the flag "market" is off
    GET  /api/market/portfolio   signed in; needs the flag "market"
    POST /api/market/open        signed in; needs the flag "market"
    POST /api/market/close       signed in; needs the flag "market"

While the flag "market" is off, the three player routes answer 404 feature_off. GET /api/market
works regardless, so the screen can show the prices (`tradingEnabled` says whether it can trade).
Then it only LOOKS: it runs no automatic close.

All JSON is camelCase. Times are UTC with whole seconds ("2026-11-06T12:05:00Z"). Prices are JSON
numbers, coins are whole numbers. All numbers are worked out by the server: the screen does no
arithmetic.

GET /api/market
    -> {"generatedAt", "demo", "demoNote" (text or null), "tradingEnabled", "relit",
        "companies": [{"id", "name", "ticker", "kind": "island" | "stock", "follows", "market",
                       "marketName", "currency", "priceDecimals", "tagline",
                       "price", "priceAt", "source": "live" | "cache" | "stale" | "replay" | "none",
                       "status": "open" | "closed" | "stale" | "unavailable", "reason",
                       "holiday", "opensAt", "closesAt", "delisted", "canOpen", "canClose",
                       "zeroPrices": {"rising", "falling"} or null}, ...],
        "rules": {"leverage", "zeroPointMovePercent", "feePercent", "minStake", "maxStake",
                  "dailyStakeCap", "maxOpenPositions", "stakeChoices": [{"stake", "fee", "total"}],
                  "tradePriceMaxAgeSeconds", "tradesPer30Seconds", "gameDayStarts"},
        "credits": [{"text", "href", "licenceText", "licenceHref"}, ...],
        "simulationNote"}
    Companies: the island companies in file order, then the stocks. Stocks appear only while the
    stock source is on and the server is not in demo mode. "price" is the real price; "priceAt" is
    when it was quoted (for an island company the time we fetched it); "source" says where it came
    from. A company that cannot be priced or traded says why with "status" and "reason":
      open         tradable
      closed       its market is closed (weekend, holiday, outside_hours, no_calendar). It shows its
                   last price and "opensAt" (null if that lies beyond the calendar). No trades, and
                   no position is closed by itself.
      stale        the price cannot be trusted now (source_away, waiting_first_price, quote_old)
      unavailable  no price at all (no_price, source_off, not_in_recording)
    "zeroPrices" is an estimate at the board price, given only for open companies: the real zero
    point comes from the price at the moment of opening. "delisted" (after the Relighting) means
    no new positions; existing ones can still be closed. The answer is cached for 30 seconds
    ("Cache-Control: public, max-age=30, s-maxage=30"), so the address takes no query parameters
    (422 validation_error): a different address would skip the cache. The board answers 200
    whenever the data files loaded. A price problem is a status of a company, never a 503.

GET /api/market/portfolio    (Authorization: Bearer <token>)
    -> {"coins", "demo", "feePercent", "stakedToday", "dailyStakeCap", "openCount",
        "maxOpenPositions",
        "positions": [{"id", "companyId", "name", "ticker", "follows", "currency", "priceDecimals",
                       "side", "mode", "stake", "openFee", "entryPrice", "zeroPrice", "openedAt",
                       "price", "priceAt", "companyStatus", "companyReason", "opensAt", "value",
                       "profit", "profitPercent", "closeFee", "wouldReceive", "result",
                       "canClose"}, ...],
        "recentlyClosed": [{"id", "companyId", "name", "currency", "priceDecimals", "side", "mode",
                            "stake", "openFee", "entryPrice", "zeroPrice", "openedAt",
                            "closedAs": "closed" | "zeroed", "closePrice", "closedAt", "value",
                            "closeFee", "coinsChange", "result"}, ...],
        "generatedAt"}
    "currency" and "priceDecimals" say how to show the prices of a position, as on the board, so a
    position needs no board to be shown. For a position whose company is no longer in
    companies.json, "ticker", "follows", "currency" and "priceDecimals" are null and "name" is the
    company id.
    "positions" are the open positions, newest first (at most 20). Values are at the current price,
    or at the last price when "companyStatus" is closed or stale (then "canClose" is false).
    "value" is what the position is worth now before the closing fee (whole coins, rounded down,
    never below 0), "wouldReceive" what closing it now would pay, "result" what the whole position
    has made with both fees counted. A position with no price at all ("companyStatus"
    "unavailable": no price yet, the company left the file, or it was opened on the other kind of
    prices, "companyReason" wrong_price_mode) has price, value, profit, profitPercent, closeFee,
    wouldReceive and result null, and cannot be closed. "recentlyClosed" are the 10 newest. Before
    reading, the automatic close runs for this player. "Cache-Control: no-store". No query
    parameters.

POST /api/market/open       (Authorization: Bearer <token>)
    {"companyId": "harbor-trust", "side": "rising" | "falling", "stake": 100,
     "actionUid": "5d2c9f7e-3b1a-4c8e-9f20-6a7b8c9d0e1f"}
    -> {"positionId", "companyId", "side", "stake", "fee", "coinsChange", "coins", "entryPrice",
        "zeroPrice", "feePercent", "openedAt"}
    The browser never sends a price. The SERVER takes the price from the shared board, from a price
    at most 5 seconds old, and works out every coin. "actionUid" is made once per click (8 to 64
    letters, digits, hyphens or underscores) and sent again if the request is repeated: the ledger
    reference is "market:open:<actionUid>", so a repeat can never open twice. The price can differ
    from the price on the player's screen, which may be a minute old (no price protection).

POST /api/market/close      (Authorization: Bearer <token>)
    {"positionId": "<uuid>", "actionUid": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}
    -> {"positionId", "closedAs": "closed" | "zeroed", "closePrice", "value", "fee",
        "coinsChange", "coins", "closedAt"}
    A close that finds the position used up answers 200 with "closedAs": "zeroed" and 0 coins. The
    ledger reference is "market:close:<actionUid>". A company that was delisted can still be closed.

The order of the checks of an opening (a closing is the same, with the position read first):
    1 sign-in (401)  2 the flag (404 feature_off)  3 the request (422)  4 the speed limit (429)
    5 a REPEAT (409 already_applied), before anything else that could have changed  6 the stake
    (422)  7 the company (404)  8 delisted (409)  9 the price source (409 company_unavailable)
    10 the market is open and the price fresh (409 market_closed or prices_stale)  11 the automatic
    close, which never fails the trade  12 the wallet rules  13 the database

Errors (standard shape, see errors.py):
      401 unauthorized            no or bad sign-in
      404 feature_off             the flag "market" is off
      404 no_such_company         unknown company id
      404 no_such_position        close: no position with that id for this player
      409 already_applied         this actionUid was used before; nothing changed, treat as done
      409 market_closed           a stock's market is closed; the message says when it opens
      409 prices_stale            the price is not up to date, so trading is paused; try again
      409 company_unavailable     the company has no connected price source (or is a stock in demo)
      409 company_delisted        open: Greyfathom Salvage after the Relighting
      409 daily_stake_cap         open: 2000 coins of new stakes per game day (from 08:00 Lisbon)
      409 too_many_positions      open: at most 20 open positions
      409 insufficient_funds      open: not enough coins for the stake and its fee
      409 position_closed         close: the position is closed already; says how and when
      409 wrong_price_mode        close: opened on live prices but closed in demo mode, or back
      422 validation_error        the request does not fit (a word where a number belongs, ...)
      422 stake_too_small         open: a stake needs at least 10 coins
      422 stake_too_big           open: a stake can be at most 500 coins
      429 too_many_requests       more than 10 trades in 30 seconds; Retry-After says how long
      502 database_error          the database refused the numbers, or refused in a way we do not
                                  know (nothing changed)
      503 database_unavailable    the OUTCOME IS UNKNOWN: no answer in time, or an answer to an
                                  opening or closing that is not a refusal and cannot be read (the
                                  coins may have moved); check the portfolio before trying again
      503 database_not_configured the server has no database settings
      503 market_unavailable      a data file could not be read at start-up

Used by: the game client (the Island Exchange panel).
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.auth import PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.market import messages
from server.market.board import credits_block, rules_block
from server.market.exchange import MarketDep, MarketService
from server.market.portfolio import ClosedView, PositionView
from server.market.positions import (
    DAILY_STAKE_CAP_COINS,
    FALLING,
    MAX_OPEN_POSITIONS,
    RISING,
    profit,
    profit_percent,
    zero_price,
)
from server.market.states import CompanyState
from server.market.trading import CloseOrder, CloseReceipt, OpenOrder, OpenReceipt
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

# How long a browser or the Vercel network may reuse the price board.
BOARD_CACHE_SECONDS = 30

# The length limits of an actionUid. With "market:close:" in front it must fit into a wallet ref.
ACTION_UID_MIN_LENGTH = 8
ACTION_UID_MAX_LENGTH = 64

MAX_STAKE_IN_REQUEST = 1_000_000  # only a sanity limit: the rule check says too small or too big


def seconds(moment: datetime | None) -> datetime | None:
    """A time in UTC without microseconds, so the JSON reads 2026-11-06T12:05:00Z."""
    return None if moment is None else moment.astimezone(UTC).replace(microsecond=0)


def number(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


# --- what the browser sends ---


class OpenRequest(BaseModel):
    """What the browser sends to POST /api/market/open. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    # Company ids are lowercase letters, digits and hyphens (companies.json).
    companyId: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9-]+$")
    side: Literal["rising", "falling"]
    # StrictInt: 100 is fine, but "100" and 100.5 are refused instead of quietly repaired. The
    # rule check then says stake_too_small or stake_too_big.
    stake: StrictInt = Field(ge=1, le=MAX_STAKE_IN_REQUEST)
    # Made by the browser once per click. With "market:open:" in front it becomes the ledger ref.
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class CloseRequest(BaseModel):
    """What the browser sends to POST /api/market/close. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    positionId: UUID
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


# --- what GET /api/market sends ---


class ZeroPricesOut(BaseModel):
    rising: float
    falling: float


class CompanyOut(BaseModel):
    """One company on the price board."""

    id: str
    name: str
    ticker: str
    kind: Literal["island", "stock"]
    follows: str
    market: str
    marketName: str
    currency: str
    priceDecimals: int
    tagline: str
    price: float | None
    priceAt: datetime | None
    source: Literal["live", "cache", "stale", "replay", "none"]
    status: Literal["open", "closed", "stale", "unavailable"]
    reason: str | None
    holiday: str | None
    opensAt: datetime | None
    closesAt: datetime | None
    delisted: bool
    canOpen: bool
    canClose: bool
    zeroPrices: ZeroPricesOut | None


class StakeChoiceOut(BaseModel):
    stake: int
    fee: int
    total: int


class RulesOut(BaseModel):
    """The numbers of the rules, so the screen never has to guess them."""

    leverage: int
    zeroPointMovePercent: int
    feePercent: float
    minStake: int
    maxStake: int
    dailyStakeCap: int
    maxOpenPositions: int
    stakeChoices: list[StakeChoiceOut]
    tradePriceMaxAgeSeconds: int
    tradesPer30Seconds: int
    gameDayStarts: str


class CreditOut(BaseModel):
    text: str
    href: str | None
    licenceText: str | None
    licenceHref: str | None


class MarketResponse(BaseModel):
    """What GET /api/market returns. It contains no secrets and no player data."""

    generatedAt: datetime
    demo: bool
    demoNote: str | None
    tradingEnabled: bool
    relit: bool
    companies: list[CompanyOut]
    rules: RulesOut
    credits: list[CreditOut]
    simulationNote: str


# --- what GET /api/market/portfolio sends ---


class PositionOut(BaseModel):
    """One open position of the signed-in player."""

    id: str
    companyId: str
    name: str
    ticker: str | None
    follows: str | None
    currency: str | None
    priceDecimals: int | None
    side: Literal["rising", "falling"]
    mode: Literal["live", "replay"]
    stake: int
    openFee: int
    entryPrice: float
    zeroPrice: float
    openedAt: datetime
    price: float | None
    priceAt: datetime | None
    companyStatus: Literal["open", "closed", "stale", "unavailable"]
    companyReason: str | None
    opensAt: datetime | None
    value: int | None
    profit: int | None
    profitPercent: float | None
    closeFee: int | None
    wouldReceive: int | None
    result: int | None
    canClose: bool


class ClosedPositionOut(BaseModel):
    """One position that was closed by the player or used up."""

    id: str
    companyId: str
    name: str
    currency: str | None
    priceDecimals: int | None
    side: Literal["rising", "falling"]
    mode: Literal["live", "replay"]
    stake: int
    openFee: int
    entryPrice: float
    zeroPrice: float
    openedAt: datetime
    closedAs: Literal["closed", "zeroed"]
    closePrice: float
    closedAt: datetime
    value: int
    closeFee: int
    coinsChange: int
    result: int


class PortfolioResponse(BaseModel):
    """What GET /api/market/portfolio returns."""

    coins: int
    demo: bool
    feePercent: float
    stakedToday: int
    dailyStakeCap: int
    openCount: int
    maxOpenPositions: int
    positions: list[PositionOut]
    recentlyClosed: list[ClosedPositionOut]
    generatedAt: datetime


# --- what the two trades send ---


class OpenResponse(BaseModel):
    """What POST /api/market/open returns after a finished opening."""

    positionId: str
    companyId: str
    side: Literal["rising", "falling"]
    stake: int
    fee: int
    coinsChange: int  # minus (stake + fee)
    coins: int  # the wallet balance after the opening
    entryPrice: float
    zeroPrice: float
    feePercent: float
    openedAt: datetime


class CloseResponse(BaseModel):
    """What POST /api/market/close returns after a finished closing."""

    positionId: str
    closedAs: Literal["closed", "zeroed"]
    closePrice: float
    value: int
    fee: int
    coinsChange: int  # plus (value - fee), 0 or more
    coins: int  # the wallet balance after the closing
    closedAt: datetime


# --- the checks every player route makes ---


def require_market_on(settings: SettingsDep) -> bool:
    """The portfolio and the trades exist only while the flag "market" is on."""
    if not is_enabled("market", settings.flags):
        raise messages.feature_off()
    return True


# Write `market_on: MarketOnDep` after `player: PlayerDep`: sign-in is checked first, then the flag.
MarketOnDep = Annotated[bool, Depends(require_market_on)]


# --- building the answers ---


def company_out(state: CompanyState, market: MarketService) -> CompanyOut:
    company = state.company
    reading = state.reading
    session = state.session
    zero_prices = None
    if state.is_open:
        zero_prices = ZeroPricesOut(
            rising=float(zero_price(RISING, reading.price)),
            falling=float(zero_price(FALLING, reading.price)),
        )
    return CompanyOut(
        id=company.id,
        name=company.name,
        ticker=company.ticker,
        kind=company.kind,
        follows=company.follows,
        market=company.market,
        marketName=market.calendars.market_name(company.market),
        currency=company.currency,
        priceDecimals=company.price_decimals,
        tagline=company.tagline,
        price=number(reading.price),
        priceAt=seconds(reading.quoted_at),
        source=reading.source,
        status=state.status,
        reason=state.reason,
        holiday=session.holiday,
        opensAt=None if session.is_open else seconds(session.opens_at),
        closesAt=seconds(session.closes_at),
        delisted=state.delisted,
        canOpen=state.can_open,
        canClose=state.can_close,
        zeroPrices=zero_prices,
    )


def position_out(view: PositionView) -> PositionOut:
    row = view.row
    company = view.company
    closing = view.closing
    return PositionOut(
        id=row.id,
        companyId=row.company_id,
        name=row.company_id if company is None else company.name,
        ticker=None if company is None else company.ticker,
        follows=None if company is None else company.follows,
        currency=None if company is None else company.currency,
        priceDecimals=None if company is None else company.price_decimals,
        side=row.side,
        mode=row.price_mode,
        stake=row.stake,
        openFee=row.open_fee,
        entryPrice=float(row.entry_price),
        zeroPrice=float(row.zero_price),
        openedAt=seconds(row.opened_at),
        price=number(view.price),
        priceAt=seconds(view.price_at),
        companyStatus=view.company_status,
        companyReason=view.company_reason,
        opensAt=seconds(view.opens_at),
        value=None if closing is None else closing.value,
        profit=None if closing is None else profit(closing.value, row.stake),
        profitPercent=None if closing is None else float(profit_percent(closing.value, row.stake)),
        closeFee=None if closing is None else closing.fee,
        wouldReceive=None if closing is None else closing.coins_change,
        result=view.result,
        canClose=view.can_close,
    )


def closed_position_out(view: ClosedView) -> ClosedPositionOut:
    row = view.row
    return ClosedPositionOut(
        id=row.id,
        companyId=row.company_id,
        name=row.company_id if view.company is None else view.company.name,
        currency=None if view.company is None else view.company.currency,
        priceDecimals=None if view.company is None else view.company.price_decimals,
        side=row.side,
        mode=row.price_mode,
        stake=row.stake,
        openFee=row.open_fee,
        entryPrice=float(row.entry_price),
        zeroPrice=float(row.zero_price),
        openedAt=seconds(row.opened_at),
        closedAs=row.status,
        closePrice=float(row.close_price),
        closedAt=seconds(row.closed_at),
        value=row.close_value or 0,
        closeFee=row.close_fee or 0,
        coinsChange=view.coins_change,
        result=view.result,
    )


def open_response(receipt: OpenReceipt) -> OpenResponse:
    return OpenResponse(
        positionId=receipt.position_id,
        companyId=receipt.company.id,
        side=receipt.side,
        stake=receipt.stake,
        fee=receipt.fee,
        coinsChange=receipt.coins_change,
        coins=receipt.balance,
        entryPrice=float(receipt.entry_price),
        zeroPrice=float(receipt.zero_price),
        feePercent=receipt.fee_basis_points / 100,  # 100 basis points are 1 percent
        openedAt=seconds(receipt.opened_at),
    )


def close_response(receipt: CloseReceipt) -> CloseResponse:
    return CloseResponse(
        positionId=receipt.position_id,
        closedAs=receipt.closed_as,
        closePrice=float(receipt.close_price),
        value=receipt.value,
        fee=receipt.fee,
        coinsChange=receipt.coins_change,
        coins=receipt.balance,
        closedAt=seconds(receipt.closed_at),
    )


def refuse_query_parameters(request: Request) -> None:
    """The answers are cached or built per player by address, so a made-up query is refused."""
    if request.query_params:
        raise ApiError(422, "validation_error", "This address takes no query parameters.")


# --- the four routes ---


@router.get("/market")
async def get_board(
    request: Request,
    response: Response,
    settings: SettingsDep,
    market: MarketDep,
    admin: AdminDep,
) -> MarketResponse:
    refuse_query_parameters(request)
    trading_enabled = is_enabled("market", settings.flags)
    snapshot = await market.board(admin, trading_enabled=trading_enabled)
    response.headers["Cache-Control"] = (
        f"public, max-age={BOARD_CACHE_SECONDS}, s-maxage={BOARD_CACHE_SECONDS}"
    )
    replay = market.feed.replay
    return MarketResponse(
        generatedAt=seconds(snapshot.now),
        demo=snapshot.demo_mode,
        demoNote=messages.demo_note(replay.credit, replay.recorded_on)
        if snapshot.demo_mode
        else None,
        tradingEnabled=trading_enabled,
        relit=snapshot.relit,
        companies=[company_out(state, market) for state in snapshot.listed],
        rules=RulesOut(**rules_block(snapshot.relit)),
        credits=[CreditOut(**credit) for credit in credits_block(market.feed)],
        simulationNote=messages.SIMULATION_NOTE,
    )


@router.get("/market/portfolio")
async def get_portfolio(
    request: Request,
    response: Response,
    player: PlayerDep,
    market_on: MarketOnDep,
    market: MarketDep,
    admin: AdminDep,
) -> PortfolioResponse:
    refuse_query_parameters(request)
    portfolio = await market.portfolio(admin, player.id)
    snapshot = portfolio.snapshot
    response.headers["Cache-Control"] = "no-store"
    return PortfolioResponse(
        coins=portfolio.coins,
        demo=snapshot.demo_mode,
        feePercent=snapshot.basis_points / 100,  # 100 basis points are 1 percent
        stakedToday=portfolio.staked_today,
        dailyStakeCap=DAILY_STAKE_CAP_COINS,
        openCount=len(portfolio.positions),
        maxOpenPositions=MAX_OPEN_POSITIONS,
        positions=[position_out(view) for view in portfolio.positions],
        recentlyClosed=[closed_position_out(view) for view in portfolio.recently_closed],
        generatedAt=seconds(snapshot.now),
    )


@router.post("/market/open")
async def post_open(
    request: OpenRequest,
    player: PlayerDep,
    market_on: MarketOnDep,
    market: MarketDep,
    admin: AdminDep,
) -> OpenResponse:
    order = OpenOrder(request.companyId, request.side, request.stake, request.actionUid)
    return open_response(await market.open_position(admin, player.id, order))


@router.post("/market/close")
async def post_close(
    request: CloseRequest,
    player: PlayerDep,
    market_on: MarketOnDep,
    market: MarketDep,
    admin: AdminDep,
) -> CloseResponse:
    order = CloseOrder(str(request.positionId), request.actionUid)
    return close_response(await market.close_position(admin, player.id, order))
