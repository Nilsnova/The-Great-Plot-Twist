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
  * POST rpc/wave_revive                     revive_reply (captain health, default REVIVED)
  * GET islands?player_id=                   the tower defense columns (progress)
  * GET wallet_transactions                  the repeat check of a paid action (ledger_refs)
  * POST rpc/island_build, island_upgrade, island_hire, island_captain, pp_build, pp_upgrade,
    island_weapon_buy                        paid_replies[name] (default: done)
  * GET captain_skill_learns                 the repeat check of a skill (skill_refs)
  * GET island_research                      the Tech hub's research of an island (research)
  * POST rpc/island_research, island_wreck_repair  paid_replies[name] (default: done)
  * POST rpc/island_specialise               paid_replies[name] (default: SPECIALISED)
  * POST rpc/island_learn_skill, island_weapon_equip
                                             paid_replies[name] (default: LEARNED, EQUIPPED)
  * POST rpc/island_demolish, island_demolish_quote
                                             paid_replies[name] (default: DEMOLISHED, QUOTED)
  * GET pirate_point_buildings, GET wave_runs  Pirate Point's buildings and best wave, and where a
                                             wave runs (wave_places, by id)
  * POST rpc/game_join, game_leave, game_list, game_members, GET island_members
                                             the games of GAME-V3 section 2 (FakeGames below:
                                             the SQL rules of 20261112040000_game_rooms.sql,
                                             the 10-member cap included)

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
    "island_research",
    "island_wreck_repair",
    "island_respec_at_level",
)
PAID_DONE = {"status": "done", "level": 2, "balance": 70, "repeat": False}
ROLE_PICKED = {"status": "done", "role": "medic", "repeat": False}
LEARNED = {"status": "done", "skills": ["steady_aim"], "points": 1, "repeat": False}
REVIVED = {"status": "done", "price": 35, "balance": 65, "repeat": False}
EQUIPPED = {"status": "done", "weapon": "musket"}
SPECIALISED = {"status": "done", "plot": "cannon_1", "spec": "rapid"}
# A level-3 cannon that FRIEND built and PLAYER upgraded (20261112080000_demolish.sql).
DEMOLISH_REFUNDS = [
    {"playerId": FRIEND_ID, "paid": 150, "coins": 75},
    {"playerId": PLAYER_ID, "paid": 60, "coins": 30},
]
DEMOLISHED = {
    "status": "done", "plot": "cannon_1", "kind": "cannon", "level": 3,
    "refunds": DEMOLISH_REFUNDS, "repeat": False,
}  # fmt: skip
QUOTED = {
    "status": "quote", "plot": "cannon_1", "kind": "cannon", "level": 3,
    "refunds": DEMOLISH_REFUNDS,
}  # fmt: skip


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
        self.revive_reply: dict | httpx.Response = REVIVED
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
            "wreck_paid": 0,
            "captain_role": None,
        }
        # The captain roles of the lobby members ({player id: role}).
        self.captain_roles: dict[str, str] = {}
        # The Tech hub's research rows of every island ({"branch": "cannon"}), one list for all.
        self.research: list[dict] = []
        self.ledger_refs: set[tuple[str, str]] = set()
        self.skill_refs: set[str] = set()
        self.paid_replies: dict[str, dict | httpx.Response] = {}
        self.point_buildings: list[dict] = []
        self.point_best: list[dict] = []
        # Where each wave runs (GET wave_runs?id=): WAVE_ID is on PLAYER's island by default.
        self.wave_places: dict[str, dict] = {
            WAVE_ID: {"place": "island", "island_owner": PLAYER_ID}
        }
        self.games = FakeGames(self)
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
            "POST /rpc/wave_revive": lambda _: self.answer(self.revive_reply),
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
            "GET /wave_runs": self.read_wave_runs,
            "POST /rpc/game_join": self.games.join,
            "POST /rpc/game_leave": self.games.leave,
            "POST /rpc/game_list": self.games.list,
            "POST /rpc/game_members": self.games.members,
            "GET /island_members": self.games.read_membership,
            "GET /island_research": lambda _: httpx.Response(200, json=self.research),
            "POST /rpc/island_specialise": lambda _: self.answer(
                self.paid_replies.get("island_specialise", SPECIALISED)
            ),
        }
        for name in PAID_FUNCTIONS:
            handlers[f"POST /rpc/{name}"] = self.paid
        handlers["POST /rpc/island_learn_skill"] = lambda request: self.answer(
            self.paid_replies.get("island_learn_skill", LEARNED)
        )
        handlers["POST /rpc/island_pick_role"] = lambda request: self.answer(
            self.paid_replies.get("island_pick_role", ROLE_PICKED)
        )
        handlers["POST /rpc/island_weapon_equip"] = lambda request: self.answer(
            self.paid_replies.get("island_weapon_equip", EQUIPPED)
        )
        handlers["POST /rpc/island_demolish"] = lambda request: self.answer(
            self.paid_replies.get("island_demolish", DEMOLISHED)
        )
        handlers["POST /rpc/island_demolish_quote"] = lambda request: self.answer(
            self.paid_replies.get("island_demolish_quote", QUOTED)
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
        if request.url.params.get("player_id", "").startswith("in."):
            ids = request.url.params["player_id"].removeprefix("in.(").removesuffix(")").split(",")
            rows = [{"player_id": who, "captain_role": self.captain_roles.get(who)} for who in ids]
            return httpx.Response(200, json=rows)
        if "player_id" in request.url.params:
            return httpx.Response(200, json=[self.progress])
        code = request.url.params["code"].removeprefix("eq.")
        row = self.islands.get(code)
        return httpx.Response(200, json=[row] if row else [])

    def read_wave_runs(self, request: httpx.Request) -> httpx.Response:
        wave_id = request.url.params.get("id")
        if wave_id is None:
            return httpx.Response(200, json=self.point_best)
        row = self.wave_places.get(wave_id.removeprefix("eq."))
        return httpx.Response(200, json=[row] if row else [])

    def read_name(self, request: httpx.Request) -> httpx.Response:
        player = request.url.params["id"].removeprefix("eq.")
        return httpx.Response(200, json=[{"display_name": self.names[player]}])

    def calls(self, name: str) -> list[dict]:
        """The JSON arguments of every call to the database function `name`."""
        return [json.loads(r.content) for r in self.requests if r.url.path.endswith(f"/rpc/{name}")]

    def paths(self) -> list[str]:
        return [f"{r.method} {r.url.path.removeprefix('/rest/v1')}" for r in self.requests]


class FakeGames:
    """The games of 20261112040000_game_rooms.sql in memory, with the same rules: the host is the
    island's owner and never leaves, at most p_max_members active members (the host counted once),
    a repeat only stamps opened_at, a member who left joins again like a new one."""

    def __init__(self, database: "FakeIslandDatabase") -> None:
        self.database = database
        # owner -> player -> {"role", "joined", "opened", "left"}; a counter stands in for time.
        self.rows: dict[str, dict[str, dict]] = {}
        self.no_profile: set[str] = set()
        self.clock = 0

    def now(self) -> int:
        self.clock += 1
        return self.clock

    def island_exists(self, owner: str, caller: str) -> bool:
        # The caller's own island is always there (island_open ran first, as in the server).
        return owner == caller or any(
            row["player_id"] == owner for row in self.database.islands.values()
        )

    def active(self, owner: str) -> int:
        """Active members, the host counted once whether or not the host row exists."""
        rows = self.rows.get(owner, {})
        return 1 + sum(1 for who, row in rows.items() if who != owner and row["left"] is None)

    def add(self, owner: str, player: str) -> None:
        """A member row as if the player had joined (for the tests' starting state)."""
        now = self.now()
        role = "host" if owner == player else "member"
        self.rows.setdefault(owner, {})[player] = {
            "role": role, "joined": now, "opened": now, "left": None,
        }  # fmt: skip

    def join(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        player, owner, most = body["p_player_id"], body["p_island_owner"], body["p_max_members"]
        assert 2 <= most <= 50, "bad_game_join"
        if not self.island_exists(owner, player):
            return refused_game("no_such_game")
        if player in self.no_profile:
            return refused_game("player_not_set_up")
        rows = self.rows.setdefault(owner, {})
        before = rows.get(player)
        now = self.now()
        if player == owner:
            if before is None:
                rows[player] = {"role": "host", "joined": now, "opened": now, "left": None}
            else:
                before["opened"] = now
            repeat = before is not None
        elif before is not None and before["left"] is None:
            before["opened"] = now
            repeat = True
        else:
            members = self.active(owner)
            if members >= most:
                return refused_game("game_full", members)
            rows[player] = {"role": "member", "joined": now, "opened": now, "left": None}
            repeat = False
        role = "host" if player == owner else "member"
        reply = {"status": "joined", "role": role, "members": self.active(owner), "repeat": repeat}
        return httpx.Response(200, json=reply)

    def leave(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        player, owner = body["p_player_id"], body["p_island_owner"]
        if not self.island_exists(owner, player):
            return refused_game("no_such_game")
        if player == owner:
            return refused_game("host_cannot_leave")
        row = self.rows.get(owner, {}).get(player)
        if row is None or row["left"] is not None:
            return httpx.Response(200, json={"status": "left", "repeat": True})
        row["left"] = self.now()
        return httpx.Response(200, json={"status": "left", "repeat": False})

    def islands(self) -> list[dict]:
        return list(self.database.islands.values())

    def list(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        player, limit = body["p_player_id"], body["p_limit"]
        games = []
        for island in self.islands():
            owner = island["player_id"]
            row = self.rows.get(owner, {}).get(player)
            if owner != player and (row is None or row["left"] is not None):
                continue
            games.append(
                {
                    "code": island["code"],
                    "hostId": owner,
                    "hostName": self.database.names[owner],
                    "role": "host" if owner == player else "member",
                    "waveBest": island["wave_best"],
                    "members": self.active(owner),
                    # The SQL sorts ISO times; a zero-padded counter sorts the same way.
                    "openedAt": f"2026-11-12T00:00:{row['opened'] if row else 0:02d}Z",
                }
            )
        games.sort(key=lambda game: game["openedAt"], reverse=True)
        return httpx.Response(200, json=games[: max(1, min(limit, 50))])

    def members(self, request: httpx.Request) -> httpx.Response:
        owner = json.loads(request.content)["p_island_owner"]
        names = self.database.names
        listed = [{"id": owner, "name": names[owner], "role": "host"}]
        rows = sorted(self.rows.get(owner, {}).items(), key=lambda item: item[1]["joined"])
        listed += [
            {"id": who, "name": names[who], "role": "member"}
            for who, row in rows
            if who != owner and row["left"] is None
        ]
        return httpx.Response(200, json=listed)

    def read_membership(self, request: httpx.Request) -> httpx.Response:
        params = request.url.params
        assert params["left_at"] == "is.null"
        owner = params["island_owner"].removeprefix("eq.")
        player = params["player_id"].removeprefix("eq.")
        row = self.rows.get(owner, {}).get(player)
        found = row is not None and row["left"] is None
        return httpx.Response(200, json=[{"player_id": player}] if found else [])


def refused_game(reason: str, members: int = 0) -> httpx.Response:
    return httpx.Response(200, json={"status": "refused", "reason": reason, "members": members})


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

    def revive(self, headers=PLAYER, **body) -> httpx.Response:
        request = {"waveId": WAVE_ID, "fallen": "p-k3x9q2", "downAt": 412, "actionUid": "help-0001"}
        request.update(body)
        return self.client.post("/api/waves/revive", json=request, headers=headers)
