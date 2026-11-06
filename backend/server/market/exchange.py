"""The Island Exchange service: puts the feed, the rules and the database together for the routes.

routes/market.py is thin. It checks who is asking and which feature flag is on, then calls one of
the four methods of MarketService:
  * board()           every company with its status and price right now (public)
  * portfolio()       a signed-in player's positions with their value now
  * open_position()   one new position for a signed-in player
  * close_position()  one position closed by its player

How a price gets here, in one place
  1. The feed (feed.py) gives one Reading per company: the same price for every player, live from
     Binance or the stock provider, or from the cache. Nobody calls a price service for themselves.
  2. states.py turns each reading and the opening hours (calendars.py) into a status: open, closed,
     stale or unavailable. Only an open company can be traded, and only an open company's price can
     close a position by itself.

How a position is opened (the order is part of the contract in routes/market.py)
  1. A speed limit per player (limits.py), then a look in the history: a click that was done
     already is answered "already applied", whatever else has changed since.
  2. The stake, the company, the delisting and the price source are checked. Then the market must
     be open and the price at most 5 seconds old (fetched again if the cache is older).
  3. The automatic close runs with the prices at hand (sweeps.py). It never fails the trade.
  4. positions.py works out the fee, and the wallet rules check each coin movement.
  5. The database function exchange_open_position() does the rest in ONE step (store_calls.py). It
     checks the arithmetic again, so the database stays right even if this file has a bug.
Closing is the same, with the position read first and the amounts worked out by positions.py.

The Relighting. After it the fee is 1 % and Greyfathom Salvage takes no new positions. This package
does not know when the Relighting happens: MarketService takes `relit_check`, an async function of
the admin client that says yes or no. The default never_relit says no without asking anybody. L3
(the Captain's Table board and the finale) replaces it with a read of its world_state. A check that
fails counts as "not relit" and is logged.

Used by: routes/market.py and app.py (which builds one MarketService per server).
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.market import messages, store
from server.market.board import Snapshot
from server.market.calendars import CalendarError, Calendars, load_calendars
from server.market.companies import CompaniesError, Company, load_companies
from server.market.feed import BOARD_MAX_AGE_SECONDS, TRADE_MAX_AGE_SECONDS, PriceFeed
from server.market.game_day import game_day_start
from server.market.limits import TradeLimiter
from server.market.portfolio import Portfolio, build_portfolio
from server.market.positions import (
    check_price,
    check_stake,
    closing_amounts,
    fee_basis_points,
    fee_for,
)
from server.market.readings import NO_READING, PRICE_MODE_LIVE, PRICE_MODE_REPLAY, Reading
from server.market.replay import ReplayError, load_replay
from server.market.states import CompanyState, company_state
from server.market.stocks import build_stock_source
from server.market.store_calls import (
    CLOSE_REF_PREFIX,
    OPEN_REF_PREFIX,
    close_arguments,
    open_arguments,
    run_close,
    run_open,
)
from server.market.sweeps import sweep
from server.market.trading import (
    CloseOrder,
    CloseReceipt,
    OpenOrder,
    OpenReceipt,
    check_close_coins,
    check_open_coins,
    close_refusal,
    open_refusal,
    refusal_for_state,
)
from server.settings import Settings
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseUnavailable

logger = logging.getLogger(__name__)

# An async function of the admin client: True once the Relighting has happened.
RelitCheck = Callable[[SupabaseAdmin], Awaitable[bool]]


async def never_relit(admin: SupabaseAdmin) -> bool:
    """The default relighting check: the Relighting has not happened. It asks nobody."""
    return False


class MarketService:
    """The Island Exchange for one server. create_app() makes one and keeps it on the app."""

    def __init__(
        self,
        companies: tuple[Company, ...],
        calendars: Calendars,
        feed: PriceFeed,
        *,
        clock: Clock = utc_now,
        limiter: TradeLimiter | None = None,
        relit_check: RelitCheck = never_relit,
    ) -> None:
        self.companies = tuple(companies)
        self.calendars = calendars
        self.feed = feed
        self.clock = clock
        self.limiter = limiter or TradeLimiter(clock=clock)
        self.relit_check = relit_check

    @property
    def demo_mode(self) -> bool:
        """True while the recording plays (the feed never calls anybody)."""
        return not self.feed.live

    @property
    def price_mode(self) -> str:
        """The kind of prices a position opened now is stored with (rule R20)."""
        return PRICE_MODE_REPLAY if self.demo_mode else PRICE_MODE_LIVE

    def find_company(self, company_id: str) -> Company | None:
        for company in self.companies:
            if company.id == company_id:
                return company
        return None

    def is_priced_here(self, company: Company) -> bool:
        """True if a price source is on for this company (a stock needs the stock source)."""
        return self.feed.source_is_on(company) and not (company.is_stock and self.demo_mode)

    async def is_relit(self, admin: SupabaseAdmin) -> bool:
        """Has the Relighting happened? A check that fails counts as "not relit"."""
        try:
            return bool(await self.relit_check(admin))
        except Exception as error:  # on purpose: a broken check must not stop the Exchange
            logger.warning(
                "The Relighting check failed, counted as not relit: %s", type(error).__name__
            )
            return False

    # --- looking at the companies ---

    def state_of(
        self,
        company: Company,
        reading: Reading,
        now: datetime,
        relit: bool,
        trading_enabled: bool,
    ) -> CompanyState:
        session = self.calendars.session_at(company.market, now)
        return company_state(
            company,
            reading,
            session,
            source_on=self.feed.source_is_on(company),
            demo_mode=self.demo_mode,
            relit=relit,
            trading_enabled=trading_enabled,
        )

    async def snapshot(
        self,
        admin: SupabaseAdmin,
        *,
        trading_enabled: bool,
        max_age_seconds: float = BOARD_MAX_AGE_SECONDS,
    ) -> Snapshot:
        """The state of every company now, from prices at most `max_age_seconds` old."""
        relit = await self.is_relit(admin)
        readings = await self.feed.read(max_age_seconds)
        now = self.clock()
        states = tuple(
            self.state_of(
                company, readings.get(company.id, NO_READING), now, relit, trading_enabled
            )
            for company in self.companies
        )
        return Snapshot(states, now, relit, trading_enabled, self.demo_mode)

    async def board(self, admin: SupabaseAdmin, *, trading_enabled: bool) -> Snapshot:
        """The price board. While the flag is off it only looks: no sweep runs."""
        snapshot = await self.snapshot(admin, trading_enabled=trading_enabled)
        if trading_enabled:
            await sweep(admin, snapshot.states, None)
        return snapshot

    async def sweep_all(self, admin: SupabaseAdmin) -> None:
        """The automatic close for all players, with the prices of the board. Never raises."""
        snapshot = await self.snapshot(admin, trading_enabled=True)
        await sweep(admin, snapshot.states, None)

    async def portfolio(self, admin: SupabaseAdmin, player_id: str) -> Portfolio:
        """The player's positions and what they are worth now. Their sweep runs first."""
        snapshot = await self.snapshot(admin, trading_enabled=True)
        await sweep(admin, snapshot.states, player_id)
        return build_portfolio(
            coins=await store.read_balance(admin, player_id),
            open_rows=await store.read_open_positions(admin, player_id),
            closed_rows=await store.read_recently_closed(admin, player_id),
            staked_today=await store.read_staked_since(
                admin, player_id, game_day_start(snapshot.now)
            ),
            snapshot=snapshot,
            price_mode=self.price_mode,
        )

    # --- trading ---

    async def fresh_state(self, company: Company, relit: bool) -> CompanyState:
        """The company with a price at most 5 seconds old. Raises the 409 that says why not.

        A closed market is refused before anybody is asked for a price.
        """
        session = self.calendars.session_at(company.market, self.clock())
        if not session.is_open:
            raise messages.market_closed(company, self.calendars, session)
        readings = await self.feed.read(TRADE_MAX_AGE_SECONDS, only=company)
        state = self.state_of(company, readings[company.id], self.clock(), relit, True)
        refusal = refusal_for_state(state, self.calendars)
        if refusal is not None:
            raise refusal
        return state

    async def refuse_repeat(self, admin: SupabaseAdmin, player_id: str, ref: str) -> None:
        """A click that was done already is answered "already applied", before anything else."""
        if await store.event_exists(admin, player_id, ref):
            raise AlreadyApplied()

    async def open_position(
        self, admin: SupabaseAdmin, player_id: str, order: OpenOrder
    ) -> OpenReceipt:
        """Open a position for a player. Raises an ApiError if the rules do not allow it."""
        ref = f"{OPEN_REF_PREFIX}{order.action_uid}"
        self.limiter.check(player_id)
        await self.refuse_repeat(admin, player_id, ref)
        check_stake(order.stake)
        company = self.find_company(order.company_id)
        if company is None:
            raise messages.no_such_company()
        relit = await self.is_relit(admin)
        if company.delist_at_relighting and relit:
            raise messages.company_delisted(company)
        if not self.is_priced_here(company):
            raise messages.company_unavailable(company.name)
        state = await self.fresh_state(company, relit)
        await self.sweep_all(admin)
        return await self.run_opening(admin, player_id, order, ref, state, relit)

    async def run_opening(
        self,
        admin: SupabaseAdmin,
        player_id: str,
        order: OpenOrder,
        ref: str,
        state: CompanyState,
        relit: bool,
    ) -> OpenReceipt:
        basis_points = fee_basis_points(relit)
        fee = fee_for(order.stake, basis_points)
        check_open_coins(order.stake, fee, ref)
        entry = state.reading.price
        check_price(entry)
        arguments = open_arguments(
            player_id,
            state.company.id,
            order.side,
            state.reading.price_mode,
            entry,
            order.stake,
            fee,
            basis_points,
            ref,
            game_day_start(self.clock()),
        )
        try:
            outcome = await run_open(admin, arguments)
        except SupabaseUnavailable as error:
            raise messages.outcome_unknown() from error
        if not outcome.done:
            raise open_refusal(outcome)
        return OpenReceipt(
            position_id=outcome.position_id,
            company=state.company,
            side=order.side,
            stake=order.stake,
            fee=fee,
            coins_change=-(order.stake + fee),
            balance=outcome.balance,
            entry_price=entry,
            zero_price=outcome.zero_price,
            fee_basis_points=basis_points,
            opened_at=outcome.opened_at,
        )

    async def close_position(
        self, admin: SupabaseAdmin, player_id: str, order: CloseOrder
    ) -> CloseReceipt:
        """Close a player's position at the price of now. Raises an ApiError if it cannot be."""
        ref = f"{CLOSE_REF_PREFIX}{order.action_uid}"
        self.limiter.check(player_id)
        await self.refuse_repeat(admin, player_id, ref)
        row = await store.read_position(admin, player_id, order.position_id)
        if row is None:
            raise messages.no_such_position()
        if not row.is_open:
            raise messages.position_closed(row.status, row.closed_at)
        company = self.find_company(row.company_id)
        if company is None or not self.is_priced_here(company):
            raise messages.company_unavailable(row.company_id if company is None else company.name)
        if row.price_mode != self.price_mode:
            raise messages.wrong_price_mode(row.price_mode)
        relit = await self.is_relit(admin)
        state = await self.fresh_state(company, relit)
        receipt = await self.run_closing(admin, player_id, ref, row, state, relit)
        await self.sweep_all(admin)
        return receipt

    async def run_closing(
        self,
        admin: SupabaseAdmin,
        player_id: str,
        ref: str,
        row: store.PositionRow,
        state: CompanyState,
        relit: bool,
    ) -> CloseReceipt:
        basis_points = fee_basis_points(relit)
        price = state.reading.price
        check_price(price)
        closing = closing_amounts(row.side, row.stake, row.entry_price, price, basis_points)
        check_close_coins(closing, ref)
        # The mode sent is the mode of the PRICE, not the one stored with the position. The database
        # compares the two (rule R20), so it can still refuse if a bug here ever pays a position
        # at the wrong kind of price.
        arguments = close_arguments(
            player_id, row.id, state.reading.price_mode, price, closing, basis_points, ref
        )
        try:
            outcome = await run_close(admin, arguments)
        except SupabaseUnavailable as error:
            raise messages.outcome_unknown() from error
        if not outcome.done:
            raise close_refusal(outcome, row)
        return CloseReceipt(
            position_id=row.id,
            closed_as=outcome.closed_as,
            close_price=price,
            value=outcome.value,
            fee=outcome.fee,
            coins_change=outcome.coins_change,
            balance=outcome.balance,
            closed_at=outcome.closed_at,
        )


