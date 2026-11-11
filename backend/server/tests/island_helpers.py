"""Fakes for the island and wave route tests: a pretend Supabase, a pretend weather and the app.

FakeIslandDatabase answers exactly the calls the island and wave routes make, and fails loudly
(KeyError) for anything else:

  * POST rpc/island_open                     the player's island (queue replies in open_replies)
  * GET wallets                              the coins
  * GET islet_buildings                      the repeat check (a ref) or the buildings of a player
  * POST rpc/islet_build                     the build (build_reply: JSON or an httpx.Response)
  * GET islands, GET profiles                a visit by code and the owner's captain name
  * POST rpc/wave_start, rpc/wave_finish     start_reply and finish_reply
  * POST rpc/wave_join, rpc/wave_current     join_reply and current_reply (None: no wave)
  * GET islands?player_id=                   the tower defense columns (progress)
  * GET wallet_transactions                  the repeat check of a paid action (ledger_refs)
  * POST rpc/island_build, island_upgrade, island_hire, island_captain, pp_build, pp_upgrade,
    island_weapon_buy                        paid_replies[name] (default: done)
  * GET captain_skill_learns                 the repeat check of a skill (skill_refs)
  * POST rpc/island_learn_skill, island_weapon_equip
                                             paid_replies[name] (default: LEARNED, EQUIPPED)
  * GET pirate_point_buildings, GET wave_runs  Pirate Point's buildings and best wave

FakePlaceWeather stands in for the Keeper's Lock weather of a place (the bell-ringer's area).

The login check knows a GitHub player, a friend and a guest (anonymous). Nothing uses the network.

Used by: test_island_routes.py and test_wave_routes.py.
"""

import json
from dataclasses import replace
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.demo.gate import DemoGate
from server.flags import parse_flags
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import CONFIGURED_SETTINGS, FAKE_SECRET_KEY, FAKE_URL, FakeClock
from server.weather.mapping import WeatherReading
from server.weather.source import PlaceReading

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
FRIEND_ID = "66666666-7777-4888-9999-000000000000"
GUEST_ID = "aaaaaaaa-0000-4000-8000-000000000001"
WAVE_ID = "0b6f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4"

PLAYER = {"Authorization": "Bearer test.player.signature"}
GUEST = {"Authorization": "Bearer test.guest.signature"}
USERS = {
    "Bearer test.player.signature": {"id": PLAYER_ID, "is_anonymous": False},
    "Bearer test.guest.signature": {"id": GUEST_ID, "is_anonymous": True},
}

ISLAND_SETTINGS = replace(CONFIGURED_SETTINGS, flags=parse_flags("islands"))

# The weather now, as Open-Meteo numbers. Each one maps to the state its name says.
CALM = WeatherReading(
    weather_code=0,
    precipitation_mm_per_hour=0.0,
    visibility_m=24000.0,
    wind_speed_kmh=8.0,
    cloud_cover_percent=10.0,
    is_day=True,
)
FOG = replace(CALM, weather_code=45, visibility_m=300.0, wind_speed_kmh=6.0)
RAIN = replace(CALM, weather_code=63, precipitation_mm_per_hour=3.5, wind_speed_kmh=18.0)
STORM = replace(CALM, weather_code=95, precipitation_mm_per_hour=6.0, wind_speed_kmh=55.0)

STARTED = {
    "status": "started",
    "waveId": WAVE_ID,
    "wave": 1,
    "seed": 123456789,
    "startsAt": "2026-11-10T12:00:10+00:00",
    "weatherKind": "calm",
    "ships": 1.0,
    "fog": 0,
    "place": "island",
    "repeat": False,
}
FINISHED = {
    "status": "done",
    "loot": 15,
    "balance": 115,
    "survived": True,
    "wave": 1,
    "waveBest": 1,
    "flags": 1,
    "expired": False,
    "repeat": False,
}


PAID_FUNCTIONS = (
    "island_build",
    "island_upgrade",
    "island_hire",
    "island_captain",
    "pp_build",
    "pp_upgrade",
    "island_weapon_buy",
)
PAID_DONE = {"status": "done", "level": 2, "balance": 70, "repeat": False}
LEARNED = {"status": "done", "skills": ["steady_aim"], "points": 1, "repeat": False}
EQUIPPED = {"status": "done", "weapon": "musket"}


def opened(code: str = "K7Q2M", wave_best: int = 0, flags: int = 0) -> dict:
    return {
        "status": "open",
        "code": code,
        "waveBest": wave_best,
        "flags": flags,
        "created": False,
        "paid": 0,
    }


