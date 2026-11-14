"""Wave routes: ring the bell, join a running wave, find it, and finish your part for the loot.

The contract is docs/BUILD-PLAN.md section 3.4 (lane 0, tasks 0.3 and 0.4). The rules are in
backend/server/island/waves.py, the numbers in backend/content/islands.json, the database part in
supabase/migrations/20261110010000_islands_and_waves.sql and 20261110020000_wave_crews.sql. The
simulation runs in every browser (frontend/src/pirates/sim.js, BUILD-PLAN 3.5) from the seed.

Every route needs a signed-in player (guests admitted with the class code too), then the flag
"islands" (404 feature_off), like routes/island.py. start, join and finish share one budget of
20 requests a minute per player; current has its own of 30 (a friend sailing in may ask often).

The wave shape (start, join, current):
    {"waveId": "6f1c...", "wave": 1, "seed": 123456789, "startsAt": "2026-11-10T12:00:10Z",
     "weather": {"kind": "storm", "label": "Storm: 50% more pirate ships", "ships": 1.5,
                 "fog": 0.0},
     "flagship": false, "boss": false}
    flagship is true on Pirate Point: the flagship that only the three lamps can sink. boss is true
    on every 5th wave (5, 10, ...): a warship comes, and the loot of that wave pays twice.

POST /api/waves/start  {"where": "own" | "ISLE-K7Q2M" | "pirate_point", "actionUid": "..."}
    -> the wave. "where" is "own" (your island; made on first use), an island code (with or
    without "ISLE-", any case) or "pirate_point". On an island the wave number is the won wave
    plus one, or after a lost wave the best wave minus 2 (at least 1); on Pirate Point the best
    wave won there plus one; at most 100. "startsAt" is now plus the 10-second countdown. The
    bell-ringer is the first participant. weather.kind is the real weather state where the bell
    was rung (Vercel's city-level geo headers, never stored), else of the default place, else
    calm: storm gives ships 1.5, fog gives fog 0.4, anything else 1.0 and 0. The weather never
    stops a wave. A repeated actionUid answers the same wave with its stored weather.
    "walls" (decision D039, proposed; only while the flag wall_recovery is on, else the key is
    left out): {wall spot: health percent} the wave's walls start with, worked out by the
    server at "startsAt" (join and current answer the same); left out on Pirate Point. Every
    client of the wave feeds these to its simulation.
    Errors: 404 no_such_island, 409 wave_running (one wave per island at a time)

POST /api/waves/join  {"waveId": "6f1c..."}
    -> the wave. Only while it runs (nobody finished it yet, not past 900 s after startsAt).
    Joining again answers the same wave. A wave on somebody else's island needs a member of
    that game (GAME-V3 section 2; the owner always), a Pirate Point wave is open to everybody.
    Errors: 403 not_member, 404 no_such_wave, 409 wave_over

GET /api/waves/current?where=own | ISLE-K7Q2M | pirate_point
    -> the running wave there, or null. Errors: 404 no_such_island

POST /api/waves/finish  {"waveId": "6f1c...", "survived": true, "shipsSunk": 7,
                         "bonuses": ["galleon"], "walls": {"wall_1": 40, "wall_2": 0}}
    -> {"loot": 15, "coins": 115, "waveBest": 1, "flags": 1, "boss": false}
    bonuses (optional, v3 waves, docs/GAME-V3.md 4.2 and 4.3): "galleon" (the treasure galleon was
    sunk) and "finisher" (a boss finisher was won) add 20 + 4 x n and 15 + 3 x n to the base of a
    won wave n (content/wave_events.json), only on an island wave whose seed brings the galleon or
    on a boss wave; any other bonus is dropped, never refused.
    walls (optional, decision D039, proposed; ignored while the flag wall_recovery is off):
    every wall's health in percent (0 to 100) when the finishing player's simulation ended the
    wave. The first finish of an island wave keeps them (island_walls_record()); later
    finishes, Pirate Point waves and spots without a wall change nothing. A wall below 100
    starts the next wave damaged and mends by itself 10 minutes later.
    Every participant finishes their own part, once. A survived wave n pays this player
    10 + 5 x n + 5 x (house levels on that island), on Pirate Point 20 + 5 x n, twice that on a
    boss wave; a lost wave pays 0. A
    finish earlier than 15 seconds after "startsAt" is refused (409 wave_too_early, Retry-After)
    and changes nothing; more than 900 seconds after it pays 0. The first finish closes the wave
    for new joins; the island's best wave and one flag are counted once, at the first survived
    finish. waveBest and flags belong to the island of the wave (Pirate Point: its own). A repeat
    answers the stored loot and the coins now, and pays nothing more.
    Errors: 403 not_in_wave (never joined), 404 no_such_wave, 404 player_not_set_up,
            409 wave_too_early, 503 database_unavailable (outcome unknown: repeat the same finish)

POST /api/waves/revive  {"waveId": "6f1c...", "fallen": "p-k3x9q2", "downAt": 412,
                         "actionUid": "..."}
    -> {"price": 35, "coins": 80, "repeat": false}
    Captain health (docs/GAME-V3.md section 3): the signed-in player stood next to a fallen
    teammate, held E for 2 s, and pays for helping them up: 20 + 5 x the wave number
    (islands.json "revive"; the database reads the wave number), 25% less rounded down on an
    island with a Tavern (a house role, docs/GAME-V3.md "Houses": the database checks the
    island's buildings, so "price" is what was paid). "fallen" is the teammate's id
    in the wave's simulation, recorded only: the fall and the standing up happen in every
    browser. Only a member of the game (the island's owner always; Pirate Point: everybody)
    who is in the wave and has not finished it yet, while it runs. One payment per actionUid
    (ledger reason captain_revive, ref revive:<actionUid>): a repeat pays nothing and answers
    the first price with repeat true. "downAt" is the tick of the fall in the simulation (the
    same in every browser): one fall is paid for once, so when two teammates help the same
    fallen captain up at the same moment the first pays and the second is refused already_up
    and pays nothing. Shares the budget of start, join and finish.
    Errors: 403 not_member, 403 not_in_wave, 404 no_such_wave, 404 player_not_set_up,
            409 wave_over, 409 insufficient_funds, 409 already_up

Every route also: 401, 403 demo_closed, 404 feature_off, 422 validation_error, 429
too_many_requests, 502 database_error, 503 database_unavailable.

Used by: the bell, the wave bar and the Pirate Point battle of the game client (lane P).
"""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from server.flags import is_enabled
from server.island import wall_repair, waves
from server.island.service import IslandCatalogueDep
from server.island.wave_weather import wave_weather
from server.island.waves import WaveStart
from server.lock.place import place_from_headers
from server.routes.island import ACTION_UID_PATTERN, IslandPlayerDep
from server.routes.weather import WeatherRulesDep, WeatherSourceDep
from server.settings import Settings, SettingsDep
from server.supabase_admin import AdminDep, SupabaseAdmin
from server.weather.mapping import format_utc_time

