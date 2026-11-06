"""Tests for routes/market.py and market/exchange.py: the price board, the portfolio and the wiring.

(Opening and closing positions are in test_market_routes_open.py and test_market_routes_close.py.)

Nothing here uses the network. The pretend world is in market_world.py: Binance, the stock API and
the database are fake transports, the sign-in check answers from a fake transport, and the clock
only moves when the test says so.

Fixed numbers used again and again:
  * the clock starts at Monday 9 Nov 2026, 16:00 UTC: New York is open and the game day began at
    08:00 that day,
  * BASE_PRICES are the real Binance prices at the start of a test, and the board shows them
    one to one: there is no amplification, no floor and no ceiling.
"""

import logging
from dataclasses import replace
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from server.app import create_app
from server.market import exchange
from server.market.calendars import CalendarError
from server.market.companies import CompaniesError
from server.market.exchange import market_from_settings
from server.market.replay import ReplayError
from server.market.stocks import StockSourceError
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, assert_error
from server.tests.market_helpers import CLASS_TIME, KEY, FakeBinance, good_binance_answer
from server.tests.market_world import (
    BASE_PRICES,
    CLOSED_POSITION_ID,
    ISLAND_IDS,
    MARKET_ON,
    OTHER_PLAYER_ID,
    PLAYER_ID,
    POSITION_ID,
    STOCK_IDS,
    World,
    position_row,
)

HARBOR_TRUST = {
    "id": "harbor-trust",
    "name": "Saltreach Harbor Trust",
    "ticker": "SHT",
    "kind": "island",
    "follows": "Bitcoin",
    "market": "always",
    "marketName": "Around the clock",
    "currency": "USDT",
    "priceDecimals": 2,
    "tagline": "The old harbor bank. When it moves, the whole market feels it.",
    "price": 76159.21,
    "priceAt": "2026-11-09T16:00:00Z",
    "source": "live",
    "status": "open",
    "reason": None,
    "holiday": None,
    "opensAt": None,
    "closesAt": None,
    "delisted": False,
    "canOpen": True,
    "canClose": True,
    "zeroPrices": {"rising": 68543.289, "falling": 83775.131},
}


# --- GET /api/market: the price board ---


def test_the_board_needs_no_sign_in():
    assert World().board().status_code == 200


def test_the_board_lists_the_seven_island_companies_at_their_real_prices_one_to_one():
    body = World().board().json()

    assert [company["id"] for company in body["companies"]] == ISLAND_IDS
    assert [company["price"] for company in body["companies"]] == [
        76159.21,
        2255.69,
        160.4,
        2.4012,
        612.5,
        1.1246,
        4180.55,
    ]
    assert {company["kind"] for company in body["companies"]} == {"island"}


def test_a_company_row_has_the_agreed_fields_with_the_values_of_the_example():
    company = World().company("harbor-trust")

    assert company == HARBOR_TRUST


def test_the_board_has_the_agreed_top_level_fields():
    body = World().board().json()

    assert list(body) == [
        "generatedAt",
        "demo",
        "demoNote",
        "tradingEnabled",
        "relit",
        "companies",
        "rules",
        "credits",
        "simulationNote",
    ]
    assert body["generatedAt"] == "2026-11-09T16:00:00Z"
    assert (body["demo"], body["demoNote"], body["relit"]) == (False, None, False)
    assert body["simulationNote"] == (
        "Simulation with play money. Real names and real prices, no real money and no prizes."
    )


def test_a_look_inside_a_minute_shows_the_prices_as_cache_with_the_time_of_the_fetch():
    world = World()
    world.board()
    world.advance(30)

    company = world.company("harbor-trust")

    assert company["source"] == "cache"
    assert company["priceAt"] == "2026-11-09T16:00:00Z"


def test_the_board_carries_the_rules_the_screen_shows_with_the_stake_choices():
    rules = World().board().json()["rules"]

    assert rules == {
        "leverage": 10,
        "zeroPointMovePercent": 10,
        "feePercent": 2.0,
        "minStake": 10,
        "maxStake": 500,
        "dailyStakeCap": 2000,
        "maxOpenPositions": 20,
        "stakeChoices": [
            {"stake": 10, "fee": 1, "total": 11},
            {"stake": 25, "fee": 1, "total": 26},
            {"stake": 50, "fee": 1, "total": 51},
            {"stake": 100, "fee": 2, "total": 102},
            {"stake": 250, "fee": 5, "total": 255},
            {"stake": 500, "fee": 10, "total": 510},
        ],
        "tradePriceMaxAgeSeconds": 5,
        "tradesPer30Seconds": 10,
        "gameDayStarts": "08:00 Europe/Lisbon",
    }


def test_after_the_relighting_the_fee_is_1_percent_and_the_stake_choices_follow():
    body = World(relit=True).board().json()

    assert body["relit"] is True
    assert body["rules"]["feePercent"] == 1.0
    assert body["rules"]["stakeChoices"][-1] == {"stake": 500, "fee": 5, "total": 505}


