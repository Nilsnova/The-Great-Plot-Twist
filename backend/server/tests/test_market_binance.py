"""Tests for market/binance.py: the Binance request and how its answer is read.

Nothing here uses the network: these are pure functions on fixed text.
"""

from decimal import Decimal

import pytest

from server.market.binance import (
    BINANCE_URL,
    PRICE_PATH,
    BinanceError,
    parse_prices,
    price_request,
    read_price,
)

D = Decimal

SYMBOLS = ("BTCUSDT", "ETHUSDT", "EURUSDT")

# What Binance answers (the order is not the order we asked for, and prices are text).
ANSWER = [
    {"symbol": "EURUSDT", "price": "1.12460000"},
    {"symbol": "BTCUSDT", "price": "76159.21000000"},
    {"symbol": "ETHUSDT", "price": "2255.69000000"},
]


# --- the request ---


def test_the_market_data_host_is_the_keyless_binance_vision_host():
    assert BINANCE_URL == "https://data-api.binance.vision"
    assert PRICE_PATH == "/api/v3/ticker/price"


def test_one_request_asks_for_all_symbols_at_the_documented_address():
    request = price_request(SYMBOLS)

    assert request.method == "GET"
    assert str(request.url).startswith(f"{BINANCE_URL}{PRICE_PATH}?")
    assert request.url.params["symbols"] == '["BTCUSDT","ETHUSDT","EURUSDT"]'


def test_the_request_sends_no_key_and_no_secret_header():
    headers = {name.lower() for name in price_request(SYMBOLS).headers}

    assert "authorization" not in headers
    assert "x-mbx-apikey" not in headers
    assert "apikey" not in headers


# --- the answer, symbol by symbol ---


def test_every_symbol_of_a_good_answer_is_read_with_its_exact_price():
    prices = parse_prices(ANSWER, SYMBOLS)

    assert prices == {
        "BTCUSDT": D("76159.21"),
        "ETHUSDT": D("2255.69"),
        "EURUSDT": D("1.1246"),
    }
    assert list(prices) == list(SYMBOLS)


def test_a_symbol_that_is_missing_from_a_good_answer_is_left_out_and_the_others_stay():
    prices = parse_prices(ANSWER[1:], SYMBOLS)  # EURUSDT is missing

    assert set(prices) == {"BTCUSDT", "ETHUSDT"}


def test_a_symbol_with_a_bad_price_is_left_out_and_the_others_stay():
    answer = [{"symbol": "BTCUSDT", "price": "abc"}] + ANSWER[2:] + ANSWER[:1]

    prices = parse_prices(answer, SYMBOLS)

    assert set(prices) == {"ETHUSDT", "EURUSDT"}


def test_symbols_nobody_asked_for_are_ignored():
    extra = ANSWER + [{"symbol": "DOGEUSDT", "price": "0.1"}]

    assert list(parse_prices(extra, SYMBOLS)) == list(SYMBOLS)


def test_items_that_are_not_objects_with_a_symbol_are_ignored():
    answer = ["BTCUSDT", {"price": "1"}, {"symbol": 5, "price": "1"}] + ANSWER

    assert set(parse_prices(answer, SYMBOLS)) == set(SYMBOLS)


@pytest.mark.parametrize("answer", [{"symbol": "BTCUSDT"}, "oops", None, 5])
def test_an_answer_that_is_not_a_list_is_refused(answer):
    with pytest.raises(BinanceError, match="list"):
        parse_prices(answer, SYMBOLS)


@pytest.mark.parametrize("value", [None, 5, 1.5, ["1"], "abc", "", "NaN", "Infinity", "0", "-1"])
def test_a_price_must_be_text_that_is_a_number_above_zero(value):
    with pytest.raises(BinanceError):
        read_price(value)


def test_a_price_keeps_all_its_decimals():
    assert read_price("0.00001234") == D("0.00001234")


def test_a_price_with_more_than_8_decimals_is_rounded_half_even_to_8():
    assert read_price("1.123456785") == D("1.12345678")
    assert read_price("1.123456795") == D("1.12345680")


def test_a_price_that_rounds_to_zero_is_refused():
    with pytest.raises(BinanceError, match="above 0"):
        read_price("0.000000001")


def test_a_price_far_too_big_is_refused():
    with pytest.raises(BinanceError):
        read_price("1" + "0" * 20)
