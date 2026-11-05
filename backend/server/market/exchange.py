"""The Island Exchange service: puts the feed, the rules and the database together for the routes.

routes/market.py is thin. It checks who is asking and which feature flags are on, then calls one
of the three methods of MarketService:
  * board()      the price of every company right now (public)
  * trade()      one buy or sell for a signed-in player
  * portfolio()  what a signed-in player holds, with the value of it

How a price is made, in one place:
  1. The feed gives the real prices (live, cache, stale or replay): ONE price per instrument for
     every player. Nobody calls Binance for themselves.
  2. rules.evaluate() turns each real price into a game price, using the base that the database
     remembers for the company. It may decide that a base must be saved: a first look, a new
     market day, a pause that starts or ends, or a new price source.
  3. The new bases are saved with their version number. If another server instance saved first,
     the board reads the bases again and looks once more. So every instance agrees on the base
     and on a pause. (Each instance still prices from its OWN copy of the real prices, so two
     instances can differ by the age of that copy: up to 60 seconds for the board, 5 seconds for
     a trade. The base and the pause are shared; the real price is not.)
  4. While the flag "market" is off, the board is only looked at: it saves nothing, so the market
     does not start to move before the launch.

How a trade is made:
  1. A speed limit per player (limits.py), then a look in the history: a click that was done
     already is answered "already applied", whatever else has changed since.
  2. The price is looked up as above, but from real prices that are at most 5 seconds old
     (feed.py). Old ("stale") prices are refused: a player who watches Binance would know that
     they are out of date. A paused company is refused.
  3. trade_rules works out the whole coins (rounded against the player) and the fee, and the size
     of the trade is checked.
  4. The wallet rules check each coin movement, exactly like every other coin change.
  5. The database function market_trade does the rest in ONE step (see store.py). It checks the
     arithmetic again, so the database stays right even if this file has a bug.

Used by: routes/market.py and app.py (which builds one MarketService per server).
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Annotated

import httpx
from fastapi import Depends, Request

from server.adapters.base import SourceUnavailable
from server.clock import Clock, utc_now
from server.errors import ApiError
from server.market import store
from server.market.companies import CompaniesError, Company, load_companies
from server.market.feed import (
    TRADE_MAX_PRICE_AGE_SECONDS,
    FeedError,
    PriceFeed,
    PriceSnapshot,
    load_replay,
)
from server.market.limits import TradeLimiter
from server.market.rules import (
    DEFAULT_MULTIPLIER,
    Base,
    Evaluation,
    evaluate,
    market_day_start,
    move_percent,
)
from server.market.store import BaseStore, DatabaseBaseStore, MemoryBaseStore, PositionRow
from server.market.trade_rules import (
    BUY,
    DAILY_BUY_CAP_COINS,
    MIN_HOLD_MINUTES,
    TradeAmounts,
    TradeRefused,
    buy_amounts,
    can_sell_now,
    check_trade_size,
    sell_amounts,
    sellable_from,
)
from server.settings import Settings
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

logger = logging.getLogger(__name__)

# The ledger reference of a trade is this text plus the actionUid that the browser made.
REF_PREFIX = "market:"


@dataclass(frozen=True)
class CompanyQuote:
    """One company with its current price."""

    company: Company
    evaluation: Evaluation

    @property
    def price(self) -> Decimal:
        return self.evaluation.price

    @property
    def is_halted(self) -> bool:
        return self.evaluation.halted_until is not None


@dataclass(frozen=True)
class Board:
    """The price of every company, and where the real prices came from."""

    quotes: tuple[CompanyQuote, ...]
    snapshot: PriceSnapshot
    now: datetime

    def find(self, company_id: str) -> CompanyQuote | None:
        for quote in self.quotes:
            if quote.company.id == company_id:
                return quote
        return None


@dataclass(frozen=True)
class TradeOrder:
    """What a player asked for. The route builds it from the checked request."""

    company_id: str
    side: str  # "buy" or "sell"
    units: int
    action_uid: str  # made by the browser once per click; the same again if the click is repeated


@dataclass(frozen=True)
class TradeReceipt:
    """What a finished trade did."""

    company: Company
    side: str
    units: int
    price: Decimal
    amounts: TradeAmounts
    balance: int  # coins after the trade
    units_after: int  # units of this company held after the trade
    avg_price: Decimal | None


@dataclass(frozen=True)
class PositionView:
    """One thing a player holds, with its value now."""

    quote: CompanyQuote
    row: PositionRow
    value: int  # coins the units are worth now, before the fee (rounded down)
    profit_percent: Decimal  # current price against the average price paid
    sellable_from: datetime
    can_sell_now: bool


@dataclass(frozen=True)
class Portfolio:
    """A player's coins and positions."""

    coins: int
    positions: tuple[PositionView, ...]
    bought_today: int
    board: Board


