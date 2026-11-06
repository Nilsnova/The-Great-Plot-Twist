"""Shared helpers for the prediction desk tests (the test_prediction_*.py files). It holds no tests.

It gives the tests:
  * the saved Manifold answers from backend/content/predictions/ (recordings and samples),
  * FakeManifold, a pretend Manifold (an httpx.MockTransport handler) that the tests can change,
  * FakeDatabase, a pretend Supabase that behaves like the tables, the view and the two
    functions of the prediction desk migration (it is written below the Manifold part),
  * DeskWorld, a whole desk on those fakes with a client that signs in as a player or a host.

No test using these helpers ever touches the network. The name has no test_ at the start on
purpose: pytest only collects test_*.py files, and this one is not a test file.

Used by: test_prediction_manifold.py, test_prediction_source.py, test_prediction_store.py,
test_prediction_routes.py and test_predictions_match_migration.py.
"""

import asyncio
import json
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.flags import default_flags
from server.predictions.desk import PredictionDesk
from server.predictions.questions import QUESTIONS_FILE, Question, load_questions
from server.predictions.source import make_question_sources
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, FAKE_URL, FakeClock

# backend/content/predictions/: the saved answers of Manifold.
PREDICTIONS_CONTENT = QUESTIONS_FILE.parent
RECORDED_FOLDER = PREDICTIONS_CONTENT / "recorded"
SAMPLES_FOLDER = PREDICTIONS_CONTENT / "samples"

# The real resolved samples and what the desk must make of each one.
SAMPLE_YES = "6Ll9sZtyun"
SAMPLE_NO = "5tuCpAqPlp"
SAMPLE_CANCEL = "c0uOtluyER"
SAMPLE_MKT = "99gszRZN58"
SAMPLE_CASH = "6Ll9sZtyun-cash"  # a hand-edited copy of the YES sample whose token is CASH

# What a real answer from Manifold has besides the fields we keep. The parser must ignore all of it,
# and nothing of it may ever reach a player.
EXTRA_FIELDS = {
    "probability": 0.77,
    "pool": {"YES": 120.5, "NO": 40.25},
    "volume": 1234.5,
    "creatorUsername": "someone",
    "creatorName": "Some One",
    "url": "https://manifold.markets/someone/some-market",
}


def load_saved_file(folder: Path, name: str) -> dict[str, Any]:
    """One saved file (recording or sample) as plain JSON data."""
    return json.loads((folder / f"{name}.json").read_text(encoding="utf-8"))


def recorded_answer(market_id: str) -> dict[str, Any]:
    """The answer inside a recording, as Manifold sent it (trimmed)."""
    return load_saved_file(RECORDED_FOLDER, market_id)["answer"]


def sample_answer(name: str) -> dict[str, Any]:
    """The answer inside a sample."""
    return load_saved_file(SAMPLES_FOLDER, name)["answer"]


def recording_names() -> list[str]:
    return sorted(path.stem for path in RECORDED_FOLDER.glob("*.json"))


def sample_names() -> list[str]:
    return sorted(path.stem for path in SAMPLES_FOLDER.glob("*.json"))


def milliseconds(moment) -> int:
    """A datetime as Manifold writes it: milliseconds since 1970."""
    return int(moment.timestamp() * 1000)


class FakeManifold:
    """A pretend Manifold. Give it to httpx as the transport: `httpx.MockTransport(fake)`.

    answers   the JSON answer for each market id (a copy of the recording plus EXTRA_FIELDS)
    status    the HTTP status of every answer (200 normally; 429 and 500 make a fetch fail)
    requests  every request that arrived, so a test can count the calls
    """

    def __init__(self, market_ids: list[str] | None = None) -> None:
        names = market_ids if market_ids is not None else recording_names()
        self.answers: dict[str, dict[str, Any]] = {
            name: {**recorded_answer(name), **deepcopy(EXTRA_FIELDS)} for name in names
        }
        self.status = 200
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        market_id = request.url.path.rsplit("/", 1)[-1]
        if self.status != 200:
            return httpx.Response(self.status, json={"message": "pretend failure"})
        if market_id not in self.answers:
            return httpx.Response(404, json={"message": "no such market"})
        return httpx.Response(200, json=self.answers[market_id])

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)

    @property
    def calls(self) -> int:
        return len(self.requests)

    def change(self, market_id: str, **fields: Any) -> None:
        """Change fields of one answer, for example change("q68phStPls", closeTime=0)."""
        self.answers[market_id].update(fields)

    def resolve(self, market_id: str, resolution: str, at_ms: int | None = None) -> None:
        """Make the market resolved, as Manifold does when its creator resolves it."""
        answer = self.answers[market_id]
        when = at_ms if at_ms is not None else answer["closeTime"]
        answer.update(isResolved=True, resolution=resolution, resolutionTime=when)
        answer["closeTime"] = min(answer["closeTime"], when)


