"""The caches and the freshness of every price behind the Island Exchange.

The feed answers one question for the rest of the Exchange: "what is the price of each company
right now, and how fresh is it?". The answer is a Reading per company (readings.py). The feed
never raises because a price source fails: a company without a fresh price simply gets an older
reading marked "stale", or none at all. What that means for the board is decided in states.py.

Two sources, each with its own cache that lives in memory, once per server instance:

  Island companies  Binance, one request for all seven pairs (binance.py), no key.
  Stock companies   a stock provider (stocks.py), one call per share, sent together.

How old a price may be (the caller says so with max_age_seconds)
  * The price board accepts prices up to 60 seconds old. So one server instance asks a source at
    most once a minute while nobody trades, however many players look.
  * A TRADE accepts only prices younger than 5 seconds. If the cache is older, the trade asks again
    first, and only for the traded company's source (a stock trade asks for its own symbol only).
    A rush of players at the same moment still causes one request, because they wait on the same
    lock and find the answer in the cache.
  * Quote time. A Binance answer has no time, so a Binance price is quoted when we fetched it. A
    stock quote has the provider's own time.

When a source fails (any error, a timeout, a 429, an answer we cannot read)
  * Binance is asked again 10 seconds later, a stock provider 30 seconds later.
  * The old prices stay, marked "stale" with their own time, for as long as the source stays away.
    NOBODY CAN TRADE ON THEM and no position is closed by them (states.py).
  * A source that has never answered gives no reading at all ("no price yet").
  * The recorded replay NEVER plays as a stand-in in live mode (replay.py explains why).

Stocks and opening hours (calendars.py)
  * While a stock's market is open its price is refreshed like any other.
  * While it is closed nothing changes, so nothing is asked once the instance holds a FINAL price,
    one fetched at least 10 minutes after the latest close. A fresh instance asks once to learn the
    last price. That price is "cache", never "stale", however old it gets.
  * A refresh that would go over the call budget is not sent (stocks.py): the company keeps its
    last price.

Demo mode (live=False): the feed plays the recorded replay and never calls anybody. The stock
companies have no reading, because the recording holds only the island companies.

Used by: exchange.py (the board, the portfolio, trades) and the tests (they pass fake transports
and a fake clock, so no test uses the network).
"""

import asyncio
import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

import httpx

from server.clock import Clock, utc_now
from server.market.binance import BINANCE_URL, fetch_prices
from server.market.calendars import Calendars, Session
from server.market.companies import Company
from server.market.readings import (
    NO_READING,
    SOURCE_CACHE,
    SOURCE_LIVE,
    SOURCE_REPLAY,
    SOURCE_STALE,
    Reading,
)
from server.market.replay import Replay, check_has_symbols, replay_minute
from server.market.stocks import StockSource

logger = logging.getLogger(__name__)

BOARD_MAX_AGE_SECONDS = 60  # the price board accepts prices up to this old
TRADE_MAX_AGE_SECONDS = 5  # a trade accepts only prices younger than this
ISLAND_RETRY_AFTER_FAILURE_SECONDS = 10  # Binance is asked again this long after a failure
STOCK_RETRY_AFTER_FAILURE_SECONDS = 30  # a stock provider is asked again this long after one
# A price fetched at least this long after a market closed is the final price of that session.
FINAL_PRICE_AFTER_CLOSE = timedelta(minutes=10)


@dataclass(frozen=True)
class Held:
    """One price this server instance holds."""

    price: Decimal
    quoted_at: datetime  # when the price was quoted (the provider's time for a stock)
    fetched_at: datetime  # when this instance fetched it


class QuoteBook:
    """The newest prices one source has given this instance, and when it was last asked."""

    def __init__(self, retry_after_failure_seconds: float) -> None:
        self.held: dict[str, Held] = {}
        self.asked_at: dict[str, datetime] = {}  # per symbol: the last successful request
        self.last_failure_at: datetime | None = None
        self.retry_after = timedelta(seconds=retry_after_failure_seconds)
        # Only one refresh at a time: the others wait here and then find the result in the cache.
        self.lock = asyncio.Lock()

    def is_due(self, symbol: str, now: datetime, max_age_seconds: float) -> bool:
        """True if the symbol was never asked for, or was asked `max_age_seconds` ago or longer."""
        asked = self.asked_at.get(symbol)
        return asked is None or now - asked >= timedelta(seconds=max_age_seconds)

    def may_ask(self, now: datetime) -> bool:
        """False for a while after a failed request, so a source that is down is not hammered."""
        return self.last_failure_at is None or now - self.last_failure_at >= self.retry_after

    def note_answer(self, asked: Iterable[str], held: Mapping[str, Held], now: datetime) -> None:
        """A request worked: remember when each symbol was asked and the prices that came back."""
        for symbol in asked:
            self.asked_at[symbol] = now
        self.held.update(held)
        self.last_failure_at = None

    def note_failure(self, now: datetime) -> None:
        self.last_failure_at = now