def trade_refusal(reason: str, company: Company, outcome: store.TradeOutcome) -> ApiError:
    """The error for a trade that a rule in the database refused. Nothing was changed."""
    if reason == "halted":
        return TradeRefused(
            409, "market_halted", f"{company.name} is paused right now. Try again in a few minutes."
        )
    if reason == "daily_cap":
        return TradeRefused(
            409,
            "daily_buy_cap",
            f"You can buy at most {DAILY_BUY_CAP_COINS} coins of shares per market day. "
            f"You can still buy {outcome.coins_left} coins today.",
        )
    if reason == "not_enough_units":
        held = outcome.units_held
        return TradeRefused(
            409, "not_enough_units", f"You hold only {held} unit(s) of {company.name}."
        )
    if reason == "holding_time":
        minutes, seconds = divmod(outcome.wait_seconds, 60)
        return TradeRefused(
            409,
            "holding_time",
            f"Shares can be sold {MIN_HOLD_MINUTES} minutes after your latest purchase. "
            f"Wait {minutes} min {seconds} s.",
        )
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree


def prices_not_current() -> TradeRefused:
    """The error for a trade while the real prices are old. Nothing was changed."""
    return TradeRefused(
        409,
        "prices_stale",
        "The live prices are not up to date right now, so trading is paused. "
        "Try again in a moment.",
    )


def amounts_for(side: str, units: int, price: Decimal) -> TradeAmounts:
    """The coins of a trade: a buy is rounded up, a sell is rounded down (trade_rules.py)."""
    if side == BUY:
        return buy_amounts(units, price)
    return sell_amounts(units, price)


def check_coin_moves(side: str, amounts: TradeAmounts, ref: str) -> None:
    """Check each coin movement of the trade with the wallet rules, before the database is asked."""
    if side == BUY:
        validate_transaction(-amounts.gross, "market_buy", ref)
    else:
        validate_transaction(amounts.gross, "market_sell", ref)
    validate_transaction(-amounts.fee, "market_fee", ref)