router = APIRouter()

# "own", "pirate_point" or an island code with or without ISLE- (codes.read_code decides).
WHERE_PATTERN = r"^[A-Za-z0-9_ -]{1,32}$"
# A captain's id in the wave's simulation (frontend/src/pirates/sync.js BY).
CAPTAIN_PATTERN = r"^[A-Za-z0-9_.:-]{1,64}$"
MAX_SHIPS_SUNK = 1000
# D039: a wall spot of the island (wall_1 .. wall_99) and its health in percent at a wave's end.
WALL_SPOT = Annotated[str, Field(pattern=r"^wall_[0-9]{1,2}$")]
WALL_HEALTH = Annotated[StrictInt, Field(ge=0, le=100)]
MAX_WALLS = 24


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    where: str = Field(pattern=WHERE_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class JoinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveId: UUID


class FinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveId: UUID
    survived: StrictBool
    shipsSunk: StrictInt = Field(ge=0, le=MAX_SHIPS_SUNK)
    # v3 waves: the treasure galleon sunk, a boss finisher won (paid only where the wave allows it).
    bonuses: list[Literal["galleon", "finisher"]] | None = Field(default=None, max_length=2)
    # D039: the health of every wall when this player's simulation ended the wave (percent).
    walls: dict[WALL_SPOT, WALL_HEALTH] | None = Field(default=None, max_length=MAX_WALLS)


class ReviveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveId: UUID
    fallen: str = Field(pattern=CAPTAIN_PATTERN)
    # The tick of the fall in the wave's simulation (50 ms ticks; a wave lasts at most 900 s).
    downAt: StrictInt = Field(ge=0, le=100_000)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class ReviveResponse(BaseModel):
    price: int
    coins: int
    repeat: bool


class WeatherOut(BaseModel):
    kind: str
    label: str
    ships: float
    fog: float


class WaveResponse(BaseModel):
    waveId: UUID
    wave: int
    seed: int
    startsAt: str
    weather: WeatherOut
    flagship: bool
    boss: bool
    # D039: {wall spot: health percent} the wave's walls start with; null on Pirate Point.
    walls: dict[str, int] | None = None


class FinishResponse(BaseModel):
    loot: int
    coins: int
    waveBest: int
    flags: int
    boss: bool


async def start_walls(
    admin: SupabaseAdmin, settings: Settings, wave: WaveStart
) -> dict[str, int] | None:
    """D039: the walls a wave starts with, only while the flag wall_recovery is on (it needs
    the 20261114100000_wall_recovery.sql migration). Off: no "walls" in the answer at all."""
    if not is_enabled("wall_recovery", settings.flags):
        return None
    return await wall_repair.walls_for_wave(admin, wave)


def wave_out(wave: WaveStart, walls: dict[str, int] | None = None) -> WaveResponse:
    return WaveResponse(
        waveId=wave.wave_id,
        wave=wave.wave,
        seed=wave.seed,
        startsAt=format_utc_time(wave.starts_at),
        weather=WeatherOut(
            kind=wave.weather.kind,
            label=wave.weather.label,
            ships=wave.weather.ships,
            fog=wave.weather.fog,
        ),
        flagship=wave.flagship,
        boss=wave.boss,
        walls=walls,
    )


@router.post("/waves/start", response_model_exclude_none=True)
async def post_start(
    body: StartRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    source: WeatherSourceDep,
    state_rules: WeatherRulesDep,
    request: Request,
) -> WaveResponse:
    request.app.state.wave_budget.spend(player.id)
    # The ringer's area from Vercel's geo headers, for this request only: never stored or logged.
    area = place_from_headers(request.headers)
    weather = await wave_weather(
        catalogue, source, state_rules, request.app.state.lock_weather, area
    )
    started = await waves.start(admin, catalogue, weather, player.id, body.where, body.actionUid)
    return wave_out(started, await start_walls(admin, settings, started))


@router.post("/waves/join", response_model_exclude_none=True)
async def post_join(
    body: JoinRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> WaveResponse:
    request.app.state.wave_budget.spend(player.id)
    joined = await waves.join(admin, catalogue, player.id, body.waveId)
    return wave_out(joined, await start_walls(admin, settings, joined))


@router.get("/waves/current", response_model_exclude_none=True)
async def get_current(
    where: Annotated[str, Query(pattern=WHERE_PATTERN)],
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> WaveResponse | None:
    request.app.state.wave_read_budget.spend(player.id)
    running = await waves.current(admin, catalogue, player.id, where)
    if running is None:
        return None
    return wave_out(running, await start_walls(admin, settings, running))


@router.post("/waves/finish")
async def post_finish(
    body: FinishRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    settings: SettingsDep,
    request: Request,
) -> FinishResponse:
    request.app.state.wave_budget.spend(player.id)
    finished = await waves.finish(
        admin,
        catalogue,
        player.id,
        body.waveId,
        body.survived,
        body.shipsSunk,
        sorted(set(body.bonuses or [])),
    )
    # D039: the first finish of an island wave keeps its walls' health for the next wave.
    if is_enabled("wall_recovery", settings.flags):
        await wall_repair.record(admin, player.id, body.waveId, body.walls)
    return FinishResponse(
        loot=finished.loot,
        coins=finished.coins,
        waveBest=finished.wave_best,
        flags=finished.flags,
        boss=finished.boss,
    )


@router.post("/waves/revive")
async def post_revive(
    body: ReviveRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> ReviveResponse:
    request.app.state.wave_budget.spend(player.id)
    revived = await waves.revive(
        admin, catalogue, player.id, body.waveId, body.fallen, body.downAt, body.actionUid
    )
    return ReviveResponse(price=revived.price, coins=revived.coins, repeat=revived.repeat)
