"""Tests for routes/market.py and market/exchange.py: the three Island Exchange URLs.

Nothing here uses the network. The real prices come from a FakeFeed, the database is a
FakeDatabase (an httpx.MockTransport that behaves like the parts of Supabase the exchange uses),
the sign-in check answers from a fake transport, and the clock is a FakeClock that only moves when
the test says so.

Fixed numbers used again and again:
  * the clock starts at Thursday 5 Nov 2026, 12:00 UTC (the market day began at 08:00 that day),
  * each real price starts as BASE_PRICES, and a company starts at its start price from
    companies.json: harbor-trust (BTC) 60.00, tidewright-works (ETH) 40.00, ...,
  * at multiplier 100 a real move of +0.12 % is +12 % in the game: harbor-trust 60.00 -> 67.20,
    and +0.30 % is +30 %, which pauses the company at 78.00.
"""

import json
import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from fastapi.testclient import TestClient

from server.adapters.base import SourceUnavailable
from server.app import create_app
from server.auth import PlayerVerifier
from server.flags import default_flags
from server.market import exchange
from server.market.companies import CompaniesError, Company, load_companies
from server.market.exchange import MarketService, market_from_settings
from server.market.feed import ATTRIBUTION_LIVE, FeedError, PriceSnapshot
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_SECRET_KEY,
    FAKE_URL,
    FakeClock,
    assert_error,
)

D = Decimal

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
TOKEN = "test.market-player.signature"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
DAY_START = "2026-11-05T08:00:00+00:00"

MARKET_ON = replace(CONFIGURED_SETTINGS, flags={**default_flags(), "market": True})

# The real prices of the seven instruments at the start of a test.
BASE_PRICES = {
    "BTCUSDT": D("50000"),
    "ETHUSDT": D("2000"),
    "SOLUSDT": D("100"),
    "XRPUSDT": D("1"),
    "BNBUSDT": D("600"),
    "EURUSDT": D("1.1"),
    "PAXGUSDT": D("4000"),
}


def btc_after(percent: str) -> dict:
    """The real prices when BTC has moved by `percent` and the rest has not moved."""
    prices = dict(BASE_PRICES)
    prices["BTCUSDT"] = BASE_PRICES["BTCUSDT"] * (1 + D(percent) / 100)
    return prices


class FakeFeed:
    """A pretend price feed: it gives the prices a test has set, and counts the asks.

    `max_ages` remembers how old the prices were allowed to be at each ask (None: the default of
    the board). `failing` makes the feed behave like Binance that has never answered.
    """

    def __init__(self, clock: FakeClock, prices: dict | None = None, source: str = "live") -> None:
        self.clock = clock
        self.prices = prices or dict(BASE_PRICES)
        self.source = source
        self.asked = 0
        self.max_ages: list = []
        self.failing = False

    async def get(self, max_age_seconds: float | None = None) -> PriceSnapshot:
        self.asked += 1
        self.max_ages.append(max_age_seconds)
        if self.failing:
            raise SourceUnavailable("market prices")
        return PriceSnapshot(self.prices, self.source, self.clock.now)

    def attribution(self, source: str) -> str:
        return ATTRIBUTION_LIVE if source != "replay" else "Recorded moves from Binance Vision."

    def licence_url(self, source: str) -> str | None:
        return "https://licence.example/by-nc-sa" if source == "replay" else None


class FakeDatabase:
    """A pretend Supabase with the parts the exchange uses.

    bases      the table market_bases, as the rows Supabase would send (numbers as floats)
    balance    the player's coins; positions and trades_today are rows for the reads
    trade_reply  what market_trade answers: a dict (JSON) or a ready-made httpx.Response
    requests   every request the exchange sent, in order
    """

    def __init__(self) -> None:
        self.bases: dict[str, dict] = {}
        self.balance = 1000
        self.has_wallet = True
        self.positions: list[dict] = []
        self.trades_today: list[dict] = []
        self.known_refs: set[str] = set()  # refs of trades that were made already
        self.trade_reply: dict | httpx.Response = {
            "status": "done",
            "balance": 694,
            "unitsAfter": 5,
            "avgPrice": 60.0,
            "tradeId": 1,
        }
        self.race_once = False  # True: another server instance saves first, once
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1')}"
        handlers = {
            "GET /market_bases": self.read_bases,
            "POST /rpc/market_set_base": self.set_base,
            "POST /rpc/market_trade": self.trade,
            "GET /wallets": self.read_wallet,
            "GET /market_positions": lambda r: httpx.Response(200, json=self.positions),
            "GET /market_trades": self.read_trades,
        }
        return handlers[route](request)

    def read_trades(self, request: httpx.Request) -> httpx.Response:
        """The history: one row if the ref is known (the repeat check), else the buys of today."""
        ref = request.url.params.get("ref")
        if ref is not None:
            known = ref.removeprefix("eq.") in self.known_refs
            return httpx.Response(200, json=[{"id": 1}] if known else [])
        return httpx.Response(200, json=self.trades_today)

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        rows = [{"balance": self.balance}] if self.has_wallet else []
        return httpx.Response(200, json=rows)

    def read_bases(self, request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=list(self.bases.values()))

    def set_base(self, request: httpx.Request) -> httpx.Response:
        """market_set_base: save only if the version is the one the caller read."""
        arguments = json.loads(request.content)
        company_id = arguments["p_company_id"]
        if self.race_once:
            self.race_once = False
            self.bases[company_id] = self.bases.get(company_id) or self.row_from(arguments, 0)
            self.bases[company_id]["version"] += 1  # somebody else saved just before us
        current = self.bases.get(company_id)
        current_version = 0 if current is None else current["version"]
        if current_version != arguments["p_expected_version"]:
            return httpx.Response(200, json=None)
        self.bases[company_id] = self.row_from(arguments, current_version)
        return httpx.Response(200, json=current_version + 1)

    @staticmethod
    def row_from(arguments: dict, old_version: int) -> dict:
        frozen = arguments["p_frozen_price"]
        return {
            "company_id": arguments["p_company_id"],
            "base_game_price": float(arguments["p_base_game_price"]),
            "base_real_price": float(arguments["p_base_real_price"]),
            "base_at": arguments["p_base_at"],
            "base_source": arguments["p_base_source"],
            "halted_until": arguments["p_halted_until"],
            "frozen_price": None if frozen is None else float(frozen),
            "version": old_version + 1,
        }

    def trade(self, request: httpx.Request) -> httpx.Response:
        if isinstance(self.trade_reply, httpx.Response):
            return self.trade_reply
        return httpx.Response(200, json=self.trade_reply)

    def calls(self, name: str) -> list[dict]:
        """The JSON arguments of every call to the database function `name`."""
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def reads(self, table: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == "GET" and r.url.path.endswith(f"/{table}")]