# ---------------------------------------------------------------------------------------------
# The database and a whole desk
# ---------------------------------------------------------------------------------------------

PLAYER_1 = "11111111-2222-4333-8444-555555555551"
PLAYER_2 = "11111111-2222-4333-8444-555555555552"
PLAYER_3 = "11111111-2222-4333-8444-555555555553"
HOST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

# The fake sign-in check knows these tokens.
TOKENS = {
    "test.player-1.signature": PLAYER_1,
    "test.player-2.signature": PLAYER_2,
    "test.player-3.signature": PLAYER_3,
    "test.host.signature": HOST_ID,
}
AUTH_1 = {"Authorization": "Bearer test.player-1.signature"}
AUTH_2 = {"Authorization": "Bearer test.player-2.signature"}
AUTH_3 = {"Authorization": "Bearer test.player-3.signature"}
AUTH_HOST = {"Authorization": "Bearer test.host.signature"}


def database_error(status: int, code: str, message: str) -> httpx.Response:
    """What Supabase answers when one of our SQL functions raises an error."""
    return httpx.Response(
        status, json={"code": code, "message": message, "details": None, "hint": None}
    )


def parse_time(text: str) -> datetime:
    return datetime.fromisoformat(text)


class FakeDatabase:
    """A pretend Supabase with the tables, the view and the two functions of the prediction desk.

    It is an httpx.MockTransport handler. It mirrors the rules of the migration
    20261106100000_prediction_desk.sql (the real SQL is checked on a scratch Postgres), so a route
    test sees what the real database would answer.

    balances   player id -> coins        ledger   every wallet change: player, delta, reason, ref
    pools      question id -> row        stakes   rows of prediction_stakes, in the order placed
    requests   every request that arrived
    unavailable   True: every request answers 503
    rpc_unavailable   True: only the two functions answer 503 (the outcome of a write is unknown)
    fail_with   a ready-made response that every request gets (a 404 for a missing table, say)
    skew   how far the clock of the database is ahead of the clock of the server (can be negative)
    stakes_changed_times   the settle function answers "stakes_changed" this many times first
    """

    def __init__(self, clock) -> None:
        self.clock = clock
        self.balances: dict[str, int] = {}
        self.ledger: list[dict[str, Any]] = []
        self.pools: dict[str, dict[str, Any]] = {}
        self.stakes: list[dict[str, Any]] = []
        self.requests: list[httpx.Request] = []
        self.unavailable = False
        self.rpc_unavailable = False
        self.fail_with: httpx.Response | None = None
        self.skew = timedelta(0)
        self.stakes_changed_times = 0
        self.next_stake_row = 1

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        # A real network call gives other tasks a turn while it waits. This does the same, so a test
        # of two requests at the same moment really interleaves them.
        await asyncio.sleep(0)
        self.requests.append(request)
        if self.fail_with is not None:
            return self.fail_with
        if self.unavailable or (self.rpc_unavailable and request.method == "POST"):
            return httpx.Response(503, json={"message": "pretend outage"})
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1')}"
        handlers = {
            "GET /wallets": self.read_wallet,
            "GET /prediction_pools": self.read_pools,
            "GET /prediction_pool_sides": self.read_sides,
            "GET /prediction_stakes": self.read_stakes,
            "POST /rpc/prediction_place_stake": self.place_stake,
            "POST /rpc/prediction_settle_pool": self.settle_pool,
        }
        return handlers[route](request)

    # --- helpers for the tests ---

    def give(self, player_id: str, coins: int) -> None:
        self.balances[player_id] = coins

    def calls(self, name: str) -> list[dict[str, Any]]:
        """The JSON arguments of every call to the database function `name`."""
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def ledger_rows(self, reason: str, player_id: str | None = None) -> list[dict[str, Any]]:
        return [
            row
            for row in self.ledger
            if row["reason"] == reason and (player_id is None or row["player_id"] == player_id)
        ]

    def stake_of(self, player_id: str, question_id: str) -> dict[str, Any] | None:
        for row in self.stakes:
            if row["player_id"] == player_id and row["question_id"] == question_id:
                return row
        return None

    # --- reads (PostgREST) ---

    @staticmethod
    def matches(row: dict[str, Any], params: httpx.QueryParams) -> bool:
        """Does the row pass the filters in the query string (eq., gte. and in.)?"""
        for column in ("question_id", "player_id", "stake_id", "side", "created_at"):
            if column not in params:
                continue
            operator, _, value = params[column].partition(".")
            if operator == "eq" and str(row[column]) != value:
                return False
            if operator == "in" and str(row[column]) not in value.strip("()").split(","):
                return False
            if operator == "gte" and parse_time(row[column]) < parse_time(value):
                return False
        return True

    @staticmethod
    def shape(rows: list[dict[str, Any]], params: httpx.QueryParams) -> httpx.Response:
        """Order, limit and select columns, as PostgREST does."""
        if params.get("order") == "id.desc":
            rows = sorted(rows, key=lambda row: row["id"], reverse=True)
        elif params.get("order") == "id.asc":
            rows = sorted(rows, key=lambda row: row["id"])
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        columns = params.get("select", "").split(",")
        return httpx.Response(200, json=[{name: row[name] for name in columns} for row in rows])

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        player_id = request.url.params["player_id"].removeprefix("eq.")
        rows = [{"balance": self.balances[player_id]}] if player_id in self.balances else []
        return httpx.Response(200, json=rows)

    def read_pools(self, request: httpx.Request) -> httpx.Response:
        rows = [row for row in self.pools.values() if self.matches(row, request.url.params)]
        return self.shape([{**row, "id": 0} for row in rows], request.url.params)

    def read_stakes(self, request: httpx.Request) -> httpx.Response:
        rows = [row for row in self.stakes if self.matches(row, request.url.params)]
        return self.shape(rows, request.url.params)

    def read_sides(self, request: httpx.Request) -> httpx.Response:
        totals: dict[tuple[str, str], dict[str, Any]] = {}
        for stake in self.stakes:
            key = (stake["question_id"], stake["side"])
            row = totals.setdefault(
                key, {"question_id": key[0], "side": key[1], "players": 0, "coins": 0, "id": 0}
            )
            row["players"] += 1
            row["coins"] += stake["amount"]
        rows = [row for row in totals.values() if self.matches(row, request.url.params)]
        return self.shape(rows, request.url.params)

    # --- prediction_place_stake ---

    def sides_of(self, question_id: str) -> list[dict[str, Any]]:
        sides = []
        for side in ("no", "yes"):
            rows = [s for s in self.stakes if s["question_id"] == question_id and s["side"] == side]
            if rows:
                sides.append(
                    {"side": side, "coins": sum(r["amount"] for r in rows), "players": len(rows)}
                )
        return sides

    def place_stake(self, request: httpx.Request) -> httpx.Response:
        a = json.loads(request.content)
        now = self.clock.now + self.skew
        valid = (
            a["p_side"] in ("yes", "no")
            and 1 <= a["p_amount"] <= a["p_max_stake"]
            and a["p_daily_cap"] >= 0
            and parse_time(a["p_day_start"]) <= now + timedelta(minutes=1)
        )
        if not valid:
            return database_error(400, "P0001", "bad_stake")
        pool = self.pools.setdefault(
            a["p_question_id"],
            {
                "question_id": a["p_question_id"],
                "closes_at": a["p_closes_at"],
                "status": "open",
                "outcome": None,
                "settlement": None,
                "settled_by": None,
                "settled_at": None,
                "cut_coins": None,
                "paid_coins": None,
            },
        )
        player_id = a["p_player_id"]
        if player_id not in self.balances:
            return database_error(400, "P0001", "wallet_not_found")
        if self.find_repeat(player_id, a["p_stake_id"]):
            return database_error(409, "23505", "already_applied")
        closes = min(parse_time(pool["closes_at"]), parse_time(a["p_closes_at"]))
        if pool["status"] != "open" or now >= closes:
            return httpx.Response(200, json={"status": "refused", "reason": "pool_closed"})
        earlier = self.stake_of(player_id, a["p_question_id"])
        if earlier is not None:
            refusal = {"status": "refused", "reason": "already_staked"}
            return httpx.Response(
                200, json={**refusal, "side": earlier["side"], "amount": earlier["amount"]}
            )
        staked_today = self.staked_since(player_id, parse_time(a["p_day_start"]))
        if staked_today + a["p_amount"] > a["p_daily_cap"]:
            left = max(a["p_daily_cap"] - staked_today, 0)
            return httpx.Response(
                200, json={"status": "refused", "reason": "daily_cap", "coinsLeft": left}
            )
        if self.balances[player_id] < a["p_amount"]:
            return database_error(400, "P0001", "insufficient_funds")
        return httpx.Response(200, json=self.write_stake(a, now, staked_today))

    def find_repeat(self, player_id: str, stake_id: str) -> bool:
        return any(s["player_id"] == player_id and s["stake_id"] == stake_id for s in self.stakes)

    def staked_since(self, player_id: str, since: datetime) -> int:
        return sum(
            s["amount"]
            for s in self.stakes
            if s["player_id"] == player_id and parse_time(s["created_at"]) >= since
        )

    def write_stake(self, a: dict[str, Any], now: datetime, staked_today: int) -> dict[str, Any]:
        player_id = a["p_player_id"]
        self.balances[player_id] -= a["p_amount"]
        ref = f"stake:{a['p_stake_id']}"
        self.ledger.append(
            {
                "player_id": player_id,
                "delta": -a["p_amount"],
                "reason": "prediction_stake",
                "ref": ref,
            }
        )
        self.stakes.append(
            {
                "id": self.next_stake_row,
                "question_id": a["p_question_id"],
                "player_id": player_id,
                "side": a["p_side"],
                "amount": a["p_amount"],
                "stake_id": a["p_stake_id"],
                "ref": ref,
                "payout": None,
                "created_at": now.isoformat(),
            }
        )
        self.next_stake_row += 1
        return {
            "status": "done",
            "balance": self.balances[player_id],
            "stakedToday": staked_today + a["p_amount"],
            "sides": self.sides_of(a["p_question_id"]),
        }

    # --- prediction_settle_pool ---

    def settle_pool(self, request: httpx.Request) -> httpx.Response:
        a = json.loads(request.content)
        now = self.clock.now + self.skew
        question_id = a["p_question_id"]
        if a["p_outcome"] not in ("yes", "no", "void") or a["p_settled_by"] not in ("host", "auto"):
            return database_error(400, "P0001", "bad_settlement")
        pool = self.pools.setdefault(
            question_id,
            {
                "question_id": question_id,
                "closes_at": a["p_closes_at"],
                "status": "open",
                "outcome": None,
                "settlement": None,
                "settled_by": None,
                "settled_at": None,
                "cut_coins": None,
                "paid_coins": None,
            },
        )
        if pool["status"] == "settled":
            return database_error(409, "23505", "already_applied")
        closes = min(parse_time(pool["closes_at"]), parse_time(a["p_closes_at"]))
        if a["p_outcome"] != "void" and now < closes:
            return httpx.Response(
                200,
                json={"status": "refused", "reason": "pool_open", "closesAt": closes.isoformat()},
            )
        if self.stakes_changed_times > 0:
            self.stakes_changed_times -= 1
            return httpx.Response(200, json={"status": "refused", "reason": "stakes_changed"})
        return self.pay_out(a, pool, now)

    def pay_out(self, a: dict[str, Any], pool: dict[str, Any], now: datetime) -> httpx.Response:
        question_id = a["p_question_id"]
        outcome = a["p_outcome"]
        rows = [s for s in self.stakes if s["question_id"] == question_id]
        total = sum(s["amount"] for s in rows)
        winning = sum(s["amount"] for s in rows if s["side"] == outcome)
        losing = total - winning
        cut = 0
        if outcome == "void":
            settlement = "refund_void"
        elif winning == 0:
            settlement = "refund_no_winners"
        elif losing == 0:
            settlement = "refund_one_sided"
        else:
            settlement = "winners"
            cut = losing * a["p_cut_percent"] // 100
        paid_rows = [s for s in rows if settlement != "winners" or s["side"] == outcome]
        given = {entry["stakeRowId"]: entry["coins"] for entry in a["p_payouts"]}
        if len(a["p_payouts"]) != len(given) or set(given) != {s["id"] for s in paid_rows}:
            return httpx.Response(200, json={"status": "refused", "reason": "stakes_changed"})
        shared = total - cut
        if sum(given.values()) != shared:
            return database_error(400, "P0001", "bad_settlement")
        for stake in paid_rows:
            coins = given[stake["id"]]
            exact_gap = abs(coins * winning - stake["amount"] * shared)
            if coins < 1 or (settlement != "winners" and coins != stake["amount"]):
                return database_error(400, "P0001", "bad_settlement")
            if settlement == "winners" and exact_gap >= winning:
                return database_error(400, "P0001", "bad_settlement")
        for stake in sorted(paid_rows, key=lambda s: (s["player_id"], s["id"])):
            self.balances[stake["player_id"]] += given[stake["id"]]
            self.ledger.append(
                {
                    "player_id": stake["player_id"],
                    "delta": given[stake["id"]],
                    "reason": "prediction_payout",
                    "ref": f"pool:{question_id}",
                }
            )
        for stake in rows:
            stake["payout"] = given.get(stake["id"], 0)
        pool.update(
            status="settled",
            outcome=outcome,
            settlement=settlement,
            settled_by=a["p_settled_by"],
            settled_at=now.isoformat(),
            cut_coins=cut,
            paid_coins=shared,
        )
        return httpx.Response(
            200,
            json={
                "status": "done",
                "settlement": settlement,
                "paidPlayers": len(paid_rows),
                "paidCoins": shared,
                "cutCoins": cut,
                "settledAt": now.isoformat(),
            },
        )