class FakeWeather:
    """Stands in for the cached weather source: a reading, or a failure."""

    def __init__(self, reading: WeatherReading | None = CALM) -> None:
        self.reading = reading

    async def get(self) -> SimpleNamespace:
        if self.reading is None:
            raise RuntimeError("pretend weather failure")
        return SimpleNamespace(data=PlaceReading("Test Isle", self.reading))


class FakeIslandDatabase:
    def __init__(self) -> None:
        self.balance = 100
        self.has_wallet = True
        self.open_replies: list[dict] = []
        self.buildings: dict[str, list[dict]] = {}
        self.known_refs: set[str] = set()
        self.islands: dict[str, dict] = {}
        self.names: dict[str, str] = {}
        self.build_reply: dict | httpx.Response = {
            "status": "done",
            "balance": 70,
            "timber": 0,
            "level": 1,
        }
        self.start_reply: dict | httpx.Response = STARTED
        self.finish_reply: dict | httpx.Response = FINISHED
        self.join_reply: dict | httpx.Response = {**STARTED, "status": "joined"}
        self.current_reply: dict | None = None
        self.progress = {
            "wave_best": 0,
            "next_wave": None,
            "crew_gunner": 0,
            "crew_carpenter": 0,
            "crew_lookout": 0,
            "captain_level": 1,
            "won_wave_best": 0,
            "captain_skills": [],
            "weapons_owned": ["musket"],
            "weapon_equipped": "musket",
        }
        self.ledger_refs: set[tuple[str, str]] = set()
        self.skill_refs: set[str] = set()
        self.paid_replies: dict[str, dict | httpx.Response] = {}
        self.point_buildings: list[dict] = []
        self.point_best: list[dict] = []
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1')}"
        handlers = {
            "POST /rpc/island_open": self.open_island,
            "GET /wallets": self.read_wallet,
            "GET /islet_buildings": self.read_buildings,
            "POST /rpc/islet_build": lambda _: self.answer(self.build_reply),
            "GET /islands": self.read_island,
            "GET /profiles": self.read_name,
            "POST /rpc/wave_start": lambda _: self.answer(self.start_reply),
            "POST /rpc/wave_finish": lambda _: self.answer(self.finish_reply),
            "POST /rpc/wave_join": lambda _: self.answer(self.join_reply),
            "POST /rpc/wave_current": lambda _: httpx.Response(200, json=self.current_reply),
            "GET /wallet_transactions": self.read_ledger,
            "GET /captain_skill_learns": lambda request: httpx.Response(
                200,
                json=[{"ref": "x"}]
                if request.url.params["ref"].removeprefix("eq.") in self.skill_refs
                else [],
            ),
            "POST /rpc/demo_guest_admit": lambda _: httpx.Response(
                200, json={"status": "admitted"}
            ),
            "GET /pirate_point_buildings": lambda _: httpx.Response(200, json=self.point_buildings),
            "GET /wave_runs": lambda _: httpx.Response(200, json=self.point_best),
        }
        for name in PAID_FUNCTIONS:
            handlers[f"POST /rpc/{name}"] = self.paid
        handlers["POST /rpc/island_learn_skill"] = lambda request: self.answer(
            self.paid_replies.get("island_learn_skill", LEARNED)
        )
        handlers["POST /rpc/island_weapon_equip"] = lambda request: self.answer(
            self.paid_replies.get("island_weapon_equip", EQUIPPED)
        )
        return handlers[route](request)

    @staticmethod
    def answer(reply: dict | httpx.Response) -> httpx.Response:
        return reply if isinstance(reply, httpx.Response) else httpx.Response(200, json=reply)

    def open_island(self, request: httpx.Request) -> httpx.Response:
        if self.open_replies:
            return httpx.Response(200, json=self.open_replies.pop(0))
        return httpx.Response(200, json=opened())

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"balance": self.balance}] if self.has_wallet else [])

    def read_buildings(self, request: httpx.Request) -> httpx.Response:
        ref = request.url.params.get("ref")
        if ref is not None:
            known = ref.removeprefix("eq.") in self.known_refs
            return httpx.Response(200, json=[{"plot": "wall_1"}] if known else [])
        owner = request.url.params["player_id"].removeprefix("eq.")
        rows = [{"level": 1, **row} for row in self.buildings.get(owner, [])]
        return httpx.Response(200, json=rows)

    def paid(self, request: httpx.Request) -> httpx.Response:
        name = request.url.path.rsplit("/", 1)[-1]
        return self.answer(self.paid_replies.get(name, PAID_DONE))

    def read_ledger(self, request: httpx.Request) -> httpx.Response:
        key = (
            request.url.params["reason"].removeprefix("eq."),
            request.url.params["ref"].removeprefix("eq."),
        )
        return httpx.Response(200, json=[{"id": 1}] if key in self.ledger_refs else [])

    def read_island(self, request: httpx.Request) -> httpx.Response:
        if "player_id" in request.url.params:
            return httpx.Response(200, json=[self.progress])
        code = request.url.params["code"].removeprefix("eq.")
        row = self.islands.get(code)
        return httpx.Response(200, json=[row] if row else [])

    def read_name(self, request: httpx.Request) -> httpx.Response:
        player = request.url.params["id"].removeprefix("eq.")
        return httpx.Response(200, json=[{"display_name": self.names[player]}])

    def calls(self, name: str) -> list[dict]:
        """The JSON arguments of every call to the database function `name`."""
        return [json.loads(r.content) for r in self.requests if r.url.path.endswith(f"/rpc/{name}")]

    def paths(self) -> list[str]:
        return [f"{r.method} {r.url.path.removeprefix('/rest/v1')}" for r in self.requests]