class World:
    """One test world: the app, a client, and the fakes behind it."""

    def __init__(self, settings: Settings = MARKET_ON, companies=None, multiplier: int = 100):
        self.clock = FakeClock()
        self.feed = FakeFeed(self.clock)
        self.database = FakeDatabase()
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        verifier = PlayerVerifier(
            settings,
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"id": PLAYER_ID})),
            clock=self.clock,
        )
        self.service = MarketService(
            companies or load_companies(), self.feed, multiplier, self.clock
        )
        self.client = TestClient(create_app(settings, verifier, admin, market_service=self.service))

    def board(self) -> httpx.Response:
        return self.client.get("/api/market")

    def trade(self, **body) -> httpx.Response:
        request = {
            "companyId": "harbor-trust",
            "side": "buy",
            "units": 5,
            "actionUid": "click-0001",
        }
        request.update(body)
        return self.client.post("/api/market/trade", json=request, headers=AUTH)

    def portfolio(self) -> httpx.Response:
        return self.client.get("/api/market/portfolio", headers=AUTH)

    def company(self, company_id: str = "harbor-trust") -> dict:
        companies = self.board().json()["companies"]
        return next(company for company in companies if company["id"] == company_id)


# --- GET /api/market: the price board ---


def test_the_board_lists_the_seven_companies_at_their_start_prices():
    world = World()

    body = world.board().json()

    assert [company["id"] for company in body["companies"]] == [
        "harbor-trust",
        "tidewright-works",
        "swiftwater-ferries",
        "pier-post-courier",
        "market-hall-guild",
        "two-shores-bureau",
        "greyfathom-salvage",
    ]
    assert [company["price"] for company in body["companies"]] == [
        60.0,
        40.0,
        24.0,
        12.0,
        30.0,
        50.0,
        20.0,
    ]
    assert {company["status"] for company in body["companies"]} == {"open"}
    assert {company["movePercent"] for company in body["companies"]} == {0.0}


def test_the_board_needs_no_sign_in():
    world = World()

    assert world.client.get("/api/market").status_code == 200


def test_the_board_says_where_the_prices_come_from_and_when():
    body = World().board().json()

    assert body["source"] == "live"
    assert body["fetchedAt"] == "2026-11-05T12:00:00Z"


def test_the_board_works_while_the_flag_is_off_and_says_trading_is_not_enabled():
    world = World(settings=CONFIGURED_SETTINGS)  # every flag off

    response = world.board()

    assert response.status_code == 200
    assert response.json()["tradingEnabled"] is False


def test_the_board_says_trading_is_enabled_when_the_flag_is_on():
    assert World().board().json()["tradingEnabled"] is True


def test_the_board_can_be_cached_for_30_seconds():
    response = World().board()

    assert response.headers["cache-control"] == "public, max-age=30, s-maxage=30"


def test_a_failed_board_is_not_cached():
    world = World()
    world.database.read_bases = lambda request: httpx.Response(500, json={})

    response = world.board()

    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"


def test_the_board_carries_the_rules_the_screen_shows():
    rules = World().board().json()["rules"]

    assert rules == {
        "multiplier": 100,
        "feePercent": 2.0,
        "breakerPercent": 30,
        "haltMinutes": 15,
        "floorPercent": 25,
        "ceilingPercent": 400,
        "minHoldMinutes": 10,
        "maxTradeCoins": 500,
        "dailyBuyCapCoins": 2000,
        "marketDayStarts": "08:00 Europe/Lisbon",
        "pauseNote": "A pause only stops trading. Your shares are not sold, and they stay yours.",
    }


def test_the_board_shows_the_multiplier_of_the_server():
    assert World(multiplier=20).board().json()["rules"]["multiplier"] == 20


def test_the_board_carries_the_credit_line_that_says_simulation_and_play_money():
    attribution = World().board().json()["attribution"]

    assert "Binance" in attribution
    assert "play money" in attribution


def test_the_credit_line_follows_the_source_of_the_prices():
    world = World()
    world.feed.source = "replay"

    body = world.board().json()

    assert body["source"] == "replay"
    assert "Binance Vision" in body["attribution"]


def test_prices_are_json_numbers_not_text():
    company = World().company()

    assert isinstance(company["price"], float)
    assert isinstance(company["basePrice"], float)
    assert isinstance(company["movePercent"], float)


