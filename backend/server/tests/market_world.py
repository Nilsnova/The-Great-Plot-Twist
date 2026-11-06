"""A whole pretend world for the Island Exchange route tests. It holds no tests itself.

World builds the real app (create_app) with the real MarketService, the real PriceFeed and the real
data files, and puts fakes where the outside world would be:
  * Binance        a fake transport that answers with the prices the test sets (world.set_price)
  * the stock API  a fake provider and server (world.stock_server)
  * the database   FakeDatabase, an httpx.MockTransport that behaves like the parts of Supabase the
                   Exchange uses (it filters rows like PostgREST does) and answers the three
                   database functions with replies the test prepares
  * the sign-in    a fake transport that says the token belongs to PLAYER_ID
  * the clock      a FakeClock that only moves when the test says so

Fixed numbers used again and again:
  * the clock starts at Monday 9 Nov 2026, 16:00 UTC: New York is open (14:30 to 21:00 UTC),
  * BASE_PRICES are the real prices of the seven instruments at the start of a test,
  * STOCK_PRICES are the share prices the fake stock server answers.

Used by: test_market_routes.py, test_market_routes_open.py and test_market_routes_close.py.
"""

import json
from dataclasses import replace
from datetime import datetime
from decimal import Decimal

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.flags import default_flags
from server.market.calendars import load_calendars
from server.market.companies import load_companies
from server.market.exchange import MarketService
from server.market.feed import PriceFeed
from server.market.replay import load_replay
from server.market.stocks import StockSource
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, FAKE_URL, FakeClock
from server.tests.market_helpers import (
    KEY,
    NY_OPEN,
    FakeBinance,
    FakeProvider,
    FakeStockServer,
    good_binance_answer,
)

D = Decimal

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
OTHER_PLAYER_ID = "99999999-2222-4333-8444-555555555555"
TOKEN = "test.player.signature"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

MARKET_ON = replace(CONFIGURED_SETTINGS, flags={**default_flags(), "market": True})

POSITION_ID = "7b3e5f20-1111-4222-8333-444455556666"
NEW_POSITION_ID = "2f0c5f20-1111-4222-8333-444455556666"
CLOSED_POSITION_ID = "9a715f20-1111-4222-8333-444455556666"

# The real prices of the seven instruments at the start of a test.
BASE_PRICES = {
    "BTCUSDT": "76159.21",
    "ETHUSDT": "2255.69",
    "SOLUSDT": "160.4",
    "XRPUSDT": "2.4012",
    "BNBUSDT": "612.5",
    "EURUSDT": "1.1246",
    "PAXGUSDT": "4180.55",
}

# The share prices the fake stock server answers, each quoted at 15:59:58 UTC.
STOCK_PRICES = {
    "AAPL": "271.20",
    "NVDA": "190.10",
    "TSLA": "412.30",
    "KO": "70.55",
    "SPOT": "598.40",
}

ISLAND_IDS = [
    "harbor-trust",
    "tidewright-works",
    "swiftwater-ferries",
    "pier-post-courier",
    "market-hall-guild",
    "two-shores-bureau",
    "greyfathom-salvage",
]
STOCK_IDS = ["apple", "nvidia", "tesla", "coca-cola", "spotify"]


def position_row(**changes) -> dict:
    """A row of exchange_positions as Supabase sends it: an open rising position of PLAYER_ID.

    100 coins in Saltreach Harbor Trust, entry 75000.00, opened at 11:40 UTC today.
    """
    row = {
        "id": POSITION_ID,
        "player_id": PLAYER_ID,
        "company_id": "harbor-trust",
        "side": "rising",
        "price_mode": "live",
        "stake": 100,
        "entry_price": 75000.0,
        "zero_price": 67500.0,
        "open_fee": 2,
        "opened_at": "2026-11-09T11:40:12+00:00",
        "status": "open",
        "closed_at": None,
        "close_price": None,
        "close_value": None,
        "close_fee": None,
    }
    row.update(changes)
    return row