def is_final(held: Held, session: Session) -> bool:
    """True if this price was fetched after the latest close: it cannot change before the open."""
    if session.last_close is None:
        return True  # the calendar does not say when the market last closed: any price will do
    return held.fetched_at >= session.last_close + FINAL_PRICE_AFTER_CLOSE


class PriceFeed:
    """The one place the Exchange asks for prices. Call `await feed.read(max_age_seconds)`.

    `transport` (for Binance) and `clock` can be replaced in tests: a fake transport answers
    without any network, and a fake clock lets a test move time forward instantly. The stock
    source is passed in already built (or None when stocks are off), and carries its own transport.
    """

    def __init__(
        self,
        companies: Sequence[Company],
        calendars: Calendars,
        replay: Replay,
        *,
        stocks: StockSource | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
        live: bool = True,
        binance_url: str = BINANCE_URL,
    ) -> None:
        self.companies = tuple(companies)
        self.calendars = calendars
        self.replay = replay
        self.stocks = stocks
        self.transport = transport
        self.clock = clock
        self.live = live  # False in demo mode: nobody is called, the replay plays
        self.binance_url = binance_url
        self.island_symbols = tuple(company.symbol for company in companies if company.symbol)
        check_has_symbols(replay, self.island_symbols)  # a ReplayError names a missing pair
        self.island_book = QuoteBook(ISLAND_RETRY_AFTER_FAILURE_SECONDS)
        self.stock_book = QuoteBook(STOCK_RETRY_AFTER_FAILURE_SECONDS)

    def source_is_on(self, company: Company) -> bool:
        """True if a source can price this company: island companies always, stocks if covered."""
        if not company.is_stock:
            return True
        return self.stocks is not None and self.stocks.covers(company)

    async def read(
        self, max_age_seconds: float = BOARD_MAX_AGE_SECONDS, only: Company | None = None
    ) -> dict[str, Reading]:
        """A reading for every company (or only for `only`), keyed by company id.

        max_age_seconds  the oldest prices that are good enough: 60 for the board, 5 for a trade.
        only             a trade asks about one company, so only its source is asked.
        """
        companies = self.companies if only is None else (only,)
        if not self.live:
            return self.replay_readings(companies)
        fetched_islands, fetched_stocks = await asyncio.gather(
            self.refresh_islands(companies, max_age_seconds),
            self.refresh_stocks(companies, max_age_seconds),
        )
        now = self.clock()
        readings = {}
        for company in companies:
            fetched = fetched_stocks if company.is_stock else fetched_islands
            readings[company.id] = self.reading_of(company, now, max_age_seconds, fetched)
        return readings

    # --- demo mode ---

    def replay_readings(self, companies: Sequence[Company]) -> dict[str, Reading]:
        """The recorded prices of this minute. Stock companies are not part of the recording."""
        now = self.clock()
        minute = replay_minute(self.replay, self.island_symbols, now)
        readings = {}
        for company in companies:
            if company.symbol is None:
                readings[company.id] = NO_READING
            else:
                price = minute.prices[company.symbol]
                readings[company.id] = Reading(price, minute.as_of, now, SOURCE_REPLAY)
        return readings

    # --- Binance: the island companies ---

    async def refresh_islands(
        self, companies: Sequence[Company], max_age_seconds: float
    ) -> set[str]:
        """Ask Binance if the prices are too old. Returns the symbols fetched by THIS call."""
        book = self.island_book
        if not any(company.symbol for company in companies):
            return set()
        if not self.islands_are_due(self.clock(), max_age_seconds):
            return set()
        async with book.lock:
            now = self.clock()  # somebody else may have fetched while we waited for the lock
            if not self.islands_are_due(now, max_age_seconds) or not book.may_ask(now):
                return set()
            prices = await self.fetch_island_prices()
            now = self.clock()
            if not prices:
                book.note_failure(now)
                return set()
            held = {symbol: Held(price, now, now) for symbol, price in prices.items()}
            book.note_answer(self.island_symbols, held, now)
            return set(prices)

    def islands_are_due(self, now: datetime, max_age_seconds: float) -> bool:
        return any(self.island_book.is_due(s, now, max_age_seconds) for s in self.island_symbols)

    async def fetch_island_prices(self) -> dict[str, Decimal]:
        """One request to Binance. Any problem is logged by its kind and gives no prices."""
        try:
            return await fetch_prices(
                self.island_symbols, transport=self.transport, base_url=self.binance_url
            )
        except Exception as error:  # on purpose: any failure means "use the old prices"
            # Log only the kind of error. Its text could contain an address.
            logger.warning("Binance request failed: %s", type(error).__name__)
            return {}

    # --- the stock provider: the stock companies ---

    async def refresh_stocks(
        self, companies: Sequence[Company], max_age_seconds: float
    ) -> set[str]:
        """Ask the provider for the stocks that are due. Returns the symbols THIS call fetched."""
        if self.stocks is None:
            return set()
        wanted = {
            self.stocks.symbol_for(c): c for c in companies if c.is_stock and self.stocks.covers(c)
        }
        if not self.due_symbols(wanted, self.clock(), max_age_seconds):
            return set()
        book = self.stock_book
        async with book.lock:
            now = self.clock()  # somebody else may have fetched while we waited for the lock
            symbols = self.due_symbols(wanted, now, max_age_seconds)
            if not symbols or not book.may_ask(now):
                return set()
            try:
                result = await self.stocks.fetch(symbols)
            except Exception as error:  # a broken provider must never break the board
                logger.warning("Stock refresh failed: %s", type(error).__name__)
                book.note_failure(self.clock())
                return set()
            if not result.sent:
                return set()  # the call budget is used up: nothing was asked, nothing failed
            now = self.clock()
            held = {s: Held(q.price, q.quoted_at, now) for s, q in result.quotes.items()}
            book.note_answer(result.answered, held, now)
            if result.failed:
                book.note_failure(now)
            return set(result.quotes)

    def due_symbols(
        self, wanted: Mapping[str, Company], now: datetime, max_age: float
    ) -> list[str]:
        """The symbols that need a new request now."""
        due = []
        for symbol, company in wanted.items():
            session = self.calendars.session_at(company.market, now)
            if self.stock_is_due(symbol, session, now, max_age):
                due.append(symbol)
        return due

    def stock_is_due(self, symbol: str, session: Session, now: datetime, max_age: float) -> bool:
        """Does this stock need a request? Open market: when its price is too old. Closed market:
        only while we hold no final price (a fresh instance asks once to learn the last price)."""
        book = self.stock_book
        if symbol not in book.asked_at:
            return True
        if not book.is_due(symbol, now, max_age):
            return False
        if session.is_open:
            return True
        held = book.held.get(symbol)
        return held is not None and not is_final(held, session)

    # --- turning what we hold into a reading ---

    def reading_of(
        self, company: Company, now: datetime, max_age_seconds: float, fetched_now: set[str]
    ) -> Reading:
        """The newest price we hold for a company, labelled live, cache or stale."""
        if company.is_stock:
            symbol = None if self.stocks is None else self.stocks.symbol_for(company)
            book = self.stock_book
            session = self.calendars.session_at(company.market, now)
        else:
            symbol = company.symbol
            book = self.island_book
            session = None
        held = book.held.get(symbol)
        if held is None:
            return NO_READING
        if symbol in fetched_now:
            source = SOURCE_LIVE
        elif self.is_current(held, session, now, max_age_seconds):
            source = SOURCE_CACHE
        else:
            source = SOURCE_STALE
        return Reading(held.price, held.quoted_at, held.fetched_at, source)

    @staticmethod
    def is_current(held: Held, session: Session | None, now: datetime, max_age: float) -> bool:
        """Is this price good enough? Young enough, or (market closed) the final price."""
        if now - held.fetched_at < timedelta(seconds=max_age):
            return True
        return session is not None and not session.is_open and is_final(held, session)