def test_the_board_holds_no_secret_and_no_real_price():
    text = World().board().text

    assert FAKE_SECRET_KEY not in text
    assert "50000" not in text  # the real price of BTC is not published, only the game price


def test_a_real_rise_of_0_12_percent_gives_harbor_trust_67_20():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")

    company = world.company()

    assert company["price"] == 67.2
    assert company["movePercent"] == 12.0
    assert company["basePrice"] == 60.0
    assert company["status"] == "open"


def test_only_the_company_that_follows_the_instrument_moves():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")

    assert world.company("tidewright-works")["price"] == 40.0


def test_a_multiplier_of_20_amplifies_less():
    world = World(multiplier=20)
    world.board()
    world.feed.prices = btc_after("0.5")

    assert world.company()["price"] == 66.0  # 60 x (1 + 20 x 0.005)


def test_the_board_takes_no_query_parameters_so_nobody_can_skip_the_cache():
    world = World()

    response = world.client.get("/api/market?now=1")

    assert_error(response, 422, "validation_error")
    assert world.feed.asked == 0


def test_the_board_of_live_prices_has_no_licence_link():
    assert World().board().json()["licenceUrl"] is None


def test_while_the_replay_plays_the_board_links_to_its_licence():
    world = World()
    world.feed.source = "replay"

    assert world.board().json()["licenceUrl"] == "https://licence.example/by-nc-sa"


def test_the_board_still_shows_old_prices_marked_stale():
    world = World()
    world.feed.source = "stale"

    body = world.board().json()

    assert body["source"] == "stale"
    assert body["companies"][0]["price"] == 60.0


# --- GET /api/market: while the flag is off the board only looks ---


def test_while_the_flag_is_off_the_board_saves_no_base():
    world = World(settings=CONFIGURED_SETTINGS)

    body = world.board().json()

    assert body["tradingEnabled"] is False
    assert [company["price"] for company in body["companies"]][:2] == [60.0, 40.0]
    assert world.database.calls("market_set_base") == []


def test_while_the_flag_is_off_a_pause_is_shown_but_not_saved():
    world = World()
    world.board()  # the flag is on: the bases exist now
    saves_before = len(world.database.calls("market_set_base"))
    world.feed.prices = btc_after("0.30")
    admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(world.database))
    flag_off = TestClient(
        create_app(CONFIGURED_SETTINGS, admin=admin, market_service=world.service)
    )

    company = flag_off.get("/api/market").json()["companies"][0]

    assert company["status"] == "halted"  # the board shows what the rules say ...
    assert len(world.database.calls("market_set_base")) == saves_before  # ... and saves nothing


def test_when_the_flag_is_on_the_board_saves_the_bases():
    world = World()

    world.board()

    assert len(world.database.calls("market_set_base")) == 7


# --- GET /api/market: the bases in the database ---


def test_the_first_look_saves_a_base_for_every_company_as_a_new_row():
    world = World()

    world.board()

    saves = world.database.calls("market_set_base")
    assert len(saves) == 7
    assert {save["p_expected_version"] for save in saves} == {0}
    btc = next(save for save in saves if save["p_company_id"] == "harbor-trust")
    assert btc["p_base_game_price"] == "60.00"
    assert btc["p_base_real_price"] == "50000"
    assert btc["p_base_source"] == "live"
    assert btc["p_halted_until"] is None
    assert btc["p_frozen_price"] is None


def test_the_next_look_saves_nothing_when_nothing_changed():
    world = World()
    world.board()
    saves_before = len(world.database.calls("market_set_base"))

    world.board()

    assert len(world.database.calls("market_set_base")) == saves_before


def test_a_small_move_saves_nothing():
    world = World()
    world.board()
    saves_before = len(world.database.calls("market_set_base"))
    world.feed.prices = btc_after("0.12")

    world.board()

    assert len(world.database.calls("market_set_base")) == saves_before


def test_the_bases_are_read_from_the_database_on_every_look():
    world = World()

    world.board()
    world.board()

    assert len(world.database.reads("market_bases")) == 2


def test_a_second_server_instance_with_the_same_database_agrees_on_the_price():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    other = MarketService(load_companies(), world.feed, 100, world.clock)
    other_client = TestClient(
        create_app(
            MARKET_ON,
            PlayerVerifier(MARKET_ON),
            SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(world.database)),
            market_service=other,
        )
    )

    mine = world.company()["price"]
    theirs = next(
        c for c in other_client.get("/api/market").json()["companies"] if c["id"] == "harbor-trust"
    )["price"]

    assert mine == theirs == 67.2


def test_when_another_instance_saved_first_the_board_reads_again_and_uses_that():
    world = World()
    world.board()  # the bases exist now
    world.clock.advance(24 * 3600)  # a new market day: every company must be re-based
    world.database.race_once = True

    response = world.board()

    assert response.status_code == 200
    assert world.database.race_once is False
    assert len(world.database.reads("market_bases")) >= 3  # one look, one re-read after the race


# --- GET /api/market: the circuit breaker ---


def test_a_real_rise_of_0_3_percent_pauses_the_company_at_130_percent_of_its_base():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")

    company = world.company()

    assert company["status"] == "halted"
    assert company["price"] == 78.0
    assert company["movePercent"] == 30.0
    assert company["haltedUntil"] == "2026-11-05T12:15:00Z"


def test_the_pause_is_saved_with_its_end_time_and_frozen_price():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")

    world.board()

    row = world.database.bases["harbor-trust"]
    assert row["halted_until"] == "2026-11-05T12:15:00+00:00"
    assert row["frozen_price"] == 78.0
    assert row["base_game_price"] == 60.0  # the base stays until the pause is over
    assert row["version"] == 2