def test_after_the_relighting_greyfathom_salvage_is_delisted_but_the_others_are_not():
    world = World(relit=True)

    greyfathom = world.company("greyfathom-salvage")

    assert greyfathom["delisted"] is True
    assert greyfathom["status"] == "open"  # it keeps its status
    assert (greyfathom["canOpen"], greyfathom["canClose"]) == (False, True)
    assert world.company("harbor-trust")["delisted"] is False
    assert world.company("harbor-trust")["canOpen"] is True


def test_a_failing_relighting_check_counts_as_not_relit_and_is_logged(caplog):
    world = World()

    async def broken(admin):
        raise RuntimeError("the world state is away")

    world.service.relit_check = broken

    with caplog.at_level(logging.WARNING, logger="server"):
        body = world.board().json()

    assert body["relit"] is False
    assert body["rules"]["feePercent"] == 2.0
    assert "Relighting" in caplog.text
    assert "RuntimeError" in caplog.text


def test_zero_prices_are_given_for_open_companies_only():
    world = World()
    world.board()
    world.binance_down()
    world.advance(61)

    stale = world.company("harbor-trust")

    assert stale["status"] == "stale"
    assert stale["zeroPrices"] is None


def test_prices_are_json_numbers_not_text():
    company = World().company("pier-post-courier")

    assert isinstance(company["price"], float)
    assert company["priceDecimals"] == 4


def test_the_board_works_while_the_flag_is_off_and_nothing_can_be_traded():
    world = World(settings=CONFIGURED_SETTINGS)  # every flag off

    body = world.board().json()

    assert body["tradingEnabled"] is False
    assert [(c["canOpen"], c["canClose"]) for c in body["companies"]] == [(False, False)] * 7
    assert {c["status"] for c in body["companies"]} == {"open"}  # it still shows the prices


def test_while_the_flag_is_off_the_board_runs_no_sweep_and_asks_the_database_nothing():
    world = World(settings=CONFIGURED_SETTINGS)

    world.board()

    assert world.database.requests == []


def test_the_board_says_trading_is_enabled_when_the_flag_is_on():
    assert World().board().json()["tradingEnabled"] is True


def test_the_board_can_be_cached_for_30_seconds():
    response = World().board()

    assert response.headers["cache-control"] == "public, max-age=30, s-maxage=30"


def test_a_board_that_cannot_be_built_is_not_cached(monkeypatch):
    def broken(path=None, market_ids=None):
        raise CompaniesError("companies[0]: 'id' must be text that is not empty.")

    monkeypatch.setattr(exchange, "load_companies", broken)
    client = TestClient(create_app(MARKET_ON))

    response = client.get("/api/market")

    assert_error(response, 503, "market_unavailable")
    assert response.headers["cache-control"] == "no-store"


def test_the_board_takes_no_query_parameters_so_nobody_can_skip_the_cache():
    world = World()

    response = world.client.get("/api/market?refresh=now")

    assert_error(response, 422, "validation_error")
    assert world.binance.requests == []


def test_the_board_holds_no_secret_and_no_player_data():
    world = World(stocks=True)

    text = world.board().text

    assert KEY not in text
    assert FAKE_SECRET_KEY not in text
    assert PLAYER_ID not in text


def test_the_board_asks_binance_once_a_minute_however_many_players_look():
    world = World()
    world.board()
    world.set_price(BTCUSDT="80000.00")

    prices = {world.board().json()["companies"][0]["price"] for _ in range(10)}

    assert prices == {76159.21}  # the shared price of the first look
    assert len(world.binance.requests) == 1


def test_the_board_shows_the_new_price_after_a_minute():
    world = World()
    world.board()
    world.set_price(BTCUSDT="80000.00")
    world.advance(60)

    assert world.company("harbor-trust")["price"] == 80000.0


# --- GET /api/market: the stock companies ---


def test_stocks_are_hidden_while_the_stock_source_is_off():
    body = World().board().json()

    assert [company["id"] for company in body["companies"]] == ISLAND_IDS


def test_with_the_stock_source_on_the_stocks_follow_the_island_companies():
    body = World(stocks=True).board().json()

    assert [company["id"] for company in body["companies"]] == ISLAND_IDS + STOCK_IDS


def test_an_open_stock_shows_the_price_the_quote_time_and_when_the_market_closes():
    apple = World(stocks=True).company("apple")

    assert apple["kind"] == "stock"
    assert apple["market"] == "us"
    assert apple["marketName"] == "New York (NYSE and Nasdaq)"
    assert apple["currency"] == "USD"
    assert apple["price"] == 271.2
    assert apple["priceAt"] == "2026-11-09T15:59:58Z"
    assert (apple["status"], apple["reason"]) == ("open", None)
    assert apple["opensAt"] is None
    assert apple["closesAt"] == "2026-11-09T21:00:00Z"
    assert apple["zeroPrices"] == {"rising": 244.08, "falling": 298.32}
    assert (apple["canOpen"], apple["canClose"]) == (True, True)


