"""Tests for market/companies.py and the real file backend/content/market/companies.json."""

import json

import pytest

from server.market.companies import (
    COMPANIES_FILE,
    CompaniesError,
    Company,
    load_companies,
)

KNOWN_MARKETS = {"us", "euronext", "xetra"}

GOOD_ISLAND = {
    "id": "harbor-trust",
    "name": "Saltreach Harbor Trust",
    "ticker": "SHT",
    "kind": "island",
    "follows": "Bitcoin",
    "symbol": "BTCUSDT",
    "market": "always",
    "currency": "USDT",
    "priceDecimals": 2,
    "tagline": "The old harbor bank.",
}

GOOD_STOCK = {
    "id": "apple",
    "name": "Apple",
    "ticker": "AAPL",
    "kind": "stock",
    "follows": "Apple Inc. shares (Nasdaq)",
    "market": "us",
    "currency": "USD",
    "priceDecimals": 2,
    "tagline": "Phones, laptops and the shop in every pocket.",
}


def write_file(tmp_path, entries) -> object:
    path = tmp_path / "companies.json"
    path.write_text(json.dumps({"companies": entries}))
    return path


def load(tmp_path, entries):
    return load_companies(write_file(tmp_path, entries), KNOWN_MARKETS)


def changed(entry: dict, **changes) -> dict:
    return {**entry, **changes}


def without(entry: dict, name: str) -> dict:
    return {key: value for key, value in entry.items() if key != name}


# --- the real file ---


def test_the_real_file_has_twelve_companies_the_island_ones_first():
    companies = load_companies()

    assert len(companies) == 12
    assert [company.kind for company in companies] == ["island"] * 7 + ["stock"] * 5


def test_the_seven_island_companies_keep_their_ids_names_tickers_and_pairs():
    islands = [company for company in load_companies() if company.kind == "island"]

    assert [(c.id, c.name, c.ticker, c.symbol) for c in islands] == [
        ("harbor-trust", "Saltreach Harbor Trust", "SHT", "BTCUSDT"),
        ("tidewright-works", "Tidewright Works", "TIDE", "ETHUSDT"),
        ("swiftwater-ferries", "Swiftwater Ferries", "SWFT", "SOLUSDT"),
        ("pier-post-courier", "Pier Post Courier", "PIER", "XRPUSDT"),
        ("market-hall-guild", "Market Hall Guild", "MHG", "BNBUSDT"),
        ("two-shores-bureau", "Two Shores Change Bureau", "TWSH", "EURUSDT"),
        ("greyfathom-salvage", "Greyfathom Salvage", "GREY", "PAXGUSDT"),
    ]


def test_the_island_companies_follow_btc_eth_sol_xrp_bnb_euro_dollar_and_gold():
    islands = [company for company in load_companies() if company.kind == "island"]

    assert [company.follows for company in islands] == [
        "Bitcoin",
        "Ether",
        "Solana",
        "XRP",
        "BNB",
        "Euro in US dollars",
        "Gold (PAXG, one troy ounce)",
    ]


def test_every_island_company_trades_around_the_clock_in_usdt():
    islands = [company for company in load_companies() if company.kind == "island"]

    assert {company.market for company in islands} == {"always"}
    assert {company.currency for company in islands} == {"USDT"}


def test_xrp_and_the_euro_show_4_decimals_and_the_rest_show_2():
    decimals = {company.id: company.price_decimals for company in load_companies()}

    assert decimals["pier-post-courier"] == 4
    assert decimals["two-shores-bureau"] == 4
    assert decimals["harbor-trust"] == 2
    assert decimals["apple"] == 2


def test_the_five_stocks_are_real_us_companies_with_their_exchange_tickers():
    stocks = [company for company in load_companies() if company.kind == "stock"]

    assert [(c.id, c.name, c.ticker) for c in stocks] == [
        ("apple", "Apple", "AAPL"),
        ("nvidia", "NVIDIA", "NVDA"),
        ("tesla", "Tesla", "TSLA"),
        ("coca-cola", "Coca-Cola", "KO"),
        ("spotify", "Spotify", "SPOT"),
    ]
    assert {company.market for company in stocks} == {"us"}
    assert {company.currency for company in stocks} == {"USD"}
    assert {company.symbol for company in stocks} == {None}