def test_a_paused_company_stays_frozen_and_is_saved_only_once():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")
    world.board()
    world.clock.advance(300)
    world.feed.prices = btc_after("-2")  # a crash while it is paused changes nothing

    company = world.company()

    assert company["status"] == "halted"
    assert company["price"] == 78.0
    assert world.database.bases["harbor-trust"]["version"] == 2


def test_after_15_minutes_the_company_restarts_from_the_frozen_price_and_gets_a_new_base():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")
    world.board()
    world.clock.advance(15 * 60)
    world.feed.prices = btc_after("0.5")

    company = world.company()

    assert company["status"] == "open"
    assert company["price"] == 78.0
    assert company["movePercent"] == 0.0
    row = world.database.bases["harbor-trust"]
    assert row["halted_until"] is None
    assert row["frozen_price"] is None
    assert row["base_game_price"] == 78.0
    assert row["base_real_price"] == pytest.approx(50250.0)


def test_the_other_companies_keep_trading_while_one_is_paused():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")

    assert world.company("tidewright-works")["status"] == "open"


# --- GET /api/market: the daily re-base and the price source ---


def test_the_first_look_on_a_new_market_day_keeps_the_price_and_starts_the_move_again():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    world.board()
    world.clock.advance(24 * 3600)

    company = world.company()

    assert company["price"] == 67.2
    assert company["movePercent"] == 0.0
    assert world.database.bases["harbor-trust"]["base_game_price"] == 67.2


def test_a_change_of_price_source_takes_the_company_back_to_its_base_game_price():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    assert world.company()["price"] == 67.2  # the live prices put the company 12 % up
    world.feed.prices = {symbol: price * D("0.9") for symbol, price in BASE_PRICES.items()}
    world.feed.source = "replay"

    company = world.company()

    assert company["price"] == 60.0  # the recorded prices cannot be compared: back to the base
    assert company["status"] == "open"
    assert world.database.bases["harbor-trust"]["base_source"] == "replay"


# --- GET /api/market: without a database ---


def test_without_a_database_the_board_still_works_from_memory():
    clock = FakeClock()
    feed = FakeFeed(clock)
    seen = []
    admin = SupabaseAdmin("", "", httpx.MockTransport(lambda r: seen.append(r)))
    service = MarketService(load_companies(), feed, 100, clock)
    client = TestClient(create_app(MARKET_ON, admin=admin, market_service=service))

    first = client.get("/api/market")
    feed.prices = btc_after("0.12")
    second = client.get("/api/market")

    assert first.status_code == second.status_code == 200
    assert second.json()["companies"][0]["price"] == 67.2
    assert seen == []  # no request went out


def test_without_a_database_a_pause_is_remembered_in_memory_too():
    clock = FakeClock()
    feed = FakeFeed(clock)
    admin = SupabaseAdmin("", "")
    service = MarketService(load_companies(), feed, 100, clock)
    client = TestClient(create_app(MARKET_ON, admin=admin, market_service=service))
    client.get("/api/market")
    feed.prices = btc_after("0.30")

    first = client.get("/api/market").json()["companies"][0]
    feed.prices = btc_after("0")
    second = client.get("/api/market").json()["companies"][0]

    assert first["status"] == second["status"] == "halted"
    assert second["price"] == 78.0


def binance_answers(*replies):
    """A pretend Binance for the real service: it answers with the given replies, in order."""
    queue = list(replies)

    def answer(request: httpx.Request) -> httpx.Response:
        return queue.pop(0) if len(queue) > 1 else queue[0]

    return httpx.MockTransport(answer)


def real_service_client(transport, clock: FakeClock, settings: Settings = MARKET_ON):
    service = market_from_settings(settings, transport=transport, clock=clock)
    admin = SupabaseAdmin("", "")
    return TestClient(create_app(settings, admin=admin, market_service=service))


def test_when_binance_has_never_answered_the_live_board_is_a_503_and_never_plays_the_replay():
    clock = FakeClock()
    client = real_service_client(binance_answers(httpx.Response(451, json={})), clock)

    response = client.get("/api/market")

    assert_error(response, 503, "source_unavailable")
    assert response.headers["cache-control"] == "no-store"


def test_when_binance_fails_after_a_good_answer_the_board_shows_the_old_prices_as_stale():
    clock = FakeClock()
    live = httpx.Response(
        200, json=[{"symbol": s, "price": str(p)} for s, p in BASE_PRICES.items()]
    )
    client = real_service_client(binance_answers(live, httpx.Response(500)), clock)
    first = client.get("/api/market").json()

    clock.advance(24 * 3600)  # a day later Binance is still failing
    second = client.get("/api/market").json()

    assert first["source"] == "live"
    assert second["source"] == "stale"
    assert second["fetchedAt"] == first["fetchedAt"]  # the board says how old the prices are
    assert second["licenceUrl"] is None
    assert "Binance Vision" not in second["attribution"]  # it is never the replay


def test_in_demo_mode_the_real_service_never_calls_binance_and_plays_the_replay():
    clock = FakeClock()
    calls = []

    def binance(request):
        calls.append(request)
        return httpx.Response(200, json=[])

    settings = replace(MARKET_ON, demo_mode=True)
    service = market_from_settings(settings, transport=httpx.MockTransport(binance), clock=clock)
    client = TestClient(create_app(settings, admin=SupabaseAdmin("", ""), market_service=service))

    body = client.get("/api/market").json()

    assert body["source"] == "replay"
    assert body["licenceUrl"] == "https://creativecommons.org/licenses/by-nc-sa/4.0/"
    assert "Binance Vision" in body["attribution"]
    assert calls == []