def test_at_the_class_time_new_york_is_closed_and_the_stock_shows_its_last_price_and_the_opening():
    world = World(stocks=True, start=CLASS_TIME)
    world.stock_server.quoted_at = datetime(2026, 11, 6, 20, 59, 59, tzinfo=UTC)

    apple = world.company("apple")

    assert apple["price"] == 271.2
    assert apple["priceAt"] == "2026-11-06T20:59:59Z"
    assert (apple["status"], apple["reason"], apple["holiday"]) == ("closed", "outside_hours", None)
    assert apple["opensAt"] == "2026-11-09T14:30:00Z"
    assert apple["closesAt"] is None
    assert (apple["canOpen"], apple["canClose"]) == (False, False)
    assert apple["zeroPrices"] is None
    assert world.company("harbor-trust")["status"] == "open"  # the island companies still trade


def test_on_thanksgiving_day_the_stock_is_closed_for_the_holiday_and_opens_the_next_day():
    world = World(stocks=True, start=datetime(2026, 11, 26, 16, 0, tzinfo=UTC))
    world.stock_server.quoted_at = datetime(2026, 11, 25, 20, 59, 59, tzinfo=UTC)

    apple = world.company("apple")

    assert (apple["status"], apple["reason"]) == ("closed", "holiday")
    assert apple["holiday"] == "Thanksgiving Day"
    assert apple["opensAt"] == "2026-11-27T14:30:00Z"


def test_after_the_last_day_of_the_calendar_the_stock_is_closed_with_no_calendar():
    world = World(stocks=True, start=datetime(2027, 1, 4, 15, 0, tzinfo=UTC))
    world.stock_server.quoted_at = datetime(2026, 12, 31, 20, 59, 59, tzinfo=UTC)

    apple = world.company("apple")

    assert (apple["status"], apple["reason"]) == ("closed", "no_calendar")
    assert apple["opensAt"] is None


def test_a_stock_quoted_before_the_opening_is_stale_and_waits_for_the_first_price():
    world = World(stocks=True, start=datetime(2026, 11, 9, 14, 31, tzinfo=UTC))
    world.stock_server.quoted_at = datetime(2026, 11, 6, 20, 59, 59, tzinfo=UTC)

    apple = world.company("apple")

    assert (apple["status"], apple["reason"]) == ("stale", "waiting_first_price")
    assert (apple["canOpen"], apple["canClose"]) == (False, False)


def test_a_stock_whose_quote_was_already_old_when_fetched_is_stale():
    world = World(stocks=True)
    world.stock_server.quoted_at = datetime(2026, 11, 9, 15, 58, 0, tzinfo=UTC)  # 120 s old

    apple = world.company("apple")

    assert (apple["status"], apple["reason"]) == ("stale", "quote_old")


def test_a_stock_without_a_price_yet_is_unavailable():
    world = World(stocks=True)
    world.stock_server.status = 500

    apple = world.company("apple")

    assert (apple["status"], apple["reason"]) == ("unavailable", "no_price")
    assert (apple["price"], apple["priceAt"], apple["source"]) == (None, None, "none")


def test_the_credits_name_binance_and_the_stock_provider_with_its_link():
    credits = World(stocks=True).board().json()["credits"]

    assert credits == [
        {
            "text": "Real prices from Binance market data.",
            "href": None,
            "licenceText": None,
            "licenceHref": None,
        },
        {
            "text": "Stock prices from the Fake Exchange.",
            "href": "https://fake.example",
            "licenceText": None,
            "licenceHref": None,
        },
    ]


def test_without_the_stock_source_the_credits_name_only_binance():
    credits = World().board().json()["credits"]

    assert [credit["text"] for credit in credits] == ["Real prices from Binance market data."]


# --- GET /api/market: stale prices ---


def test_when_binance_fails_after_a_good_look_the_board_shows_the_old_prices_marked_stale():
    world = World()
    world.board()
    world.binance_down()
    world.advance(61)

    company = world.company("harbor-trust")

    assert company["status"] == "stale"
    assert company["reason"] == "source_away"
    assert company["source"] == "stale"
    assert company["price"] == 76159.21
    assert company["priceAt"] == "2026-11-09T16:00:00Z"  # the time of the old price
    assert (company["canOpen"], company["canClose"]) == (False, False)


def test_when_binance_has_never_answered_the_board_is_still_a_200_with_no_prices():
    world = World()
    world.binance_down()

    response = world.board()

    assert response.status_code == 200
    companies = response.json()["companies"]
    assert {c["status"] for c in companies} == {"unavailable"}
    assert {c["reason"] for c in companies} == {"no_price"}
    assert {c["price"] for c in companies} == {None}
    assert "cache-control" in response.headers


