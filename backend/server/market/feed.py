"""The real prices behind the Island Exchange: Binance market data, and a replay for demo mode.

Where the prices come from
  Live mode (the default). The first one that works wins:
    1. live    Binance market data, one request for all companies. No key, no account.
    2. cache   the last live answer, while it is younger than the age the caller accepts. The price
               board accepts 60 seconds, so one server instance asks Binance at most once per
               minute while nobody trades, however many players look. A TRADE accepts only prices
               younger than 5 seconds (TRADE_MAX_PRICE_AGE_SECONDS): if the cache is older, the
               trade asks Binance again first. A rush of players at the same moment still causes
               one request, because they wait for the same answer. Worst case, while players
               trade all the time, one instance asks every 5 seconds: 12 requests a minute, 48 of
               the 6000 request weight that an address may use per minute.
    3. stale   the last live answer when Binance fails now. It is shown, marked "stale" and with
               its own time, for as long as Binance stays away. NOBODY CAN TRADE ON IT (see
               PriceSnapshot.is_tradable): a player who watches Binance would know that these
               prices are out of date. After a failed request an instance waits 10 seconds before
               it asks again, so Binance is not hammered, and trading opens again soon after
               Binance is back.
    4. nothing If Binance has not answered once since this server instance started, there is
               nothing to show and the price board answers 503 source_unavailable.
  Demo mode (DEMO_MODE=true) is "no real outside services": the feed never calls Binance and
  always plays the recorded replay, and trading on it is allowed, so a demo or a rehearsal works
  without internet.

Why the replay never plays in live mode (changed after the independent review, D017). The replay
file is in the repository, and the minute that plays comes from the clock. Anybody can read the
next prices from the file and trade against them without risk. That is acceptable in a demo, where
nothing real is at stake, but a live Exchange must never fall back to it, and the live and the
recorded prices must not be switched to and fro (each switch moves every price, see rules.py,
rule 5). If Binance is away, the live Exchange shows the old prices and closes for trading.

Every answer says which source it is (`source`) and when its prices are from (`as_of`), so the
screen can say "live", "stale" or "replay" and never passes old prices off as current ones.

The live request (checked with real calls on 5 Nov 2026, from Lisbon). All seven pairs of
companies.json answered in one request: BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, BNBUSDT, EURUSDT
and PAXGUSDT.
    GET https://data-api.binance.vision/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT",...]
    -> [{"symbol": "BTCUSDT", "price": "76159.21000000"}, ...]   prices are text; order is not fixed
  * data-api.binance.vision is Binance's host for public market data. It needs no API key.
  * One request returns all seven prices. It costs 4 of the 6000 request weight per minute that an
    address may use, and the answer took well under a second.
  * Binance can refuse addresses in some countries (HTTP 451, for example from US data centers).
    Then the live Exchange has no prices: test it from the deployed function before the class, and
    use DEMO_MODE=true if it does not work. Our functions run in Dublin (docs/DECISIONS.md, D002).
  * Documentation: https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
    (section "Symbol price ticker" and the "Market Data Only" note), read on 5 Nov 2026.
  * Binance's own terms do not say whether public market data may be shown in a class game.
    A non-profit class game is not clearly covered either way. Ask the teacher if unsure
    (docs/INTERFACES.md, section 9).

The replay is a derivative of Binance Vision public data. Its licence (CC BY-NC-SA 4.0) and credit
("Binance Vision") are written in the file itself and are shown next to the prices.

The replay plays forward through its minutes, then backward, then forward again, forever. Going
back and forth means the price never jumps at the end of the recording. The minute that is playing
comes from the clock, so every server instance plays the same minute at the same moment.

Used by: exchange.py (the price board and trades) and the tests (they pass a fake transport and a
fake clock, so no test uses the network).
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx

from server.adapters.base import CachedSource, SourceResult
from server.clock import Clock, utc_now
from server.market.companies import CONTENT_FOLDER
from server.market.rules import LIVE, REPLAY

BINANCE_URL = "https://data-api.binance.vision"
PRICE_PATH = "/api/v3/ticker/price"

FEED_TTL_SECONDS = 60  # the price board accepts prices up to this old: one request per minute
FEED_TIMEOUT_SECONDS = 3.0  # a live request that takes longer is given up
# A trade accepts only prices younger than this. It is the answer to a player who watches Binance
# and trades on a move that the game has not shown yet: the shorter this is, the smaller that edge.
TRADE_MAX_PRICE_AGE_SECONDS = 5
# After a failed request an instance waits this long before it asks Binance again. The shared
# pattern (adapters/base.py) waits a whole minute, but then one dropped request would close the
# Exchange for a minute. 10 seconds is still gentle: at most 6 requests a minute while it fails.
RETRY_AFTER_FAILURE_SECONDS = 10

REPLAY_FILE = CONTENT_FOLDER / "replay.json"
MIN_REPLAY_CANDLES = 2

ATTRIBUTION_LIVE = (
    "Real price moves from Binance market data, amplified in the game. Simulation, play money."
)


class FeedError(ValueError):
    """The prices (live answer or replay file) are not usable. The message says why."""


@dataclass(frozen=True)
class PriceSnapshot:
    """Real prices for all symbols at one moment, and where they came from."""

    prices: Mapping[str, Decimal]  # Binance symbol -> real price (in USDT)
    source: str  # "live", "cache", "stale" or "replay"
    as_of: datetime  # when these prices are from (the minute that is playing, for the replay)

    @property
    def kind(self) -> str:
        """LIVE or REPLAY. Live, cache and stale prices are all real prices of the same kind."""
        return REPLAY if self.source == REPLAY else LIVE

    @property
    def is_tradable(self) -> bool:
        """False for stale prices: Binance is not answering, so the prices may be out of date.

        Live and cache prices are tradable, because a trade asks for prices that are at most
        TRADE_MAX_PRICE_AGE_SECONDS old (PriceFeed.get). The replay only plays in demo mode, where
        trading on it is allowed.
        """
        return self.source != "stale"


@dataclass(frozen=True)
class Replay:
    """The recorded prices: for every symbol, one closing price per minute."""

    closes: Mapping[str, tuple[Decimal, ...]]
    candles: int  # how many minutes are recorded
    candle_seconds: int  # the length of one candle (60)
    credit: str  # whom to credit: "Binance Vision"
    licence: str  # the licence of the data: "CC BY-NC-SA 4.0"
    licence_url: str | None = None  # where the licence text is, for a link next to the prices


def read_price(value: object) -> Decimal:
    """One price from Binance: text such as "76159.21000000" that is a number above 0."""
    if not isinstance(value, str):
        raise FeedError("A price is not text.")
    try:
        price = Decimal(value)
    except InvalidOperation as error:
        raise FeedError("A price is not a number.") from error
    if not price.is_finite() or price <= 0:
        raise FeedError("A price is not above 0.")
    return price


def parse_prices(data: object, symbols: Sequence[str]) -> dict[str, Decimal]:
    """Turn Binance's answer into {symbol: price}. Every wanted symbol must be in it."""
    if not isinstance(data, list):
        raise FeedError("Binance did not answer with a list.")
    found: dict[str, Decimal] = {}
    for item in data:
        if isinstance(item, dict) and isinstance(item.get("symbol"), str):
            found[item["symbol"]] = read_price(item.get("price"))
    missing = [symbol for symbol in symbols if symbol not in found]
    if missing:
        raise FeedError(f"Binance sent no price for: {', '.join(missing)}.")
    return {symbol: found[symbol] for symbol in symbols}


