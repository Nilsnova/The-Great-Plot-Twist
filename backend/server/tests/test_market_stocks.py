"""Tests for market/stocks.py and market/stock_finnhub.py: the stock source.

Nothing here uses the network: the provider's server is a fake transport (httpx.MockTransport),
the clock is a fake clock, and the answers are invented numbers in the shape of the real answer
(never recorded vendor prices).
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest

from server.market import stocks
from server.market.stock_finnhub import FinnhubProvider
from server.market.stocks import (
    STOCK_CALLS_PER_MINUTE,
    CallBudget,
    Quote,
    StockAnswerError,
    StockSource,
    StockSourceError,
    build_stock_source,
    make_quote,
    provider_named,
)
from server.tests.helpers import FakeClock
from server.tests.market_helpers import (
    KEY,
    QUOTED_AT,
    FakeProvider,
    FakeStockServer,
    stock_company,
)

D = Decimal


def make_source(server: FakeStockServer, clock: FakeClock, batch: bool = False, **options):
    return StockSource(
        FakeProvider(batch=batch),
        KEY,
        transport=httpx.MockTransport(server),
        clock=clock,
        **options,
    )


def fetch(source: StockSource, symbols):
    return asyncio.run(source.fetch(symbols))


# --- turning the source on or off ---


def test_the_agreed_call_budget_is_25_calls_a_minute():
    assert STOCK_CALLS_PER_MINUTE == 25


def test_the_source_is_off_when_the_provider_is_empty():
    assert build_stock_source("", KEY) is None


def test_the_source_is_off_without_a_warning_when_nothing_is_configured(caplog):
    with caplog.at_level(logging.WARNING):
        build_stock_source("", "")

    assert caplog.text == ""


def test_the_source_is_off_with_one_warning_when_the_key_is_empty(caplog):
    with caplog.at_level(logging.WARNING):
        source = build_stock_source("finnhub", "")

    assert source is None
    assert len(caplog.records) == 1
    assert "STOCK_API_KEY" in caplog.text


def test_a_known_provider_with_a_key_builds_a_source():
    source = build_stock_source("finnhub", KEY)

    assert isinstance(source, StockSource)
    assert source.provider.name == "finnhub"


def test_an_unknown_provider_stops_start_up_with_a_clear_message():
    with pytest.raises(StockSourceError, match=r"STOCK_API_PROVIDER.*'nasdaq'.*finnhub"):
        build_stock_source("nasdaq", KEY)


def test_an_unknown_provider_is_refused_even_without_a_key():
    with pytest.raises(StockSourceError, match="nasdaq"):
        build_stock_source("nasdaq", "")


def test_the_known_provider_names_are_the_ones_the_settings_accept():
    from server.settings import STOCK_PROVIDER_NAMES

    assert tuple(STOCK_PROVIDER_NAMES) == tuple(stocks.PROVIDER_NAMES)
    assert provider_named("finnhub").name == "finnhub"


def test_the_source_covers_a_company_when_the_provider_covers_its_market():
    source = make_source(FakeStockServer(), FakeClock())

    assert source.covers(stock_company("AAPL", "us")) is True
    assert source.covers(stock_company("SAP", "xetra")) is False
    assert source.symbol_for(stock_company("AAPL")) == "AAPL"
    assert source.symbol_for(stock_company("SAP", "xetra")) is None


# --- one refresh asks for all the symbols together ---


def test_a_refresh_sends_one_request_per_symbol_and_all_of_them_together():
    server = FakeStockServer()
    source = make_source(server, FakeClock())

    result = fetch(source, ["AAPL", "NVDA", "KO"])

    assert sorted(request.url.params["symbol"] for request in server.requests) == [
        "AAPL",
        "KO",
        "NVDA",
    ]
    assert result.sent is True
    assert result.failed is False
    assert {symbol: quote.price for symbol, quote in result.quotes.items()} == {
        "AAPL": D("271.20"),
        "NVDA": D("190.10"),
        "KO": D("70.55"),
    }


def test_the_result_lists_the_symbols_whose_call_worked_even_when_there_was_no_quote():
    server = FakeStockServer({"AAPL": "271.20"})  # the provider has no quote for NVDA
    server.fail_for = {"KO"}  # and the call for KO fails
    source = make_source(server, FakeClock())

    result = fetch(source, ["AAPL", "NVDA", "KO"])

    assert result.answered == frozenset({"AAPL", "NVDA"})
    assert set(result.quotes) == {"AAPL"}
    assert result.failed is True


def test_a_provider_with_a_batch_call_gets_one_request_for_all_symbols():
    server = FakeStockServer()
    source = make_source(server, FakeClock(), batch=True)

    result = fetch(source, ["AAPL", "NVDA", "KO"])

    assert len(server.requests) == 1
    assert set(result.quotes) == {"AAPL", "NVDA", "KO"}


def test_the_requests_of_one_refresh_are_in_flight_at_the_same_moment():
    in_flight = 0
    most_in_flight = 0

    class SlowTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            nonlocal in_flight, most_in_flight
            in_flight += 1
            most_in_flight = max(most_in_flight, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return httpx.Response(200, json={request.url.params["symbol"]: "1.5"})

    source = StockSource(FakeProvider(), KEY, transport=SlowTransport(), clock=FakeClock())

    fetch(source, ["AAPL", "NVDA", "KO"])

    assert most_in_flight == 3


def test_a_symbol_the_provider_has_no_quote_for_is_simply_missing_from_the_result():
    source = make_source(FakeStockServer({"AAPL": "271.20"}), FakeClock())

    result = fetch(source, ["AAPL", "NVDA"])

    assert set(result.quotes) == {"AAPL"}
    assert result.failed is False


def test_the_key_goes_in_a_header_and_never_in_the_address():
    server = FakeStockServer()

    fetch(make_source(server, FakeClock()), ["AAPL"])

    request = server.requests[0]
    assert request.headers["X-Fake-Token"] == KEY
    assert KEY not in str(request.url)


# --- when a call fails ---


@pytest.mark.parametrize("status", [429, 500, 503, 451, 404])
def test_an_error_status_marks_the_refresh_as_failed_and_returns_no_quote(status):
    server = FakeStockServer()
    server.status = status

    result = fetch(make_source(server, FakeClock()), ["AAPL", "NVDA"])

    assert result.failed is True
    assert result.sent is True
    assert result.quotes == {}


def test_one_failing_call_does_not_lose_the_quotes_of_the_others():
    server = FakeStockServer()
    server.fail_for = {"NVDA"}

    result = fetch(make_source(server, FakeClock()), ["AAPL", "NVDA", "KO"])

    assert set(result.quotes) == {"AAPL", "KO"}
    assert result.failed is True


@pytest.mark.parametrize("error", [httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError])
def test_a_network_failure_marks_the_refresh_as_failed(error):
    def broken(request: httpx.Request) -> httpx.Response:
        raise error("pretend network failure", request=request)

    source = StockSource(
        FakeProvider(), KEY, transport=httpx.MockTransport(broken), clock=FakeClock()
    )

    result = fetch(source, ["AAPL"])

    assert (result.failed, result.quotes) == (True, {})


def test_an_answer_the_provider_adapter_cannot_read_marks_the_refresh_as_failed():
    def nonsense(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="this is not json")

    source = StockSource(
        FakeProvider(), KEY, transport=httpx.MockTransport(nonsense), clock=FakeClock()
    )

    assert fetch(source, ["AAPL"]).failed is True


def test_the_key_never_appears_in_a_log_line_when_a_call_fails(caplog):
    server = FakeStockServer()
    server.status = 429

    with caplog.at_level(logging.DEBUG, logger="server"):
        fetch(make_source(server, FakeClock()), ["AAPL"])

    assert caplog.records
    assert KEY not in caplog.text
    assert "X-Fake-Token" not in caplog.text
    assert "fake.example" not in caplog.text


def test_the_key_never_appears_in_the_log_when_the_network_fails(caplog):
    def broken(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {request.url} with {KEY}", request=request)

    source = StockSource(
        FakeProvider(), KEY, transport=httpx.MockTransport(broken), clock=FakeClock()
    )

    with caplog.at_level(logging.DEBUG, logger="server"):
        fetch(source, ["AAPL"])

    assert caplog.records
    assert KEY not in caplog.text


# --- the call budget: at most 25 calls a minute per instance ---


def test_the_budget_lets_25_calls_through_in_a_minute_and_refuses_the_26th():
    budget = CallBudget(max_calls=25, window_seconds=60, clock=FakeClock())

    spent = [budget.try_spend(1) for _ in range(26)]

    assert spent == [True] * 25 + [False]


def test_the_budget_is_all_or_nothing_for_one_refresh():
    budget = CallBudget(max_calls=25, window_seconds=60, clock=FakeClock())
    assert budget.try_spend(22) is True

    assert budget.try_spend(5) is False  # would go over: nothing is spent
    assert budget.try_spend(3) is True  # so these 3 are still there


def test_the_budget_is_free_again_after_the_window_has_passed():
    clock = FakeClock()
    budget = CallBudget(max_calls=25, window_seconds=60, clock=clock)
    assert budget.try_spend(25) is True
    clock.advance(59)
    assert budget.try_spend(1) is False

    clock.advance(1)

    assert budget.try_spend(25) is True


def test_the_budget_is_a_sliding_window_not_a_fixed_minute():
    clock = FakeClock()
    budget = CallBudget(max_calls=25, window_seconds=60, clock=clock)
    budget.try_spend(10)
    clock.advance(30)
    budget.try_spend(15)
    clock.advance(31)  # the first 10 calls are 61 seconds old, the other 15 are 31 seconds old

    assert budget.try_spend(10) is True
    assert budget.try_spend(1) is False


def test_a_refresh_that_would_go_over_the_budget_is_not_sent_at_all():
    server = FakeStockServer()
    clock = FakeClock()
    source = make_source(server, clock, budget=CallBudget(5, 60, clock))
    assert fetch(source, ["AAPL", "NVDA", "KO"]).sent is True

    result = fetch(source, ["AAPL", "NVDA", "KO"])  # 3 more calls would make 6

    assert result.sent is False
    assert result.quotes == {}
    assert len(server.requests) == 3


def test_the_default_budget_of_a_source_is_25_calls_a_minute():
    server = FakeStockServer()
    clock = FakeClock()
    source = make_source(server, clock)

    results = [fetch(source, ["AAPL"]) for _ in range(26)]

    assert [result.sent for result in results] == [True] * 25 + [False]
    assert len(server.requests) == 25


# --- quotes ---


def test_a_quote_price_is_rounded_half_even_to_8_decimals():
    assert make_quote(D("1.123456785"), QUOTED_AT).price == D("1.12345678")
    assert make_quote(D("271.20"), QUOTED_AT).price == D("271.20")


@pytest.mark.parametrize("price", [D("0"), D("-1"), D("0.000000001"), D("NaN")])
def test_a_price_that_is_not_above_zero_makes_no_quote(price):
    assert make_quote(price, QUOTED_AT) is None


# --- the Finnhub adapter ---


def test_finnhub_is_a_us_provider_with_a_credit_line_and_a_link():
    provider = FinnhubProvider()

    assert provider.name == "finnhub"
    assert provider.markets == frozenset({"us"})
    assert provider.credit == "Stock prices from Finnhub."
    assert provider.credit_href == "https://finnhub.io"


def test_finnhub_uses_the_ticker_as_the_symbol_for_us_stocks_only():
    provider = FinnhubProvider()

    assert provider.symbol_for("AAPL", "us") == "AAPL"
    assert provider.symbol_for("SAP", "xetra") is None


def test_finnhub_wants_one_request_per_symbol_with_the_key_in_a_header():
    calls = FinnhubProvider().requests_for(["AAPL", "KO"], KEY)

    assert [call.symbols for call in calls] == [("AAPL",), ("KO",)]
    first = calls[0].request
    assert first.method == "GET"
    assert str(first.url) == "https://finnhub.io/api/v1/quote?symbol=AAPL"
    assert first.headers["X-Finnhub-Token"] == KEY
    assert KEY not in str(first.url)


# An invented answer in the shape of Finnhub's quote: c is the price, t the time (unix seconds).
def finnhub_answer(c="271.20", t=1_762_718_398) -> str:
    return (
        f'{{"c": {c}, "d": 1.1, "dp": 0.4, "h": 272.5, "l": 269.9, "o": 270.1, '
        f'"pc": 270.1, "t": {t}}}'
    )


def test_finnhub_reads_the_price_c_and_the_time_t():
    quotes = FinnhubProvider().read_answer(["AAPL"], finnhub_answer("271.20", 1_762_718_398))

    assert quotes == {"AAPL": Quote(D("271.20"), datetime.fromtimestamp(1_762_718_398, UTC))}


def test_finnhub_keeps_prices_exact_and_does_not_turn_them_into_floats():
    quotes = FinnhubProvider().read_answer(["AAPL"], finnhub_answer("0.1"))

    assert quotes["AAPL"].price == D("0.1")
    assert str(quotes["AAPL"].price) == "0.1"


def test_finnhub_rounds_a_price_with_too_many_decimals_to_8():
    quotes = FinnhubProvider().read_answer(["AAPL"], finnhub_answer("1.123456785"))

    assert quotes["AAPL"].price == D("1.12345678")


@pytest.mark.parametrize(
    "answer",
    [
        finnhub_answer(c="0"),
        finnhub_answer(t=0),
        finnhub_answer(c="0", t=0),
        finnhub_answer(c="-3"),
    ],
)
def test_finnhub_treats_a_price_or_time_of_zero_as_no_quote(answer):
    assert FinnhubProvider().read_answer(["AAPL"], answer) == {}


def test_finnhub_refuses_a_time_far_in_the_future():
    now = datetime(2026, 11, 9, 16, 0, tzinfo=UTC)
    provider = FinnhubProvider(clock=lambda: now)
    tomorrow = int((now + timedelta(days=1)).timestamp())

    assert provider.read_answer(["AAPL"], finnhub_answer(t=tomorrow)) == {}


def test_finnhub_accepts_a_time_a_little_ahead_of_our_clock():
    now = datetime(2026, 11, 9, 16, 0, tzinfo=UTC)
    provider = FinnhubProvider(clock=lambda: now)
    a_little_ahead = int((now + timedelta(seconds=20)).timestamp())

    assert set(provider.read_answer(["AAPL"], finnhub_answer(t=a_little_ahead))) == {"AAPL"}


@pytest.mark.parametrize(
    "text", ["this is not json", "[]", '"AAPL"', '{"c": "271.2", "t": 1}', '{"t": 1}', '{"c": 3}']
)
def test_finnhub_refuses_an_answer_it_cannot_read(text):
    with pytest.raises(StockAnswerError):
        FinnhubProvider().read_answer(["AAPL"], text)


def test_finnhub_answers_for_exactly_one_symbol_at_a_time():
    with pytest.raises(StockAnswerError, match="one symbol"):
        FinnhubProvider().read_answer(["AAPL", "KO"], finnhub_answer())


def test_a_finnhub_source_works_end_to_end_with_a_fake_transport():
    seen: list[httpx.Request] = []

    def finnhub(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=finnhub_answer("189.50", 1_762_718_398))

    source = build_stock_source(
        "finnhub", KEY, transport=httpx.MockTransport(finnhub), clock=FakeClock()
    )

    result = fetch(source, ["NVDA"])

    assert result.quotes["NVDA"].price == D("189.50")
    assert seen[0].headers["X-Finnhub-Token"] == KEY