def test_a_pair_missing_from_a_good_answer_leaves_only_that_company_without_a_price():
    world = World()
    del world.prices["EURUSDT"]
    world.binance.replies = [good_binance_answer(world.prices)]

    companies = {c["id"]: c for c in world.board().json()["companies"]}

    assert companies["two-shores-bureau"]["status"] == "unavailable"
    assert companies["harbor-trust"]["status"] == "open"


# --- GET /api/market: the automatic close ---


def test_the_board_runs_one_sweep_for_all_players_with_the_prices_of_the_open_companies():
    world = World()

    world.board()

    (sweep,) = world.database.calls("exchange_close_used_up")
    assert sweep["p_player_id"] is None
    assert [price["company_id"] for price in sweep["p_prices"]] == ISLAND_IDS
    assert sweep["p_prices"][0] == {
        "company_id": "harbor-trust",
        "price": "76159.21",
        "quoted_at": "2026-11-09T16:00:00+00:00",
        "mode": "live",
    }


def test_the_sweep_holds_the_stock_prices_with_the_quote_time_of_the_provider():
    world = World(stocks=True)

    world.board()

    (sweep,) = world.database.calls("exchange_close_used_up")
    apple = next(price for price in sweep["p_prices"] if price["company_id"] == "apple")
    assert apple == {
        "company_id": "apple",
        "price": "271.20",
        "quoted_at": "2026-11-09T15:59:58+00:00",
        "mode": "live",
    }


def test_closed_and_stale_companies_are_never_in_the_sweep():
    world = World(stocks=True, start=CLASS_TIME)
    world.stock_server.quoted_at = datetime(2026, 11, 6, 20, 59, 59, tzinfo=UTC)
    world.board()

    (sweep,) = world.database.calls("exchange_close_used_up")

    assert [price["company_id"] for price in sweep["p_prices"]] == ISLAND_IDS  # no stock


def test_when_no_company_is_open_the_database_is_not_asked_to_sweep():
    world = World()
    world.binance_down()

    world.board()

    assert world.database.calls("exchange_close_used_up") == []


def test_a_sweep_that_fails_is_logged_and_does_not_fail_the_board(caplog):
    world = World()
    world.database.sweep_reply = httpx.Response(500, json={"code": "XX000", "message": "boom"})

    with caplog.at_level(logging.WARNING, logger="server"):
        response = world.board()

    assert response.status_code == 200
    assert "sweep" in caplog.text.lower()


def test_a_sweep_that_times_out_does_not_fail_the_board():
    world = World()
    world.database.sweep_reply = httpx.ReadTimeout("slow")

    assert world.board().status_code == 200


def test_a_laptop_without_a_database_still_has_a_board_and_runs_no_sweep():
    world = World(database=False)

    response = world.board()

    assert response.status_code == 200
    assert world.database.requests == []


# --- GET /api/market: demo mode ---


def test_in_demo_mode_the_board_plays_the_recording_and_carries_the_label_and_the_licence_link():
    world = World(demo=True)

    body = world.board().json()

    assert body["demo"] is True
    assert body["demoNote"] == (
        "Demo recording: prices from 4 November 2026 (Binance Vision), played back. "
        "Trades here use your real coins."
    )
    assert body["credits"] == [
        {
            "text": "Recorded prices from Binance Vision, played back.",
            "href": None,
            "licenceText": "CC BY-NC-SA 4.0",
            "licenceHref": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
        }
    ]
    assert {company["source"] for company in body["companies"]} == {"replay"}
    assert {company["status"] for company in body["companies"]} == {"open"}


def test_in_demo_mode_binance_is_never_called():
    world = World(demo=True)

    world.board()

    assert world.binance.requests == []


def test_in_demo_mode_the_stocks_are_hidden_and_their_provider_is_never_called():
    world = World(demo=True, stocks=True)

    body = world.board().json()

    assert [company["id"] for company in body["companies"]] == ISLAND_IDS
    assert world.stock_server.requests == []


def test_in_demo_mode_the_sweep_uses_the_replay_mode():
    world = World(demo=True)

    world.board()

    (sweep,) = world.database.calls("exchange_close_used_up")
    assert {price["mode"] for price in sweep["p_prices"]} == {"replay"}


def test_in_live_mode_the_board_never_plays_the_recording_even_when_binance_is_away():
    world = World()
    world.binance_down()

    companies = world.board().json()["companies"]

    assert "replay" not in {company["source"] for company in companies}


# --- GET /api/market/portfolio ---


def test_the_portfolio_needs_a_sign_in():
    assert_error(World().client.get("/api/market/portfolio"), 401, "unauthorized")