def test_every_island_pair_is_used_by_one_company_only():
    symbols = [company.symbol for company in load_companies() if company.symbol]

    assert len(symbols) == len(set(symbols)) == 7


def test_only_greyfathom_salvage_is_delisted_at_the_relighting():
    delisted = [company.id for company in load_companies() if company.delist_at_relighting]

    assert delisted == ["greyfathom-salvage"]


def test_the_real_file_says_the_island_companies_are_invented_and_the_stocks_are_real():
    text = COMPANIES_FILE.read_text()

    assert "are invented" in text
    assert "not real businesses" in text
    assert "real listed companies" in text
    assert "no logos" in text


def test_the_real_file_has_no_start_price_any_more():
    assert "startPrice" not in COMPANIES_FILE.read_text()


def test_every_stock_market_of_the_real_file_is_in_the_calendars():
    markets = {company.market for company in load_companies() if company.kind == "stock"}

    assert markets <= KNOWN_MARKETS


def test_there_are_at_most_twenty_companies_in_the_real_file():
    assert len(load_companies()) <= 20


# --- the loader ---


def test_a_good_island_entry_is_loaded_as_a_company(tmp_path):
    assert load(tmp_path, [GOOD_ISLAND]) == (
        Company(
            id="harbor-trust",
            name="Saltreach Harbor Trust",
            ticker="SHT",
            kind="island",
            follows="Bitcoin",
            symbol="BTCUSDT",
            market="always",
            currency="USDT",
            price_decimals=2,
            tagline="The old harbor bank.",
            delist_at_relighting=False,
        ),
    )


def test_a_good_stock_entry_is_loaded_with_no_symbol(tmp_path):
    (company,) = load(tmp_path, [GOOD_STOCK])

    assert (company.kind, company.symbol, company.market) == ("stock", None, "us")
    assert company.is_stock is True


def test_the_delist_flag_is_read(tmp_path):
    (company,) = load(tmp_path, [changed(GOOD_ISLAND, delistAtRelighting=True)])

    assert company.delist_at_relighting is True


@pytest.mark.parametrize(
    ("entry", "field_name", "value"),
    [
        (GOOD_ISLAND, "id", "Harbor Trust"),
        (GOOD_ISLAND, "id", "x"),
        (GOOD_ISLAND, "id", ""),
        (GOOD_ISLAND, "ticker", "sht"),
        (GOOD_ISLAND, "ticker", "TOOLONGX"),
        (GOOD_ISLAND, "ticker", ""),
        (GOOD_ISLAND, "symbol", "btcusdt"),
        (GOOD_ISLAND, "symbol", "BTC/USDT"),
        (GOOD_ISLAND, "name", ""),
        (GOOD_ISLAND, "name", "N" * 41),
        (GOOD_ISLAND, "follows", None),
        (GOOD_ISLAND, "follows", "F" * 61),
        (GOOD_ISLAND, "tagline", "t" * 121),
        (GOOD_ISLAND, "currency", "usdt"),
        (GOOD_ISLAND, "currency", "US"),
        (GOOD_ISLAND, "priceDecimals", 9),
        (GOOD_ISLAND, "priceDecimals", -1),
        (GOOD_ISLAND, "priceDecimals", "2"),
        (GOOD_ISLAND, "priceDecimals", True),
        (GOOD_ISLAND, "kind", "fund"),
        (GOOD_ISLAND, "kind", None),
        (GOOD_ISLAND, "delistAtRelighting", False),
        (GOOD_ISLAND, "delistAtRelighting", "yes"),
        (GOOD_STOCK, "market", "mars"),
        (GOOD_STOCK, "market", "always"),
        (GOOD_ISLAND, "market", "us"),
    ],
)
def test_a_bad_field_stops_the_load_and_the_message_names_the_company_and_the_field(
    tmp_path, entry, field_name, value
):
    path = write_file(tmp_path, [changed(entry, **{field_name: value})])

    with pytest.raises(CompaniesError, match=rf"companies\[0\].*: '{field_name}'"):
        load_companies(path, KNOWN_MARKETS)


