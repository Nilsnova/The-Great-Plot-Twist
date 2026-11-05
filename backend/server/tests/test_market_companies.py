"""Tests for market/companies.py and the real file backend/content/market/companies.json."""

import json
from decimal import Decimal

import pytest

from server.market.companies import (
    COMPANIES_FILE,
    CompaniesError,
    Company,
    load_companies,
)
from server.market.rules import price_limits
from server.market.trade_rules import MAX_TRADE_COINS, MIN_TRADE_COINS

D = Decimal

GOOD_ENTRY = {
    "id": "harbor-trust",
    "name": "Saltreach Harbor Trust",
    "ticker": "SHT",
    "follows": "BTC",
    "symbol": "BTCUSDT",
    "startPrice": "60.00",  # turned into a number by write_file below
    "tagline": "The old harbor bank.",
}


def write_file(tmp_path, entries) -> object:
    """Write a companies file. A startPrice given as text is written as a number."""
    lines = []
    for entry in entries:
        text = json.dumps(entry)
        if isinstance(entry.get("startPrice"), str):
            text = text.replace(f'"{entry["startPrice"]}"', entry["startPrice"])
        lines.append(text)
    path = tmp_path / "companies.json"
    path.write_text('{"companies": [' + ", ".join(lines) + "]}")
    return path


def with_change(**changes) -> dict:
    return {**GOOD_ENTRY, **changes}


# --- the real file ---


def test_the_real_file_has_seven_companies():
    assert len(load_companies()) == 7


def test_the_real_file_follows_btc_eth_sol_xrp_bnb_euro_dollar_and_gold():
    followed = [company.follows for company in load_companies()]

    assert followed == ["BTC", "ETH", "SOL", "XRP", "BNB", "EUR/USD", "Gold"]


def test_the_real_file_uses_the_binance_pairs_for_those_instruments():
    symbols = [company.symbol for company in load_companies()]

    assert symbols == [
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "XRPUSDT",
        "BNBUSDT",
        "EURUSDT",
        "PAXGUSDT",
    ]


def test_every_company_follows_its_own_instrument():
    companies = load_companies()

    assert len({company.symbol for company in companies}) == len(companies)


def test_the_real_file_contains_greyfathom_salvage_from_the_story():
    names = {company.name for company in load_companies()}

    assert "Greyfathom Salvage" in names


def test_start_prices_are_exact_numbers_with_two_decimals():
    prices = {company.id: company.start_price for company in load_companies()}

    assert prices["harbor-trust"] == D("60.00")
    assert str(prices["harbor-trust"]) == "60.00"


def test_the_real_file_says_the_companies_are_fictional():
    text = COMPANIES_FILE.read_text()

    assert "invented" in text
    assert "not real businesses" in text


# --- the loader ---


def test_a_good_entry_is_loaded_as_a_company(tmp_path):
    companies = load_companies(write_file(tmp_path, [GOOD_ENTRY]))

    assert companies == (
        Company(
            id="harbor-trust",
            name="Saltreach Harbor Trust",
            ticker="SHT",
            follows="BTC",
            symbol="BTCUSDT",
            start_price=D("60.00"),
            tagline="The old harbor bank.",
        ),
    )


@pytest.mark.parametrize(
    ("field_name", "value"),
    [
        ("id", "Harbor Trust"),  # capital letters and a space
        ("id", "x"),  # too short
        ("id", ""),
        ("ticker", "sht"),  # must be capital letters
        ("ticker", "TOOLONG"),
        ("ticker", "A"),
        ("symbol", "btcusdt"),
        ("symbol", "BTC/USDT"),
        ("name", ""),
        ("name", "N" * 41),
        ("follows", None),
        ("tagline", "t" * 121),
    ],
)
def test_a_bad_text_field_stops_the_load_and_names_the_field(tmp_path, field_name, value):
    path = write_file(tmp_path, [with_change(**{field_name: value})])

    with pytest.raises(CompaniesError, match=f"companies\\[0\\]: '{field_name}'"):
        load_companies(path)


@pytest.mark.parametrize("price", ["3.99", "125.01", "60.001", "-5.00"])
def test_a_start_price_outside_4_to_125_or_with_more_than_two_decimals_is_refused(tmp_path, price):
    path = write_file(tmp_path, [with_change(startPrice=price)])

    with pytest.raises(CompaniesError, match="startPrice"):
        load_companies(path)


@pytest.mark.parametrize("price", ["4.00", "125.00"])
def test_the_lowest_and_the_highest_allowed_start_price_are_accepted(tmp_path, price):
    companies = load_companies(write_file(tmp_path, [with_change(startPrice=price)]))

    assert companies[0].start_price == D(price)


def test_the_refusal_of_a_start_price_says_why_the_limits_are_there(tmp_path):
    path = write_file(tmp_path, [with_change(startPrice="3.99")])

    with pytest.raises(CompaniesError, match="from 4.00 to 125.00.*tradable"):
        load_companies(path)


def test_every_company_is_tradable_from_its_floor_to_its_ceiling():
    # At the floor one unit is worth a whole coin, at the ceiling one unit fits into one purchase.
    for company in load_companies():
        lowest, highest = price_limits(company.start_price)

        assert lowest >= MIN_TRADE_COINS, company.id
        assert highest <= MAX_TRADE_COINS, company.id


def test_a_start_price_without_a_decimal_point_is_refused(tmp_path):
    path = write_file(tmp_path, [with_change(startPrice=60)])

    with pytest.raises(CompaniesError, match="startPrice"):
        load_companies(path)


@pytest.mark.parametrize("field_name", ["id", "ticker", "symbol"])
def test_two_companies_cannot_share_an_id_a_ticker_or_a_symbol(tmp_path, field_name):
    second = with_change(id="other-id", ticker="OTHR", symbol="ETHUSDT")
    second[field_name] = GOOD_ENTRY[field_name]

    with pytest.raises(CompaniesError, match=f"same '{field_name}'"):
        load_companies(write_file(tmp_path, [GOOD_ENTRY, second]))


def test_an_empty_list_is_refused(tmp_path):
    with pytest.raises(CompaniesError, match="1 to 20"):
        load_companies(write_file(tmp_path, []))


def test_a_file_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "companies.json"
    path.write_text("not json at all")

    with pytest.raises(CompaniesError, match="Cannot read"):
        load_companies(path)


def test_a_missing_file_is_refused(tmp_path):
    with pytest.raises(CompaniesError, match="Cannot read"):
        load_companies(tmp_path / "nothing.json")


def test_an_entry_that_is_not_an_object_is_refused(tmp_path):
    path = tmp_path / "companies.json"
    path.write_text('{"companies": ["harbor-trust"]}')

    with pytest.raises(CompaniesError, match=r"companies\[0\] must be an object"):
        load_companies(path)