# --- POST /api/market/trade: who may trade ---


def test_trading_needs_a_sign_in():
    world = World()

    response = world.client.post("/api/market/trade", json={})

    assert_error(response, 401, "unauthorized")
    assert world.database.requests == []


def test_a_visitor_without_sign_in_gets_401_even_while_the_flag_is_off():
    world = World(settings=CONFIGURED_SETTINGS)

    assert_error(world.client.post("/api/market/trade", json={}), 401, "unauthorized")


def test_while_the_flag_is_off_trading_answers_404_feature_off_and_asks_nobody():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.trade()

    assert_error(response, 404, "feature_off")
    assert world.database.requests == []
    assert world.feed.asked == 0


def test_while_the_flag_is_off_the_portfolio_answers_404_feature_off():
    world = World(settings=CONFIGURED_SETTINGS)

    assert_error(world.portfolio(), 404, "feature_off")
    assert world.database.requests == []


def test_the_portfolio_needs_a_sign_in():
    world = World()

    assert_error(world.client.get("/api/market/portfolio"), 401, "unauthorized")


# --- POST /api/market/trade: the request must fit ---


@pytest.mark.parametrize(
    "change",
    [
        {"units": 0},
        {"units": -3},
        {"units": 5.5},
        {"units": "5"},
        {"units": True},
        {"units": 100_001},
        {"units": None},
        {"side": "hold"},
        {"side": "BUY"},
        {"companyId": "Harbor-Trust"},
        {"companyId": "x"},
        {"companyId": "harbor trust"},
        {"companyId": ""},
        {"actionUid": "short"},
        {"actionUid": "has spaces in it"},
        {"actionUid": "x" * 65},
        {"actionUid": 12345678},
    ],
)
def test_a_request_that_does_not_fit_is_refused_with_422_and_nothing_else_happens(change):
    world = World()

    response = world.trade(**change)

    assert_error(response, 422, "validation_error")
    assert world.database.calls("market_trade") == []


@pytest.mark.parametrize("missing", ["companyId", "side", "units", "actionUid"])
def test_a_missing_field_is_refused_with_422(missing):
    world = World()
    body = {"companyId": "harbor-trust", "side": "buy", "units": 5, "actionUid": "click-0001"}
    del body[missing]

    response = world.client.post("/api/market/trade", json=body, headers=AUTH)

    assert_error(response, 422, "validation_error")
    assert missing in response.json()["error"]["message"]


def test_an_extra_field_such_as_a_player_id_or_a_price_is_refused():
    world = World()

    for extra in ({"playerId": "someone-else"}, {"price": 1.0}, {"coins": 99999}):
        response = world.trade(**extra)

        assert_error(response, 422, "validation_error")
    assert world.database.calls("market_trade") == []


def test_an_unknown_company_is_404():
    world = World()

    response = world.trade(companyId="no-such-company")

    assert_error(response, 404, "no_such_company")
    assert world.database.calls("market_trade") == []


# --- POST /api/market/trade: buying and selling ---


def test_buying_5_units_at_60_costs_300_coins_and_a_fee_of_6():
    world = World()
    world.database.trade_reply = {
        "status": "done",
        "balance": 694,
        "unitsAfter": 5,
        "avgPrice": 60.0,
        "tradeId": 1,
    }

    response = world.trade(side="buy", units=5)

    assert response.status_code == 200
    assert response.json() == {
        "companyId": "harbor-trust",
        "side": "buy",
        "units": 5,
        "price": 60.0,
        "gross": 300,
        "fee": 6,
        "coinsChange": -306,
        "coins": 694,
        "unitsHeld": 5,
        "avgPrice": 60.0,
    }


def test_the_server_sends_the_database_the_numbers_it_worked_out_and_the_verified_player():
    world = World()

    world.trade(side="buy", units=5, actionUid="click-0001")

    assert world.database.calls("market_trade") == [
        {
            "p_player_id": PLAYER_ID,
            "p_company_id": "harbor-trust",
            "p_side": "buy",
            "p_units": 5,
            "p_price": "60.00",
            "p_gross": 300,
            "p_fee": 6,
            "p_ref": "market:click-0001",
            "p_min_hold_seconds": 600,
            "p_daily_buy_cap": 2000,
            "p_day_start": DAY_START,
            "p_fee_basis_points": 200,
            "p_max_buy_coins": 500,
        }
    ]


def test_the_price_of_a_trade_is_the_amplified_price_of_that_moment():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")

    world.trade(side="buy", units=3)

    call = world.database.calls("market_trade")[0]
    # 3 x 67.20 = 201.60, rounded UP to 202 coins. The fee is 2 % of 202 = 4.04, rounded UP to 5.
    assert call["p_price"] == "67.20"
    assert call["p_gross"] == 202
    assert call["p_fee"] == 5


def test_selling_rounds_the_coins_down_and_the_fee_up():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    world.database.trade_reply = {
        "status": "done",
        "balance": 1150,
        "unitsAfter": 2,
        "avgPrice": 60.0,
        "tradeId": 2,
    }

    response = world.trade(side="sell", units=3, actionUid="click-0002")

    # 3 x 67.20 = 201.60, rounded DOWN to 201 coins. The fee is 2 % of 201 = 4.02, rounded UP to 5.
    call = world.database.calls("market_trade")[0]
    assert (call["p_side"], call["p_gross"], call["p_fee"]) == ("sell", 201, 5)
    assert response.json()["coinsChange"] == 196
    assert response.json()["unitsHeld"] == 2


