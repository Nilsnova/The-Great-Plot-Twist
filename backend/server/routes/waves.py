"""Wave routes: ring the bell for a pirate wave, and finish it for the loot.

The contract is docs/BUILD-PLAN.md section 3.4 (lane 0, task 0.3). The rules are in
backend/server/island/waves.py, the numbers in backend/content/islands.json, the database part in
supabase/migrations/20261110010000_islands_and_waves.sql. The simulation itself runs in every
browser (frontend/src/pirates/sim.js, BUILD-PLAN 3.5) from the seed this route hands out.

Both routes need a signed-in player (guests admitted with the class code too), then the flag
"islands" (404 feature_off), like routes/island.py. Both share one budget of requests per player.

POST /api/waves/start  {"where": "own" | "ISLE-K7Q2M" | "pirate_point", "actionUid": "..."}
    -> {"waveId": "6f1c...", "wave": 1, "seed": 123456789, "startsAt": "2026-11-10T12:00:10Z",
        "weather": {"kind": "storm", "label": "Storm: 50% more pirate ships",
                    "ships": 1.5, "fog": 0.0}}
    "where" is "own" (your island; made on first use), an island code (with or without "ISLE-",
    any case: a friend's island, or your own) or "pirate_point". The wave number is the best wave
    survived there plus one (at most 50). "startsAt" is when the ships come: now plus the
    10-second countdown. weather.kind is the real weather state of the default place (storm, fog,
    rain or calm); a storm gives ships 1.5, fog gives fog 0.4, anything else 1.0 and 0. When the
    weather cannot be read the sea is calm; the weather never stops a wave. A repeated actionUid
    answers with the same wave and its stored weather.
    Errors: 404 no_such_island, 409 wave_running (one wave per island at a time), 422
            validation_error, 429 too_many_requests, 404 feature_off, 401, 403, 502, 503

POST /api/waves/finish  {"waveId": "6f1c...", "survived": true, "shipsSunk": 7}
    -> {"loot": 25, "coins": 125, "waveBest": 1, "flags": 1}
    Only the player who rang the bell may finish. The server caps the loot: a survived wave n pays
    10 + 5 x n + 5 x (houses on that island; none on Pirate Point), a lost wave pays 0. A finish
    earlier than 15 seconds after "startsAt" is refused (409 wave_too_early, Retry-After) and the
    wave keeps running; a finish more than 900 seconds after it pays 0. waveBest and flags belong
    to the island of the wave (Pirate Point: its shared best wave and survived waves). A repeat
    answers with the stored loot and the coins now, and pays nothing more.
    Errors: 403 not_your_wave, 404 no_such_wave, 404 player_not_set_up, 409 wave_too_early,
            422 validation_error, 429 too_many_requests, 404 feature_off, 401, 403, 502,
            503 database_unavailable (the OUTCOME IS UNKNOWN: repeat the same finish; it is safe)

Used by: the bell and the wave bar of the game client (lane P).
"""

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from server.island import waves
from server.island.service import IslandCatalogueDep
from server.routes.island import ACTION_UID_PATTERN, IslandPlayerDep
from server.routes.weather import WeatherRulesDep, WeatherSourceDep
from server.supabase_admin import AdminDep
from server.weather.mapping import format_utc_time

router = APIRouter()

# "own", "pirate_point" or an island code with or without ISLE- (codes.read_code decides).
WHERE_PATTERN = r"^[A-Za-z0-9_ -]{1,32}$"
MAX_SHIPS_SUNK = 1000


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    where: str = Field(pattern=WHERE_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class FinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    waveId: UUID
    survived: StrictBool
    shipsSunk: StrictInt = Field(ge=0, le=MAX_SHIPS_SUNK)


class WeatherOut(BaseModel):
    kind: str
    label: str
    ships: float
    fog: float


class StartResponse(BaseModel):
    waveId: UUID
    wave: int
    seed: int
    startsAt: str
    weather: WeatherOut


class FinishResponse(BaseModel):
    loot: int
    coins: int
    waveBest: int
    flags: int


@router.post("/waves/start")
async def post_start(
    body: StartRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    source: WeatherSourceDep,
    state_rules: WeatherRulesDep,
    request: Request,
) -> StartResponse:
    request.app.state.wave_budget.spend(player.id)
    weather = await waves.current_weather(catalogue, source, state_rules)
    started = await waves.start(admin, catalogue, weather, player.id, body.where, body.actionUid)
    return StartResponse(
        waveId=started.wave_id,
        wave=started.wave,
        seed=started.seed,
        startsAt=format_utc_time(started.starts_at),
        weather=WeatherOut(
            kind=started.weather.kind,
            label=started.weather.label,
            ships=started.weather.ships,
            fog=started.weather.fog,
        ),
    )


@router.post("/waves/finish")
async def post_finish(
    body: FinishRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> FinishResponse:
    request.app.state.wave_budget.spend(player.id)
    finished = await waves.finish(
        admin, catalogue, player.id, body.waveId, body.survived, body.shipsSunk
    )
    return FinishResponse(
        loot=finished.loot,
        coins=finished.coins,
        waveBest=finished.wave_best,
        flags=finished.flags,
    )
