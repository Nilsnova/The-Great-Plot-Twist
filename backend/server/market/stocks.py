"""The stock source: how the Exchange asks a stock-price provider for real share prices.

One small interface, so a provider can be swapped without touching the rest. The provider is the
setting STOCK_API_PROVIDER and its key is STOCK_API_KEY. Both are empty until a teammate has
created a key (an agent never signs up for one), and then the stock companies stay off: the board
simply does not list them. An unknown provider name stops the server at start-up with a clear
message, like an unknown feature flag, so set the name only after its adapter is merged.

How a refresh works
  * The feed (feed.py) says which symbols it wants. StockSource.fetch() asks the provider for the
    requests (provider.requests_for) and sends them ALL AT ONCE (asyncio.gather). Finnhub answers
    one symbol per request, so five companies are five requests. This is the one place where "one
    request per source for all symbols" cannot hold. A provider with a batch call sends one request.
  * The call budget is the safeguard: at most STOCK_CALLS_PER_MINUTE (25) provider calls per server
    instance in any 60 seconds, a sliding window like limits.py. Finnhub's free plan allows 60 a
    minute per key, so two busy instances fit. A refresh that would go over the budget is NOT SENT:
    the companies keep their last price, and a trade that needed a fresh one is refused.
  * A call that fails (any error, a timeout, a 429, an answer we cannot read) is logged by its
    TYPE only and counted as failed. The key goes in a header, never in the address, and it is never
    written to a log or an error message.

The provider contract (StockProvider below) has four small parts: which markets it covers, the
symbol of a company, the requests for a list of symbols, and how to read one answer. The adapter
for Finnhub is stock_finnhub.py. Tests use a fake provider and invented numbers.

Used by: feed.py (the caches and the freshness), exchange.py (builds the source from the settings),
settings.py (the list of known provider names) and the tests.
"""

import asyncio
import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Protocol

import httpx

from server.clock import Clock, utc_now
from server.market.companies import Company
from server.market.positions import MAX_PRICE, round_price

logger = logging.getLogger(__name__)

# The names STOCK_API_PROVIDER may have. Add a name here only when its adapter is merged.
PROVIDER_NAMES = ("finnhub",)

STOCK_CALLS_PER_MINUTE = 25  # provider calls per server instance in any window
STOCK_CALL_WINDOW_SECONDS = 60
STOCK_TIMEOUT_SECONDS = 3.0  # a call that takes longer is given up


class StockSourceError(ValueError):
    """The stock source is set up wrongly (an unknown provider). The message says what to fix."""


class StockAnswerError(ValueError):
    """A provider's answer cannot be read. The call counts as failed."""


@dataclass(frozen=True)
class Quote:
    """One share price, as a provider reports it."""

    price: Decimal  # above 0, at most 8 decimals
    quoted_at: datetime  # the provider's time of this price, in UTC


@dataclass(frozen=True)
class StockCall:
    """One request to a provider, and the symbols its answer is about."""

    request: httpx.Request
    symbols: tuple[str, ...]


@dataclass(frozen=True)
class StockFetch:
    """The result of one refresh."""

    sent: bool  # False: the call budget was used up, so nothing was sent
    quotes: Mapping[str, Quote]  # symbol -> quote, for the calls that worked
    failed: bool = False  # True if at least one call failed
    # The symbols of the calls that worked, also those the provider had no quote for. A symbol
    # whose call failed is not in it, so the feed asks for it again soon.
    answered: frozenset[str] = frozenset()


class StockProvider(Protocol):
    """What the Exchange needs from a stock-price provider."""

    name: str  # the value of STOCK_API_PROVIDER, for example "finnhub"
    markets: frozenset[str]  # the calendars it covers, for example {"us"}
    credit: str  # the credit line its terms ask for
    credit_href: str | None  # where the credit line links to, if it should

    def symbol_for(self, ticker: str, market: str) -> str | None:
        """The provider's symbol for a company, or None if it does not cover that market."""
        ...

    def requests_for(self, symbols: Sequence[str], key: str) -> list[StockCall]:
        """The requests that ask for these symbols: one for all of them, or one per symbol."""
        ...

    def read_answer(self, symbols: Sequence[str], text: str) -> dict[str, Quote]:
        """The quotes in one answer (a symbol without a quote is left out), or StockAnswerError."""
        ...


def make_quote(price: Decimal, quoted_at: datetime) -> Quote | None:
    """A Quote with the price rounded (half to even) to 8 decimals, or None if it is no price."""
    try:
        if not price.is_finite():
            return None
        rounded = round_price(price)
    except InvalidOperation:
        return None
    if rounded <= 0 or rounded >= MAX_PRICE:
        return None
    return Quote(rounded, quoted_at)