def test_selling_everything_answers_with_no_average_price():
    world = World()
    world.database.trade_reply = {
        "status": "done",
        "balance": 1294,
        "unitsAfter": 0,
        "avgPrice": None,
        "tradeId": 3,
    }

    body = world.trade(side="sell", units=5, actionUid="click-0003").json()

    assert body["unitsHeld"] == 0
    assert body["avgPrice"] is None


def test_every_coin_movement_goes_through_the_wallet_rules_before_the_database_is_asked():
    # If the wallet rules refused an amount, the database would never be called. A trade of
    # exactly the biggest size is allowed, so this checks the happy end of that rule.
    world = World()

    response = world.trade(units=8)  # 8 x 60 = 480 coins, under the limit of 500

    assert response.status_code == 200


def test_a_trade_worth_more_than_500_coins_is_refused_before_the_database_is_asked():
    world = World()

    response = world.trade(units=9)  # 9 x 60 = 540 coins

    assert_error(response, 422, "trade_too_big")
    assert "500" in response.json()["error"]["message"]
    assert world.database.calls("market_trade") == []


def test_a_trade_worth_less_than_one_coin_is_refused():
    cheap = Company("tiny-co", "Tiny Co", "TINY", "BTC", "BTCUSDT", D("1.00"), "Cheap.")
    world = World(companies=(cheap,))
    world.board()
    world.feed.prices = btc_after("-0.29")  # 1.00 x (1 - 0.29) = 0.71

    response = world.trade(companyId="tiny-co", side="sell", units=1)

    assert_error(response, 422, "trade_too_small")
    assert world.database.calls("market_trade") == []


def test_a_paused_company_cannot_be_traded_and_the_database_is_not_asked():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")

    response = world.trade()

    assert_error(response, 409, "market_halted")
    assert "Saltreach Harbor Trust" in response.json()["error"]["message"]
    assert world.database.calls("market_trade") == []


def test_a_company_that_is_not_paused_can_be_traded_while_another_is():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")

    response = world.trade(companyId="tidewright-works", units=2)

    assert response.status_code == 200


# --- POST /api/market/trade: what the database refuses ---


@pytest.mark.parametrize(
    ("reply", "status", "code", "words"),
    [
        ({"status": "refused", "reason": "halted"}, 409, "market_halted", "paused"),
        (
            {"status": "refused", "reason": "daily_cap", "coinsLeft": 150},
            409,
            "daily_buy_cap",
            "150 coins",
        ),
        (
            {"status": "refused", "reason": "not_enough_units", "unitsHeld": 2},
            409,
            "not_enough_units",
            "only 2 unit",
        ),
        (
            {"status": "refused", "reason": "holding_time", "waitSeconds": 437},
            409,
            "holding_time",
            "7 min 17 s",
        ),
    ],
)
def test_a_rule_that_the_database_enforces_is_answered_with_a_clear_409(reply, status, code, words):
    world = World()
    world.database.trade_reply = reply

    response = world.trade()

    assert_error(response, status, code)
    assert words in response.json()["error"]["message"]


def test_a_refusal_we_do_not_know_is_a_502_and_not_a_success():
    world = World()
    world.database.trade_reply = {"status": "refused", "reason": "something_new"}

    assert_error(world.trade(), 502, "database_error")


@pytest.mark.parametrize("reply", [None, [], "done", {"status": "maybe"}, {"balance": 5}])
def test_an_answer_the_server_cannot_read_is_a_502(reply):
    world = World()
    world.database.trade_reply = reply

    assert_error(world.trade(), 502, "database_error")


def test_not_enough_coins_is_a_409_insufficient_funds():
    world = World()
    world.database.trade_reply = httpx.Response(
        400, json={"code": "P0001", "message": "insufficient_funds", "details": None}
    )

    assert_error(world.trade(), 409, "insufficient_funds")


def test_a_repeated_action_uid_is_a_409_already_applied():
    world = World()
    world.database.trade_reply = httpx.Response(
        409, json={"code": "23505", "message": "already_applied", "details": None}
    )

    assert_error(world.trade(), 409, "already_applied")


def test_sending_the_same_click_twice_uses_the_same_ledger_ref_both_times():
    world = World()

    world.trade(actionUid="click-same-1")
    world.trade(actionUid="click-same-1")

    refs = [call["p_ref"] for call in world.database.calls("market_trade")]
    assert refs == ["market:click-same-1", "market:click-same-1"]


def test_two_different_clicks_use_two_different_refs():
    world = World()

    world.trade(actionUid="click-aaaa-1")
    world.trade(actionUid="click-bbbb-2")

    refs = {call["p_ref"] for call in world.database.calls("market_trade")}
    assert refs == {"market:click-aaaa-1", "market:click-bbbb-2"}


def test_a_database_that_times_out_during_a_trade_is_a_503_and_the_outcome_is_unknown():
    world = World()

    def times_out(request):
        raise httpx.ReadTimeout("slow", request=request)

    world.database.trade = times_out

    response = world.trade()

    assert_error(response, 503, "database_unavailable")


def test_an_unconfigured_database_is_a_503_for_trading():
    clock = FakeClock()
    service = MarketService(load_companies(), FakeFeed(clock), 100, clock)
    verifier = PlayerVerifier(
        MARKET_ON,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"id": PLAYER_ID})),
        clock=clock,
    )
    client = TestClient(
        create_app(MARKET_ON, verifier, SupabaseAdmin("", ""), market_service=service)
    )

    response = client.post(
        "/api/market/trade",
        json={"companyId": "harbor-trust", "side": "buy", "units": 1, "actionUid": "click-0001"},
        headers=AUTH,
    )

    assert_error(response, 503, "database_not_configured")


