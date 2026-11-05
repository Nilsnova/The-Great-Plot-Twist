"""Tests for market/feed.py: the real prices, the cache, the fallbacks and the replay.

Nothing here uses the network: Binance is a fake transport (httpx.MockTransport) and the clock is
a fake clock that only moves when the test says so.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from server.adapters.base import SourceUnavailable
from server.market.feed import (
    ATTRIBUTION_LIVE,
    BINANCE_URL,
    FEED_TTL_SECONDS,
    REPLAY_FILE,
    TRADE_MAX_PRICE_AGE_SECONDS,
    FeedError,
    PriceFeed,
    PriceSnapshot,
    Replay,
    load_replay,
    parse_prices,
    ping_pong_index,
    read_price,
    replay_snapshot,
)
from server.market.rules import LIVE
from server.tests.helpers import FakeClock

D = Decimal

SYMBOLS = ("BTCUSDT", "ETHUSDT", "EURUSDT")

# A small replay of 4 minutes, so the tests can follow it by eye.
SMALL_REPLAY = Replay(
    closes={
        "BTCUSDT": (D("100"), D("101"), D("102"), D("103")),
        "ETHUSDT": (D("10"), D("11"), D("12"), D("13")),
        "EURUSDT": (D("1.1"), D("1.2"), D("1.3"), D("1.4")),
    },
    candles=4,
    candle_seconds=60,
    credit="Binance Vision",
    licence="CC BY-NC-SA 4.0",
)

# What Binance answers (the order is not the order we asked for, and prices are text).
BINANCE_ANSWER = [
    {"symbol": "EURUSDT", "price": "1.12460000"},
    {"symbol": "BTCUSDT", "price": "76159.21000000"},
    {"symbol": "ETHUSDT", "price": "2255.69000000"},
]


class FakeBinance:
    """A pretend Binance. It counts requests and answers with prepared replies, in order."""

    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


def good() -> httpx.Response:
    return httpx.Response(200, json=BINANCE_ANSWER)


def make_feed(binance: FakeBinance, clock: FakeClock, **options) -> PriceFeed:
    return PriceFeed(
        SYMBOLS, SMALL_REPLAY, transport=httpx.MockTransport(binance), clock=clock, **options
    )


def get(feed: PriceFeed, max_age_seconds: float | None = None):
    return asyncio.run(feed.get(max_age_seconds))


# --- the live request ---


def test_one_request_asks_binance_for_all_symbols_at_the_documented_address():
    binance = FakeBinance(good())

    get(make_feed(binance, FakeClock()))

    assert len(binance.requests) == 1
    request = binance.requests[0]
    assert request.method == "GET"
    assert str(request.url).startswith(f"{BINANCE_URL}/api/v3/ticker/price?")
    assert json.loads(request.url.params["symbols"]) == list(SYMBOLS)


def test_the_request_is_keyless_and_sends_no_secret_header():
    binance = FakeBinance(good())

    get(make_feed(binance, FakeClock()))

    headers = {name.lower() for name in binance.requests[0].headers}
    assert "authorization" not in headers
    assert "x-mbx-apikey" not in headers
    assert "apikey" not in headers


def test_the_market_data_host_is_the_keyless_binance_vision_host():
    assert BINANCE_URL == "https://data-api.binance.vision"


def test_live_prices_are_exact_numbers_in_the_order_of_the_symbols():
    clock = FakeClock()

    snapshot = get(make_feed(FakeBinance(good()), clock))

    assert snapshot.source == "live"
    assert snapshot.as_of == clock.now
    assert list(snapshot.prices) == list(SYMBOLS)
    assert snapshot.prices["BTCUSDT"] == D("76159.21")
    assert snapshot.prices["EURUSDT"] == D("1.1246")


def test_a_live_snapshot_is_of_the_live_kind():
    assert get(make_feed(FakeBinance(good()), FakeClock())).kind == LIVE


# --- the cache: one request per minute ---


def test_a_second_look_inside_a_minute_uses_the_cache_and_asks_binance_nothing():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    first = get(feed)

    clock.advance(59)
    second = get(feed)

    assert second.source == "cache"
    assert second.prices == first.prices
    assert second.as_of == first.as_of
    assert len(binance.requests) == 1


def test_after_a_minute_the_next_look_asks_binance_again():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)

    clock.advance(60)
    second = get(feed)

    assert second.source == "live"
    assert len(binance.requests) == 2


def test_a_rush_of_players_at_the_same_moment_causes_one_request():
    async def hundred_players() -> list:
        feed = make_feed(binance, FakeClock())
        return await asyncio.gather(*[feed.get() for _ in range(100)])

    binance = FakeBinance(good())

    snapshots = asyncio.run(hundred_players())

    assert len(binance.requests) == 1
    assert {snapshot.source for snapshot in snapshots} <= {"live", "cache"}


# --- a trade needs younger prices than the board ---


def test_the_agreed_ages_are_60_seconds_for_the_board_and_5_seconds_for_a_trade():
    assert FEED_TTL_SECONDS == 60
    assert TRADE_MAX_PRICE_AGE_SECONDS == 5


def test_prices_that_are_older_than_the_limit_of_a_trade_are_fetched_again():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)  # the board looks: one request

    clock.advance(6)
    snapshot = get(feed, TRADE_MAX_PRICE_AGE_SECONDS)

    assert snapshot.source == "live"
    assert len(binance.requests) == 2


def test_prices_younger_than_the_limit_of_a_trade_come_from_the_cache():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)

    clock.advance(4.9)
    snapshot = get(feed, TRADE_MAX_PRICE_AGE_SECONDS)

    assert snapshot.source == "cache"
    assert len(binance.requests) == 1


def test_prices_exactly_as_old_as_the_limit_are_fetched_again():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)

    clock.advance(TRADE_MAX_PRICE_AGE_SECONDS)

    assert get(feed, TRADE_MAX_PRICE_AGE_SECONDS).source == "live"


def test_the_board_still_accepts_prices_that_are_a_trade_would_refuse():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)

    clock.advance(30)

    assert get(feed).source == "cache"  # the board's own limit is 60 seconds
    assert len(binance.requests) == 1


def test_a_fetch_for_a_trade_also_refreshes_the_cache_of_the_board():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)
    get(feed)
    clock.advance(30)
    get(feed, TRADE_MAX_PRICE_AGE_SECONDS)  # a trade fetches again

    clock.advance(30)  # the board looks 30 seconds later: the new prices are 30 seconds old

    assert get(feed).source == "cache"
    assert len(binance.requests) == 2


def test_a_rush_of_trades_at_the_same_moment_causes_one_request():
    async def hundred_traders() -> list:
        clock = FakeClock()
        feed = make_feed(binance, clock)
        await feed.get()
        clock.advance(10)
        return await asyncio.gather(*[feed.get(TRADE_MAX_PRICE_AGE_SECONDS) for _ in range(100)])

    binance = FakeBinance(good())

    snapshots = asyncio.run(hundred_traders())

    assert len(binance.requests) == 2  # the first look, and one for the whole rush
    assert {snapshot.source for snapshot in snapshots} <= {"live", "cache"}


def test_trading_all_the_time_asks_binance_at_most_every_5_seconds():
    clock = FakeClock()
    binance = FakeBinance(good())
    feed = make_feed(binance, clock)

    for _ in range(60):  # one trade every second for a minute
        get(feed, TRADE_MAX_PRICE_AGE_SECONDS)
        clock.advance(1)

    assert len(binance.requests) == 12


# --- when Binance fails ---


@pytest.mark.parametrize(
    "reply",
    [
        httpx.Response(451, json={"msg": "Service unavailable from a restricted location"}),
        httpx.Response(429, json={}),
        httpx.Response(500, text="oops"),
        httpx.Response(200, text="this is not json"),
        httpx.Response(200, json={"symbol": "BTCUSDT"}),  # an object instead of a list
        httpx.Response(200, json=BINANCE_ANSWER[1:]),  # EURUSDT is missing
        httpx.Response(200, json=[{"symbol": "BTCUSDT", "price": "abc"}] + BINANCE_ANSWER[1:]),
        httpx.Response(200, json=[{"symbol": "BTCUSDT", "price": "0"}] + BINANCE_ANSWER[1:]),
        httpx.Response(200, json=[{"symbol": "BTCUSDT", "price": "-5"}] + BINANCE_ANSWER[1:]),
        httpx.Response(200, json=[{"symbol": "BTCUSDT", "price": 5}] + BINANCE_ANSWER[1:]),
    ],
)
def test_a_bad_answer_from_binance_before_any_good_one_means_there_are_no_prices(reply):
    # The live Exchange never plays the replay as a stand-in (see the top of feed.py).
    with pytest.raises(SourceUnavailable):
        get(make_feed(FakeBinance(reply), FakeClock()))


@pytest.mark.parametrize("error", [httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError])
def test_a_network_failure_before_any_good_answer_means_there_are_no_prices(error):
    binance = FakeBinance(error("pretend network failure"))

    with pytest.raises(SourceUnavailable):
        get(make_feed(binance, FakeClock()))


def test_without_prices_the_error_is_the_standard_503_source_unavailable():
    with pytest.raises(SourceUnavailable) as unavailable:
        get(make_feed(FakeBinance(httpx.Response(500)), FakeClock()))

    assert unavailable.value.status_code == 503
    assert unavailable.value.code == "source_unavailable"


def test_after_a_good_answer_a_failure_gives_the_old_prices_marked_stale():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good(), httpx.Response(500)), clock)
    first = get(feed)

    clock.advance(61)
    second = get(feed)

    assert second.source == "stale"
    assert second.prices == first.prices
    assert second.as_of == first.as_of  # the time of the prices, not the time of the look


def test_a_failure_during_a_trade_gives_stale_prices_and_they_are_not_tradable():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good(), httpx.Response(500)), clock)
    get(feed)

    clock.advance(6)
    snapshot = get(feed, TRADE_MAX_PRICE_AGE_SECONDS)

    assert snapshot.source == "stale"
    assert snapshot.is_tradable is False


def test_old_prices_stay_stale_for_as_long_as_binance_is_away_and_the_replay_never_plays():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good(), httpx.Response(500)), clock)
    first = get(feed)

    for seconds in (599, 2, 3600, 24 * 3600):
        clock.advance(seconds)
        snapshot = get(feed)

        assert snapshot.source == "stale"
        assert snapshot.kind == "live"
        assert snapshot.prices == first.prices


def test_live_prices_come_back_when_binance_does():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good(), httpx.Response(500), good()), clock)
    get(feed)
    clock.advance(61)
    assert get(feed).source == "stale"

    clock.advance(61)

    assert get(feed).source == "live"


def test_after_a_failure_binance_is_asked_again_only_10_seconds_later():
    clock = FakeClock()
    binance = FakeBinance(good(), httpx.Response(500), good())
    feed = make_feed(binance, clock)
    get(feed)  # at 0 seconds: good prices

    clock.advance(6)
    assert get(feed, TRADE_MAX_PRICE_AGE_SECONDS).source == "stale"  # a trade asks, and it fails
    clock.advance(9)
    assert get(feed, TRADE_MAX_PRICE_AGE_SECONDS).source == "stale"  # 9 seconds later: too early
    assert len(binance.requests) == 2
    clock.advance(1)

    assert get(feed, TRADE_MAX_PRICE_AGE_SECONDS).source == "live"  # 10 seconds later: asked again
    assert len(binance.requests) == 3


def test_while_binance_is_down_a_look_or_a_trade_every_5_seconds_asks_it_every_10_seconds():
    clock = FakeClock()
    binance = FakeBinance(good(), httpx.Response(500))
    feed = make_feed(binance, clock)
    get(feed)
    clock.advance(61)

    for _ in range(13):  # a look or a trade every 5 seconds, for a minute and a little more
        get(feed, TRADE_MAX_PRICE_AGE_SECONDS)
        clock.advance(5)

    # The first good request, then a failing one at 61, 71, 81, 91, 101, 111 and 121 seconds.
    assert len(binance.requests) == 8


def test_a_failing_binance_does_not_log_anything_about_a_replay(caplog):
    feed = make_feed(FakeBinance(good(), httpx.Response(500)), FakeClock())

    with caplog.at_level(logging.WARNING):
        get(feed)

    assert "replay" not in caplog.text


# --- which prices a trade may use ---


def snapshot_from(source: str) -> PriceSnapshot:
    return PriceSnapshot({"BTCUSDT": D("1")}, source, datetime(2026, 11, 5, 12, 0, tzinfo=UTC))


@pytest.mark.parametrize("source", ["live", "cache", "replay"])
def test_live_cache_and_replay_prices_can_be_traded_on(source):
    assert snapshot_from(source).is_tradable is True


def test_stale_prices_cannot_be_traded_on():
    assert snapshot_from("stale").is_tradable is False


# --- demo mode: no real outside services ---


def test_a_feed_that_is_not_live_never_asks_binance_and_plays_the_replay():
    binance = FakeBinance(good())
    feed = PriceFeed(
        SYMBOLS, SMALL_REPLAY, transport=httpx.MockTransport(binance), clock=FakeClock(), live=False
    )

    snapshot = get(feed)

    assert snapshot.source == "replay"
    assert binance.requests == []


def test_a_feed_that_is_not_live_does_not_log_a_warning_about_binance(caplog):
    feed = PriceFeed(SYMBOLS, SMALL_REPLAY, clock=FakeClock(), live=False)

    with caplog.at_level(logging.WARNING):
        get(feed)

    assert caplog.text == ""


# --- parsing ---


def test_parse_prices_wants_every_symbol():
    with pytest.raises(FeedError, match="EURUSDT"):
        parse_prices(BINANCE_ANSWER[1:], SYMBOLS)


def test_parse_prices_ignores_symbols_nobody_asked_for():
    extra = BINANCE_ANSWER + [{"symbol": "DOGEUSDT", "price": "0.1"}]

    assert list(parse_prices(extra, SYMBOLS)) == list(SYMBOLS)


@pytest.mark.parametrize("value", [None, 5, 1.5, ["1"], "abc", "", "NaN", "Infinity", "0", "-1"])
def test_read_price_refuses_anything_but_text_that_is_a_number_above_zero(value):
    with pytest.raises(FeedError):
        read_price(value)


def test_read_price_keeps_all_decimals():
    assert read_price("0.00001234") == D("0.00001234")


# --- the replay ---


def test_the_replay_plays_forward_then_backward_forever():
    steps = [ping_pong_index(step, 4) for step in range(10)]

    assert steps == [0, 1, 2, 3, 2, 1, 0, 1, 2, 3]


def test_a_replay_of_two_minutes_goes_back_and_forth():
    assert [ping_pong_index(step, 2) for step in range(5)] == [0, 1, 0, 1, 0]


def at_minute(minute: int) -> datetime:
    """A time that is exactly `minute` whole minutes after the start of the Unix epoch."""
    return datetime.fromtimestamp(minute * 60 + 17, UTC)  # 17 seconds into the minute


def test_the_replay_plays_the_recorded_minute_that_belongs_to_the_clock():
    # 4 recorded minutes make a turn of 6 steps, and 8 % 6 = 2, so recorded minute 2 plays.
    snapshot = replay_snapshot(SMALL_REPLAY, SYMBOLS, at_minute(8))

    assert snapshot.prices["BTCUSDT"] == D("102")
    assert snapshot.prices["EURUSDT"] == D("1.3")


def test_the_same_time_always_gives_the_same_replay_prices():
    first = replay_snapshot(SMALL_REPLAY, SYMBOLS, at_minute(1234))
    second = replay_snapshot(SMALL_REPLAY, SYMBOLS, at_minute(1234))

    assert first == second


def test_the_replay_time_is_shifted_to_now_it_says_the_start_of_the_current_minute():
    now = at_minute(1234)

    snapshot = replay_snapshot(SMALL_REPLAY, SYMBOLS, now)

    assert snapshot.as_of == now.replace(second=0)
    assert snapshot.source == "replay"


def test_two_servers_at_the_same_moment_play_the_same_minute():
    clock = FakeClock()
    feed_one = make_feed(FakeBinance(good()), clock, live=False)
    feed_two = make_feed(FakeBinance(good()), clock, live=False)

    assert get(feed_one) == get(feed_two)


def test_the_replay_moves_on_by_one_recorded_minute_per_real_minute():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good()), clock, live=False)
    first = get(feed)

    clock.advance(60)
    second = get(feed)

    assert first.prices != second.prices


def test_a_feed_refuses_to_start_if_the_replay_lacks_a_symbol_it_needs():
    with pytest.raises(FeedError, match="SOLUSDT"):
        PriceFeed(("BTCUSDT", "SOLUSDT"), SMALL_REPLAY)


# --- the replay file in the repository ---

REAL_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "EURUSDT", "PAXGUSDT")


def test_the_real_replay_has_90_minutes_for_all_seven_symbols():
    replay = load_replay()

    assert replay.candles == 90
    assert replay.candle_seconds == 60
    assert tuple(replay.closes) == REAL_SYMBOLS
    assert all(len(prices) == 90 for prices in replay.closes.values())


def test_the_real_replay_credits_binance_vision_and_names_its_licence():
    replay = load_replay()
    text = REPLAY_FILE.read_text()

    assert replay.credit == "Binance Vision"
    assert replay.licence == "CC BY-NC-SA 4.0"
    assert replay.licence_url == "https://creativecommons.org/licenses/by-nc-sa/4.0/"
    assert "https://creativecommons.org/licenses/by-nc-sa/4.0/" in text
    assert "Binance_Vision-Terms_of_Use.pdf" in text
    assert "changes" in json.loads(text)  # CC BY says: say what you changed


def test_the_real_replay_has_only_prices_above_zero():
    replay = load_replay()

    assert all(price > 0 for prices in replay.closes.values() for price in prices)


def test_the_real_replay_has_no_jump_of_more_than_half_a_percent_between_two_minutes():
    replay = load_replay()
    biggest = {}
    for symbol, prices in replay.closes.items():
        steps = [abs(prices[i + 1] / prices[i] - 1) for i in range(len(prices) - 1)]
        biggest[symbol] = max(steps)

    assert all(step < D("0.005") for step in biggest.values()), biggest


def test_the_real_replay_prices_are_in_the_range_of_the_instruments():
    closes = load_replay().closes

    assert D("50000") < closes["BTCUSDT"][0] < D("150000")
    assert D("1.0") < closes["EURUSDT"][0] < D("1.3")
    assert D("3000") < closes["PAXGUSDT"][0] < D("6000")


def test_the_real_replay_works_with_the_real_companies():
    from server.market.companies import load_companies

    symbols = [company.symbol for company in load_companies()]

    PriceFeed(symbols, load_replay())  # raises FeedError if a symbol were missing


# --- a damaged replay file is refused with a clear message ---


def write_replay(tmp_path, **changes):
    data = {
        "credit": "Binance Vision",
        "licence": "CC BY-NC-SA 4.0",
        "candleSeconds": 60,
        "candles": 3,
        "closes": {"BTCUSDT": [1.5, 2, 3.25]},
    }
    data.update(changes)
    path = tmp_path / "replay.json"
    path.write_text(json.dumps(data))
    return path


def test_a_small_good_replay_loads_with_exact_numbers(tmp_path):
    replay = load_replay(write_replay(tmp_path))

    assert replay.closes["BTCUSDT"] == (D("1.5"), D("2"), D("3.25"))


def test_a_replay_without_a_licence_link_loads_and_has_none(tmp_path):
    assert load_replay(write_replay(tmp_path)).licence_url is None


def test_a_replay_with_a_licence_link_keeps_it(tmp_path):
    replay = load_replay(write_replay(tmp_path, licenceUrl="https://example.org/licence"))

    assert replay.licence_url == "https://example.org/licence"


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"credit": ""}, "credit"),
        ({"credit": None}, "credit"),
        ({"licence": ""}, "licence"),
        ({"candles": 1, "closes": {"BTCUSDT": [1]}}, "candles"),
        ({"candles": "3"}, "candles"),
        ({"candleSeconds": 0}, "candleSeconds"),
        ({"closes": {}}, "no prices"),
        ({"closes": {"BTCUSDT": [1, 2]}}, "does not have 3 prices"),
        ({"closes": {"BTCUSDT": [1, 2, 0]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, -3]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, "3"]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, True]}}, "not above 0"),
        ({"licenceUrl": "javascript:alert(1)"}, "licenceUrl"),
        ({"licenceUrl": "http://example.org/licence"}, "licenceUrl"),
        ({"licenceUrl": 5}, "licenceUrl"),
    ],
)
def test_a_damaged_replay_is_refused(tmp_path, changes, message):
    with pytest.raises(FeedError, match=message):
        load_replay(write_replay(tmp_path, **changes))


def test_a_replay_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "replay.json"
    path.write_text("nope")

    with pytest.raises(FeedError, match="Cannot read"):
        load_replay(path)


# --- the credit line ---


def test_the_licence_link_is_given_only_while_the_replay_plays():
    replay = Replay(
        closes=SMALL_REPLAY.closes,
        candles=4,
        candle_seconds=60,
        credit="Binance Vision",
        licence="CC BY-NC-SA 4.0",
        licence_url="https://example.org/licence",
    )
    feed = PriceFeed(SYMBOLS, replay, clock=FakeClock())

    assert feed.licence_url("replay") == "https://example.org/licence"
    for source in ("live", "cache", "stale"):
        assert feed.licence_url(source) is None


def test_the_credit_line_of_live_prices_names_binance_and_says_simulation():
    feed = make_feed(FakeBinance(good()), FakeClock())

    for source in ("live", "cache", "stale"):
        assert feed.attribution(source) == ATTRIBUTION_LIVE
    assert "Binance" in ATTRIBUTION_LIVE
    assert "play money" in ATTRIBUTION_LIVE


def test_the_credit_line_of_the_replay_names_the_data_and_its_licence():
    feed = make_feed(FakeBinance(good()), FakeClock())

    text = feed.attribution("replay")

    assert "Binance Vision" in text
    assert "CC BY-NC-SA 4.0" in text
    assert "play money" in text