def test_while_the_flag_is_off_the_portfolio_answers_404_feature_off_and_asks_nobody():
    world = World(settings=CONFIGURED_SETTINGS)

    assert_error(world.portfolio(), 404, "feature_off")
    assert world.database.requests == []
    assert world.binance.requests == []


def test_a_player_with_nothing_has_an_empty_portfolio():
    body = World().portfolio().json()

    assert body["coins"] == 1000
    assert body["positions"] == []
    assert body["recentlyClosed"] == []
    assert (body["openCount"], body["stakedToday"]) == (0, 0)


def test_the_portfolio_carries_the_limits_and_the_fee_rate():
    body = World().portfolio().json()

    assert body["demo"] is False
    assert body["feePercent"] == 2.0
    assert body["dailyStakeCap"] == 2000
    assert body["maxOpenPositions"] == 20
    assert body["generatedAt"] == "2026-11-09T16:00:00Z"


def test_a_position_is_worth_what_its_stake_makes_at_the_current_price():
    world = World()
    world.database.positions = [position_row()]  # 100 coins, rising, entry 75000.00

    (position,) = world.portfolio().json()["positions"]

    assert position == {
        "id": POSITION_ID,
        "companyId": "harbor-trust",
        "name": "Saltreach Harbor Trust",
        "ticker": "SHT",
        "follows": "Bitcoin",
        "currency": "USDT",
        "priceDecimals": 2,
        "side": "rising",
        "mode": "live",
        "stake": 100,
        "openFee": 2,
        "entryPrice": 75000.0,
        "zeroPrice": 67500.0,
        "openedAt": "2026-11-09T11:40:12Z",
        "price": 76159.21,
        "priceAt": "2026-11-09T16:00:00Z",
        "companyStatus": "open",
        "companyReason": None,
        "opensAt": None,
        "value": 115,
        "profit": 15,
        "profitPercent": 15.0,
        "closeFee": 2,
        "wouldReceive": 113,
        "result": 11,
        "canClose": True,
    }


def test_a_falling_position_gains_when_the_price_falls():
    world = World()
    world.database.positions = [
        position_row(side="falling", entry_price=80000.0, zero_price=88000.0)
    ]

    (position,) = world.portfolio().json()["positions"]

    # 100 x (80000 - 10 x (76159.21 - 80000)) / 80000 = 100 x 118407.9 / 80000 = 148.0
    assert position["value"] == 148
    assert position["profit"] == 48


def test_after_the_relighting_the_closing_fee_is_1_percent():
    world = World(relit=True)
    world.database.positions = [position_row(stake=500, open_fee=10)]

    (position,) = world.portfolio().json()["positions"]

    assert position["closeFee"] == 5
    assert world.portfolio().json()["feePercent"] == 1.0


def test_the_portfolio_counts_the_open_positions_and_the_stakes_of_today():
    world = World()
    world.database.positions = [
        position_row(),
        position_row(id="aaaaaaaa-1111-4222-8333-444455556666", stake=250),
        position_row(
            id="bbbbbbbb-1111-4222-8333-444455556666", opened_at="2026-11-09T07:59:59+00:00"
        ),
    ]

    body = world.portfolio().json()

    assert body["openCount"] == 3
    assert body["stakedToday"] == 350  # the third was opened before the game day began (08:00)


def test_the_newest_open_position_comes_first():
    world = World()
    world.database.positions = [
        position_row(
            id="aaaaaaaa-1111-4222-8333-444455556666", opened_at="2026-11-09T09:00:00+00:00"
        ),
        position_row(
            id="bbbbbbbb-1111-4222-8333-444455556666", opened_at="2026-11-09T10:00:00+00:00"
        ),
    ]

    ids = [position["id"] for position in world.portfolio().json()["positions"]]

    assert ids == ["bbbbbbbb-1111-4222-8333-444455556666", "aaaaaaaa-1111-4222-8333-444455556666"]


def test_the_portfolio_reads_only_the_rows_of_the_signed_in_player():
    world = World()
    world.database.positions = [
        position_row(),
        position_row(id="cccccccc-1111-4222-8333-444455556666", player_id=OTHER_PLAYER_ID),
    ]

    positions = world.portfolio().json()["positions"]

    assert [position["id"] for position in positions] == [POSITION_ID]
    for request in world.database.reads("exchange_positions"):
        assert request.url.params["player_id"] == f"eq.{PLAYER_ID}"


