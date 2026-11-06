"""Shared helpers for the Island Exchange tests (the test_market_*.py files). It holds no tests.

It builds the pretend outside world of the Exchange, so no market test ever uses the network:
  * FakeBinance        a pretend Binance (an httpx.MockTransport handler with prepared replies)
  * FakeProvider       a pretend stock provider, and FakeStockServer, its pretend server
  * company builders   small island and stock companies, and the real ones from the data file
  * fixed moments      NY_OPEN (New York is open) and CLASS_TIME (the 11:00 class: it is closed)

The name has no test_ at the start on purpose: pytest only collects test_*.py files.

Used by: test_market_feed.py, test_market_stocks.py, test_market_routes.py and the other
market tests.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from server.market.companies import Company
from server.market.stocks import Quote, StockCall

D = Decimal

# Monday 9 Nov 2026, 16:00 UTC: New York (14:30 to 21:00 UTC) and the European markets are open.
NY_OPEN = datetime(2026, 11, 9, 16, 0, tzinfo=UTC)
# Monday 9 Nov 2026, 11:00 UTC: the time of the class. New York is closed, the island companies
# trade, and the European markets are open.
CLASS_TIME = datetime(2026, 11, 9, 11, 0, tzinfo=UTC)
# Monday 9 Nov 2026, 22:00 UTC: New York has closed for the day.
NY_NIGHT = datetime(2026, 11, 9, 22, 0, tzinfo=UTC)

KEY = "test-key-that-must-stay-secret"
QUOTED_AT = datetime(2026, 11, 9, 15, 59, 58, tzinfo=UTC)


def island_company(symbol: str = "BTCUSDT", **changes) -> Company:
    """A small island company that follows a Binance pair."""
    name = symbol.removesuffix("USDT").lower()
    values = {
        "id": f"{name}-company",
        "name": f"{name.upper()} Company",
        "ticker": name.upper()[:5],
        "kind": "island",
        "follows": name.upper(),
        "symbol": symbol,
        "market": "always",
        "currency": "USDT",
        "price_decimals": 2,
        "tagline": "A test company.",
    }
    values.update(changes)
    return Company(**values)


def stock_company(ticker: str = "AAPL", market: str = "us", **changes) -> Company:
    """A small stock company (its id is the ticker in lowercase)."""
    values = {
        "id": ticker.lower(),
        "name": ticker.title(),
        "ticker": ticker,
        "kind": "stock",
        "follows": f"{ticker} shares",
        "symbol": None,
        "market": market,
        "currency": "USD",
        "price_decimals": 2,
        "tagline": "A test company.",
    }
    values.update(changes)
    return Company(**values)


# --- a pretend Binance ---

# What Binance answers (the order is not the order we asked for, and prices are text).
BINANCE_ANSWER = [
    {"symbol": "EURUSDT", "price": "1.12460000"},
    {"symbol": "BTCUSDT", "price": "76159.21000000"},
    {"symbol": "ETHUSDT", "price": "2255.69000000"},
]


class FakeBinance:
    """A pretend Binance. It counts requests and answers with prepared replies, in order.

    The last reply repeats for ever. A reply that is an Exception is raised, like a network error.
    """

    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def good_binance_answer(prices: dict | None = None) -> httpx.Response:
    """A good answer. `prices` is {symbol: text}; by default the three of BINANCE_ANSWER."""
    if prices is None:
        return httpx.Response(200, json=BINANCE_ANSWER)
    return httpx.Response(200, json=[{"symbol": s, "price": p} for s, p in prices.items()])


# --- a pretend stock provider ---


class FakeProvider:
    """A pretend stock provider: one request per symbol (like Finnhub) or one for all (batch)."""

    name = "fake"
    markets = frozenset({"us"})
    credit = "Stock prices from the Fake Exchange."
    credit_href = "https://fake.example"

    def __init__(self, batch: bool = False) -> None:
        self.batch = batch

    def symbol_for(self, ticker: str, market: str) -> str | None:
        return ticker if market in self.markets else None

    def requests_for(self, symbols, key: str) -> list[StockCall]:
        headers = {"X-Fake-Token": key}
        if self.batch:
            url = "https://fake.example/quotes?symbols=" + ",".join(symbols)
            return [StockCall(httpx.Request("GET", url, headers=headers), tuple(symbols))]
        return [
            StockCall(
                httpx.Request(
                    "GET", f"https://fake.example/quote?symbol={symbol}", headers=headers
                ),
                (symbol,),
            )
            for symbol in symbols
        ]

    def read_answer(self, symbols, text: str) -> dict[str, Quote]:
        """The answer is {symbol: price, ...}; every quote is timed QUOTED_AT unless told so."""
        data = json.loads(text, parse_float=Decimal)
        quoted_at = (
            datetime.fromisoformat(data.pop("quoted_at")) if "quoted_at" in data else QUOTED_AT
        )
        return {s: Quote(D(str(data[s])), quoted_at) for s in symbols if s in data}


class FakeStockServer:
    """The provider's pretend server. It records every request and answers from a table.

    prices      {symbol: text}, what it answers
    quoted_at   the time the quotes carry (None: QUOTED_AT)
    status      a status other than 200 makes every call fail with it
    fail_for    symbols whose call fails with a 500
    """

    def __init__(self, prices: dict | None = None) -> None:
        self.prices = prices or {
            "AAPL": "271.20",
            "NVDA": "190.10",
            "KO": "70.55",
            "TSLA": "412.30",
        }
        self.requests: list[httpx.Request] = []
        self.quoted_at: datetime | None = None
        self.status = 200
        self.fail_for: set[str] = set()

    def asked_symbols(self) -> list[str]:
        """The symbols of every request so far, in the order they arrived."""
        asked = []
        for request in self.requests:
            params = request.url.params
            asked += (
                params["symbol"].split(",") if "symbol" in params else params["symbols"].split(",")
            )
        return asked

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        params = request.url.params
        symbols = (
            params["symbol"].split(",") if "symbol" in params else params["symbols"].split(",")
        )
        if self.status != 200:
            return httpx.Response(self.status, text="oops")
        if set(symbols) & self.fail_for:
            return httpx.Response(500, text="oops")
        answer = {s: self.prices[s] for s in symbols if s in self.prices}
        if self.quoted_at is not None:
            answer["quoted_at"] = self.quoted_at.isoformat()
        return httpx.Response(200, json=answer)
