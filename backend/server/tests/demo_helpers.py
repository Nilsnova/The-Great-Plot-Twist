"""Fakes for the class demo tests: a pretend Supabase (login check and database) and the app.

FakeDemoDatabase answers exactly the calls the demo gate, the host routes and the Keeper's Lock
make, and fails loudly for anything else:

  * POST rpc/demo_class_code_read, rpc/demo_class_code_set   the class code, kept in memory
  * POST rpc/demo_guest_admit, GET demo_guests          the admitted guests (the gate's lookup)
  * GET entry_profiles, POST rpc/assign_captain_name, rpc/grant_entry_kit   getting a guest ready
  * GET demo_lock_attempts, POST rpc/demo_lock_record  the lock answers, kept in memory
  * GET /auth/v1/admin/users, POST rpc/delete_player    "Clean up guests"

The login check knows four tokens: a guest (anonymous), a GitHub player, an email player
(6-digit code sign-in) and a host. Nothing uses the network.

Used by: test_demo_gate.py, test_demo_host_routes.py, test_lock_routes.py.
"""

import json
from dataclasses import replace
from datetime import datetime
from typing import Any

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.flags import parse_flags
from server.lock.places import PlaceSearch
from server.lock.weather import PlaceWeather
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, FAKE_URL, FakeClock

GUEST_ID = "aaaaaaaa-0000-4000-8000-000000000001"
PLAYER_ID = "bbbbbbbb-0000-4000-8000-000000000002"
EMAIL_PLAYER_ID = "cccccccc-0000-4000-8000-000000000003"
HOST_ID = "dddddddd-0000-4000-8000-000000000004"

GUEST = {"Authorization": "Bearer test.guest.signature"}
PLAYER = {"Authorization": "Bearer test.github.signature"}
EMAIL_PLAYER = {"Authorization": "Bearer test.email.signature"}
HOST = {"Authorization": "Bearer test.host.signature"}

USERS = {
    "Bearer test.guest.signature": {
        "id": GUEST_ID,
        "is_anonymous": True,
        "app_metadata": {"provider": "anonymous", "providers": ["anonymous"]},
    },
    "Bearer test.github.signature": {
        "id": PLAYER_ID,
        "is_anonymous": False,
        "app_metadata": {"provider": "github", "providers": ["github"]},
    },
    "Bearer test.email.signature": {
        "id": EMAIL_PLAYER_ID,
        "is_anonymous": False,
        "email": "captain@example.org",
        "app_metadata": {"provider": "email", "providers": ["email"]},
    },
    "Bearer test.host.signature": {"id": HOST_ID, "app_metadata": {"provider": "github"}},
}

DEMO_SETTINGS = replace(
    CONFIGURED_SETTINGS, flags=parse_flags("demo"), host_player_ids=frozenset({HOST_ID})
)


def login(request: httpx.Request) -> httpx.Response:
    user = USERS.get(request.headers["authorization"])
    if user is None:
        return httpx.Response(401, json={"msg": "invalid JWT"})
    return httpx.Response(200, json=user)


def utc_text(moment: datetime) -> str:
    return moment.isoformat()


