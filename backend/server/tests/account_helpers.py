"""Test helpers for the account routes (package A2): a fake database and a ready-made client.

No test uses the network. Two fakes stand in for Supabase:
  * a fake login check that knows exactly one token (the answer carries a GitHub login name and an
    e-mail address, like the real one, so a test can prove that neither of them is ever used), and
  * a fake database, in two flavours:
      scripted_database   answers table reads and database function calls from dictionaries that
                          the test fills in. Good for one exact answer, for example an error.
      AccountsDatabase    keeps profiles, saves and name re-rolls in memory and runs the same
                          steps as the SQL functions of supabase/migrations/20261106020000_
                          accounts.sql. Good for two requests in a row: a test can see how the
                          second one is answered.

Both understand the filter "column=eq.value" on a table read, and a function call
(POST /rest/v1/rpc/<name>) with the arguments as the JSON body.

Used by: test_captain_name_routes.py, test_saves.py, test_delete_me.py (and the other account tests
that need a client).
"""

import json
from collections.abc import Callable, Mapping
from typing import Any

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.settings import Settings
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock, FakeReply, make_admin

# The signed-in player, the token the fake login knows, and another player whose data must never
# show up in an answer.
PLAYER_ID = "11111111-2222-3333-4444-555555555555"
PLACEHOLDER = "Captain-111111"  # what the sign-up trigger writes for PLAYER_ID
OTHER_PLAYER_ID = "99999999-8888-7777-6666-555555555555"
OTHER_PLACEHOLDER = "Captain-999999"
TOKEN = "token-of-octocat"
RIGHT_HEADER = {"Authorization": f"Bearer {TOKEN}"}

# The time that the fake database writes into a save, in the timezone of the scratch server
# (+01:00). The route must answer it as UTC, whole seconds, with a Z.
WRITTEN_AT = "2026-11-06T11:15:30.250000+01:00"
WRITTEN_AT_AS_UTC = "2026-11-06T10:15:30Z"
FIRST_SAVE_AT = "2026-11-06T09:00:00+00:00"

REST_PREFIX = "/rest/v1/"
RPC_PREFIX = "/rest/v1/rpc/"

# A function of the fake database gets the arguments (the JSON body) and returns the JSON answer.
# It may also return a whole httpx.Response, to pretend that the database failed.
FunctionReply = Callable[[dict[str, Any]], Any]


def answer_request(
    request: httpx.Request,
    tables: Mapping[str, list[dict[str, Any]]],
    functions: Mapping[str, FunctionReply],
) -> httpx.Response:
    """Answer one request of the server like the database would."""
    path = request.url.path
    if request.method == "POST" and path.startswith(RPC_PREFIX):
        function = functions.get(path.removeprefix(RPC_PREFIX))
        if function is None:
            return httpx.Response(404, json={"code": "PGRST202", "message": "no such function"})
        result = function(json.loads(request.content))
        return result if isinstance(result, httpx.Response) else httpx.Response(200, json=result)
    if request.method == "GET" and path.startswith(REST_PREFIX):
        rows = tables.get(path.removeprefix(REST_PREFIX))
        if rows is None:
            return httpx.Response(404, json={"code": "42P01", "message": "no such table"})
        return httpx.Response(200, json=filter_rows(rows, request.url.params))
    return httpx.Response(500, json={"message": "the fake database does not know this request"})


def filter_rows(rows: list[dict[str, Any]], params: Mapping[str, str]) -> list[dict[str, Any]]:
    """Apply the filter "column=eq.value" and the limit, like the database does."""
    for column, condition in params.items():
        if condition.startswith("eq."):
            wanted = condition.removeprefix("eq.")
            rows = [row for row in rows if row[column] == wanted]
    if "limit" in params:
        rows = rows[: int(params["limit"])]
    return rows


def scripted_database(
    functions: Mapping[str, FunctionReply] | None = None,
    tables: Mapping[str, list[dict[str, Any]]] | None = None,
) -> FakeReply:
    """A fake database that answers table reads and function calls from dictionaries."""

    def reply(request: httpx.Request) -> httpx.Response:
        return answer_request(request, tables or {}, functions or {})

    return reply


def database_error(status: int, code: str, message: str) -> httpx.Response:
    """The JSON error that Supabase sends when a database function or a read fails."""
    return httpx.Response(status, json={"code": code, "message": message})