# --- POST /api/market/trade: only prices that are fresh enough ---


def test_a_trade_asks_the_feed_for_prices_that_are_at_most_5_seconds_old():
    world = World()

    world.trade()

    assert world.feed.max_ages == [5]


def test_the_price_board_accepts_older_prices_than_a_trade_does():
    world = World()

    world.board()
    world.trade()

    assert world.feed.max_ages == [None, 5]  # None: the feed's own 60 seconds


def test_a_purchase_on_stale_prices_is_refused_with_409_and_nothing_is_changed():
    world = World()
    world.board()
    world.feed.source = "stale"  # Binance is not answering: the prices may be out of date

    response = world.trade()

    assert_error(response, 409, "prices_stale")
    assert "paused" in response.json()["error"]["message"]
    assert world.database.calls("market_trade") == []


def test_a_sale_on_stale_prices_is_refused_too_so_nobody_sells_at_a_price_that_is_gone():
    world = World()
    world.board()
    world.feed.source = "stale"

    response = world.trade(side="sell", units=3)

    assert_error(response, 409, "prices_stale")
    assert world.database.calls("market_trade") == []


def test_a_trade_while_binance_has_never_answered_is_a_409_and_not_a_503():
    # A 503 on a money route means "outcome unknown". Here nothing was done, and the answer says so.
    world = World()
    world.feed.failing = True

    response = world.trade()

    assert_error(response, 409, "prices_stale")
    assert world.database.calls("market_trade") == []


def test_stale_prices_are_checked_before_a_pause_because_a_pause_may_be_out_of_date_too():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")  # the company is paused now ...
    world.feed.source = "stale"

    response = world.trade()

    assert_error(response, 409, "prices_stale")  # ... but old prices are the first problem


def test_in_demo_mode_trading_on_the_replay_is_allowed():
    world = World()
    world.feed.source = "replay"

    assert world.trade().status_code == 200


def test_the_portfolio_still_works_on_stale_prices():
    world = World()
    world.feed.source = "stale"
    world.database.positions = [position_row()]

    body = world.portfolio().json()

    assert body["source"] == "stale"
    assert body["positions"][0]["canSellNow"] is True  # the screen decides with the source


# --- POST /api/market/trade: a click that was made already ---


def test_a_click_that_was_made_already_is_answered_already_applied_and_nothing_else_is_asked():
    world = World()
    world.database.known_refs = {"market:click-0001"}

    response = world.trade(actionUid="click-0001")

    assert_error(response, 409, "already_applied")
    assert world.database.calls("market_trade") == []
    assert world.feed.asked == 0  # not even the prices were looked at


def test_the_repeat_check_looks_for_this_player_and_this_ref():
    world = World()

    world.trade(actionUid="click-0001")

    lookup = [r for r in world.database.reads("market_trades") if "ref" in r.url.params]
    assert len(lookup) == 1
    assert lookup[0].url.params["player_id"] == f"eq.{PLAYER_ID}"
    assert lookup[0].url.params["ref"] == "eq.market:click-0001"


def test_a_repeat_is_already_applied_even_when_the_company_is_paused_now():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")
    world.database.known_refs = {"market:click-0001"}

    assert_error(world.trade(actionUid="click-0001"), 409, "already_applied")


def test_a_repeat_is_already_applied_even_when_the_price_has_made_it_too_big_since():
    world = World()
    world.database.known_refs = {"market:click-0001"}

    response = world.trade(actionUid="click-0001", units=9)  # 9 x 60 = 540, over the limit

    assert_error(response, 409, "already_applied")


def test_a_repeat_is_already_applied_even_when_the_prices_have_gone_old():
    world = World()
    world.feed.source = "stale"
    world.database.known_refs = {"market:click-0001"}

    assert_error(world.trade(actionUid="click-0001"), 409, "already_applied")


def test_a_new_click_is_not_a_repeat():
    world = World()
    world.database.known_refs = {"market:click-0001"}

    assert world.trade(actionUid="click-0002").status_code == 200


# --- POST /api/market/trade: a sale has no upper size ---


def test_a_sale_worth_more_than_500_coins_is_allowed_so_a_holder_can_always_sell():
    world = World()

    response = world.trade(side="sell", units=9, actionUid="click-0009")  # 9 x 60 = 540

    assert response.status_code == 200
    assert world.database.calls("market_trade")[0]["p_gross"] == 540


# --- POST /api/market/trade: the speed limit ---


def test_the_11th_trade_within_30_seconds_is_a_429_with_a_hint_how_long_to_wait():
    world = World()
    for number in range(10):
        assert world.trade(actionUid=f"click-{number:04d}").status_code == 200

    response = world.trade(actionUid="click-0010")

    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "30"
    assert len(world.database.calls("market_trade")) == 10


def test_the_refused_11th_trade_asks_nobody_for_prices():
    world = World()
    for number in range(10):
        world.trade(actionUid=f"click-{number:04d}")
    asked = world.feed.asked

    world.trade(actionUid="click-0010")

    assert world.feed.asked == asked


def test_after_30_seconds_the_player_may_trade_again():
    world = World()
    for number in range(10):
        world.trade(actionUid=f"click-{number:04d}")
    world.clock.advance(30)

    assert world.trade(actionUid="click-0010").status_code == 200


# --- GET /api/market/portfolio ---