class FakeDatabase:
    """A pretend Supabase with the parts the Exchange uses.

    balance       the player's coins; has_wallet False makes the wallet read find no row
    positions     rows of exchange_positions (position_row builds one); GET filters them
    known_refs    (player_id, ref) pairs that are in exchange_events already (the repeat check)
    open_reply    what exchange_open_position answers: a dict (JSON), a ready-made httpx.Response,
    close_reply   what exchange_close_position answers, and
    sweep_reply   what exchange_close_used_up answers; an Exception is raised like a network error
    on_sweep      a function the sweep calls first, to change self.positions like a real sweep
    check_price_mode  True (the default): a close whose p_price_mode differs from the mode of the
                  stored position is refused with wrong_price_mode, as the real function does
                  (rule R20, the database half). The prepared close_reply is used otherwise.
    requests      every request the Exchange sent, in order
    """

    def __init__(self) -> None:
        self.balance = 1000
        self.has_wallet = True
        self.positions: list[dict] = []
        self.known_refs: set[tuple[str, str]] = set()
        self.open_reply: dict | httpx.Response | Exception = {
            "status": "done",
            "positionId": NEW_POSITION_ID,
            "zeroPrice": 68543.289,
            "balance": 838,
            "openedAt": "2026-11-09T16:00:04+00:00",
        }
        self.close_reply: dict | httpx.Response | Exception = {
            "status": "done",
            "closedAs": "closed",
            "value": 115,
            "fee": 2,
            "coinsChange": 113,
            "balance": 1113,
            "closedAt": "2026-11-09T16:00:10+00:00",
        }
        self.sweep_reply: dict | httpx.Response | Exception = {"closed": 0, "positionIds": []}
        self.on_sweep = None  # a function the sweep calls: it may change self.positions
        self.check_price_mode = True
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        name = request.url.path.removeprefix("/rest/v1/")
        handlers = {
            "wallets": self.read_wallet,
            "exchange_positions": self.read_positions,
            "exchange_events": self.read_events,
            "rpc/exchange_open_position": lambda r: self.answer(self.open_reply),
            "rpc/exchange_close_position": self.close,
            "rpc/exchange_close_used_up": self.sweep,
        }
        return handlers[name](request)

    def close(self, request: httpx.Request) -> httpx.Response:
        """Like exchange_close_position(): a price of the wrong kind is refused (step 6)."""
        call = json.loads(request.content)
        row = next((p for p in self.positions if p["id"] == call["p_position_id"]), None)
        if self.check_price_mode and row is not None and row["price_mode"] != call["p_price_mode"]:
            return httpx.Response(200, json={"status": "refused", "reason": "wrong_price_mode"})
        return self.answer(self.close_reply)

    def sweep(self, request: httpx.Request) -> httpx.Response:
        if self.on_sweep is not None:
            self.on_sweep()
        return self.answer(self.sweep_reply)

    @staticmethod
    def answer(reply) -> httpx.Response:
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx.Response):
            return reply
        return httpx.Response(200, json=reply)

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        rows = [{"balance": self.balance}] if self.has_wallet else []
        return httpx.Response(200, json=rows)

    def read_events(self, request: httpx.Request) -> httpx.Response:
        player = request.url.params["player_id"].removeprefix("eq.")
        ref = request.url.params["ref"].removeprefix("eq.")
        return httpx.Response(200, json=[{"id": 1}] if (player, ref) in self.known_refs else [])

    def read_positions(self, request: httpx.Request) -> httpx.Response:
        """Filter and sort the rows the way PostgREST does for the queries the Exchange sends."""
        params = request.url.params
        rows = list(self.positions)
        for column, text in params.items():
            if column in ("select", "order", "limit"):
                continue
            rows = [row for row in rows if self.matches(row, column, text)]
        if "order" in params:
            column, direction = params["order"].split(".")
            rows.sort(key=lambda row: row[column] or "", reverse=direction == "desc")
        return httpx.Response(200, json=rows[: int(params["limit"])])

    @staticmethod
    def matches(row: dict, column: str, text: str) -> bool:
        operator, _, value = text.partition(".")
        if operator == "eq":
            return str(row[column]) == value
        if operator == "in":
            return str(row[column]) in value.strip("()").split(",")
        if operator == "gte":
            return datetime.fromisoformat(row[column]) >= datetime.fromisoformat(value)
        raise AssertionError(f"The fake database does not know the filter {text!r}.")

    def calls(self, name: str) -> list[dict]:
        """The JSON arguments of every call to the database function `name`."""
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def reads(self, table: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == "GET" and r.url.path.endswith(f"/{table}")]

    def names(self) -> list[str]:
        """What the Exchange asked for, in order: a function name or the table of a read."""
        return [
            request.url.path.removeprefix("/rest/v1/").removeprefix("rpc/")
            for request in self.requests
        ]