class CallBudget:
    """Counts the provider calls of this server instance in a sliding window."""

    def __init__(
        self,
        max_calls: int = STOCK_CALLS_PER_MINUTE,
        window_seconds: float = STOCK_CALL_WINDOW_SECONDS,
        clock: Clock = utc_now,
    ) -> None:
        self.max_calls = max_calls
        self.window = timedelta(seconds=window_seconds)
        self.clock = clock
        self.recent_calls: list[datetime] = []

    def try_spend(self, calls: int) -> bool:
        """Spend `calls` calls, or spend nothing and say False if that would go over the budget."""
        now = self.clock()
        self.recent_calls = [moment for moment in self.recent_calls if now - moment < self.window]
        if len(self.recent_calls) + calls > self.max_calls:
            return False
        self.recent_calls.extend([now] * calls)
        return True


class StockSource:
    """Asks one provider for the prices of a list of symbols. Call `await source.fetch(...)`."""

    def __init__(
        self,
        provider: StockProvider,
        key: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
        budget: CallBudget | None = None,
        timeout_seconds: float = STOCK_TIMEOUT_SECONDS,
    ) -> None:
        self.provider = provider
        self._key = key  # private on purpose: nothing else needs it
        self.transport = transport  # tests pass a fake transport here, so no network is used
        self.budget = budget or CallBudget(clock=clock)
        self.timeout_seconds = timeout_seconds

    def covers(self, company: Company) -> bool:
        """True if the provider has prices for this company's market."""
        return self.symbol_for(company) is not None

    def symbol_for(self, company: Company) -> str | None:
        return self.provider.symbol_for(company.ticker, company.market)

    async def fetch(self, symbols: Sequence[str]) -> StockFetch:
        """Ask for these symbols. All the requests of one refresh go out at the same moment."""
        calls = self.provider.requests_for(symbols, self._key)
        if not self.budget.try_spend(len(calls)):
            logger.warning(
                "Stock call budget used up: a refresh of %d call(s) was not sent.", len(calls)
            )
            return StockFetch(sent=False, quotes={})
        async with httpx.AsyncClient(
            transport=self.transport, timeout=self.timeout_seconds
        ) as client:
            answers = await asyncio.gather(*(self.send(client, call) for call in calls))
        quotes: dict[str, Quote] = {}
        answered: set[str] = set()
        failed = False
        for call, (call_quotes, call_failed) in zip(calls, answers, strict=True):
            quotes.update(call_quotes)
            failed = failed or call_failed
            if not call_failed:
                answered.update(call.symbols)
        return StockFetch(sent=True, quotes=quotes, failed=failed, answered=frozenset(answered))

    async def send(
        self, client: httpx.AsyncClient, call: StockCall
    ) -> tuple[dict[str, Quote], bool]:
        """One call: its quotes, and True if it failed. A failure never raises."""
        try:
            response = await asyncio.wait_for(
                client.send(call.request), timeout=self.timeout_seconds + 1
            )
            response.raise_for_status()
            return self.provider.read_answer(call.symbols, response.text), False
        except httpx.HTTPStatusError as error:
            logger.warning("Stock call failed: HTTP %s", error.response.status_code)
        except Exception as error:  # on purpose: any failure just means "this call did not work"
            # Log only the kind of error. Its text could contain the address of the request.
            logger.warning("Stock call failed: %s", type(error).__name__)
        return {}, True


def provider_named(name: str, clock: Clock = utc_now) -> StockProvider:
    """The provider adapter for a STOCK_API_PROVIDER name. Raises StockSourceError if unknown."""
    if name == "finnhub":
        # Imported here because the adapter imports this file (Quote, StockCall).
        from server.market.stock_finnhub import FinnhubProvider

        return FinnhubProvider(clock=clock)
    raise StockSourceError(
        f"STOCK_API_PROVIDER '{name}' is not known. Known providers: {', '.join(PROVIDER_NAMES)}."
    )


def build_stock_source(
    provider_name: str,
    key: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock = utc_now,
) -> StockSource | None:
    """The stock source, or None when it is off.

    Off when STOCK_API_PROVIDER is empty (silently) or when the key is empty (one warning).
    An unknown provider name raises StockSourceError, so a typo stops the server at start-up.
    """
    if not provider_name:
        return None
    provider = provider_named(provider_name, clock)
    if not key:
        logger.warning(
            "STOCK_API_PROVIDER is '%s' but STOCK_API_KEY is empty: stock prices stay off.",
            provider_name,
        )
        return None
    return StockSource(provider, key, transport=transport, clock=clock)
