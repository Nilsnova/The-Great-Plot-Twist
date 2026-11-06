"""Shared helpers for the Lantern Duels route tests. It holds no tests itself.

It builds a fake database that behaves like the parts of Supabase the duels use: the four tables
(duels, duel_moves, profiles, wallets), the filters of the reads, and the three database
functions duel_create, duel_answer and duel_void. The functions follow the SQL of
supabase/migrations/20261106110000_lantern_duels.sql step by step, including its refusals, its
errors and its all-or-nothing rollback, so a route test can play a whole duel without a network.

It also builds a "world": the app, a client and three captains (Alice, Bob and Carol) who sign in
with the tokens "test.alice.signature", "test.bob.signature" and "test.carol.signature".
The clock only moves when a test says so.

The name has no test_ at the start on purpose: pytest only collects test_*.py files.

Used by: test_duels_routes.py and test_duels_secrecy.py.
"""

import copy
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.duels.service import DuelService
from server.flags import default_flags
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, FAKE_URL, FakeClock

ARENA_ON = replace(CONFIGURED_SETTINGS, flags={**default_flags(), "arena": True})

START = datetime(2026, 11, 6, 10, 0, tzinfo=UTC)

# The three captains of the tests: who -> (player id, display name).
PLAYERS = {
    "alice": ("11111111-1111-4111-8111-111111111111", "Brave Puffin 17"),
    "bob": ("22222222-2222-4222-8222-222222222222", "Captain-3fa85f"),
    "carol": ("33333333-3333-4333-8333-333333333333", "Captain-7c41d2"),
}
ALICE = PLAYERS["alice"][0]
BOB = PLAYERS["bob"][0]
CAROL = PLAYERS["carol"][0]
TOKENS = {f"test.{who}.signature": player_id for who, (player_id, _) in PLAYERS.items()}

# The worked example of the spec: Alice challenges Bob, 5 rounds, 100 coins each. Bob wins 3 to 1.
ALICE_SIGNALS = ["flash", "shade", "shade", "mirror", "shade"]
BOB_SIGNALS = ["mirror", "flash", "shade", "shade", "mirror"]

NEW_CHALLENGE = {
    "opponentName": "Captain-3fa85f",
    "rounds": 5,
    "stake": 100,
    "signals": ALICE_SIGNALS,
    "actionUid": "challenge-0001",
}
NEW_ANSWER = {"signals": BOB_SIGNALS, "actionUid": "answer-0001"}


class RpcFailure(Exception):
    """A database function that raises an error. Everything it did so far is rolled back."""

    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def refused(reason: str) -> dict[str, str]:
    return {"status": "refused", "reason": reason}