class FakeDemoDatabase:
    def __init__(self, clock: FakeClock) -> None:
        self.clock = clock
        self.code: str | None = None
        self.code_set_at: datetime | None = None
        self.code_actions: dict[tuple[str, str], str] = {}
        self.guests: dict[str, datetime] = {}
        self.known_users: set[str] | None = None  # None: every user exists
        self.entry_profiles: dict[str, str] = {}
        self.names: dict[str, str] = {}
        self.attempts: list[dict[str, Any]] = []
        self.auth_users: list[dict[str, Any]] = []
        self.deleted: list[str] = []
        self.requests: list[httpx.Request] = []

    # --- helpers for the tests ---

    def set_code(self, code: str) -> None:
        self.code, self.code_set_at = code, self.clock()

    def admit(self, player_id: str) -> None:
        self.guests.setdefault(player_id, self.clock())

    def calls(self, name: str) -> list[dict[str, Any]]:
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def paths(self) -> list[str]:
        return [f"{request.method} {request.url.path}" for request in self.requests]

    # --- the fake server ---

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path == "/auth/v1/admin/users":
            return self.list_users(request)
        route = f"{request.method} {path.removeprefix('/rest/v1/')}"
        body = json.loads(request.content) if request.content else {}
        handlers = {
            "POST rpc/demo_class_code_read": lambda: self.code_read(),
            "POST rpc/demo_class_code_set": lambda: self.code_write(body),
            "POST rpc/demo_guest_admit": lambda: self.guest_admit(body),
            "GET demo_guests": lambda: self.read_guests(request),
            "GET entry_profiles": lambda: self.read_profiles(request),
            "POST rpc/assign_captain_name": lambda: self.assign_name(body),
            "POST rpc/grant_entry_kit": lambda: self.grant_kit(body),
            "GET demo_lock_attempts": lambda: self.read_attempts(request),
            "POST rpc/demo_lock_record": lambda: self.lock_record(body),
            "POST rpc/delete_player": lambda: self.delete_player(body),
        }
        handler = handlers.get(route)
        if handler is None:
            raise AssertionError(f"The demo code made a request nobody expected: {route}")
        return httpx.Response(200, json=handler())

    def code_read(self) -> dict[str, Any]:
        at = self.code_set_at
        return {"code": self.code, "setAt": at and utc_text(at), "guests": len(self.guests)}

    def code_write(self, body: dict[str, Any]) -> dict[str, Any]:
        key = (body["p_host_id"], body["p_action_uid"])
        repeat = key in self.code_actions
        if not repeat:
            self.set_code(body["p_code"])
            self.code_actions[key] = body["p_code"]
        return {"status": "set", **self.code_read(), "repeat": repeat}

    def guest_admit(self, body: dict[str, Any]) -> dict[str, Any]:
        player = body["p_player_id"]
        if self.known_users is not None and player not in self.known_users:
            return {"status": "missing"}
        if player in self.guests:
            return {"status": "already"}
        self.admit(player)
        return {"status": "admitted"}

    def read_guests(self, request: httpx.Request) -> list[dict[str, Any]]:
        player = request.url.params["player_id"].removeprefix("eq.")
        return [{"player_id": player}] if player in self.guests else []

    def read_profiles(self, request: httpx.Request) -> list[dict[str, Any]]:
        player = request.url.params["player_id"].removeprefix("eq.")
        kit = self.entry_profiles.get(player)
        return [] if kit is None else [{"kit": kit}]

    def assign_name(self, body: dict[str, Any]) -> dict[str, Any]:
        name = self.names.setdefault(body["p_player_id"], body["p_name"])
        return {"status": "named", "name": name, "rerollsUsed": 0}

    def grant_kit(self, body: dict[str, Any]) -> dict[str, Any]:
        player = body["p_player_id"]
        paid = 0 if player in self.entry_profiles else body["p_kit_coins"]
        status = "stored" if player in self.entry_profiles else "granted"
        self.entry_profiles.setdefault(player, body["p_kit"])
        return {
            "status": status,
            "paid": paid,
            "ending": body["p_ending"],
            "decision": body["p_decision"],
            "readLog": body["p_read_log"],
            "kit": self.entry_profiles[player],
            "startPlace": body["p_start_place"],
            "kitCoins": body["p_kit_coins"],
        }

    def read_attempts(self, request: httpx.Request) -> list[dict[str, Any]]:
        params = request.url.params
        rows = [row for row in self.attempts if f"eq.{row['player_id']}" == params["player_id"]]
        if "action_uid" in params:
            rows = [row for row in rows if f"eq.{row['action_uid']}" == params["action_uid"]]
        return [
            {"answer": row["answer"], "outcome": row["outcome"], "accepted": row["accepted"]}
            for row in rows
        ]

    def lock_record(self, body: dict[str, Any]) -> dict[str, Any]:
        player, uid = body["p_player_id"], body["p_action_uid"]
        for row in self.attempts:
            if row["player_id"] == player and row["action_uid"] == uid:
                return {
                    "status": "repeat",
                    **{k: row[k] for k in ("answer", "outcome", "accepted")},
                }
        if sum(1 for row in self.attempts if row["player_id"] == player) >= 40:
            return {"status": "full"}
        row = {
            "player_id": player,
            "action_uid": uid,
            "answer": body["p_answer"],
            "outcome": body["p_outcome"],
            "accepted": body["p_outcome"] in ("exact", "close", "hint", "clue"),
        }
        self.attempts.append(row)
        return {"status": "recorded", **{k: row[k] for k in ("answer", "outcome", "accepted")}}

    def list_users(self, request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        size = int(request.url.params["per_page"])
        users = self.auth_users[(page - 1) * size : page * size]
        return httpx.Response(200, json={"users": users, "aud": "authenticated"})

    def delete_player(self, body: dict[str, Any]) -> dict[str, Any]:
        player = body["p_player_id"]
        self.deleted.append(player)
        # The user and their admission go, as with the real cascade.
        self.auth_users = [user for user in self.auth_users if user.get("id") != player]
        self.guests.pop(player, None)
        return {"status": "deleted"}


def make_demo_app(
    settings=DEMO_SETTINGS,
    *,
    clock: FakeClock | None = None,
    weather_reply=None,
    places_reply=None,
):
    """The real app with the fake login check, the fake database and fake Open-Meteo replies."""
    clock = clock or FakeClock()
    database = FakeDemoDatabase(clock)
    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=clock)
    admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(database))

    def no_weather(request: httpx.Request) -> httpx.Response:
        raise AssertionError("This test did not expect a weather call.")

    weather = PlaceWeather(
        enabled=not settings.demo_mode,
        transport=httpx.MockTransport(weather_reply or no_weather),
        clock=clock,
    )
    search = PlaceSearch(transport=httpx.MockTransport(places_reply or no_weather), clock=clock)
    app = create_app(
        settings,
        verifier=verifier,
        admin=admin,
        clock=clock,
        lock_weather=weather,
        place_search=search,
    )
    return app, database, clock


def make_demo_client(settings=DEMO_SETTINGS, **options) -> tuple[TestClient, FakeDemoDatabase]:
    app, database, _ = make_demo_app(settings, **options)
    return TestClient(app), database
