"""The wave service: ring the bell and finish a wave, for routes/waves.py.

    start()    a new wave on your own island, on a friend's island (by code) or on Pirate Point
    finish()   the result of a wave: the loot, the coins, the best wave and the flags

The weather of a wave is the real weather of the default place (the place of GET /api/weather,
WEATHER_PLACE_NAME in the settings), through the same cached source and the same state rules: a
storm brings 1.5 times the ships, fog hides them (0.4), anything else changes nothing. A weather
source that is down, or a rules file that cannot be read, never stops a wave: it is calm then.

The database decides everything that depends on time and on other players (wave_start and
wave_finish, see store.py): one running wave per island, the wave number, the countdown, the
minimum and maximum length, the loot cap and the payment.

Used by: routes/waves.py and the tests.
"""

import logging
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from server.adapters.base import CachedSource
from server.errors import ApiError
from server.game.islet_store import player_not_set_up
from server.island import store
from server.island.catalogue import IslandCatalogue, Weather
from server.island.codes import read_code
from server.island.rules import weather_for
from server.island.service import no_such_island
from server.island.store import Refusal
from server.supabase_admin import SupabaseAdmin, SupabaseRejected
from server.weather.mapping import map_reading
from server.weather.state_rules import StateRules
from server.weather.states import state_of

logger = logging.getLogger(__name__)

OWN = "own"
PIRATE_POINT = "pirate_point"
# A seed fits a 31-bit number, so JavaScript reads it without loss (wave_runs_seed_range).
SEED_LIMIT = 2**31


@dataclass(frozen=True)
class WaveStart:
    wave_id: UUID
    wave: int
    seed: int
    starts_at: datetime
    weather: Weather


@dataclass(frozen=True)
class WaveFinish:
    loot: int
    coins: int
    wave_best: int
    flags: int


async def current_weather(
    catalogue: IslandCatalogue, source: CachedSource, state_rules: StateRules | None
) -> Weather:
    """What the real weather does to the pirates now. Never raises: calm when it cannot tell."""
    state = None
    try:
        result = await source.get()
        if state_rules is not None:
            state = state_of(map_reading(result.data.reading), state_rules)
    except Exception as error:  # the weather must never stop a wave, whatever went wrong
        logger.warning("Wave weather unavailable (%s); the sea is calm.", type(error).__name__)
    return weather_for(catalogue, state)


async def find_place(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, where: str
) -> tuple[str, str | None]:
    """("island", owner id) or ("pirate_point", None) for "own", an island code or Pirate Point."""
    if where == PIRATE_POINT:
        return PIRATE_POINT, None
    if where == OWN:
        island = await store.open_island(admin, player_id, catalogue.starting_coins)
        return "island", island.owner
    code = read_code(where)
    island = await store.find_island(admin, code) if code is not None else None
    if island is None:
        raise no_such_island()
    return "island", island.owner


def start_refusal(refusal: Refusal) -> ApiError:
    if refusal.reason == "no_such_island":
        return no_such_island()
    if refusal.reason == "wave_running":
        return ApiError(409, "wave_running", "A wave is already under way on this island.")
    return SupabaseRejected()


async def start(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    weather: Weather,
    player_id: str,
    where: str,
    action_uid: str,
    make_seed: Callable[[int], int] = secrets.randbelow,
) -> WaveStart:
    """Ring the bell. A repeated actionUid answers with the same wave (and its weather)."""
    place, owner = await find_place(admin, catalogue, player_id, where)
    timing = catalogue.waves
    arguments = {
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_place": place,
        "p_island_owner": owner,
        "p_seed": make_seed(SEED_LIMIT),
        "p_countdown_seconds": timing.countdown_seconds,
        "p_minimum_seconds": timing.minimum_seconds,
        "p_maximum_seconds": timing.maximum_seconds,
        "p_highest_wave": timing.highest_wave,
        "p_weather_kind": weather.kind,
        "p_weather_ships": weather.ships,
        "p_weather_fog": weather.fog,
    }
    reply = await store.start_wave(admin, arguments)
    if isinstance(reply, Refusal):
        raise start_refusal(reply)
    # A repeat carries the weather stored with the wave, which may differ from the weather now.
    stored = weather_for(catalogue, reply.weatherKind)
    wave_weather = Weather(stored.kind, stored.label, reply.ships, reply.fog)
    return WaveStart(reply.waveId, reply.wave, reply.seed, reply.startsAt, wave_weather)


def finish_refusal(refusal: Refusal) -> ApiError:
    if refusal.reason == "player_not_set_up":
        return player_not_set_up()
    if refusal.reason == "no_such_wave":
        return ApiError(404, "no_such_wave", "There is no such wave.")
    if refusal.reason == "not_your_wave":
        return ApiError(
            403, "not_your_wave", "Only the captain who rang the bell can end this wave."
        )
    if refusal.reason == "too_early":
        wait = max(1, refusal.wait_seconds)
        message = f"The wave is not over yet. Try again in {wait} seconds."
        return ApiError(409, "wave_too_early", message, headers={"Retry-After": str(wait)})
    return SupabaseRejected()


async def finish(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    wave_id: UUID,
    survived: bool,
    ships_sunk: int,
) -> WaveFinish:
    """End a wave. A repeat answers with the stored result and pays nothing more."""
    loot = catalogue.loot
    arguments = {
        "p_player_id": player_id,
        "p_wave_id": str(wave_id),
        "p_survived": survived,
        "p_ships_sunk": ships_sunk,
        "p_loot_base": loot.base,
        "p_loot_per_wave": loot.per_wave,
        "p_loot_per_house": loot.per_house,
    }
    reply = await store.finish_wave(admin, arguments)
    if isinstance(reply, Refusal):
        raise finish_refusal(reply)
    return WaveFinish(reply.loot, reply.balance, reply.waveBest, reply.flags)