class AccountsDatabase:
    """The account part of the database, kept in memory, with the steps of the SQL functions.

    It is a FakeReply, so pass it to make_admin (or make_client below). Tests fill `profiles` and
    `saves` with add_player and read them again afterwards to see what a request changed.
    """

    def __init__(self) -> None:
        self.profiles: dict[str, str] = {}  # player id -> display name
        self.saves: dict[str, dict[str, Any]] = {}  # player id -> version, data, updated_at
        self.rerolls: dict[str, str] = {}  # player id -> the action_uid of their one re-roll
        self.deleted: list[str] = []  # the ids that delete_player removed, in order

    def add_player(
        self,
        player_id: str,
        display_name: str | None = None,
        data: dict[str, Any] | None = None,
        version: int = 1,
    ) -> None:
        """Add a player the way the sign-up trigger does: a placeholder name and a save."""
        self.profiles[player_id] = display_name or "Captain-" + player_id[:6]
        self.saves[player_id] = {
            "version": version,
            "data": data or {},
            "updated_at": FIRST_SAVE_AT,
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        tables = {
            "profiles": [
                {"id": player_id, "display_name": name} for player_id, name in self.profiles.items()
            ],
            "saves": [{"player_id": player_id, **save} for player_id, save in self.saves.items()],
        }
        functions = {
            "assign_captain_name": self.assign_captain_name,
            "reroll_captain_name": self.reroll_captain_name,
            "save_progress": self.save_progress,
            "delete_player": self.delete_player,
        }
        return answer_request(request, tables, functions)

    def assign_captain_name(self, arguments: dict[str, Any]) -> dict[str, Any]:
        player_id = arguments["p_player_id"]
        if player_id not in self.profiles:
            return {"status": "missing"}
        if self.profiles[player_id] == arguments["p_placeholder"]:  # the name is given only once
            self.profiles[player_id] = arguments["p_name"]
        used = 1 if player_id in self.rerolls else 0
        return {"status": "named", "name": self.profiles[player_id], "rerollsUsed": used}

    def reroll_captain_name(self, arguments: dict[str, Any]) -> Any:
        player_id = arguments["p_player_id"]
        if player_id not in self.profiles:
            return {"status": "missing"}
        name = self.profiles[player_id]
        if player_id in self.rerolls:
            same_request = self.rerolls[player_id] == arguments["p_action_uid"]
            reason = "already_applied" if same_request else "no_rerolls_left"
            return {"status": "refused", "reason": reason, "name": name}
        if name == arguments["p_placeholder"]:
            return {"status": "refused", "reason": "no_name_yet", "name": name}
        if arguments["p_new_name"] in (None, name):
            return database_error(400, "P0001", "same_name")
        self.rerolls[player_id] = arguments["p_action_uid"]
        self.profiles[player_id] = arguments["p_new_name"]
        return {"status": "named", "name": arguments["p_new_name"], "rerollsUsed": 1}

    def save_progress(self, arguments: dict[str, Any]) -> Any:
        player_id = arguments["p_player_id"]
        version, data = arguments["p_expected_version"], arguments["p_data"]
        if not isinstance(version, int) or version < 1 or not isinstance(data, dict):
            return database_error(400, "P0001", "bad_save")
        if len(json.dumps(data)) > 200_000:  # the same limit as the table rule
            return {"status": "too_big"}
        save = self.saves.get(player_id)
        if save is None:
            return {"status": "missing"}
        if save["version"] != version:
            return {"status": "stale", "version": save["version"]}
        save.update(data=data, version=version + 1, updated_at=WRITTEN_AT)
        return {"status": "saved", "version": version + 1, "updatedAt": WRITTEN_AT}

    def delete_player(self, arguments: dict[str, Any]) -> dict[str, Any]:
        player_id = arguments["p_player_id"]
        if player_id not in self.profiles:
            return {"status": "not_found"}
        self.profiles.pop(player_id)
        self.saves.pop(player_id, None)
        self.rerolls.pop(player_id, None)
        self.deleted.append(player_id)
        return {"status": "deleted"}


def login_works(request: httpx.Request) -> httpx.Response:
    """A fake Supabase login check that knows one token.

    The answer carries a login name and an e-mail address, like the real one. The game must never
    show either of them.
    """
    if request.headers["authorization"] == f"Bearer {TOKEN}":
        user = {
            "id": PLAYER_ID,
            "email": "octocat@example.com",
            "user_metadata": {"user_name": "octocat"},
        }
        return httpx.Response(200, json=user)
    return httpx.Response(401, json={"msg": "invalid JWT"})


def make_client(
    database_reply: FakeReply,
    login_reply: FakeReply = login_works,
    settings: Settings = CONFIGURED_SETTINGS,
) -> tuple[TestClient, list[httpx.Request]]:
    """The app, wired to a fake login check and a fake database.

    Also returns every request that the database received, in order.
    """
    verifier = PlayerVerifier(
        settings, transport=httpx.MockTransport(login_reply), clock=FakeClock()
    )
    secret_key = settings.supabase_secret_key.get_secret_value()
    admin, seen = make_admin(database_reply, settings.supabase_url, secret_key)
    return TestClient(create_app(settings, verifier=verifier, admin=admin)), seen


def sent_arguments(request: httpx.Request) -> dict[str, Any]:
    """The arguments the server sent to a database function: the JSON body of the request."""
    return json.loads(request.content)