@pytest.mark.parametrize(
    "field_name", ["id", "name", "ticker", "kind", "follows", "market", "currency", "tagline"]
)
def test_a_missing_field_is_refused_and_named(tmp_path, field_name):
    path = write_file(tmp_path, [without(GOOD_ISLAND, field_name)])

    with pytest.raises(CompaniesError, match=f"'{field_name}'"):
        load_companies(path, KNOWN_MARKETS)


def test_a_missing_price_decimals_field_is_refused(tmp_path):
    path = write_file(tmp_path, [without(GOOD_ISLAND, "priceDecimals")])

    with pytest.raises(CompaniesError, match="priceDecimals"):
        load_companies(path, KNOWN_MARKETS)


def test_an_island_company_needs_a_binance_pair(tmp_path):
    path = write_file(tmp_path, [without(GOOD_ISLAND, "symbol")])

    with pytest.raises(CompaniesError, match="'symbol'"):
        load_companies(path, KNOWN_MARKETS)


def test_a_stock_company_must_not_have_a_binance_pair(tmp_path):
    path = write_file(tmp_path, [changed(GOOD_STOCK, symbol="AAPLUSDT")])

    with pytest.raises(CompaniesError, match="'symbol'.*stock"):
        load_companies(path, KNOWN_MARKETS)


def test_a_stock_with_a_market_that_is_not_in_the_calendars_is_refused_and_the_market_is_named(
    tmp_path,
):
    path = write_file(tmp_path, [changed(GOOD_STOCK, market="tokyo")])

    with pytest.raises(CompaniesError, match=r"'market'.*tokyo.*calendars\.json"):
        load_companies(path, KNOWN_MARKETS)


def test_the_markets_are_read_from_the_real_calendars_when_none_are_given(tmp_path):
    (company,) = load_companies(write_file(tmp_path, [GOOD_STOCK]))

    assert company.market == "us"


@pytest.mark.parametrize("field_name", ["id", "ticker"])
def test_two_companies_cannot_share_an_id_or_a_ticker(tmp_path, field_name):
    second = changed(GOOD_STOCK, id="other-id", ticker="OTHR")
    second[field_name] = GOOD_ISLAND[field_name]

    with pytest.raises(CompaniesError, match=f"same '{field_name}'"):
        load(tmp_path, [GOOD_ISLAND, second])


def test_an_island_and_a_stock_cannot_share_a_ticker(tmp_path):
    with pytest.raises(CompaniesError, match="same 'ticker'"):
        load(tmp_path, [GOOD_ISLAND, changed(GOOD_STOCK, ticker="SHT")])


def test_two_island_companies_cannot_share_a_binance_pair(tmp_path):
    second = changed(GOOD_ISLAND, id="other-id", ticker="OTHR")

    with pytest.raises(CompaniesError, match="same 'symbol'"):
        load(tmp_path, [GOOD_ISLAND, second])


def test_more_than_twenty_companies_are_refused(tmp_path):
    entries = [
        changed(GOOD_STOCK, id=f"stock-{number:02d}", ticker=f"S{number:02d}")
        for number in range(21)
    ]

    with pytest.raises(CompaniesError, match="1 to 20"):
        load(tmp_path, entries)


def test_exactly_twenty_companies_are_fine(tmp_path):
    entries = [
        changed(GOOD_STOCK, id=f"stock-{number:02d}", ticker=f"S{number:02d}")
        for number in range(20)
    ]

    assert len(load(tmp_path, entries)) == 20


def test_an_empty_list_is_refused(tmp_path):
    with pytest.raises(CompaniesError, match="1 to 20"):
        load(tmp_path, [])


def test_a_file_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "companies.json"
    path.write_text("not json at all")

    with pytest.raises(CompaniesError, match="Cannot read"):
        load_companies(path, KNOWN_MARKETS)


def test_a_missing_file_is_refused(tmp_path):
    with pytest.raises(CompaniesError, match="Cannot read"):
        load_companies(tmp_path / "nothing.json", KNOWN_MARKETS)


def test_an_entry_that_is_not_an_object_is_refused(tmp_path):
    path = tmp_path / "companies.json"
    path.write_text('{"companies": ["harbor-trust"]}')

    with pytest.raises(CompaniesError, match=r"companies\[0\] must be an object"):
        load_companies(path, KNOWN_MARKETS)