class World:
    """One test world: the app, a client, and the fakes behind it.

    stocks    True: the stock source is on (a fake provider and server)
    demo      True: demo mode, the recording plays and nobody is called
    relit     True: the Relighting has happened (fees 1 %, Greyfathom delisted)
    database  False: the server has no database settings (a laptop without Supabase)
    """

    def __init__(
        self,
        settings: Settings = MARKET_ON,
        *,
        stocks: bool = False,
        demo: bool = False,
        relit: bool = False,
        start: datetime = NY_OPEN,
        database: bool = True,
    ) -> None:
        self.clock = FakeClock()
        self.clock.now = start
        self.relit = relit
        self.prices = dict(BASE_PRICES)
        self.binance = FakeBinance(good_binance_answer(self.prices))
        self.stock_server = FakeStockServer(dict(STOCK_PRICES))
        self.database = FakeDatabase()
        self.calendars = load_calendars()
        source = None
        if stocks:
            source = StockSource(
                FakeProvider(),
                KEY,
                transport=httpx.MockTransport(self.stock_server),
                clock=self.clock,
            )
        companies = load_companies()
        self.feed = PriceFeed(
            companies,
            self.calendars,
            load_replay(),
            stocks=source,
            transport=httpx.MockTransport(self.binance),
            clock=self.clock,
            live=not demo,
        )
        self.service = MarketService(
            companies, self.calendars, self.feed, clock=self.clock, relit_check=self.check_relit
        )
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        if not database:
            admin = SupabaseAdmin("", "")
        verifier = PlayerVerifier(
            settings,
            transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"id": PLAYER_ID})),
            clock=self.clock,
        )
        self.client = TestClient(create_app(settings, verifier, admin, market_service=self.service))

    async def check_relit(self, admin) -> bool:
        return self.relit

    def set_price(self, **prices: str) -> None:
        """Change the real Binance prices, for example set_price(BTCUSDT="77000.00")."""
        self.prices.update(prices)
        self.binance.replies = [good_binance_answer(self.prices)]

    def binance_down(self) -> None:
        self.binance.replies = [httpx.Response(500, text="oops")]

    def advance(self, seconds: float) -> None:
        self.clock.advance(seconds)

    def board(self) -> httpx.Response:
        return self.client.get("/api/market")

    def portfolio(self) -> httpx.Response:
        return self.client.get("/api/market/portfolio", headers=AUTH)

    def open(self, **body) -> httpx.Response:
        request = {
            "companyId": "harbor-trust",
            "side": "rising",
            "stake": 100,
            "actionUid": "click-0001",
        }
        request.update(body)
        return self.client.post("/api/market/open", json=request, headers=AUTH)

    def close(self, **body) -> httpx.Response:
        request = {"positionId": POSITION_ID, "actionUid": "click-0001"}
        request.update(body)
        return self.client.post("/api/market/close", json=request, headers=AUTH)

    def company(self, company_id: str = "harbor-trust") -> dict:
        companies = self.board().json()["companies"]
        return next(company for company in companies if company["id"] == company_id)
