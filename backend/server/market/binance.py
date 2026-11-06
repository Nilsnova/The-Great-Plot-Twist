"""The Binance request for the prices of the island companies, and how its answer is read.

Binance publishes market data on a host that needs no key and no account. One request returns
the price of every pair we ask for, so the seven island companies cost one request.

The live request (checked with real calls on 5 Nov 2026, from Lisbon). All seven pairs of
companies.json answered in one request: BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, BNBUSDT, EURUSDT
and PAXGUSDT.
    GET https://data-api.binance.vision/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT",...]
    -> [{"symbol": "BTCUSDT", "price": "76159.21000000"}, ...]   prices are text; order is not fixed
  * data-api.binance.vision is Binance's host for public market data. It needs no API key.
  * One request costs 4 of the 6000 request weight that an address may use per minute.
  * The answer has no time of its own, so the quote time of a price is the time we fetched it.
  * Binance can refuse addresses in some countries (HTTP 451, for example from US data centers).
    Then the live Exchange has no prices: test it from the deployed function before the class, and
    use DEMO_MODE=true if it does not work. Our functions run in Dublin (docs/DECISIONS.md, D002).
  * Documentation: https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
    (section "Symbol price ticker" and the "Market Data Only" note), read on 5 Nov 2026.
  * Binance's own terms do not say whether public market data may be shown in a class game.
    A non-profit class game is not clearly covered either way. Ask the teacher if unsure
    (docs/INTERFACES.md, section 9).

Reading the answer is done symbol by symbol: a pair that is missing from a good answer, or that
has a price we cannot use, leaves only that company without a fresh price. The other companies
keep theirs (v1 failed the whole answer).

Used by: feed.py (the caches and the freshness) and the tests.
"""

import asyncio
import json
import logging
from collections.abc import Sequence
from decimal import Decimal, InvalidOperation

import httpx

from server.market.positions import MAX_PRICE, round_price

logger = logging.getLogger(__name__)

BINANCE_URL = "https://data-api.binance.vision"
PRICE_PATH = "/api/v3/ticker/price"
BINANCE_TIMEOUT_SECONDS = 3.0  # a request that takes longer is given up


class BinanceError(ValueError):
    """Binance's answer is not usable. The message says why."""


def price_request(symbols: Sequence[str], base_url: str = BINANCE_URL) -> httpx.Request:
    """One request for all the symbols. No key, no secret header."""
    symbols_text = json.dumps(list(symbols), separators=(",", ":"))
    return httpx.Request("GET", f"{base_url}{PRICE_PATH}", params={"symbols": symbols_text})


def read_price(value: object) -> Decimal:
    """One price from Binance: text such as "76159.21000000" that is a number above 0.

    More than 8 decimals are rounded half to even, the form the database keeps.
    """
    if not isinstance(value, str):
        raise BinanceError("A price is not text.")
    try:
        price = Decimal(value)
        if not price.is_finite():
            raise InvalidOperation
        price = round_price(price)
    except InvalidOperation as error:
        raise BinanceError("A price is not a usable number.") from error
    if price <= 0 or price >= MAX_PRICE:
        raise BinanceError("A price is not above 0 and below one trillion.")
    return price


def parse_prices(data: object, symbols: Sequence[str]) -> dict[str, Decimal]:
    """Turn Binance's answer into {symbol: price} for the symbols we can use.

    The answer must be a list. A symbol that is missing, or whose price is not usable, is left
    out; the other symbols are still read.
    """
    if not isinstance(data, list):
        raise BinanceError("Binance did not answer with a list.")
    wanted = set(symbols)
    found: dict[str, Decimal] = {}
    for item in data:
        if not isinstance(item, dict) or item.get("symbol") not in wanted:
            continue
        try:
            found[item["symbol"]] = read_price(item.get("price"))
        except BinanceError:
            logger.warning("Binance sent a price we cannot use for %s.", item["symbol"])
    return {symbol: found[symbol] for symbol in symbols if symbol in found}


async def fetch_prices(
    symbols: Sequence[str],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    base_url: str = BINANCE_URL,
    timeout_seconds: float = BINANCE_TIMEOUT_SECONDS,
) -> dict[str, Decimal]:
    """Ask Binance once. Any problem raises, and the feed copes with it."""
    request = price_request(symbols, base_url)
    async with httpx.AsyncClient(transport=transport, timeout=timeout_seconds) as client:
        response = await asyncio.wait_for(client.send(request), timeout=timeout_seconds + 1)
    response.raise_for_status()
    return parse_prices(response.json(), symbols)