def test_the_recently_closed_positions_say_how_they_closed_and_what_they_made():
    world = World()
    world.database.positions = [
        position_row(
            id=CLOSED_POSITION_ID,
            company_id="pier-post-courier",
            side="falling",
            stake=50,
            open_fee=1,
            entry_price=2.4,
            zero_price=2.64,
            opened_at="2026-11-09T09:12:40+00:00",
            status="zeroed",
            closed_at="2026-11-09T10:02:31+00:00",
            close_price=2.6512,
            close_value=0,
            close_fee=0,
        )
    ]

    body = world.portfolio().json()

    assert body["positions"] == []
    assert body["recentlyClosed"] == [
        {
            "id": CLOSED_POSITION_ID,
            "companyId": "pier-post-courier",
            "name": "Pier Post Courier",
            "currency": "USDT",
            "priceDecimals": 4,
            "side": "falling",
            "mode": "live",
            "stake": 50,
            "openFee": 1,
            "entryPrice": 2.4,
            "zeroPrice": 2.64,
            "openedAt": "2026-11-09T09:12:40Z",
            "closedAs": "zeroed",
            "closePrice": 2.6512,
            "closedAt": "2026-11-09T10:02:31Z",
            "value": 0,
            "closeFee": 0,
            "coinsChange": 0,
            "result": -51,
        }
    ]


def test_a_position_the_player_closed_shows_the_coins_it_paid():
    world = World()
    world.database.positions = [
        position_row(
            status="closed",
            closed_at="2026-11-09T12:00:00+00:00",
            close_price=76159.21,
            close_value=115,
            close_fee=2,
        )
    ]

    (closed,) = world.portfolio().json()["recentlyClosed"]

    assert closed["closedAs"] == "closed"
    assert (closed["value"], closed["closeFee"], closed["coinsChange"]) == (115, 2, 113)
    assert closed["result"] == 11


def test_only_the_ten_newest_closed_positions_are_asked_for():
    world = World()

    world.portfolio()

    closed_read = [
        request
        for request in world.database.reads("exchange_positions")
        if request.url.params.get("status", "").startswith("in.")
    ]
    assert closed_read[0].url.params["limit"] == "10"


def test_a_position_in_a_stock_whose_market_is_closed_shows_the_last_price_and_cannot_be_closed():
    world = World(stocks=True, start=CLASS_TIME)
    world.stock_server.quoted_at = datetime(2026, 11, 6, 20, 59, 59, tzinfo=UTC)
    world.database.positions = [
        position_row(company_id="apple", entry_price=250.0, zero_price=225.0)
    ]

    (position,) = world.portfolio().json()["positions"]

    assert position["companyStatus"] == "closed"
    assert position["companyReason"] == "outside_hours"
    assert position["opensAt"] == "2026-11-09T14:30:00Z"
    assert position["price"] == 271.2
    assert position["value"] == 184  # 100 x (250 + 10 x 21.2) / 250 = 184.8
    assert position["canClose"] is False


def test_a_position_whose_prices_are_stale_shows_the_last_price_and_cannot_be_closed():
    world = World()
    world.database.positions = [position_row()]
    world.portfolio()
    world.binance_down()
    world.advance(61)

    (position,) = world.portfolio().json()["positions"]

    assert (position["companyStatus"], position["companyReason"]) == ("stale", "source_away")
    assert position["price"] == 76159.21
    assert position["priceAt"] == "2026-11-09T16:00:00Z"
    assert position["canClose"] is False
    assert position["value"] == 115


def test_a_position_with_no_price_at_all_has_no_value_and_cannot_be_closed():
    world = World()
    world.binance_down()
    world.database.positions = [position_row()]

    (position,) = world.portfolio().json()["positions"]

    assert position["companyStatus"] == "unavailable"
    assert position["price"] is None
    assert (position["value"], position["profit"], position["result"]) == (None, None, None)
    assert position["canClose"] is False


def test_a_position_of_a_company_that_left_the_file_is_unavailable_and_cannot_be_closed():
    world = World()
    world.database.positions = [
        position_row(
            company_id="old-company",
        )
    ]

    (position,) = world.portfolio().json()["positions"]

    assert position["companyStatus"] == "unavailable"
    assert position["name"] == "old-company"
    assert position["price"] is None
    assert position["canClose"] is False


def test_a_position_of_a_company_that_left_the_file_has_no_ticker_follows_or_price_style():
    world = World()
    world.database.positions = [position_row(company_id="old-company")]

    (position,) = world.portfolio().json()["positions"]

    assert position["ticker"] is None
    assert position["follows"] is None
    assert position["currency"] is None
    assert position["priceDecimals"] is None


def test_a_closed_position_of_a_company_that_left_the_file_has_no_price_style():
    world = World()
    world.database.positions = [
        position_row(
            company_id="old-company",
            status="closed",
            closed_at="2026-11-09T12:00:00+00:00",
            close_price=76159.21,
            close_value=115,
            close_fee=2,
        )
    ]

    (closed,) = world.portfolio().json()["recentlyClosed"]

    assert closed["name"] == "old-company"
    assert closed["currency"] is None
    assert closed["priceDecimals"] is None