def read_replay_closes(raw: object, candles: int) -> dict[str, tuple[Decimal, ...]]:
    """The closing prices of the replay file: for each symbol a list of `candles` numbers."""
    if not isinstance(raw, dict) or not raw:
        raise FeedError("The replay has no prices.")
    closes: dict[str, tuple[Decimal, ...]] = {}
    for symbol, values in raw.items():
        if not isinstance(values, list) or len(values) != candles:
            raise FeedError(f"The replay for {symbol} does not have {candles} prices.")
        prices = []
        for value in values:
            # JSON numbers without a decimal point (78630) arrive as int, the rest as Decimal.
            if isinstance(value, bool) or not isinstance(value, int | Decimal) or value <= 0:
                raise FeedError(f"The replay for {symbol} has a price that is not above 0.")
            prices.append(Decimal(value))
        closes[symbol] = tuple(prices)
    return closes


def read_replay_text(data: dict, name: str) -> str:
    """A text field of the replay file that must not be empty (the credit and the licence)."""
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise FeedError(f"The replay file must have a '{name}' (credit and licence are required).")
    return value


def read_replay_link(data: dict) -> str | None:
    """The web address of the licence text (licenceUrl). Optional, but it must be a web address."""
    value = data.get("licenceUrl")
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith("https://"):
        raise FeedError("'licenceUrl' must be a web address that starts with https://.")
    return value