def position_row(**changes) -> dict:
    row = {
        "company_id": "harbor-trust",
        "units": 5,
        "avg_price": 60.0,
        "opened_at": "2026-11-05T11:30:00+00:00",
        "last_buy_at": "2026-11-05T11:45:00+00:00",
    }
    row.update(changes)
    return row


def test_the_portfolio_shows_coins_positions_and_what_they_are_worth_now():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    world.database.balance = 940
    world.database.positions = [position_row()]
    world.database.trades_today = [{"gross": 300}, {"gross": 50}]

    body = world.portfolio().json()

    assert body["coins"] == 940
    assert body["boughtToday"] == 350
    assert body["dailyBuyCap"] == 2000
    assert body["totalValue"] == 336
    assert body["source"] == "live"
    assert body["positions"] == [
        {
            "companyId": "harbor-trust",
            "name": "Saltreach Harbor Trust",
            "ticker": "SHT",
            "units": 5,
            "avgPrice": 60.0,
            "price": 67.2,
            "value": 336,
            "profitPercent": 12.0,
            "sellableFrom": "2026-11-05T11:55:00Z",
            "canSellNow": True,
            "status": "open",
        }
    ]


def test_units_bought_5_minutes_ago_cannot_be_sold_yet_and_the_screen_is_told_when():
    world = World()
    world.database.positions = [position_row(last_buy_at="2026-11-05T11:55:00+00:00")]

    position = world.portfolio().json()["positions"][0]

    assert position["canSellNow"] is False
    assert position["sellableFrom"] == "2026-11-05T12:05:00Z"


def test_units_bought_exactly_10_minutes_ago_can_be_sold():
    world = World()
    world.database.positions = [position_row(last_buy_at="2026-11-05T11:50:00+00:00")]

    assert world.portfolio().json()["positions"][0]["canSellNow"] is True


def test_the_value_of_units_is_rounded_down_like_a_sale():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")
    world.database.positions = [position_row(units=3)]

    assert world.portfolio().json()["positions"][0]["value"] == 201  # 3 x 67.20 = 201.60


def test_a_position_in_a_paused_company_is_marked_halted_and_valued_at_the_frozen_price():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.30")
    world.database.positions = [position_row()]

    position = world.portfolio().json()["positions"][0]

    assert position["status"] == "halted"
    assert position["price"] == 78.0
    assert position["value"] == 390


def test_a_position_in_a_company_that_is_no_longer_listed_is_left_out():
    world = World()
    world.database.positions = [position_row(company_id="delisted-co")]

    assert world.portfolio().json()["positions"] == []


def test_a_player_with_nothing_has_an_empty_portfolio():
    body = World().portfolio().json()

    assert body["positions"] == []
    assert body["totalValue"] == 0
    assert body["boughtToday"] == 0


def test_the_portfolio_reads_only_the_rows_of_the_signed_in_player():
    world = World()

    world.portfolio()

    for table in ("wallets", "market_positions", "market_trades"):
        (request,) = world.database.reads(table)
        assert request.url.params["player_id"] == f"eq.{PLAYER_ID}"


def test_the_daily_buy_total_counts_only_buys_since_08_00_lisbon_time():
    world = World()

    world.portfolio()

    (request,) = world.database.reads("market_trades")
    assert request.url.params["side"] == "eq.buy"
    assert request.url.params["created_at"] == f"gte.{DAY_START}"


def test_a_player_without_a_wallet_is_a_502():
    world = World()
    world.database.has_wallet = False

    assert_error(world.portfolio(), 502, "database_error")


# --- the wiring ---


def test_the_exchange_url_is_listed_under_api_in_the_documented_routes():
    world = World()

    paths = world.client.get("/api/openapi.json").json()["paths"]

    assert "/api/market" in paths
    assert "/api/market/portfolio" in paths
    assert "/api/market/trade" in paths


def test_the_feed_is_asked_once_per_board_and_never_by_the_browser():
    world = World()

    world.board()
    world.board()

    assert world.feed.asked == 2  # the feed itself caches for 60 seconds (see test_market_feed)


def test_ten_players_looking_at_the_board_all_see_the_same_shared_price():
    world = World()
    world.board()
    world.feed.prices = btc_after("0.12")

    prices = {world.board().json()["companies"][0]["price"] for _ in range(10)}

    assert prices == {67.2}


def test_the_clock_of_the_service_decides_the_time_of_a_pause():
    world = World()
    world.board()
    world.clock.advance(3600)
    world.feed.prices = btc_after("0.30")

    company = world.company()

    assert company["haltedUntil"] == (NOW + timedelta(hours=1, minutes=15)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


# --- a broken data file must not take the rest of the API down ---


def test_a_broken_companies_file_leaves_the_rest_of_the_api_working_and_the_exchange_503(
    monkeypatch, caplog
):
    def broken(path=None):
        raise CompaniesError("companies[0]: 'id' must be text that is not empty.")

    monkeypatch.setattr(exchange, "load_companies", broken)

    with caplog.at_level(logging.ERROR):
        client = TestClient(create_app(MARKET_ON))

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/config").status_code == 200
    assert_error(client.get("/api/market"), 503, "market_unavailable")
    assert_error(client.post("/api/market/trade", json={}), 401, "unauthorized")
    assert "cannot start" in caplog.text


def test_a_broken_replay_file_also_leaves_the_rest_of_the_api_working(monkeypatch):
    def broken(path=None):
        raise FeedError("Cannot read replay.json: FileNotFoundError.")

    monkeypatch.setattr(exchange, "load_replay", broken)

    client = TestClient(create_app(MARKET_ON))

    assert client.get("/api/health").status_code == 200
    assert_error(client.get("/api/market"), 503, "market_unavailable")
