"""Tests for market/feed.py: the caches, the freshness and the sources behind the board.

The feed gives one Reading per company: the price, when it was quoted, when this server instance
fetched it, and where it came from (live, cache, stale, replay or none). Nothing here uses the
network: Binance and the stock provider are fake transports, and the clock only moves when the
test says so.

The rules under test (specs/L4-exchange-v2.md, section 4.4):
  island companies   one Binance request for all pairs; the board accepts prices up to 60 seconds
                     old, a trade only 5 seconds; after a failure Binance is asked again after 10
                     seconds; the quote time is the fetch time.
  stock companies    one call per stock, sent together; the same ages; after a failure the source
                     waits 30 seconds; no call while a market is closed and a final price is held.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest

from server.market.binance import BINANCE_URL
from server.market.calendars import load_calendars
from server.market.feed import (
    BOARD_MAX_AGE_SECONDS,
    TRADE_MAX_AGE_SECONDS,
    PriceFeed,
)
from server.market.readings import NO_READING
from server.market.replay import Replay, ReplayError
from server.market.stocks import CallBudget, StockSource
from server.tests.helpers import FakeClock
from server.tests.market_helpers import (
    KEY,
    NY_NIGHT,
    NY_OPEN,
    QUOTED_AT,
    FakeBinance,
    FakeProvider,
    FakeStockServer,
    good_binance_answer,
    island_company,
    stock_company,
)

D = Decimal

CALENDARS = load_calendars()
BTC = island_company("BTCUSDT")
ETH = island_company("ETHUSDT")
EUR = island_company("EURUSDT")
ISLANDS = (BTC, ETH, EUR)
APPLE = stock_company("AAPL")
NVIDIA = stock_company("NVDA")
COCA = stock_company("KO")
STOCKS = (APPLE, NVIDIA, COCA)

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


def make_feed(binance: FakeBinance, clock: FakeClock, companies=ISLANDS, **options) -> PriceFeed:
    return PriceFeed(
        companies,
        CALENDARS,
        SMALL_REPLAY,
        transport=httpx.MockTransport(binance),
        clock=clock,
        **options,
    )


def make_stock_feed(server: FakeStockServer, clock: FakeClock, **source_options):
    """A feed with the three island companies, three stocks and a fake stock provider."""
    binance = FakeBinance(good_binance_answer())
    source = StockSource(
        FakeProvider(),
        KEY,
        transport=httpx.MockTransport(server),
        clock=clock,
        **source_options,
    )
    return make_feed(binance, clock, ISLANDS + STOCKS, stocks=source), binance


def read(feed: PriceFeed, max_age: float = BOARD_MAX_AGE_SECONDS, only=None) -> dict:
    return asyncio.run(feed.read(max_age, only=only))


def at(clock: FakeClock, moment: datetime) -> FakeClock:
    clock.now = moment
    return clock


# --- the agreed ages ---


def test_the_agreed_ages_are_60_seconds_for_the_board_and_5_seconds_for_a_trade():
    assert BOARD_MAX_AGE_SECONDS == 60
    assert TRADE_MAX_AGE_SECONDS == 5


# --- the Binance request ---


def test_one_request_asks_binance_for_all_pairs_at_the_documented_address():
    binance = FakeBinance(good_binance_answer())

    read(make_feed(binance, FakeClock()))

    assert len(binance.requests) == 1
    request = binance.requests[0]
    assert request.method == "GET"
    assert str(request.url).startswith(f"{BINANCE_URL}/api/v3/ticker/price?")
    assert json.loads(request.url.params["symbols"]) == ["BTCUSDT", "ETHUSDT", "EURUSDT"]


def test_the_request_is_keyless_and_sends_no_secret_header():
    binance = FakeBinance(good_binance_answer())

    read(make_feed(binance, FakeClock()))

    headers = {name.lower() for name in binance.requests[0].headers}
    assert "authorization" not in headers
    assert "x-mbx-apikey" not in headers
    assert "apikey" not in headers


def test_live_prices_are_exact_and_the_quote_time_is_the_fetch_time():
    clock = FakeClock()

    readings = read(make_feed(FakeBinance(good_binance_answer()), clock))

    btc = readings[BTC.id]
    assert btc.source == "live"
    assert btc.price == D("76159.21")
    assert btc.fetched_at == clock.now
    assert btc.quoted_at == clock.now
    assert readings[EUR.id].price == D("1.1246")


def test_there_is_one_reading_for_every_company_and_a_live_reading_is_of_the_live_price_mode():
    readings = read(make_feed(FakeBinance(good_binance_answer()), FakeClock()))

    assert list(readings) == [BTC.id, ETH.id, EUR.id]
    assert {reading.price_mode for reading in readings.values()} == {"live"}


# --- the cache: one request per minute ---


def test_a_second_look_inside_a_minute_uses_the_cache_and_asks_binance_nothing():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    first = read(feed)

    clock.advance(59)
    second = read(feed)

    assert second[BTC.id].source == "cache"
    assert second[BTC.id].price == first[BTC.id].price
    assert second[BTC.id].fetched_at == first[BTC.id].fetched_at
    assert len(binance.requests) == 1


def test_after_a_minute_the_next_look_asks_binance_again():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)

    clock.advance(60)
    second = read(feed)

    assert second[BTC.id].source == "live"
    assert len(binance.requests) == 2


def test_a_rush_of_players_at_the_same_moment_causes_one_request():
    async def hundred_players() -> list:
        feed = make_feed(binance, FakeClock())
        return await asyncio.gather(*[feed.read(BOARD_MAX_AGE_SECONDS) for _ in range(100)])

    binance = FakeBinance(good_binance_answer())

    answers = asyncio.run(hundred_players())

    assert len(binance.requests) == 1
    assert {readings[BTC.id].source for readings in answers} <= {"live", "cache"}
    assert len({readings[BTC.id].price for readings in answers}) == 1


# --- a trade needs younger prices than the board ---


def test_prices_older_than_the_limit_of_a_trade_are_fetched_again():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)  # the board looks: one request

    clock.advance(6)
    readings = read(feed, TRADE_MAX_AGE_SECONDS)

    assert readings[BTC.id].source == "live"
    assert len(binance.requests) == 2


def test_prices_younger_than_the_limit_of_a_trade_come_from_the_cache():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)

    clock.advance(4.9)
    readings = read(feed, TRADE_MAX_AGE_SECONDS)

    assert readings[BTC.id].source == "cache"
    assert len(binance.requests) == 1


def test_prices_exactly_as_old_as_the_limit_of_a_trade_are_fetched_again():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer()), clock)
    read(feed)

    clock.advance(TRADE_MAX_AGE_SECONDS)

    assert read(feed, TRADE_MAX_AGE_SECONDS)[BTC.id].source == "live"


def test_the_board_still_accepts_prices_that_a_trade_would_refuse():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)

    clock.advance(30)

    assert read(feed)[BTC.id].source == "cache"  # the board's own limit is 60 seconds
    assert len(binance.requests) == 1


def test_a_fetch_for_a_trade_also_refreshes_the_cache_of_the_board():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)
    clock.advance(30)
    read(feed, TRADE_MAX_AGE_SECONDS)  # a trade fetches again

    clock.advance(30)  # the board looks 30 seconds later: the new prices are 30 seconds old

    assert read(feed)[BTC.id].source == "cache"
    assert len(binance.requests) == 2


def test_a_trade_on_one_island_company_still_reads_that_company_only():
    feed = make_feed(FakeBinance(good_binance_answer()), FakeClock())

    readings = read(feed, TRADE_MAX_AGE_SECONDS, only=ETH)

    assert list(readings) == [ETH.id]
    assert readings[ETH.id].price == D("2255.69")


def test_a_rush_of_trades_at_the_same_moment_causes_one_request():
    async def hundred_traders() -> list:
        clock = FakeClock()
        feed = make_feed(binance, clock)
        await feed.read(BOARD_MAX_AGE_SECONDS)
        clock.advance(10)
        return await asyncio.gather(
            *[feed.read(TRADE_MAX_AGE_SECONDS, only=BTC) for _ in range(100)]
        )

    binance = FakeBinance(good_binance_answer())

    answers = asyncio.run(hundred_traders())

    assert len(binance.requests) == 2  # the first look, and one for the whole rush
    assert {readings[BTC.id].source for readings in answers} <= {"live", "cache"}


def test_trading_all_the_time_asks_binance_at_most_every_5_seconds():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, clock)

    for _ in range(60):  # one trade every second for a minute
        read(feed, TRADE_MAX_AGE_SECONDS, only=BTC)
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
        httpx.Response(200, json=[]),  # a list with none of our pairs
    ],
)
def test_a_bad_answer_from_binance_before_any_good_one_means_no_price_for_anybody(reply):
    readings = read(make_feed(FakeBinance(reply), FakeClock()))

    assert {reading.source for reading in readings.values()} == {"none"}
    assert {reading.price for reading in readings.values()} == {None}


@pytest.mark.parametrize("error", [httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError])
def test_a_network_failure_before_any_good_answer_means_no_price(error):
    binance = FakeBinance(error("pretend network failure"))

    readings = read(make_feed(binance, FakeClock()))

    assert readings[BTC.id] == NO_READING


def test_a_failure_never_raises_an_error_the_board_just_has_no_price():
    feed = make_feed(FakeBinance(httpx.Response(500)), FakeClock())

    assert read(feed)[BTC.id].has_price is False


def test_after_a_good_answer_a_failure_gives_the_old_prices_marked_stale_with_their_time():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer(), httpx.Response(500)), clock)
    first = read(feed)

    clock.advance(61)
    second = read(feed)

    assert second[BTC.id].source == "stale"
    assert second[BTC.id].price == first[BTC.id].price
    assert second[BTC.id].fetched_at == first[BTC.id].fetched_at  # the time of the prices
    assert second[BTC.id].quoted_at == first[BTC.id].quoted_at


def test_a_failure_during_a_trade_gives_stale_prices():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer(), httpx.Response(500)), clock)
    read(feed)

    clock.advance(6)
    readings = read(feed, TRADE_MAX_AGE_SECONDS, only=BTC)

    assert readings[BTC.id].source == "stale"


def test_old_prices_stay_stale_for_as_long_as_binance_is_away_and_the_replay_never_plays():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer(), httpx.Response(500)), clock)
    first = read(feed)

    for seconds in (599, 2, 3600, 24 * 3600):
        clock.advance(seconds)
        reading = read(feed)[BTC.id]

        assert reading.source == "stale"
        assert reading.price_mode == "live"
        assert reading.price == first[BTC.id].price


def test_live_prices_come_back_when_binance_does():
    clock = FakeClock()
    feed = make_feed(
        FakeBinance(good_binance_answer(), httpx.Response(500), good_binance_answer()), clock
    )
    read(feed)
    clock.advance(61)
    assert read(feed)[BTC.id].source == "stale"

    clock.advance(61)

    assert read(feed)[BTC.id].source == "live"


def test_after_a_failure_binance_is_asked_again_only_10_seconds_later():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer(), httpx.Response(500), good_binance_answer())
    feed = make_feed(binance, clock)
    read(feed)  # at 0 seconds: good prices

    clock.advance(6)
    assert read(feed, TRADE_MAX_AGE_SECONDS)[BTC.id].source == "stale"  # a trade asks, it fails
    clock.advance(9)
    assert read(feed, TRADE_MAX_AGE_SECONDS)[BTC.id].source == "stale"  # 9 seconds later: too early
    assert len(binance.requests) == 2
    clock.advance(1)

    assert read(feed, TRADE_MAX_AGE_SECONDS)[BTC.id].source == "live"  # 10 seconds later: asked
    assert len(binance.requests) == 3


def test_while_binance_is_down_a_look_or_a_trade_every_5_seconds_asks_it_every_10_seconds():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer(), httpx.Response(500))
    feed = make_feed(binance, clock)
    read(feed)
    clock.advance(61)

    for _ in range(13):  # a look or a trade every 5 seconds, for a minute and a little more
        read(feed, TRADE_MAX_AGE_SECONDS, only=BTC)
        clock.advance(5)

    # The first good request, then a failing one at 61, 71, 81, 91, 101, 111 and 121 seconds.
    assert len(binance.requests) == 8


def test_a_failing_binance_does_not_log_anything_about_a_replay(caplog):
    feed = make_feed(FakeBinance(good_binance_answer(), httpx.Response(500)), FakeClock())

    with caplog.at_level(logging.WARNING, logger="server"):
        read(feed)

    assert "replay" not in caplog.text


def test_a_failure_is_logged_by_its_kind_only(caplog):
    binance = FakeBinance(httpx.ReadTimeout("pretend slow answer for https://secret.example/x"))

    with caplog.at_level(logging.WARNING, logger="server"):
        read(make_feed(binance, FakeClock()))

    assert "ReadTimeout" in caplog.text
    assert "secret.example" not in caplog.text


# --- a pair that is missing from a good answer ---


def test_a_pair_missing_from_a_good_answer_leaves_only_that_company_without_a_price():
    binance = FakeBinance(good_binance_answer({"BTCUSDT": "77000.00", "ETHUSDT": "2300.00"}))

    readings = read(make_feed(binance, FakeClock()))

    assert readings[BTC.id].source == "live"
    assert readings[ETH.id].source == "live"
    assert readings[EUR.id] == NO_READING


def test_a_pair_that_disappears_keeps_its_old_price_marked_stale_while_the_others_are_fresh():
    clock = FakeClock()
    second = good_binance_answer({"BTCUSDT": "77000.00", "ETHUSDT": "2300.00"})
    feed = make_feed(FakeBinance(good_binance_answer(), second), clock)
    first = read(feed)

    clock.advance(61)
    readings = read(feed)

    assert readings[BTC.id].source == "live"
    assert readings[BTC.id].price == D("77000.00")
    assert readings[EUR.id].source == "stale"
    assert readings[EUR.id].price == first[EUR.id].price
    assert readings[EUR.id].fetched_at == first[EUR.id].fetched_at


def test_a_missing_pair_does_not_make_binance_get_asked_on_every_look():
    clock = FakeClock()
    binance = FakeBinance(good_binance_answer({"BTCUSDT": "77000.00", "ETHUSDT": "2300.00"}))
    feed = make_feed(binance, clock)

    for _ in range(5):
        read(feed)
        clock.advance(10)

    assert len(binance.requests) == 1


def test_a_pair_with_a_bad_price_is_left_out_and_the_others_stay():
    answer = [{"symbol": "BTCUSDT", "price": "abc"}] + [
        {"symbol": "ETHUSDT", "price": "2300"},
        {"symbol": "EURUSDT", "price": "1.1"},
    ]
    binance = FakeBinance(httpx.Response(200, json=answer))

    readings = read(make_feed(binance, FakeClock()))

    assert readings[BTC.id] == NO_READING
    assert readings[ETH.id].price == D("2300")


# --- demo mode: no real outside services ---


def test_a_feed_that_is_not_live_never_asks_binance_and_plays_the_replay():
    binance = FakeBinance(good_binance_answer())

    readings = read(make_feed(binance, FakeClock(), live=False))

    assert readings[BTC.id].source == "replay"
    assert readings[BTC.id].price_mode == "replay"
    assert binance.requests == []


def test_a_replay_reading_says_the_minute_that_plays_and_is_fetched_now():
    clock = FakeClock()
    clock.now = datetime.fromtimestamp(8 * 60 + 17, UTC)  # 17 seconds into minute 8

    reading = read(make_feed(FakeBinance(good_binance_answer()), clock, live=False))[BTC.id]

    assert reading.price == D("102")  # 8 % 6 = 2, so recorded minute 2 plays
    assert reading.quoted_at == clock.now.replace(second=0)
    assert reading.fetched_at == clock.now


def test_a_feed_that_is_not_live_does_not_log_a_warning(caplog):
    feed = make_feed(FakeBinance(good_binance_answer()), FakeClock(), live=False)

    with caplog.at_level(logging.WARNING, logger="server"):
        read(feed)

    assert caplog.text == ""


def test_two_servers_at_the_same_moment_play_the_same_minute():
    clock = FakeClock()
    feed_one = make_feed(FakeBinance(good_binance_answer()), clock, live=False)
    feed_two = make_feed(FakeBinance(good_binance_answer()), clock, live=False)

    assert read(feed_one) == read(feed_two)


def test_the_replay_moves_on_by_one_recorded_minute_per_real_minute():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer()), clock, live=False)
    first = read(feed)

    clock.advance(60)
    second = read(feed)

    assert first[BTC.id].price != second[BTC.id].price


def test_in_demo_mode_the_stock_companies_have_no_reading_and_their_provider_is_never_asked():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    source = StockSource(FakeProvider(), KEY, transport=httpx.MockTransport(server), clock=clock)
    feed = make_feed(
        FakeBinance(good_binance_answer()), clock, ISLANDS + STOCKS, stocks=source, live=False
    )

    readings = read(feed)

    assert readings[APPLE.id] == NO_READING
    assert readings[BTC.id].source == "replay"
    assert server.requests == []


def test_a_feed_refuses_to_start_if_the_replay_lacks_a_pair_an_island_company_needs():
    with pytest.raises(ReplayError, match="SOLUSDT"):
        make_feed(FakeBinance(), FakeClock(), (island_company("SOLUSDT"),))


def test_stock_companies_do_not_need_prices_in_the_replay():
    make_feed(FakeBinance(good_binance_answer()), FakeClock(), ISLANDS + STOCKS)  # raises nothing


# --- stock companies: a refresh asks for every stock together ---


def test_a_board_look_while_the_market_is_open_asks_for_every_stock_together():
    server = FakeStockServer()
    feed, _binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    readings = read(feed)

    assert sorted(server.asked_symbols()) == ["AAPL", "KO", "NVDA"]
    assert readings[APPLE.id].price == D("271.20")
    assert readings[NVIDIA.id].price == D("190.10")
    assert readings[COCA.id].price == D("70.55")


def test_the_quote_time_of_a_stock_is_the_time_of_the_provider_not_our_fetch_time():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)

    reading = read(feed)[APPLE.id]

    assert reading.quoted_at == QUOTED_AT
    assert reading.fetched_at == clock.now
    assert reading.source == "live"
    assert reading.price_mode == "live"


def test_the_island_companies_and_the_stocks_are_read_in_one_look():
    server = FakeStockServer()
    feed, binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    readings = read(feed)

    assert len(binance.requests) == 1
    assert readings[BTC.id].price == D("76159.21")
    assert readings[APPLE.id].price == D("271.20")


def test_a_second_board_look_inside_a_minute_asks_the_provider_nothing():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(59)
    readings = read(feed)

    assert readings[APPLE.id].source == "cache"
    assert len(server.requests) == 3


def test_after_a_minute_the_next_board_look_asks_the_provider_again():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(60)
    readings = read(feed)

    assert readings[APPLE.id].source == "live"
    assert len(server.requests) == 6


def test_a_rush_of_players_at_the_same_moment_causes_one_refresh_of_the_stocks():
    async def hundred_players() -> None:
        await asyncio.gather(*[feed.read(BOARD_MAX_AGE_SECONDS) for _ in range(100)])

    server = FakeStockServer()
    feed, _binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    asyncio.run(hundred_players())

    assert len(server.requests) == 3


def test_a_stock_trade_refreshes_only_its_own_symbol():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    read(feed)  # the board looks: three calls

    clock.advance(10)
    readings = read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)

    assert list(readings) == [APPLE.id]
    assert readings[APPLE.id].source == "live"
    assert server.asked_symbols()[3:] == ["AAPL"]


def test_a_stock_trade_inside_five_seconds_uses_the_cache():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(4)
    readings = read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)

    assert readings[APPLE.id].source == "cache"
    assert len(server.requests) == 3


def test_a_trade_on_an_island_company_does_not_call_the_stock_provider():
    server = FakeStockServer()
    feed, binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    read(feed, TRADE_MAX_AGE_SECONDS, only=BTC)

    assert server.requests == []
    assert len(binance.requests) == 1


def test_a_stock_trade_does_not_call_binance():
    server = FakeStockServer()
    feed, binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)

    assert binance.requests == []
    assert server.asked_symbols() == ["AAPL"]


def test_a_provider_with_a_batch_call_is_asked_with_one_request_for_all_stocks():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    source = StockSource(
        FakeProvider(batch=True), KEY, transport=httpx.MockTransport(server), clock=clock
    )
    feed = make_feed(FakeBinance(good_binance_answer()), clock, ISLANDS + STOCKS, stocks=source)

    read(feed)

    assert len(server.requests) == 1
    assert sorted(server.asked_symbols()) == ["AAPL", "KO", "NVDA"]


def test_a_stock_with_no_quote_is_left_without_a_price_and_not_asked_on_every_look():
    server = FakeStockServer({"AAPL": "271.20", "NVDA": "190.10"})  # KO is unknown to it
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)

    first = read(feed)
    for _ in range(4):
        clock.advance(10)
        read(feed)

    assert first[COCA.id] == NO_READING
    assert first[APPLE.id].price == D("271.20")
    assert len(server.requests) == 3


# --- stock companies: when the call budget is used up ---


def test_a_refresh_that_would_go_over_the_budget_is_not_sent_and_the_stock_keeps_its_last_price():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock, budget=CallBudget(3, 60, clock))
    first = read(feed)  # three calls: the budget is used up

    clock.advance(61)  # the budget is free again after 60 seconds, so this look is fine
    assert read(feed)[APPLE.id].source == "live"
    clock.advance(10)
    readings = read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)  # one call more would go over

    assert readings[APPLE.id].source == "stale"
    assert readings[APPLE.id].price == first[APPLE.id].price
    assert len(server.requests) == 6


def test_a_trade_that_needs_a_fresh_stock_price_gets_a_stale_reading_when_the_budget_is_gone():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock, budget=CallBudget(3, 60, clock))
    read(feed)

    clock.advance(10)
    reading = read(feed, TRADE_MAX_AGE_SECONDS, only=NVIDIA)[NVIDIA.id]

    assert reading.source == "stale"
    assert len(server.requests) == 3


def test_a_refresh_stopped_by_the_budget_does_not_start_the_30_second_wait():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock, budget=CallBudget(3, 20, clock))
    read(feed)  # three calls: the budget is used up
    clock.advance(10)
    assert read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)[APPLE.id].source == "stale"  # not sent

    clock.advance(11)  # the three calls have left the window of 20 seconds

    # A failure would have made the source wait until 30 seconds. The budget stop does not.
    assert read(feed, TRADE_MAX_AGE_SECONDS, only=APPLE)[APPLE.id].source == "live"


# --- stock companies: when the provider fails ---


def test_a_stock_with_no_price_yet_stays_without_a_price_when_the_provider_fails():
    server = FakeStockServer()
    server.status = 429
    feed, _binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    readings = read(feed)

    assert readings[APPLE.id] == NO_READING
    assert readings[BTC.id].source == "live"  # Binance is not affected


@pytest.mark.parametrize("status", [429, 500, 503])
def test_after_a_failure_or_a_429_the_stock_source_waits_30_seconds(status):
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    server.status = status
    read(feed)  # three calls, all fail

    clock.advance(29)
    read(feed)
    assert len(server.requests) == 3  # 29 seconds later: too early

    clock.advance(1)
    server.status = 200

    assert read(feed)[APPLE.id].source == "live"  # 30 seconds later: asked again
    assert len(server.requests) == 6


def test_after_a_good_price_a_failing_provider_leaves_the_old_price_marked_stale():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    first = read(feed)

    server.status = 500
    clock.advance(61)
    reading = read(feed)[APPLE.id]

    assert reading.source == "stale"
    assert reading.price == first[APPLE.id].price
    assert reading.fetched_at == first[APPLE.id].fetched_at


def test_one_failing_stock_call_does_not_lose_the_prices_of_the_others():
    server = FakeStockServer()
    server.fail_for = {"NVDA"}
    feed, _binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))

    readings = read(feed)

    assert readings[APPLE.id].source == "live"
    assert readings[NVIDIA.id] == NO_READING
    assert readings[COCA.id].source == "live"


def test_a_failing_binance_does_not_stop_the_stocks():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    source = StockSource(FakeProvider(), KEY, transport=httpx.MockTransport(server), clock=clock)
    feed = make_feed(FakeBinance(httpx.Response(500)), clock, ISLANDS + STOCKS, stocks=source)

    readings = read(feed)

    assert readings[BTC.id] == NO_READING
    assert readings[APPLE.id].source == "live"


# --- stock companies: while the market is closed ---


def test_a_fresh_instance_while_the_market_is_closed_asks_once_to_learn_the_last_price():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_NIGHT)
    feed, _binance = make_stock_feed(server, clock)

    first = read(feed)
    clock.advance(3600)
    second = read(feed)
    clock.advance(12 * 3600)
    third = read(feed)

    assert len(server.requests) == 3  # one refresh of three symbols, never again
    assert first[APPLE.id].source == "live"
    assert second[APPLE.id].source == "cache"
    assert third[APPLE.id].source == "cache"
    assert third[APPLE.id].price == D("271.20")


def test_a_price_fetched_after_the_close_is_a_final_price_and_never_stale_however_old_it_gets():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 6, 22, 0, tzinfo=UTC))  # Friday evening, closed
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(30 * 3600)  # Sunday 04:00 UTC: the market is still closed

    assert read(feed)[APPLE.id].source == "cache"
    assert len(server.requests) == 3


def test_a_price_fetched_less_than_10_minutes_after_the_close_is_asked_for_again():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 9, 21, 5, tzinfo=UTC))  # 5 minutes after the close
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(30)
    assert read(feed)[APPLE.id].source == "cache"  # the board asks at most once a minute
    clock.advance(31)  # 21:06:01: the first price is more than a minute old, but not final yet
    assert read(feed)[APPLE.id].source == "live"
    clock.advance(5 * 60)  # 21:11:01: ten minutes have passed since the close
    assert read(feed)[APPLE.id].source == "live"  # this price is final
    calls_so_far = len(server.requests)
    clock.advance(3600)

    assert read(feed)[APPLE.id].source == "cache"
    assert len(server.requests) == calls_so_far


def test_a_price_from_the_open_session_is_asked_for_once_more_after_the_close():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 9, 20, 59, tzinfo=UTC))  # one minute before closing
    feed, _binance = make_stock_feed(server, clock)
    read(feed)
    assert len(server.requests) == 3

    clock.advance(11 * 60)  # 21:10: closed for ten minutes
    readings = read(feed)

    assert readings[APPLE.id].source == "live"
    assert len(server.requests) == 6


def test_when_the_provider_fails_after_the_close_the_last_price_is_marked_stale():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 9, 20, 59, tzinfo=UTC))
    feed, _binance = make_stock_feed(server, clock)
    first = read(feed)
    server.status = 500

    clock.advance(11 * 60)
    reading = read(feed)[APPLE.id]

    assert reading.source == "stale"  # it was fetched before the close: it may not be final
    assert reading.price == first[APPLE.id].price


def test_on_a_weekend_nothing_is_asked_once_a_final_price_is_held():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 7, 12, 0, tzinfo=UTC))  # Saturday
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    clock.advance(24 * 3600)
    read(feed)

    assert len(server.requests) == 3


def test_when_the_market_opens_again_the_stocks_are_asked_for_new_prices():
    server = FakeStockServer()
    clock = at(FakeClock(), datetime(2026, 11, 7, 12, 0, tzinfo=UTC))  # Saturday
    feed, _binance = make_stock_feed(server, clock)
    read(feed)

    at(clock, datetime(2026, 11, 9, 14, 31, tzinfo=UTC))  # Monday, one minute after the opening
    readings = read(feed)

    assert readings[APPLE.id].source == "live"
    assert len(server.requests) == 6


def test_before_the_calendar_starts_a_stock_is_still_asked_once():
    server = FakeStockServer()
    clock = FakeClock()  # 5 Nov 2026: before the calendar (6 Nov), so the market has no hours
    feed, _binance = make_stock_feed(server, clock)

    read(feed)
    clock.advance(600)
    read(feed)

    assert len(server.requests) == 3


# --- the stock source is off ---


def test_without_a_stock_source_the_stock_companies_have_no_reading_and_no_call_is_made():
    binance = FakeBinance(good_binance_answer())
    feed = make_feed(binance, at(FakeClock(), NY_OPEN), ISLANDS + STOCKS)

    readings = read(feed)

    assert readings[APPLE.id] == NO_READING
    assert readings[BTC.id].source == "live"


def test_the_feed_says_which_companies_have_a_price_source():
    server = FakeStockServer()
    feed, _binance = make_stock_feed(server, at(FakeClock(), NY_OPEN))
    without_stocks = make_feed(FakeBinance(), FakeClock(), ISLANDS + STOCKS)

    assert feed.source_is_on(BTC) is True
    assert feed.source_is_on(APPLE) is True
    assert feed.source_is_on(stock_company("SAP", "xetra")) is False  # the provider covers "us"
    assert without_stocks.source_is_on(BTC) is True
    assert without_stocks.source_is_on(APPLE) is False


def test_a_stock_company_whose_market_the_provider_does_not_cover_is_never_asked_for():
    server = FakeStockServer()
    clock = at(FakeClock(), NY_OPEN)
    feed, _binance = make_stock_feed(server, clock)
    german = stock_company("SAP", "xetra")
    feed.companies = (*feed.companies, german)

    readings = read(feed)

    assert readings[german.id] == NO_READING
    assert "SAP" not in server.asked_symbols()


# --- how old a reading is, in the words of the clock ---


def test_the_reading_of_a_fetch_that_happened_earlier_keeps_its_own_time():
    clock = FakeClock()
    feed = make_feed(FakeBinance(good_binance_answer()), clock)
    started = clock.now
    read(feed)

    clock.advance(timedelta(minutes=2).total_seconds())
    reading = read(feed, 1000)[BTC.id]

    assert reading.fetched_at == started
    assert reading.source == "cache"
