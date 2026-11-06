"""Fakes for the crew tests: a pretend Supabase, and the app wired to it.

FakeCrewDatabase answers the three reads of the crew code and the four crew functions:
  * GET entry_profiles   the kit of a player (rows of TWO players, the other one first)
  * GET crew_seats       the seats a player holds, with the status of each crew
  * GET crews            one crew with its seats and their names
  * POST rpc/<function>  the four crew functions, with replies the test scripts in advance

It understands the filter "column=eq.value" and the "select" list, like Supabase, so a test can
prove that the code asks for the right player and the right columns. A read that a test did not
set up, or a function nobody scripted, fails loudly instead of answering "nothing".

Used by: test_crew_store.py and test_crew_routes.py.
"""

import json
from typing import Any

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock, make_admin

TOKEN = "test.crew-player.signature"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

# The signed-in player, a friend who sits in the same crew, and a stranger whose data must never
# show up.
PLAYER_ID = "11111111-2222-4333-8444-555555555555"
FRIEND_ID = "22222222-3333-4444-8555-666666666666"
OTHER_PLAYER_ID = "99999999-8888-4777-8666-555555555555"

CREW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
OTHER_CREW_ID = "ffffffff-0000-4111-8222-333333333333"
CODE = "K7QF2M"

# Whole seconds, with a Z: the shape of every time the API sends.
STARTED_AT_IN_DATABASE = "2026-11-13T11:02:00.123456+01:00"
STARTED_AT_IN_API = "2026-11-13T10:02:00Z"


def shape(row: dict[str, Any], select: str) -> dict[str, Any]:
    """The row with only the columns that `select` asks for, like Supabase answers."""
    return {name: row[name] for name in top_level_columns(select)}


def top_level_columns(select: str) -> list[str]:
    """The names a select list asks for at the top level: "a,b(c,d),e" gives a, b and e."""
    names = []
    current = ""
    depth = 0
    for character in select:
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        if character == "," and depth == 0:
            names.append(current)
            current = ""
        else:
            current += character
    names.append(current)
    return [name.split("(")[0] for name in names if name]


class FakeCrewDatabase:
    """A pretend Supabase for the crew routes. See the top of this file."""

    def __init__(self) -> None:
        self.entry_profiles: list[dict[str, Any]] = [
            {"player_id": OTHER_PLAYER_ID, "kit": "stranger"},
            {"player_id": PLAYER_ID, "kit": "witness"},
        ]
        self.seat_rows: list[dict[str, Any]] = []
        self.crew_rows: dict[str, list[dict[str, Any]]] = {}
        self.replies: dict[str, list[Any]] = {}
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1/')}"
        if route == "GET entry_profiles":
            return self.read_table(self.entry_profiles, request)
        if route == "GET crew_seats":
            return self.read_table(self.seat_rows, request)
        if route == "GET crews":
            return self.read_crew(request)
        if route.startswith("POST rpc/"):
            return self.run_function(route.removeprefix("POST rpc/"))
        raise AssertionError(f"The crew code made a request nobody expected: {route}")

    def read_table(self, rows: list[dict[str, Any]], request: httpx.Request) -> httpx.Response:
        """Rows that match every "eq." filter in the address, with the columns asked for."""
        matching = rows
        for column, condition in request.url.params.items():
            if condition.startswith("eq."):
                wanted = condition.removeprefix("eq.")
                matching = [row for row in matching if row[column] == wanted]
        shaped = [shape(row, request.url.params["select"]) for row in matching]
        return httpx.Response(200, json=shaped)

    def read_crew(self, request: httpx.Request) -> httpx.Response:
        """The crew with the asked id. A test may set several rows: each read gets the next one."""
        wanted = request.url.params["id"].removeprefix("eq.")
        rows = self.crew_rows.get(wanted, [])
        if not rows:
            return httpx.Response(200, json=[])
        row = rows.pop(0) if len(rows) > 1 else rows[0]
        return httpx.Response(200, json=[shape(row, request.url.params["select"])])

    def run_function(self, name: str) -> httpx.Response:
        """The next scripted reply of the function. The last one repeats."""
        scripted = self.replies.get(name)
        if not scripted:
            raise AssertionError(f"Nobody scripted a reply for the function {name}.")
        reply = scripted.pop(0) if len(scripted) > 1 else scripted[0]
        if isinstance(reply, httpx.Response):
            return reply
        return httpx.Response(200, json=reply)

    def script(self, name: str, *replies: Any) -> None:
        """What the function `name` answers: a dict (JSON) or a ready-made httpx.Response."""
        self.replies[name] = list(replies)

    def set_crew(self, crew_id: str, *rows: dict[str, Any]) -> None:
        """The rows that reads of this crew answer with, one row per read (the last repeats)."""
        self.crew_rows[crew_id] = list(rows)

    def calls(self, name: str) -> list[dict[str, Any]]:
        """The JSON arguments of every call of the function `name`."""
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

    def routes(self) -> list[str]:
        """Every request in order, like "GET entry_profiles" or "POST rpc/crew_create"."""
        return [
            f"{request.method} {request.url.path.removeprefix('/rest/v1/')}"
            for request in self.requests
        ]