class MarketService:
    """The Island Exchange for one server. create_app() makes one and keeps it on the app."""

    def __init__(
        self,
        companies: tuple[Company, ...],
        feed: PriceFeed,
        multiplier: int = DEFAULT_MULTIPLIER,
        clock: Clock = utc_now,
        limiter: TradeLimiter | None = None,
    ) -> None:
        self.companies = companies
        self.feed = feed
        self.multiplier = multiplier
        self.clock = clock
        self.limiter = limiter or TradeLimiter(clock=clock)
        # Used when the database is not set up. Keeps the price board working in a demo.
        self.memory_store = MemoryBaseStore()

    def store_for(self, admin: SupabaseAdmin) -> BaseStore:
        if store.database_is_configured(admin):
            return DatabaseBaseStore(admin)
        return self.memory_store

    def evaluate_all(
        self, bases: dict[str, Base], snapshot: PriceSnapshot, now: datetime
    ) -> list[tuple[Company, Evaluation]]:
        """Look at every company with the bases we have."""
        looks = []
        for company in self.companies:
            look = evaluate(
                bases.get(company.id),
                company.start_price,
                snapshot.prices[company.symbol],
                snapshot.kind,
                now,
                self.multiplier,
            )
            looks.append((company, look))
        return looks

    @staticmethod
    async def save_new_bases(
        base_store: BaseStore, looks: list[tuple[Company, Evaluation]]
    ) -> bool:
        """Save every base that changed. False if another instance saved one of them first."""
        every_save_worked = True
        for company, look in looks:
            if look.must_save and not await base_store.save(company.id, look.base):
                every_save_worked = False
        return every_save_worked

    async def board(
        self, admin: SupabaseAdmin, max_price_age: float | None = None, save: bool = True
    ) -> Board:
        """The price of every company now.

        max_price_age  the oldest real prices (in seconds) that are good enough; the default is
                       the feed's 60 seconds. A trade asks for less.
        save           False only looks: nothing is written (the board while the flag is off).
        Saves a new base when the rules say so.
        """
        snapshot = await self.feed.get(max_price_age)
        now = self.clock()
        base_store = self.store_for(admin)
        looks = self.evaluate_all(await base_store.read_all(), snapshot, now)
        if save and not await self.save_new_bases(base_store, looks):
            # Another server instance saved first. Read what it saved and look once more.
            looks = self.evaluate_all(await base_store.read_all(), snapshot, now)
            await self.save_new_bases(base_store, looks)
        quotes = tuple(CompanyQuote(company, look) for company, look in looks)
        return Board(quotes, snapshot, now)

    async def board_for_trade(self, admin: SupabaseAdmin) -> Board:
        """The board with real prices that are fresh enough to trade on (feed.py explains why)."""
        try:
            return await self.board(admin, max_price_age=TRADE_MAX_PRICE_AGE_SECONDS)
        except SourceUnavailable as error:
            raise prices_not_current() from error

    async def trade(self, admin: SupabaseAdmin, player_id: str, order: TradeOrder) -> TradeReceipt:
        """Buy or sell for a player. Raises an ApiError if the rules do not allow it."""
        ref = f"{REF_PREFIX}{order.action_uid}"
        self.limiter.check(player_id)
        if await store.trade_exists(admin, player_id, ref):
            raise AlreadyApplied()

        board = await self.board_for_trade(admin)
        quote = board.find(order.company_id)
        if quote is None:
            raise ApiError(404, "no_such_company", "There is no company with that id.")
        if not board.snapshot.is_tradable:
            raise prices_not_current()
        if quote.is_halted:
            raise trade_refusal("halted", quote.company, store.TradeOutcome(done=False))

        amounts = amounts_for(order.side, order.units, quote.price)
        check_trade_size(order.side, amounts.gross)
        check_coin_moves(order.side, amounts, ref)

        arguments = store.trade_arguments(
            player_id,
            order.company_id,
            order.side,
            order.units,
            quote.price,
            amounts,
            ref,
            market_day_start(board.now),
        )
        outcome = await store.run_trade(admin, arguments)
        if not outcome.done:
            raise trade_refusal(outcome.reason, quote.company, outcome)
        return TradeReceipt(
            quote.company,
            order.side,
            order.units,
            quote.price,
            amounts,
            outcome.balance,
            outcome.units_after,
            outcome.avg_price,
        )

    async def portfolio(self, admin: SupabaseAdmin, player_id: str) -> Portfolio:
        """What the player holds, what it is worth now, and how much they may still buy today."""
        board = await self.board(admin)
        rows = await store.read_positions(admin, player_id)
        coins = await store.read_balance(admin, player_id)
        bought_today = await store.read_bought_today(admin, player_id, market_day_start(board.now))
        positions = []
        for row in rows:
            quote = board.find(row.company_id)
            if quote is not None:  # a company that left the list is not shown
                positions.append(self.view_position(quote, row, board.now))
        return Portfolio(coins, tuple(positions), bought_today, board)

    @staticmethod
    def view_position(quote: CompanyQuote, row: PositionRow, now: datetime) -> PositionView:
        return PositionView(
            quote=quote,
            row=row,
            value=sell_amounts(row.units, quote.price).gross,
            profit_percent=move_percent(quote.price, row.avg_price),
            sellable_from=sellable_from(row.last_buy_at),
            can_sell_now=can_sell_now(row.last_buy_at, now),
        )


def market_from_settings(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
) -> MarketService:
    """Build the real service: the companies file, the replay file and the Binance feed.

    In demo mode the feed never calls Binance and plays the replay. A mistake in either data file
    raises an error here (CompaniesError or FeedError) with a message that says where.
    """
    companies = load_companies()
    symbols = [company.symbol for company in companies]
    if settings.demo_mode:
        logger.warning(
            "Island Exchange in demo mode: the prices are a public recording that anybody can "
            "read in advance. Coins won on them must not count for anything real."
        )
    feed = PriceFeed(
        symbols, load_replay(), transport=transport, clock=clock, live=not settings.demo_mode
    )
    return MarketService(companies, feed, settings.market_multiplier, clock)


def market_or_none(settings: Settings) -> MarketService | None:
    """Like market_from_settings, but a broken data file does not stop the whole server.

    The exchange is a feature that is switched off by default. If its data files cannot be read
    (for example they did not make it into the deployment), the rest of the API must keep working.
    The error goes to the log, and the exchange routes answer 503 market_unavailable.
    """
    try:
        return market_from_settings(settings)
    except (CompaniesError, FeedError) as error:
        logger.error("The Island Exchange cannot start: %s", error)
        return None


def get_market(request: Request) -> MarketService:
    """FastAPI dependency: the service that create_app() stored on the app."""
    market = request.app.state.market
    if market is None:
        raise ApiError(503, "market_unavailable", "The Island Exchange is not available right now.")
    return market


# Write `market: MarketDep` in a route and FastAPI hands you the service.
MarketDep = Annotated[MarketService, Depends(get_market)]