class FakePlaceWeather:
    """The weather of a chosen place: a reading, or None (nothing usable). Records each ask."""

    def __init__(self, reading: WeatherReading | None = None) -> None:
        self.reading_now = reading
        self.asked: list[tuple[float, float]] = []

    async def reading(self, latitude: float, longitude: float) -> SimpleNamespace | None:
        self.asked.append((latitude, longitude))
        return None if self.reading_now is None else SimpleNamespace(reading=self.reading_now)


def login(request: httpx.Request) -> httpx.Response:
    user = USERS.get(request.headers["authorization"])
    if user is None:
        return httpx.Response(401, json={"msg": "invalid JWT"})
    return httpx.Response(200, json=user)


async def admit_everyone(admin: SupabaseAdmin, player_id: str) -> bool:
    return True


async def nothing_to_provision(admin: SupabaseAdmin, player_id: str) -> None:
    return None


class World:
    """One test world: the app, a client, the fake database and the fake weather."""

    def __init__(
        self,
        settings=ISLAND_SETTINGS,
        weather: WeatherReading | None = CALM,
        local_weather: WeatherReading | None = None,
    ) -> None:
        self.database = FakeIslandDatabase()
        self.weather = FakeWeather(weather)
        self.local_weather = FakePlaceWeather(local_weather)
        self.clock = FakeClock()
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(self.database))
        verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=self.clock)
        self.app = create_app(
            settings,
            verifier,
            admin,
            weather_source=self.weather,
            clock=self.clock,
            lock_weather=self.local_weather,
        )
        # A guest admitted with the class code, without the class code's own database calls.
        self.app.state.demo_gate = DemoGate(
            settings, admin, self.clock, provision=nothing_to_provision, lookup=admit_everyone
        )
        self.client = TestClient(self.app)

    def island(self, headers=PLAYER) -> httpx.Response:
        return self.client.get("/api/island", headers=headers)

    def build(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"spot": "cannon_1", "kind": "cannon", "actionUid": "click-0001"}
        request.update(body)
        return self.client.post("/api/island/build", json=request, headers=headers)

    def visit(self, code: str, headers=PLAYER) -> httpx.Response:
        return self.client.get(f"/api/island/visit/{code}", headers=headers)

    def start(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"where": "own", "actionUid": "bell-0001"}
        request.update(body)
        return self.client.post("/api/waves/start", json=request, headers=headers)

    def join(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"waveId": WAVE_ID}
        request.update(body)
        return self.client.post("/api/waves/join", json=request, headers=headers)

    def current(self, where: str = "own", headers=PLAYER) -> httpx.Response:
        return self.client.get("/api/waves/current", params={"where": where}, headers=headers)

    def post(self, path: str, headers=PLAYER, **body) -> httpx.Response:
        request = {"actionUid": "click-0001"}
        request.update(body)
        return self.client.post(path, json=request, headers=headers)

    def finish(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"waveId": WAVE_ID, "survived": True, "shipsSunk": 7}
        request.update(body)
        return self.client.post("/api/waves/finish", json=request, headers=headers)