def market_from_settings(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
    stock_transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
    relit_check: RelitCheck = never_relit,
) -> MarketService:
    """Build the real service: the data files, the Binance feed and (if set up) the stock source.

    In demo mode the feed never calls Binance and plays the recording, and the stock source is
    never built. A mistake in a data file raises an error here (CompaniesError, CalendarError or
    ReplayError) with a message that says where. An unknown STOCK_API_PROVIDER raises
    StockSourceError, which stops the server on purpose.
    """
    calendars = load_calendars()
    companies = load_companies(market_ids=set(calendars.markets))
    replay = load_replay()
    stocks = None
    if settings.demo_mode:
        logger.warning(
            "Island Exchange in demo mode: the prices are a public recording that anybody can "
            "read in advance. Coins won on them must not count for anything real."
        )
    else:
        key = settings.stock_api_key.get_secret_value()
        stocks = build_stock_source(
            settings.stock_api_provider, key, transport=stock_transport, clock=clock
        )
    feed = PriceFeed(
        companies,
        calendars,
        replay,
        stocks=stocks,
        transport=transport,
        clock=clock,
        live=not settings.demo_mode,
    )
    return MarketService(companies, calendars, feed, clock=clock, relit_check=relit_check)


def market_or_none(settings: Settings) -> MarketService | None:
    """Like market_from_settings, but a broken data file does not stop the whole server.

    The exchange is a feature that is switched off by default. If its data files cannot be read
    (for example they did not make it into the deployment), the rest of the API must keep working.
    The error goes to the log, and the exchange routes answer 503 market_unavailable.
    """
    try:
        return market_from_settings(settings)
    except (CompaniesError, CalendarError, ReplayError) as error:
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