def test_a_stock_position_carries_its_own_currency_and_decimals_even_if_the_stock_is_off():
    world = World(stocks=False)  # the stock source is off, so the board hides Apple
    world.database.positions = [position_row(company_id="apple", entry_price=260.0)]

    (position,) = world.portfolio().json()["positions"]

    assert "apple" not in [company["id"] for company in world.board().json()["companies"]]
    assert (position["currency"], position["priceDecimals"]) == ("USD", 2)
    assert (position["companyStatus"], position["companyReason"]) == ("unavailable", "source_off")


def test_a_position_opened_on_the_recording_cannot_be_valued_or_closed_on_live_prices():
    world = World()
    world.database.positions = [position_row(price_mode="replay")]

    (position,) = world.portfolio().json()["positions"]

    assert position["mode"] == "replay"
    assert (position["companyStatus"], position["companyReason"]) == (
        "unavailable",
        "wrong_price_mode",
    )
    assert position["canClose"] is False
    assert position["price"] is None


def test_a_position_opened_on_live_prices_cannot_be_closed_in_demo_mode():
    world = World(demo=True)
    world.database.positions = [position_row()]

    (position,) = world.portfolio().json()["positions"]

    assert position["canClose"] is False
    assert position["companyReason"] == "wrong_price_mode"
    assert world.portfolio().json()["demo"] is True


def test_a_delisted_company_position_can_still_be_closed():
    world = World(relit=True)
    world.database.positions = [
        position_row(company_id="greyfathom-salvage", entry_price=4000.0, zero_price=3600.0)
    ]

    (position,) = world.portfolio().json()["positions"]

    assert position["canClose"] is True


def test_the_players_sweep_runs_before_the_positions_are_read():
    world = World()

    world.portfolio()

    names = world.database.names()
    assert names[0] == "exchange_close_used_up"
    assert names.index("exchange_close_used_up") < names.index("exchange_positions")
    (sweep,) = world.database.calls("exchange_close_used_up")
    assert sweep["p_player_id"] == PLAYER_ID


def test_a_position_zeroed_by_that_sweep_shows_in_the_recently_closed_list():
    world = World()
    world.database.positions = [position_row()]
    zeroed = position_row(
        status="zeroed",
        closed_at="2026-11-09T16:00:01+00:00",
        close_price=67000.0,
        close_value=0,
        close_fee=0,
    )
    # The sweep of the database closes the position at zero, before the positions are read.
    world.database.on_sweep = lambda: setattr(world.database, "positions", [zeroed])

    body = world.portfolio().json()

    assert body["positions"] == []
    assert body["recentlyClosed"][0]["closedAs"] == "zeroed"


def test_a_portfolio_look_is_never_cached_and_takes_no_query_parameters():
    world = World()

    assert world.portfolio().headers["cache-control"] == "no-store"
    response = world.client.get(
        "/api/market/portfolio?x=1",
        headers={"Authorization": "Bearer test.market-player.signature"},
    )
    assert_error(response, 422, "validation_error")


def test_a_player_without_a_wallet_is_a_502():
    world = World()
    world.database.has_wallet = False

    assert_error(world.portfolio(), 502, "database_error")


def test_the_portfolio_of_a_laptop_without_a_database_is_a_503():
    world = World(database=False)

    assert_error(world.portfolio(), 503, "database_not_configured")


# --- the wiring ---


def test_the_four_exchange_urls_are_listed_under_api_and_the_old_trade_url_is_gone():
    world = World()

    paths = world.client.get("/api/openapi.json").json()["paths"]

    assert "/api/market" in paths
    assert "/api/market/portfolio" in paths
    assert "/api/market/open" in paths
    assert "/api/market/close" in paths
    assert "/api/market/trade" not in paths


def test_the_old_trade_url_answers_not_found():
    response = World().client.post(
        "/api/market/trade", json={}, headers={"Authorization": "Bearer t"}
    )

    assert response.status_code in (404, 405)


@pytest.mark.parametrize(
    ("broken", "error"),
    [
        ("load_companies", CompaniesError("companies[0]: 'id' must be text that is not empty.")),
        (
            "load_calendars",
            CalendarError("calendar: 'markets' must be a list of 1 or more markets."),
        ),
        ("load_replay", ReplayError("Cannot read replay.json: FileNotFoundError.")),
    ],
)
def test_a_broken_data_file_leaves_the_rest_of_the_api_working_and_the_exchange_503(
    monkeypatch, caplog, broken, error
):
    def raise_it(*args, **kwargs):
        raise error

    monkeypatch.setattr(exchange, broken, raise_it)

    with caplog.at_level(logging.ERROR, logger="server"):
        client = TestClient(create_app(MARKET_ON))

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/config").status_code == 200
    assert_error(client.get("/api/market"), 503, "market_unavailable")
    assert_error(client.get("/api/market/portfolio"), 401, "unauthorized")
    assert "cannot start" in caplog.text