def login(request: httpx.Request) -> httpx.Response:
    """A fake Supabase login check that knows the tokens in TOKENS."""
    token = request.headers["authorization"].removeprefix("Bearer ")
    if token in TOKENS:
        return httpx.Response(200, json={"id": TOKENS[token]})
    return httpx.Response(401, json={"msg": "invalid JWT"})


def reviewed_questions() -> tuple[Question, ...]:
    """The five real questions, all marked as read, so the routes serve them."""
    return tuple(
        replace(question, reviewed_by="Nils", reviewed_on="2026-11-05")
        for question in load_questions()
    )


class DeskWorld:
    """One test world: a desk on a fake Manifold, a fake database and a fake clock, with a client.

    The clock starts at Thursday 5 Nov 2026, 12:00 UTC. The five questions of the real file close
    from 1 Dec 2026 on, so they are all open at the start. The flag "predictions" is on, the host
    is HOST_ID, and every player starts with 1000 coins.
    """

    def __init__(
        self,
        flag_on: bool = True,
        demo_mode: bool = False,
        hosts: frozenset[str] = frozenset({HOST_ID}),
        questions: tuple[Question, ...] | None = None,
    ) -> None:
        self.clock = FakeClock()
        self.manifold = FakeManifold()
        self.database = FakeDatabase(self.clock)
        for player_id in (PLAYER_1, PLAYER_2, PLAYER_3, HOST_ID):
            self.database.give(player_id, 1000)
        self.settings = replace(
            CONFIGURED_SETTINGS,
            flags={**default_flags(), "predictions": flag_on},
            demo_mode=demo_mode,
            host_player_ids=hosts,
        )
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        verifier = PlayerVerifier(
            self.settings, transport=httpx.MockTransport(login), clock=self.clock
        )
        listed = questions if questions is not None else reviewed_questions()
        sources = make_question_sources(
            listed, self.settings, transport=self.manifold.transport, clock=self.clock
        )
        self.desk = PredictionDesk(listed, sources, clock=self.clock, demo_mode=demo_mode)
        self.admin = admin
        self.app = create_app(self.settings, verifier, admin, prediction_desk=self.desk)
        self.client = TestClient(self.app)

    # --- changing the world ---

    def change_question(self, question_id: str, **changes: Any) -> None:
        """Change fields of one question of the list, for example closes_at."""
        self.desk.questions = tuple(
            replace(question, **changes) if question.id == question_id else question
            for question in self.desk.questions
        )

    def close_question(self, question_id: str, minutes_ago: float = 5) -> None:
        """Make the closing time of a question pass, as if time had moved on."""
        self.change_question(question_id, closes_at=self.clock.now - timedelta(minutes=minutes_ago))

    def forget_manifold(self) -> None:
        """Make every source forget what it fetched, as a server instance that just started does."""
        for source in self.desk.sources.values():
            source.good_data = None
            source.good_fetched_at = None
            source.last_failure_at = None

    # --- the four routes ---

    def listing(self, query: str = "") -> httpx.Response:
        return self.client.get("/api/predictions" + query)

    def mine(self, headers: dict[str, str] = AUTH_1) -> httpx.Response:
        return self.client.get("/api/predictions/mine", headers=headers)

    def stake(self, headers: dict[str, str] = AUTH_1, **body: Any) -> httpx.Response:
        request = {
            "questionId": "groundhog-2027",
            "side": "yes",
            "amount": 20,
            "stakeId": "stake-0001-aaaa",
        }
        request.update(body)
        return self.client.post("/api/predictions/stake", json=request, headers=headers)

    def settle(self, headers: dict[str, str] = AUTH_HOST, **body: Any) -> httpx.Response:
        request = {"questionId": "groundhog-2027", "outcome": "yes"}
        request.update(body)
        return self.client.post("/api/predictions/settle", json=request, headers=headers)

    def question(self, question_id: str = "groundhog-2027") -> dict[str, Any]:
        """One question of the public list, as the browser sees it."""
        questions = self.listing().json()["questions"]
        return next(question for question in questions if question["id"] == question_id)