# --- rows and replies the way Supabase sends them ---


def player_seat(seat_no: int, player_id: str, name: str, kit: str) -> dict[str, Any]:
    """A seat of a crew, as the read of a crew shows it, held by a player."""
    return {
        "seat_no": seat_no,
        "player_id": player_id,
        "npc_id": None,
        "kit": kit,
        "profiles": {"display_name": name},
    }


def partner_seat(seat_no: int, npc_id: str, kit: str) -> dict[str, Any]:
    """A seat of a crew, as the read of a crew shows it, held by an NPC partner."""
    return {"seat_no": seat_no, "player_id": None, "npc_id": npc_id, "kit": kit, "profiles": None}


def crew_row(
    seats: list[dict[str, Any]],
    crew_id: str = CREW_ID,
    code: str | None = CODE,
    status: str = "forming",
    mode: str = "solo",
    version: int = 1,
    started_at: str | None = None,
) -> dict[str, Any]:
    """A crew with its seats, as the read of a crew answers."""
    return {
        "id": crew_id,
        "code": code,
        "status": status,
        "mode": mode,
        "version": version,
        "started_at": started_at,
        "crew_seats": seats,
    }


def seat_of_player(
    crew_id: str = CREW_ID,
    seat_no: int = 1,
    status: str = "forming",
    player_id: str = PLAYER_ID,
) -> dict[str, Any]:
    """A row of crew_seats as the read of "my seats" answers (with the player id to filter on)."""
    return {
        "player_id": player_id,
        "crew_id": crew_id,
        "seat_no": seat_no,
        "crews": {"status": status},
    }


def found_reply(
    seats: list[dict[str, Any]],
    crew_id: str = CREW_ID,
    crew_status: str = "forming",
    version: int = 1,
) -> dict[str, Any]:
    """What crew_find_by_code answers for a crew that has the code."""
    return {
        "status": "found",
        "crewId": crew_id,
        "crewStatus": crew_status,
        "version": version,
        "seats": seats,
    }


def found_seat(seat_no: int, player_id: str | None, npc_id: str | None, kit: str) -> dict[str, Any]:
    """One seat in the answer of crew_find_by_code."""
    return {"seatNo": seat_no, "playerId": player_id, "npcId": npc_id, "kit": kit}


def refused(reason: str, **more: Any) -> dict[str, Any]:
    """What a crew function answers when a rule says no."""
    return {"status": "refused", "reason": reason, **more}


# --- the app wired to the fake ---


def login_works(request: httpx.Request) -> httpx.Response:
    """A fake Supabase login check that knows one token."""
    if request.headers["authorization"] == f"Bearer {TOKEN}":
        return httpx.Response(200, json={"id": PLAYER_ID, "email": "octocat@example.com"})
    return httpx.Response(401, json={"msg": "invalid JWT"})


def make_crew_client(database: Any, *, broadcaster=None) -> TestClient:
    """The app, wired to a fake login check and this fake database (any request handler)."""
    verifier = PlayerVerifier(
        CONFIGURED_SETTINGS, transport=httpx.MockTransport(login_works), clock=FakeClock()
    )
    admin, _ = make_admin(database)
    return TestClient(
        create_app(CONFIGURED_SETTINGS, verifier=verifier, admin=admin, broadcaster=broadcaster)
    )