def test_all_four_routes_answer_market_unavailable_for_a_signed_in_player():
    world = World()
    world.client.app.state.market = None  # as if the data files could not be read at start-up

    assert_error(world.board(), 503, "market_unavailable")
    assert_error(world.portfolio(), 503, "market_unavailable")
    assert_error(world.open(), 503, "market_unavailable")
    assert_error(world.close(), 503, "market_unavailable")


# --- building the service from the settings ---


def stock_settings(**changes):
    return replace(MARKET_ON, stock_api_provider="finnhub", stock_api_key=SecretStr(KEY), **changes)


def test_the_service_built_from_the_settings_has_no_stock_source_by_default():
    service = market_from_settings(MARKET_ON, transport=httpx.MockTransport(FakeBinance()))

    assert service.feed.stocks is None
    assert len(service.companies) == 12


def test_the_service_built_from_the_settings_uses_binance_and_never_the_replay_in_live_mode():
    clock = World().clock
    binance = FakeBinance(good_binance_answer(BASE_PRICES))

    service = market_from_settings(MARKET_ON, transport=httpx.MockTransport(binance), clock=clock)

    assert service.feed.live is True
    assert service.demo_mode is False


def test_in_demo_mode_the_service_never_builds_the_stock_source_and_never_calls_anybody(caplog):
    calls = []

    def anybody(request):
        calls.append(request)
        return httpx.Response(200, json=[])

    settings = stock_settings(demo_mode=True)

    with caplog.at_level(logging.WARNING, logger="server"):
        service = market_from_settings(
            settings,
            transport=httpx.MockTransport(anybody),
            stock_transport=httpx.MockTransport(anybody),
        )

    assert service.feed.stocks is None
    assert service.demo_mode is True
    assert calls == []
    assert "recording" in caplog.text  # the warning that the prices are public


def test_a_stock_provider_with_a_key_builds_the_stock_source():
    service = market_from_settings(
        stock_settings(),
        transport=httpx.MockTransport(FakeBinance()),
        stock_transport=httpx.MockTransport(lambda request: httpx.Response(500)),
    )

    assert service.feed.stocks is not None
    assert service.feed.stocks.provider.name == "finnhub"


def test_a_stock_provider_without_a_key_stays_off_with_one_warning(caplog):
    settings = replace(MARKET_ON, stock_api_provider="finnhub")

    with caplog.at_level(logging.WARNING, logger="server"):
        service = market_from_settings(settings, transport=httpx.MockTransport(FakeBinance()))

    assert service.feed.stocks is None
    assert len([r for r in caplog.records if "STOCK_API_KEY" in r.getMessage()]) == 1


def test_an_unknown_stock_provider_stops_the_start_up_instead_of_being_swallowed():
    settings = replace(MARKET_ON, stock_api_provider="nasdaq", stock_api_key=SecretStr(KEY))

    with pytest.raises(StockSourceError, match="nasdaq"):
        create_app(settings)


def test_the_real_service_with_a_fake_finnhub_shows_the_stocks_on_the_board():
    clock = World().clock
    quoted = int(datetime(2026, 11, 9, 15, 59, 58, tzinfo=UTC).timestamp())

    def finnhub(request):
        return httpx.Response(
            200, json={"c": 271.2, "d": 1, "dp": 1, "h": 1, "l": 1, "o": 1, "pc": 1, "t": quoted}
        )

    service = market_from_settings(
        stock_settings(),
        transport=httpx.MockTransport(FakeBinance(good_binance_answer(BASE_PRICES))),
        stock_transport=httpx.MockTransport(finnhub),
        clock=clock,
    )
    client = TestClient(create_app(stock_settings(), market_service=service))

    body = client.get("/api/market").json()

    assert [company["id"] for company in body["companies"]] == ISLAND_IDS + STOCK_IDS
    assert body["credits"][-1] == {
        "text": "Stock prices from Finnhub.",
        "href": "https://finnhub.io",
        "licenceText": None,
        "licenceHref": None,
    }


def test_the_relighting_check_is_never_relit_by_default_and_asks_nobody():
    service = market_from_settings(MARKET_ON, transport=httpx.MockTransport(FakeBinance()))

    assert exchange.never_relit.__name__ == "never_relit"
    assert service.relit_check is exchange.never_relit


def test_a_relighting_check_given_to_the_builder_decides_the_fee_and_the_delisting():
    async def always_relit(admin) -> bool:
        return True

    clock = World().clock
    service = market_from_settings(
        MARKET_ON,
        transport=httpx.MockTransport(FakeBinance(good_binance_answer(BASE_PRICES))),
        clock=clock,
        relit_check=always_relit,
    )
    client = TestClient(create_app(MARKET_ON, market_service=service))

    body = client.get("/api/market").json()

    assert body["relit"] is True
    assert body["rules"]["feePercent"] == 1.0
    companies = {company["id"]: company for company in body["companies"]}
    assert companies["greyfathom-salvage"]["delisted"] is True
