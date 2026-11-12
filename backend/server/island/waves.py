"""The wave service: ring the bell and finish a wave, for routes/waves.py.

    start()    a new wave on your own island, on a friend's island (by code) or on Pirate Point
    join()     join a running wave, so a friend or a Pirate Point captain fights it too
    current()  the running wave of an island or of Pirate Point, or None
    finish()   one participant's result: their own loot, the coins, the best wave and the flags
    revive()   a teammate helps a fallen captain up and pays 20 + 5 x wave (GAME-V3 section 3)

Tower defense v2 (docs/TOWER-DEFENSE.md): up to wave 100, every 5th wave a boss wave (boss: true,
its loot pays twice), and after a lost island wave the next bell rings the best wave minus 2 (at
least 1). The database keeps both rules (wave_start and the 11-argument wave_finish of
20261111030000_tower_defense.sql); the numbers come from islands.json.

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
from server.island import games, store, wave_events
from server.island.catalogue import IslandCatalogue, Weather
from server.island.codes import read_code
from server.island.rules import is_boss, loot_rates, weather_for
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
    boss: bool  # every 5th wave (islands.json bossEvery): a warship, and the loot pays twice


@dataclass(frozen=True)
class WaveRevive:
    price: int  # what the helper paid (also on a repeat: what the first click paid)
    coins: int  # the helper's coins after it
    repeat: bool


@dataclass(frozen=True)
class WaveFinish:
    loot: int
    coins: int
    wave_best: int
    flags: int
    boss: bool


async def find_place(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    where: str,
    members_only: bool = False,
) -> tuple[str, str | None]:
    """("island", owner id) or ("pirate_point", None) for "own", an island code or Pirate Point.
    With members_only (the bell), somebody else's island needs a member of its game (403)."""
    if where == PIRATE_POINT:
        return PIRATE_POINT, None
    if where == OWN:
        island = await store.open_island(admin, player_id, catalogue.starting_coins)
        return "island", island.owner
    code = read_code(where)
    island = await store.find_island(admin, code) if code is not None else None
    if island is None:
        raise no_such_island()
    if members_only:
        await games.require_member(admin, island, player_id)
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
    place, owner = await find_place(admin, catalogue, player_id, where, members_only=True)
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
    boss = is_boss(catalogue, row.wave)
    return WaveStart(row.waveId, row.wave, row.seed, row.startsAt, weather, flagship, boss)


async def join(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, wave_id: UUID
) -> WaveStart:
    """Join a running wave (a friend's island or Pirate Point). Safe to repeat.

    The joiner's own island is opened first: their best won wave (the unlocks) is kept on it,
    so a friend who never opened their own island still gets the credit for a won wave.
    A wave on somebody else's island needs a member of its game (GAME-V3 section 2, 403
    not_member; the owner always); Pirate Point is open to everybody."""
    where = await store.read_wave_place(admin, str(wave_id))
    if where is None:
        raise no_such_wave()
    if where.place == "island" and where.island_owner is not None:
        await games.require_member_of(admin, where.island_owner, player_id)
    await store.open_island(admin, player_id, catalogue.starting_coins)
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
    bonuses: list[str] | None = None,
) -> WaveFinish:
    """End this player's part of a wave. A repeat answers the stored result and pays nothing.
    Past wave lateFrom the loot grows more slowly (rules.loot_rates): the wave's number is read
    first, so the rates go to wave_finish as plain arguments. v3 waves: `bonuses` (the treasure
    galleon sunk, a boss finisher won) raise the base, but only those the wave's place, number and
    seed allow (wave_events.allowed_bonuses); the boss multiplier applies after, like all loot."""
    loot = catalogue.loot
    base, per_wave, point_base = loot.base, loot.per_wave, loot.pirate_point_base
    if loot.late_from or bonuses:
        where = await store.read_wave_place(admin, str(wave_id))
        if where is not None and where.wave is not None:
            if loot.late_from:
                base, per_wave, point_base = loot_rates(loot, where.wave)
            allowed = wave_events.allowed_bonuses(
                bonuses,
                place=where.place,
                wave=where.wave,
                seed=where.seed,
                boss_every=catalogue.waves.boss_every,
            )
            base += wave_events.bonus_base(allowed, where.wave)
    arguments = {
        "p_player_id": player_id,
        "p_wave_id": str(wave_id),
        "p_survived": survived,
        "p_ships_sunk": ships_sunk,
        "p_loot_base": base,
        "p_loot_per_wave": per_wave,
        "p_loot_per_house": loot.per_house,
        "p_point_loot_base": point_base,
        "p_boss_every": catalogue.waves.boss_every,
        "p_boss_multiplier": loot.boss_multiplier,
        "p_restart_back": catalogue.waves.restart_back,
    }
    reply = await store.finish_wave(admin, arguments)
    if isinstance(reply, Refusal):
        raise finish_refusal(reply)
    return WaveFinish(reply.loot, reply.balance, reply.waveBest, reply.flags, reply.boss)


def revive_refusal(refusal: Refusal) -> ApiError:
    if refusal.reason == "player_not_set_up":
        return player_not_set_up()
    if refusal.reason == "no_such_wave":
        return no_such_wave()
    if refusal.reason == "not_member":
        return games.not_member()
    if refusal.reason == "not_in_wave":
        return ApiError(403, "not_in_wave", "Join the wave first: you are not in this wave.")
    if refusal.reason == "wave_over":
        return ApiError(409, "wave_over", "This wave is over: everybody stands up at the break.")
    if refusal.reason == "insufficient_funds":
        message = f"Helping a captain up costs {refusal.price} coins. You need more coins."
        return ApiError(409, "insufficient_funds", message)
    if refusal.reason == "already_up":
        # Two helpers of one fall: the first paid, this one pays nothing.
        return ApiError(409, "already_up", "Already up: a teammate helped them first.")
    return SupabaseRejected()


async def revive(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    wave_id: UUID,
    fallen: str,
    down_at: int,
    action_uid: str,
) -> WaveRevive:
    """Captain health (docs/GAME-V3.md section 3): the signed-in player helped a fallen captain
    up in this wave and pays catalogue.revive.base + per_wave x the wave number (the database
    reads the wave number itself). Only a member of the game (on an island; the owner always)
    who is in the wave and has not finished it, while it runs. A repeated actionUid pays nothing
    more and answers the same price. The fall and the standing up are the browsers' (the wave's
    simulation); fallen and down_at (the tick of the fall, the same in every browser) name one
    fall, which is paid for once: a second helper of it is refused already_up."""
    where = await store.read_wave_place(admin, str(wave_id))
    if where is None:
        raise no_such_wave()
    if where.place == "island" and where.island_owner is not None:
        await games.require_member_of(admin, where.island_owner, player_id)
    arguments = {
        "p_player_id": player_id,
        "p_wave_id": str(wave_id),
        "p_fallen": fallen,
        "p_down_at": down_at,
        "p_action_uid": action_uid,
        "p_base": catalogue.revive.base,
        "p_per_wave": catalogue.revive.per_wave,
    }
    reply = await store.revive_captain(admin, arguments)
    if isinstance(reply, Refusal):
        raise revive_refusal(reply)
    return WaveRevive(reply.price, reply.balance, reply.repeat)