def load_replay(path: Path = REPLAY_FILE) -> Replay:
    """Read and check the replay file. Raises FeedError if it is not usable."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except (OSError, ValueError) as error:
        raise FeedError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise FeedError("The replay file must be a JSON object.")
    candles = data.get("candles")
    candle_seconds = data.get("candleSeconds")
    if not isinstance(candles, int) or candles < MIN_REPLAY_CANDLES:
        raise FeedError(f"'candles' must be a whole number of at least {MIN_REPLAY_CANDLES}.")
    if not isinstance(candle_seconds, int) or candle_seconds < 1:
        raise FeedError("'candleSeconds' must be a whole number above 0.")
    return Replay(
        closes=read_replay_closes(data.get("closes"), candles),
        candles=candles,
        candle_seconds=candle_seconds,
        credit=read_replay_text(data, "credit"),
        licence=read_replay_text(data, "licence"),
        licence_url=read_replay_link(data),
    )


def ping_pong_index(step: int, length: int) -> int:
    """Which recorded minute plays at `step`: 0, 1, ... length-1, length-2, ... 1, 0, 1, ...

    Forward, then backward, forever. With length 4 the steps 0 to 7 give 0 1 2 3 2 1 0 1.
    """
    turn_length = 2 * (length - 1)
    position = step % turn_length
    return position if position < length else turn_length - position


def replay_snapshot(replay: Replay, symbols: Sequence[str], now: datetime) -> PriceSnapshot:
    """The recorded prices that play at `now`. The same time always gives the same prices."""
    step = int(now.timestamp()) // replay.candle_seconds
    index = ping_pong_index(step, replay.candles)
    prices = {symbol: replay.closes[symbol][index] for symbol in symbols}
    as_of = datetime.fromtimestamp(step * replay.candle_seconds, UTC)
    return PriceSnapshot(prices, REPLAY, as_of)


class PriceCache(CachedSource):
    """The shared cache pattern (adapters/base.py) with one more question: "how old may it be?".

    CachedSource.get() accepts cached data younger than its TTL, which is 60 seconds here. A trade
    needs younger prices than that. get_younger_than() takes the age limit from the caller.
    Everything else is the pattern itself: the lock that turns a rush of players into one request,
    the timeout and the last good answer ("stale"). The wait after a failure is shorter than the
    pattern's, see RETRY_AFTER_FAILURE_SECONDS.
    """

    retry_after = timedelta(seconds=RETRY_AFTER_FAILURE_SECONDS)

    def can_call_outside(self) -> bool:
        """False for a few seconds after a failed request, so Binance is not asked on every look."""
        if self.last_failure_at is None:
            return True
        return self.clock() - self.last_failure_at >= self.retry_after

    async def get_younger_than(self, max_age_seconds: float) -> SourceResult:
        limit = timedelta(seconds=max_age_seconds)
        cached = self.find_result_younger_than(limit)
        if cached is not None:
            return cached
        async with self.lock:
            # Somebody else may have fetched while we waited for the lock.
            cached = self.find_result_younger_than(limit)
            if cached is not None:
                return cached
            if self.can_call_outside():
                live = await self.try_live_fetch()
                if live is not None:
                    return live
            return self.fall_back()

    def find_result_younger_than(self, limit: timedelta) -> SourceResult | None:
        """The cached data if it is younger than `limit`, otherwise None."""
        if self.good_fetched_at is None:
            return None
        if self.clock() - self.good_fetched_at >= limit:
            return None
        return self.make_result("cache")


class PriceFeed:
    """The one place the exchange asks for real prices. Call `await feed.get()`.

    `transport` and `clock` can be replaced in tests: a fake transport answers without any
    network, and a fake clock lets a test move time forward instantly.
    """

    def __init__(
        self,
        symbols: Sequence[str],
        replay: Replay,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Clock = utc_now,
        base_url: str = BINANCE_URL,
        ttl_seconds: float = FEED_TTL_SECONDS,
        timeout_seconds: float = FEED_TIMEOUT_SECONDS,
        live: bool = True,
    ) -> None:
        missing = [symbol for symbol in symbols if symbol not in replay.closes]
        if missing:
            raise FeedError(f"The replay has no prices for: {', '.join(missing)}.")
        self.symbols = tuple(symbols)
        self.replay = replay
        self.transport = transport
        self.clock = clock
        self.base_url = base_url
        self.ttl_seconds = ttl_seconds
        self.timeout_seconds = timeout_seconds
        self.live = live  # False in demo mode: Binance is never called
        # The cache, the timeout and the "last good answer" come from the shared pattern in
        # adapters/base.py. There is no recorded fallback there: in live mode the replay never
        # plays (see the top of this file), and in demo mode get() does not use the cache.
        self.cache = PriceCache(
            "market prices",
            self.fetch_live,
            ttl_seconds=ttl_seconds,
            timeout_seconds=timeout_seconds + 1,
            clock=clock,
        )

    async def fetch_live(self) -> dict[str, Decimal]:
        """One request to Binance for all symbols. Any problem raises, and the cache copes."""
        symbols_text = json.dumps(list(self.symbols), separators=(",", ":"))
        async with httpx.AsyncClient(
            transport=self.transport, timeout=self.timeout_seconds
        ) as client:
            response = await client.get(
                f"{self.base_url}{PRICE_PATH}", params={"symbols": symbols_text}
            )
        response.raise_for_status()
        return parse_prices(response.json(), self.symbols)

    async def get(self, max_age_seconds: float | None = None) -> PriceSnapshot:
        """The current real prices, no older than `max_age_seconds` (default: the 60 second TTL).

        Live mode: live, cache or stale prices. Raises SourceUnavailable (503) if Binance has not
        answered once since this server started. Demo mode: the recorded prices of this minute.
        """
        if not self.live:
            return replay_snapshot(self.replay, self.symbols, self.clock())
        limit = self.ttl_seconds if max_age_seconds is None else max_age_seconds
        result = await self.cache.get_younger_than(limit)
        return PriceSnapshot(result.data, result.source, result.fetched_at)

    def attribution(self, source: str) -> str:
        """The credit line to show next to the prices, for the given `source` of an answer."""
        if source == REPLAY:
            return (
                f"Recorded price moves from {self.replay.credit} ({self.replay.licence}), "
                "played back. Simulation, play money."
            )
        return ATTRIBUTION_LIVE

    def licence_url(self, source: str) -> str | None:
        """The web address of the licence text while the replay plays, otherwise None."""
        return self.replay.licence_url if source == REPLAY else None
