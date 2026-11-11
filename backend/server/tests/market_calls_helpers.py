"""A pretend world for the market call route tests (test_market_calls_routes.py). No tests here.

CallsWorld builds the real app with the real MarketService and PriceFeed (Binance and the stock
source are fakes from market_helpers.py) and FakeCallsDatabase, a small Supabase that keeps
market_calls and one wallet in memory and runs market_call_open and market_call_settle with the
same rules as the SQL file (whose real behaviour is tested in market_calls_sql/). The clock is a
FakeClock that only moves when the test says so. Nothing uses the network.
"""

import json
from dataclasses import replace
from decimal import Decimal
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.demo.gate import DemoGate
from server.flags import parse_flags
from server.market.calendars import load_calendars
from server.market.calls import HOLD
from server.market.companies import load_companies
from server.market.exchange import MarketService
from server.market.feed import PriceFeed
from server.market.replay import load_replay
from server.market.stocks import StockSource
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
from server.tests.market_world import BASE_PRICES, STOCK_PRICES

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
GUEST_ID = "aaaaaaaa-0000-4000-8000-000000000001"
PLAYER = {"Authorization": "Bearer test.player.signature"}
GUEST = {"Authorization": "Bearer test.guest.signature"}
USERS = {
    "Bearer test.player.signature": {"id": PLAYER_ID, "is_anonymous": False},
    "Bearer test.guest.signature": {"id": GUEST_ID, "is_anonymous": True},
}
MARKET_ON = replace(CONFIGURED_SETTINGS, flags=parse_flags("market"))
INSUFFICIENT = {"code": "P0001", "message": "insufficient_funds"}


def iso(moment) -> str:
    return moment.isoformat()


class FakeCallsDatabase:
    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.balances = {PLAYER_ID: 100, GUEST_ID: 100}
        self.rows: list[dict] = []
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1')}"
        handlers = {
            "GET /wallets": self.read_wallet,
            "GET /market_calls": self.read_calls,
            "POST /rpc/market_call_open": self.open,
            "POST /rpc/market_call_settle": self.settle,
        }
        return handlers[route](request)

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        player = request.url.params["player_id"].removeprefix("eq.")
        return httpx.Response(200, json=[{"balance": self.balances[player]}])

    def read_calls(self, request: httpx.Request) -> httpx.Response:
        params = request.url.params
        player = params["player_id"].removeprefix("eq.")
        rows = [row for row in self.rows if row["player_id"] == player]
        if params.get("action_uid"):
            rows = [row for row in rows if row["action_uid"] == params["action_uid"][3:]]
        if params.get("settled_at") == "is.null":
            rows = [row for row in rows if row["settled_at"] is None]
        if params.get("settled_at") == "not.is.null":
            rows = [row for row in rows if row["settled_at"] is not None]
        return httpx.Response(200, json=rows)

    def open(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        player = body["p_player_id"]
        for row in self.rows:
            if row["player_id"] == player and row["action_uid"] == body["p_action_uid"]:
                return self.reply("opened", row, player, repeat=True)
        if sum(1 for r in self.rows if r["player_id"] == player and r["settled_at"] is None) >= 3:
            return httpx.Response(200, json={"status": "refused", "reason": "too_many_calls"})
        if self.balances[player] < body["p_stake"]:
            return httpx.Response(400, json=INSUFFICIENT)
        now = self.clock()
        row = {
            "id": str(uuid4()), "player_id": player, "action_uid": body["p_action_uid"],
            "asset": body["p_asset"], "direction": body["p_direction"], "stake": body["p_stake"],
            "open_price": float(body["p_open_price"]), "opened_at": iso(now),
            "settle_at": iso(now + HOLD), "settled_at": None,
            "settle_price": None, "outcome": None, "payout": None,
        }  # fmt: skip
        self.rows.append(row)
        self.balances[player] -= body["p_stake"]
        return self.reply("opened", row, player)

    def settle(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        row = next(row for row in self.rows if row["id"] == body["p_call_id"])
        player = row["player_id"]
        if row["settled_at"] is not None:
            return self.reply("settled", row, player, repeat=True)
        price = None if body["p_settle_price"] is None else Decimal(body["p_settle_price"])
        opened = Decimal(str(row["open_price"]))
        if price is None or price == opened:
            outcome, payout = "refunded", row["stake"]
        elif (row["direction"] == "up") == (price > opened):
            outcome, payout = "won", row["stake"] * 2
        else:
            outcome, payout = "lost", 0
        row.update(settled_at=iso(self.clock()), outcome=outcome, payout=payout,
                   settle_price=None if price is None else float(price))  # fmt: skip
        self.balances[player] += payout
        return self.reply("settled", row, player)

    def reply(self, status: str, row: dict, player: str, repeat: bool = False) -> httpx.Response:
        body = {"status": status, "call": row, "balance": self.balances[player], "repeat": repeat}
        return httpx.Response(200, json=body)

    def calls(self, name: str) -> list[dict]:
        return [json.loads(r.content) for r in self.requests if r.url.path.endswith(f"/{name}")]


def login(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=USERS[request.headers["authorization"]])


async def admit_everyone(admin, player_id: str) -> bool:
    return True


async def nothing_to_provision(admin, player_id: str) -> None:
    return None


class CallsWorld:
    def __init__(self, settings=MARKET_ON, *, stocks: bool = False, demo: bool = False) -> None:
        self.clock = FakeClock()
        self.clock.now = NY_OPEN
        self.prices = dict(BASE_PRICES)
        self.binance = FakeBinance(good_binance_answer(self.prices))
        source = None
        if stocks:
            server = FakeStockServer(dict(STOCK_PRICES))
            source = StockSource(
                FakeProvider(), KEY, transport=httpx.MockTransport(server), clock=self.clock
            )
        companies = load_companies()
        calendars = load_calendars()
        feed = PriceFeed(
            companies, calendars, load_replay(), stocks=source,
            transport=httpx.MockTransport(self.binance), clock=self.clock, live=not demo,
        )  # fmt: skip
        service = MarketService(companies, calendars, feed, clock=self.clock)
        self.database = FakeCallsDatabase(self.clock)
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=self.clock)
        app = create_app(settings, verifier, admin, market_service=service, clock=self.clock)
        app.state.demo_gate = DemoGate(
            settings, admin, self.clock, provision=nothing_to_provision, lookup=admit_everyone
        )
        self.client = TestClient(app)

    def set_price(self, **prices: str) -> None:
        self.prices.update(prices)
        self.binance.replies = [good_binance_answer(self.prices)]

    def advance(self, seconds: float) -> None:
        self.clock.advance(seconds)

    def look(self, headers=PLAYER) -> httpx.Response:
        return self.client.get("/api/market/calls", headers=headers)

    def call(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"asset": "harbor-trust", "direction": "up", "stake": 10,
                   "actionUid": "click-0001"}  # fmt: skip
        request.update(body)
        return self.client.post("/api/market/calls", json=request, headers=headers)