def as_text(value: Any) -> str:
    """A column value the way a PostgREST filter writes it."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def row_matches(row: dict[str, Any], column: str, condition: str) -> bool:
    """One PostgREST filter such as eq.abc, neq.abc, gt.2026-11-06T10:00:00+00:00 or in.(a,b)."""
    operator, _, value = condition.partition(".")
    cell = row[column]
    if operator == "eq":
        return as_text(cell) == value
    if operator == "neq":
        return as_text(cell) != value
    if operator == "gt":
        return datetime.fromisoformat(cell) > datetime.fromisoformat(value)
    if operator == "in":
        return as_text(cell) in value.strip("()").split(",")
    raise AssertionError(f"The fake database does not know the filter '{operator}'.")


def row_matches_any(row: dict[str, Any], clause: str) -> bool:
    """A PostgREST or=(a.eq.1,b.eq.1) filter."""
    for part in clause.strip("()").split(","):
        column, _, condition = part.partition(".")
        if row_matches(row, column, condition):
            return True
    return False


class FakeDuelDatabase:
    """A pretend Supabase for Lantern Duels. See the top of this file."""

    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.profiles: dict[str, str] = {}  # player id -> display name
        self.wallets: dict[str, int] = {}  # player id -> coins
        self.duels: list[dict[str, Any]] = []
        self.moves: list[dict[str, Any]] = []
        self.ledger: list[dict[str, Any]] = []  # player_id, delta, reason, ref
        self.requests: list[httpx.Request] = []
        self.timeouts: set[str] = set()  # function names that time out instead of answering
        self.failures: dict[str, RpcFailure] = {}  # function name -> the error it raises
        self.refusals: dict[str, str] = {}  # function name -> a reason it refuses with
        self.odd_replies: set[str] = set()  # function names that answer with nonsense
        self.next_number = 1

    # --- set-up and look-up helpers for the tests ---

    def add_player(self, player_id: str, name: str, coins: int = 1000) -> None:
        self.profiles[player_id] = name
        self.wallets[player_id] = coins

    def duel(self, number: int = 0) -> dict[str, Any]:
        return self.duels[number]

    def calls(self, name: str) -> list[dict[str, Any]]:
        """The JSON arguments of every call to the database function `name`."""
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def reads(self, table: str) -> list[httpx.Request]:
        return [
            request
            for request in self.requests
            if request.method == "GET" and request.url.path.endswith(f"/{table}")
        ]

    def ledger_sum(self, duel_id: str) -> int:
        """The coins that moved for one duel, all arena rows added up."""
        return sum(row["delta"] for row in self.ledger if row["ref"] == f"duel:{duel_id}")

    def insert_duel(self, **changes: Any) -> dict[str, Any]:
        """Put a ready-made duel row into the table (no coins move). Returns the row.

        The default is an open challenge from Alice to Bob that ends in 24 hours. Pass columns to
        change it, for example status="finished". The challenger's envelope is sealed too.
        """
        row = {
            "id": self.new_id(),
            "challenger_id": ALICE,
            "opponent_id": BOB,
            "is_open": False,
            "rounds": 5,
            "stake": 100,
            "cut_percent": 5,
            "status": "open",
            "outcome": None,
            "round_results": None,
            "create_uid": f"inserted-{self.next_number:04d}",
            "created_at": self.now().isoformat(),
            "expires_at": (self.now() + timedelta(hours=24)).isoformat(),
            "answered_at": None,
            "closed_at": None,
        }
        row.update(changes)
        self.duels.append(row)
        self.seal(row["id"], row["challenger_id"], ALICE_SIGNALS, row["create_uid"])
        return row

    def make_expire(self, duel_number: int = 0) -> None:
        """Move the creation and the deadline of a duel back, so that the deadline has passed."""
        row = self.duels[duel_number]
        row["created_at"] = (self.clock.now - timedelta(hours=25)).isoformat()
        row["expires_at"] = (self.clock.now - timedelta(hours=1)).isoformat()

    # --- the HTTP entrance ---

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = request.url.path.removeprefix("/rest/v1/")
        if request.method == "GET":
            return httpx.Response(200, json=self.read(route, request.url.params))
        name = route.removeprefix("rpc/")
        if name in self.timeouts:
            raise httpx.ReadTimeout("pretend timeout", request=request)
        if name in self.failures:
            return self.failure_response(self.failures[name])
        if name in self.refusals:
            return httpx.Response(200, json=refused(self.refusals[name]))
        if name in self.odd_replies:
            return httpx.Response(200, json={"surprise": True})
        return self.run_function(name, json.loads(request.content))

    @staticmethod
    def failure_response(failure: "RpcFailure") -> httpx.Response:
        body = {"code": failure.code, "message": failure.message, "details": None}
        return httpx.Response(failure.status, json=body)

    # --- reading a table ---

    def rows_of(self, table: str) -> list[dict[str, Any]]:
        if table == "duels":
            return self.duels
        if table == "duel_moves":
            return self.moves
        if table == "profiles":
            return [{"id": key, "display_name": name} for key, name in self.profiles.items()]
        if table == "wallets":
            return [{"player_id": key, "balance": coins} for key, coins in self.wallets.items()]
        raise AssertionError(f"The fake database has no table '{table}'.")

    def read(self, table: str, params: httpx.QueryParams) -> list[dict[str, Any]]:
        rows = self.rows_of(table)
        for column, condition in params.multi_items():
            if column in ("select", "order", "limit"):
                continue
            if column == "or":
                rows = [row for row in rows if row_matches_any(row, condition)]
            else:
                rows = [row for row in rows if row_matches(row, column, condition)]
        if "order" in params:
            column, _, direction = params["order"].partition(".")
            rows = sorted(rows, key=lambda row: row[column], reverse=direction == "desc")
        rows = rows[: int(params["limit"])]
        columns = params["select"].split(",")
        return [{column: row[column] for column in columns} for row in rows]

    # --- the three database functions ---

    def run_function(self, name: str, arguments: dict[str, Any]) -> httpx.Response:
        """Run a function all-or-nothing, like a database transaction."""
        snapshot = copy.deepcopy((self.duels, self.moves, self.wallets, self.ledger))
        try:
            reply = getattr(self, f"rpc_{name}")(arguments)
        except RpcFailure as failure:
            self.duels, self.moves, self.wallets, self.ledger = snapshot
            return self.failure_response(failure)
        return httpx.Response(200, json=reply)

    def now(self) -> datetime:
        return self.clock.now

    def is_in_the_future(self, moment: str) -> bool:
        return datetime.fromisoformat(moment) > self.now()

    def new_id(self) -> str:
        number = self.next_number
        self.next_number += 1
        return f"00000000-0000-4000-8000-{number:012d}"

    def find_duel(self, duel_id: str) -> dict[str, Any] | None:
        for row in self.duels:
            if row["id"] == duel_id:
                return row
        return None

    def has_envelope(self, duel_id: str, player_id: str) -> bool:
        return any(m["duel_id"] == duel_id and m["player_id"] == player_id for m in self.moves)

    def move_coins(self, player_id: str, delta: int, reason: str, ref: str) -> int:
        """apply_wallet_transaction(): the only way coins move. Returns the new balance."""
        direction = {"arena_stake": -1, "arena_payout": 1}[reason]
        if delta * direction <= 0:
            raise RpcFailure("P0001", "wrong_direction")
        if player_id not in self.wallets:
            raise RpcFailure("P0001", "wallet_not_found")
        same = [
            r
            for r in self.ledger
            if (r["player_id"], r["reason"], r["ref"]) == (player_id, reason, ref)
        ]
        if same:
            raise RpcFailure("23505", "duplicate key value violates unique constraint", 409)
        if self.wallets[player_id] + delta < 0:
            raise RpcFailure("P0001", "insufficient_funds")
        self.wallets[player_id] += delta
        self.ledger.append({"player_id": player_id, "delta": delta, "reason": reason, "ref": ref})
        return self.wallets[player_id]

    def rpc_duel_create(self, a: dict[str, Any]) -> dict[str, Any]:
        if (
            a["p_rounds"] not in (3, 5)
            or not 0 <= a["p_stake"] <= 100
            or not 0 <= a["p_cut_percent"] <= 20
            or len(a["p_signals"]) != a["p_rounds"]
            or not 1 <= a["p_answer_hours"] <= 72
            or a["p_max_waiting"] < 1
        ):
            raise RpcFailure("P0001", "bad_duel")
        challenger = a["p_challenger_id"]
        if challenger not in self.wallets:
            raise RpcFailure("P0001", "wallet_not_found")
        for row in self.duels:
            if row["challenger_id"] == challenger and row["create_uid"] == a["p_create_uid"]:
                raise RpcFailure("23505", "already_applied", 409)

        opponent_id, opponent_name = None, None
        if a["p_opponent_name"] is not None:
            wanted = a["p_opponent_name"].strip().lower()
            found = [(key, name) for key, name in self.profiles.items() if name.lower() == wanted]
            if not found:
                return refused("no_such_captain")
            if len(found) > 1:
                return refused("name_not_unique")
            opponent_id, opponent_name = found[0]
            if opponent_id == challenger:
                return refused("cannot_duel_yourself")
        waiting = [
            row
            for row in self.duels
            if row["challenger_id"] == challenger
            and row["status"] == "open"
            and self.is_in_the_future(row["expires_at"])
        ]
        if len(waiting) >= a["p_max_waiting"]:
            return refused("too_many_waiting")

        duel_id = self.new_id()
        self.duels.append(
            {
                "id": duel_id,
                "challenger_id": challenger,
                "opponent_id": opponent_id,
                "is_open": a["p_opponent_name"] is None,
                "rounds": a["p_rounds"],
                "stake": a["p_stake"],
                "cut_percent": a["p_cut_percent"],
                "status": "open",
                "outcome": None,
                "round_results": None,
                "create_uid": a["p_create_uid"],
                "created_at": self.now().isoformat(),
                "expires_at": (self.now() + timedelta(hours=a["p_answer_hours"])).isoformat(),
                "answered_at": None,
                "closed_at": None,
            }
        )
        self.seal(duel_id, challenger, a["p_signals"], a["p_create_uid"])
        balance = self.wallets[challenger]
        if a["p_stake"] > 0:
            balance = self.move_coins(challenger, -a["p_stake"], "arena_stake", f"duel:{duel_id}")
        return {
            "status": "done",
            "duelId": duel_id,
            "opponentId": opponent_id,
            "opponentName": opponent_name,
            "balance": balance,
        }

    def seal(self, duel_id: str, player_id: str, signals: list[str], action_uid: str) -> None:
        for number, signal in enumerate(signals, start=1):
            self.moves.append(
                {
                    "duel_id": duel_id,
                    "player_id": player_id,
                    "round_no": number,
                    "signal": signal,
                    "action_uid": action_uid,
                    "sealed_at": self.now().isoformat(),
                }
            )

    def check_answer_arguments(self, a: dict[str, Any], duel: dict[str, Any]) -> None:
        results = a["p_round_results"]
        points = {"challenger": results.count("challenger"), "opponent": results.count("opponent")}
        fits = {
            "challenger": points["challenger"] > points["opponent"],
            "opponent": points["opponent"] > points["challenger"],
            "draw": points["challenger"] == points["opponent"],
        }
        if (
            len(a["p_signals"]) != duel["rounds"]
            or len(results) != duel["rounds"]
            or not set(results) <= {"challenger", "opponent", "even"}
            or a["p_outcome"] not in fits
            or not fits[a["p_outcome"]]
        ):
            raise RpcFailure("P0001", "bad_duel")

    def rpc_duel_answer(self, a: dict[str, Any]) -> dict[str, Any]:
        if datetime.fromisoformat(a["p_day_start"]) > self.now() + timedelta(minutes=1):
            raise RpcFailure("P0001", "bad_duel")
        duel = self.find_duel(a["p_duel_id"])
        if duel is None:
            return refused("no_such_duel")
        player = a["p_player_id"]
        if self.has_envelope(duel["id"], player):
            raise RpcFailure("23505", "already_applied", 409)
        if duel["status"] != "open":
            answered = duel["is_open"] and duel["status"] == "finished"
            return refused("duel_taken" if answered else "duel_closed")
        if not duel["is_open"] and duel["opponent_id"] != player:
            return refused("no_such_duel")
        if not self.is_in_the_future(duel["expires_at"]):
            return refused("duel_expired")
        self.check_answer_arguments(a, duel)
        if duel["challenger_id"] not in self.wallets or player not in self.wallets:
            raise RpcFailure("P0001", "wallet_not_found")
        if (
            duel["stake"] > 0
            and self.staked_today(duel, player, a["p_day_start"]) >= a["p_pair_daily_limit"]
        ):
            return refused("daily_pair_limit")

        ref = f"duel:{duel['id']}"
        if duel["stake"] > 0:
            self.move_coins(player, -duel["stake"], "arena_stake", ref)
        self.seal(duel["id"], player, a["p_signals"], a["p_action_uid"])
        duel.update(
            opponent_id=player,
            status="finished",
            outcome=a["p_outcome"],
            round_results=a["p_round_results"],
            answered_at=self.now().isoformat(),
            closed_at=self.now().isoformat(),
        )
        payout = self.pay_out(duel, player, ref)
        return {"status": "done", "balance": self.wallets[player], "winnerTakes": payout}

    def staked_today(self, duel: dict[str, Any], player: str, day_start: str) -> int:
        pair = {duel["challenger_id"], player}
        return len(
            [
                row
                for row in self.duels
                if row["status"] == "finished"
                and row["stake"] > 0
                and datetime.fromisoformat(row["answered_at"]) >= datetime.fromisoformat(day_start)
                and {row["challenger_id"], row["opponent_id"]} == pair
            ]
        )

    def pay_out(self, duel: dict[str, Any], player: str, ref: str) -> int:
        """A draw returns each stake. Otherwise the winner takes the pot minus the cut."""
        stake = duel["stake"]
        if stake == 0:
            return 0
        if duel["outcome"] == "draw":
            self.move_coins(duel["challenger_id"], stake, "arena_payout", ref)
            self.move_coins(player, stake, "arena_payout", ref)
            return 0
        payout = (2 * stake * (100 - duel["cut_percent"])) // 100
        winner = duel["challenger_id"] if duel["outcome"] == "challenger" else player
        self.move_coins(winner, payout, "arena_payout", ref)
        return payout

    def rpc_duel_void(self, a: dict[str, Any]) -> dict[str, Any]:
        new_status, player = a["p_new_status"], a["p_player_id"]
        if new_status not in ("withdrawn", "declined", "expired"):
            raise RpcFailure("P0001", "bad_duel")
        duel = self.find_duel(a["p_duel_id"])
        if duel is None:
            return refused("no_such_duel")
        if duel["status"] != "open":
            same_captain = {"withdrawn": duel["challenger_id"], "declined": duel["opponent_id"]}
            if duel["status"] == new_status and same_captain.get(new_status) == player:
                raise RpcFailure("23505", "already_applied", 409)
            return refused("duel_closed")
        if new_status == "withdrawn" and duel["challenger_id"] != player:
            return refused("not_your_duel")
        if new_status == "declined" and (duel["is_open"] or duel["opponent_id"] != player):
            return refused("not_your_duel")
        if new_status == "expired" and self.is_in_the_future(duel["expires_at"]):
            return refused("not_expired")
        challenger = duel["challenger_id"]
        balance = self.wallets[challenger]
        if duel["stake"] > 0:
            balance = self.move_coins(
                challenger, duel["stake"], "arena_payout", f"duel:{duel['id']}"
            )
        duel.update(status=new_status, closed_at=self.now().isoformat())
        return {"status": "done", "refunded": duel["stake"], "challengerBalance": balance}


def fake_login(request: httpx.Request) -> httpx.Response:
    """The pretend Supabase sign-in check: "test.alice.signature" is Alice, and so on."""
    token = request.headers["authorization"].removeprefix("Bearer ")
    if token not in TOKENS:
        return httpx.Response(401, json={"message": "bad token"})
    return httpx.Response(200, json={"id": TOKENS[token]})


class World:
    """One test world: the app, a client, the fake database and three captains with 1000 coins."""

    def __init__(self, settings: Settings = ARENA_ON, admin: SupabaseAdmin | None = None) -> None:
        self.clock = FakeClock()
        self.clock.now = START
        self.database = FakeDuelDatabase(self.clock)
        for player_id, name in PLAYERS.values():
            self.database.add_player(player_id, name)
        if admin is None:
            admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        verifier = PlayerVerifier(
            settings, transport=httpx.MockTransport(fake_login), clock=self.clock
        )
        self.service = DuelService(self.clock)
        self.client = TestClient(create_app(settings, verifier, admin, duel_service=self.service))

    @staticmethod
    def headers(who: str) -> dict[str, str]:
        return {"Authorization": f"Bearer test.{who}.signature"}

    def coins(self, who: str) -> int:
        return self.database.wallets[PLAYERS[who][0]]

    def challenge(
        self, who: str = "alice", drop: tuple[str, ...] = (), **changes: Any
    ) -> httpx.Response:
        """Send a challenge. `changes` replace fields of NEW_CHALLENGE, `drop` leaves fields out."""
        body = {**NEW_CHALLENGE, **changes}
        body = {key: value for key, value in body.items() if key not in drop}
        return self.client.post("/api/duels", json=body, headers=self.headers(who))

    def answer(self, who: str, duel_id: str, **changes: Any) -> httpx.Response:
        body = {**NEW_ANSWER, **changes}
        path = f"/api/duels/{duel_id}/move"
        return self.client.post(path, json=body, headers=self.headers(who))

    def cancel(self, who: str, duel_id: str) -> httpx.Response:
        return self.client.post(f"/api/duels/{duel_id}/cancel", headers=self.headers(who))

    def detail(self, who: str, duel_id: str) -> httpx.Response:
        return self.client.get(f"/api/duels/{duel_id}", headers=self.headers(who))

    def listing(self, who: str) -> httpx.Response:
        return self.client.get("/api/duels", headers=self.headers(who))

    def start_duel(self, **changes: Any) -> str:
        """Alice challenges Bob (or whoever `changes` say). Returns the id of the new duel."""
        response = self.challenge("alice", **changes)
        assert response.status_code == 200, response.text
        return response.json()["duel"]["id"]
