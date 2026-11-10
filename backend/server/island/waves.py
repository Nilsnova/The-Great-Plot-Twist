"""The wave service: ring the bell and finish a wave, for routes/waves.py.

    start()    a new wave on your own island, on a friend's island (by code) or on Pirate Point
    join()     join a running wave, so a friend or a Pirate Point captain fights it too
    current()  the running wave of an island or of Pirate Point, or None
    finish()   one participant's result: their own loot, the coins, the best wave and the flags

The weather of a new wave comes from wave_weather.py (the bell-ringer's area, else the default
place, else calm); a joined or current wave carries the weather stored with it. A Pirate Point wave
says flagship: true, so the client shows the flagship that only the three lamps can sink.

The database decides everything that depends on time and on other players (wave_start, wave_join,
wave_current and wave_finish, see store.py): one running wave per island, who is in a wave, the
wave number, the countdown, the minimum and maximum length, each player's loot and payment.

Used by: routes/waves.py and the tests.
"""

import secrets
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from server.errors import ApiError
from server.game.islet_store import player_not_set_up
from server.island import store
from server.island.catalogue import IslandCatalogue, Weather
from server.island.codes import read_code
from server.island.rules import weather_for
from server.island.service import no_such_island
from server.island.store import Refusal, WaveRow
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

OWN = "own"
PIRATE_POINT = "pirate_point"
# A seed fits a 31-bit number, so JavaScript reads it without loss (wave_runs_seed_range).
SEED_LIMIT = 2**31


@dataclass(frozen=True)
class WaveStart:
    """A wave as start, join and current answer it."""

    wave_id: UUID
    wave: int
    seed: int
    starts_at: datetime
    weather: Weather
    flagship: bool  # True on Pirate Point: the flagship only the three lamps can sink


@dataclass(frozen=True)
class WaveFinish:
    loot: int
    coins: int
    wave_best: int
    flags: int


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
    return wave_of(catalogue, reply)


def wave_of(catalogue: IslandCatalogue, row: WaveRow) -> WaveStart:
    """The wave of a database answer, with the weather stored with it (which may differ from the
    weather now)."""
    stored = weather_for(catalogue, row.weatherKind)
    weather = Weather(stored.kind, stored.label, row.ships, row.fog)
    flagship = row.place == PIRATE_POINT
    return WaveStart(row.waveId, row.wave, row.seed, row.startsAt, weather, flagship)


async def join(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, wave_id: UUID
) -> WaveStart:
    """Join a running wave (a friend's island or Pirate Point). Safe to repeat."""
    reply = await store.join_wave(admin, player_id, str(wave_id))
    if isinstance(reply, Refusal):
        if reply.reason == "no_such_wave":
            raise no_such_wave()
        if reply.reason == "wave_over":
            raise ApiError(409, "wave_over", "This wave is over. Ring the bell for the next one.")
        if reply.reason == "player_not_set_up":
            raise player_not_set_up()
        raise SupabaseRejected()
    return wave_of(catalogue, reply)


async def current(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, where: str
) -> WaveStart | None:
    """The running wave of "own", an island code or Pirate Point, or None."""
    place, owner = await find_place(admin, catalogue, player_id, where)
    row = await store.current_wave(admin, place, owner)
    return None if row is None else wave_of(catalogue, row)


def no_such_wave() -> ApiError:
    return ApiError(404, "no_such_wave", "There is no such wave.")


def finish_refusal(refusal: Refusal) -> ApiError:
    if refusal.reason == "player_not_set_up":
        return player_not_set_up()
    if refusal.reason == "no_such_wave":
        return no_such_wave()
    if refusal.reason == "not_in_wave":
        return ApiError(403, "not_in_wave", "Join the wave first: you are not in this wave.")
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
    """End this player's part of a wave. A repeat answers the stored result and pays nothing."""
    loot = catalogue.loot
    arguments = {
        "p_player_id": player_id,
        "p_wave_id": str(wave_id),
        "p_survived": survived,
        "p_ships_sunk": ships_sunk,
        "p_loot_base": loot.base,
        "p_loot_per_wave": loot.per_wave,
        "p_loot_per_house": loot.per_house,
        "p_point_loot_base": loot.pirate_point_base,
    }
    reply = await store.finish_wave(admin, arguments)
    if isinstance(reply, Refusal):
        raise finish_refusal(reply)
    return WaveFinish(reply.loot, reply.balance, reply.waveBest, reply.flags)
