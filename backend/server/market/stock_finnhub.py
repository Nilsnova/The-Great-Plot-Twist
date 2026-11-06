"""The Finnhub adapter for the stock source: real US share prices, one request per symbol.

Finnhub's free plan gives real-time US quotes, 60 calls a minute (30 a second) per key, one symbol
per call. Its terms (checked in the research memo of 5 Nov 2026) allow personal use only: showing
the prices to other people needs Finnhub's written approval, so the stocks stay switched off until
a teammate has the key AND that approval (docs/DECISIONS.md, D017).

The request (the header name was checked in third-party client libraries and the OpenAPI
description, because Finnhub's own documentation page needs a browser to read):
    GET https://finnhub.io/api/v1/quote?symbol=AAPL
    header  X-Finnhub-Token: <key>        the key goes in a header, never in the address
The answer:
    {"c": 271.2, "d": 1.1, "dp": 0.4, "h": 272.5, "l": 269.9, "o": 270.1, "pc": 270.1,
     "t": 1762718398}
    c is the current price, t the time of that price in unix seconds. The other fields are not
    used. A c or t of 0 means "no quote" (an unknown symbol): the symbol is left out.

The tests use invented numbers in this shape, never recorded vendor prices.

Used by: stocks.py (provider_named) and the tests.
"""

import json
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx

from server.clock import Clock, utc_now
from server.market.stocks import Quote, StockAnswerError, StockCall, make_quote

FINNHUB_QUOTE_URL = "https://finnhub.io/api/v1/quote"
KEY_HEADER = "X-Finnhub-Token"
# A quote time this far ahead of our clock is not believable (a little difference is normal).
MAX_QUOTE_AHEAD_SECONDS = 300


class FinnhubProvider:
    """Real US share prices from Finnhub."""

    name = "finnhub"
    markets = frozenset({"us"})
    credit = "Stock prices from Finnhub."
    credit_href = "https://finnhub.io"

    def __init__(self, clock: Clock = utc_now) -> None:
        self.clock = clock

    def symbol_for(self, ticker: str, market: str) -> str | None:
        """Finnhub uses the ticker as the symbol of a US share."""
        return ticker if market in self.markets else None

    def requests_for(self, symbols: Sequence[str], key: str) -> list[StockCall]:
        """One request per symbol: Finnhub's quote endpoint takes one symbol per call."""
        return [
            StockCall(
                httpx.Request(
                    "GET",
                    FINNHUB_QUOTE_URL,
                    params={"symbol": symbol},
                    headers={KEY_HEADER: key},
                ),
                (symbol,),
            )
            for symbol in symbols
        ]

    def read_answer(self, symbols: Sequence[str], text: str) -> dict[str, Quote]:
        """The quote of the one symbol this answer is about. {} if Finnhub has no quote for it."""
        if len(symbols) != 1:
            raise StockAnswerError("A Finnhub answer is about exactly one symbol.")
        data = self.parse(text)
        price = self.read_number(data, "c")
        seconds = self.read_number(data, "t")
        if price <= 0 or seconds <= 0:
            return {}
        quoted_at = datetime.fromtimestamp(int(seconds), UTC)
        if quoted_at > self.clock() + timedelta(seconds=MAX_QUOTE_AHEAD_SECONDS):
            return {}
        quote = make_quote(price, quoted_at)
        return {} if quote is None else {symbols[0]: quote}

    @staticmethod
    def parse(text: str) -> dict:
        """The JSON object of an answer. Prices become Decimals, so they stay exact."""
        try:
            data = json.loads(text, parse_float=Decimal)
        except ValueError as error:
            raise StockAnswerError("A Finnhub answer is not JSON.") from error
        if not isinstance(data, dict):
            raise StockAnswerError("A Finnhub answer is not an object.")
        return data

    @staticmethod
    def read_number(data: dict, name: str) -> Decimal:
        """A field that must be a JSON number (not text, not a missing field)."""
        value = data.get(name)
        if isinstance(value, bool) or not isinstance(value, int | Decimal):
            raise StockAnswerError(f"A Finnhub answer has no number '{name}'.")
        return Decimal(value)
