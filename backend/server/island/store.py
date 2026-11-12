"""Island and wave database access: the reads and the four database functions.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on
the server only. The secret key skips row-level security, so the filter on the verified player id
in each read is the ONLY thing that keeps another player's rows out of an answer. The functions
are in supabase/migrations/20261110010000_islands_and_waves.sql:

    island_open(player, code, startingCoins)   the island with its code, and the starting coins
    wave_start(...)                            ring the bell; one running wave per island
    wave_join(player, wave)                    join a running wave (20261110020000_wave_crews.sql)
    wave_current(place, owner)                 the running wave of an island, or null
    wave_finish(...)                           one participant's result, loot, best wave, flags
                                               (the 11-argument version of
                                               20261111030000_tower_defense.sql: boss loot, the
                                               restart rule, house levels)
    island_upgrade, island_hire, island_captain, pp_build, pp_upgrade
                                               the paid actions of tower defense v2 (same file)
    island_learn_skill, island_weapon_buy, island_weapon_equip
                                               the captain's skills and weapons
                                               (20261112030000_captain_skills.sql)
    wave_revive(...)                           a teammate helps a fallen captain up and pays
                                               (20261112050000_captain_revive.sql)

A build goes through islet_build() of the home islet (islet_store.py) with a timber price of 0.

Used by: service.py and the tests.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, StrictBool, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.game.islet_store import player_not_set_up
from server.island.codes import CODE_FORMAT, new_code
from server.island.rules import Built
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# A new code collides with an existing one about once in 28.6 million; five tries are plenty.
CODE_TRIES = 5
# One player has at most 26 building rows (4 home islet plots and 22 island spots).
MAX_BUILDING_ROWS = 50
PROGRESS_COLUMNS = (
    "wave_best,next_wave,crew_gunner,crew_carpenter,crew_lookout,captain_level,won_wave_best,"
    "captain_skills,weapons_owned,weapon_equipped,wreck_paid"
)
# The Tech hub's research of an island (20261112060000_tech_hub.sql): at most one row per branch.
MAX_RESEARCH_ROWS = 10


class OpenRow(BaseModel):
    status: Literal["open"]
    code: StrictStr
    waveBest: StrictInt
    flags: StrictInt
    created: StrictBool
    paid: StrictInt


class IslandRow(BaseModel):
    player_id: StrictStr
    code: StrictStr
    wave_best: StrictInt
    flags: StrictInt


class BuildingRow(BaseModel):
    plot: StrictStr
    building_type: StrictStr
    level: StrictInt
    spec: StrictStr | None = None


class ResearchRow(BaseModel):
    branch: StrictStr


class PointBuildingRow(BaseModel):
    spot: StrictStr
    kind: StrictStr
    level: StrictInt


class ProgressRow(BaseModel):
    wave_best: StrictInt
    next_wave: StrictInt | None
    crew_gunner: StrictInt
    crew_carpenter: StrictInt
    crew_lookout: StrictInt
    captain_level: StrictInt
    won_wave_best: StrictInt
    captain_skills: list[StrictStr]
    weapons_owned: list[StrictStr]
    weapon_equipped: StrictStr
    wreck_paid: StrictInt = 0


class LearnedRow(BaseModel):
    """The answer of island_learn_skill."""

    status: Literal["done"]
    skills: list[StrictStr]
    points: StrictInt
    repeat: StrictBool


class EquippedRow(BaseModel):
    """The answer of island_weapon_equip."""

    status: Literal["done"]
    weapon: StrictStr


class PaidRow(BaseModel):
    """The answer of a paid action (island_upgrade, island_hire, island_captain, pp_*)."""

    status: Literal["done"]
    balance: StrictInt
    repeat: StrictBool


class PaidRefusedRow(BaseModel):
    status: Literal["refused"]
    reason: StrictStr
    price: StrictInt = 0


class WaveBestRow(BaseModel):
    wave: StrictInt


class NameRow(BaseModel):
    display_name: StrictStr


class WaveRow(BaseModel):
    """A wave as wave_start, wave_join and wave_current answer it."""

    status: Literal["started", "joined", "running"]
    waveId: UUID
    wave: StrictInt
    seed: StrictInt
    startsAt: AwareDatetime
    weatherKind: StrictStr
    ships: float
    fog: float
    place: Literal["island", "pirate_point"]
    repeat: StrictBool = False


class FinishedRow(BaseModel):
    status: Literal["done"]
    loot: StrictInt
    balance: StrictInt
    survived: StrictBool
    wave: StrictInt
    waveBest: StrictInt
    flags: StrictInt
    expired: StrictBool
    repeat: StrictBool
    boss: StrictBool = False


class RefusedRow(BaseModel):
    status: Literal["refused"]
    reason: StrictStr
    waitSeconds: StrictInt = 0


@dataclass(frozen=True)
class Island:
    """A player's island: the owner, the 5 symbols of its code, the best wave and the flags."""

    owner: str
    code: str
    wave_best: int
    flags: int


@dataclass(frozen=True)
class Progress:
    """What tower defense v2 keeps on the island row."""

    wave_best: int
    next_wave: int | None  # None: the next bell rings wave_best + 1
    crew: dict[str, int]  # {"gunner": 0, "carpenter": 0, "lookout": 0}
    captain_level: int
    won_wave_best: int
    skills: tuple[str, ...] = ()  # the captain's learnt skills, in the order learnt
    weapons_owned: tuple[str, ...] = ("musket",)
    weapon_equipped: str = "musket"
    wreck_paid: int = 0  # the coins paid into this island's wreck so far (GAME-V3 section 4)

    @property
    def unlock_wave(self) -> int:
        """The best wave this player won: their island's best, or any wave they fought in and won
        (any island, a friend's too, or Pirate Point)."""
        return max(self.wave_best, self.won_wave_best)


@dataclass(frozen=True)
class Paid:
    """A paid action that went through (or was a repeat)."""

    balance: int
    repeat: bool


@dataclass(frozen=True)
class Refusal:
    """A database function said no. Nothing changed."""

    reason: str
    wait_seconds: int = 0
    price: int = 0


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def read_model(model: type[BaseModel], value: object) -> Any:
    """Check one answer against its model. An answer we cannot read becomes a 502."""
    try:
        return model.model_validate(value)
    except ValidationError as error:
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise unreadable() from error


def checked_code(code: str) -> str:
    if not CODE_FORMAT.fullmatch(code):
        raise unreadable()
    return code


async def open_island(
    admin: SupabaseAdmin,
    player_id: str,
    starting_coins: int,
    make_code: Callable[[], str] = new_code,
) -> Island:
    """The player's island, made the first time with a new code (and the starting coins, once)."""
    island, _ = await open_island_made(admin, player_id, starting_coins, make_code)
    return island


async def open_island_made(
    admin: SupabaseAdmin,
    player_id: str,
    starting_coins: int,
    make_code: Callable[[], str] = new_code,
) -> tuple[Island, bool]:
    """open_island() and whether the island was made just now (POST /api/games says so)."""
    for _ in range(CODE_TRIES):
        reply = await admin.call_function(
            "island_open",
            {"p_player_id": player_id, "p_code": make_code(), "p_starting_coins": starting_coins},
        )
        status = reply.get("status") if isinstance(reply, dict) else None
        if status == "missing":
            raise player_not_set_up()
        if status != "code_taken":
            row = read_model(OpenRow, reply)
            return Island(player_id, checked_code(row.code), row.waveBest, row.flags), row.created
    logger.error("No free island code after %s tries.", CODE_TRIES)
    raise ApiError(503, "island_unavailable", "Your island could not be opened. Try again soon.")


async def find_island(admin: SupabaseAdmin, code: str) -> Island | None:
    """The island with this code (5 symbols, already checked), or None."""
    query = {"select": "player_id,code,wave_best,flags", "code": f"eq.{code}", "limit": "1"}
    rows = await admin.select_rows("islands", query)
    if not rows:
        return None
    row = read_model(IslandRow, rows[0])
    return Island(row.player_id, checked_code(row.code), row.wave_best, row.flags)


async def read_built_spots(admin: SupabaseAdmin, player_id: str) -> dict[str, Built]:
    """{plot: Built(kind, level)} of every building that stands on the player's island."""
    query = {
        "select": "plot,building_type,level,spec",
        "player_id": f"eq.{player_id}",
        "order": "plot.asc",
        "limit": str(MAX_BUILDING_ROWS),
    }
    rows = await admin.select_rows("islet_buildings", query)
    built = {}
    for row in rows:
        checked = read_model(BuildingRow, row)
        built[checked.plot] = Built(checked.building_type, checked.level, checked.spec)
    return built


async def read_research(admin: SupabaseAdmin, owner: str) -> tuple[str, ...]:
    """The research branches done on the island of `owner` (island_research), in branch order."""
    query = {
        "select": "branch",
        "island_owner": f"eq.{owner}",
        "order": "branch.asc",
        "limit": str(MAX_RESEARCH_ROWS),
    }
    rows = await admin.select_rows("island_research", query)
    return tuple(read_model(ResearchRow, row).branch for row in rows)


async def read_progress(admin: SupabaseAdmin, player_id: str) -> Progress:
    """The island row's tower defense columns. The island exists (open_island ran first)."""
    query = {"select": PROGRESS_COLUMNS, "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("islands", query)
    if not rows:
        raise unreadable()
    row = read_model(ProgressRow, rows[0])
    crew = {"gunner": row.crew_gunner, "carpenter": row.crew_carpenter, "lookout": row.crew_lookout}
    return Progress(
        row.wave_best,
        row.next_wave,
        crew,
        row.captain_level,
        row.won_wave_best,
        tuple(row.captain_skills),
        tuple(row.weapons_owned),
        row.weapon_equipped,
        row.wreck_paid,
    )


async def ledger_has(admin: SupabaseAdmin, player_id: str, reason: str, ref: str) -> bool:
    """True if this player's wallet already has the row of this action (a repeated click)."""
    query = {
        "select": "id",
        "player_id": f"eq.{player_id}",
        "reason": f"eq.{reason}",
        "ref": f"eq.{ref}",
        "limit": "1",
    }
    return len(await admin.select_rows("wallet_transactions", query)) > 0


async def run_paid(admin: SupabaseAdmin, name: str, arguments: dict[str, Any]) -> Paid | Refusal:
    """Run one of the paid functions. A refusal changed nothing."""
    reply = await admin.call_function(name, arguments)
    if isinstance(reply, dict) and reply.get("status") == "refused":
        refused = read_model(PaidRefusedRow, reply)
        return Refusal(refused.reason, price=refused.price)
    row = read_model(PaidRow, reply)
    return Paid(row.balance, row.repeat)


async def skill_learnt(admin: SupabaseAdmin, player_id: str, ref: str) -> bool:
    """True if this click (ref skill:<uid>) learnt a skill already (a repeated click)."""
    query = {"select": "ref", "player_id": f"eq.{player_id}", "ref": f"eq.{ref}", "limit": "1"}
    return len(await admin.select_rows("captain_skill_learns", query)) > 0


async def learn_skill(admin: SupabaseAdmin, arguments: dict[str, Any]) -> LearnedRow | Refusal:
    """Run island_learn_skill. A refusal changed nothing."""
    reply = await admin.call_function("island_learn_skill", arguments)
    if isinstance(reply, dict) and reply.get("status") == "refused":
        return Refusal(read_model(PaidRefusedRow, reply).reason)
    return read_model(LearnedRow, reply)


async def equip_weapon(admin: SupabaseAdmin, player_id: str, weapon: str) -> EquippedRow | Refusal:
    """Run island_weapon_equip. A refusal changed nothing."""
    reply = await admin.call_function(
        "island_weapon_equip", {"p_player_id": player_id, "p_weapon": weapon}
    )
    if isinstance(reply, dict) and reply.get("status") == "refused":
        return Refusal(read_model(PaidRefusedRow, reply).reason)
    return read_model(EquippedRow, reply)


async def read_point_buildings(admin: SupabaseAdmin) -> dict[str, Built]:
    """{spot: Built(kind, level)} of every building on Pirate Point (shared, not secret)."""
    query = {"select": "spot,kind,level", "order": "spot.asc", "limit": str(MAX_BUILDING_ROWS)}
    rows = await admin.select_rows("pirate_point_buildings", query)
    built = {}
    for row in rows:
        checked = read_model(PointBuildingRow, row)
        built[checked.spot] = Built(checked.kind, checked.level)
    return built


async def read_point_wave_best(admin: SupabaseAdmin) -> int:
    """The best wave won on Pirate Point (the waves with flag_counted)."""
    query = {
        "select": "wave",
        "place": "eq.pirate_point",
        "flag_counted": "is.true",
        "order": "wave.desc",
        "limit": "1",
    }
    rows = await admin.select_rows("wave_runs", query)
    return read_model(WaveBestRow, rows[0]).wave if rows else 0


async def read_display_name(admin: SupabaseAdmin, player_id: str) -> str:
    """The captain name other players see (profiles.display_name)."""
    query = {"select": "display_name", "id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("profiles", query)
    if not rows:
        raise unreadable()  # the island row exists, so the profile must exist (cascade)
    return read_model(NameRow, rows[0]).display_name


def refusal_or_none(reply: object) -> Refusal | None:
    if isinstance(reply, dict) and reply.get("status") == "refused":
        row = read_model(RefusedRow, reply)
        return Refusal(row.reason, row.waitSeconds)
    return None


async def start_wave(admin: SupabaseAdmin, arguments: dict[str, Any]) -> WaveRow | Refusal:
    """Run wave_start. The arguments are built by waves.py with the names of the SQL."""
    reply = await admin.call_function("wave_start", arguments)
    return refusal_or_none(reply) or read_model(WaveRow, reply)


class WavePlaceRow(BaseModel):
    place: Literal["island", "pirate_point"]
    island_owner: StrictStr | None = None
    wave: StrictInt | None = None
    seed: StrictInt | None = None  # v3 waves: the wave's event follows from it (wave_events.py)


async def read_wave_place(admin: SupabaseAdmin, wave_id: str) -> WavePlaceRow | None:
    """Where a wave runs (an island and its owner, or Pirate Point), its number and seed."""
    query = {"select": "place,island_owner,wave,seed", "id": f"eq.{wave_id}", "limit": "1"}
    rows = await admin.select_rows("wave_runs", query)
    return read_model(WavePlaceRow, rows[0]) if rows else None


async def join_wave(admin: SupabaseAdmin, player_id: str, wave_id: str) -> WaveRow | Refusal:
    """Run wave_join: the player joins a running wave (safe to repeat)."""
    reply = await admin.call_function("wave_join", {"p_player_id": player_id, "p_wave_id": wave_id})
    return refusal_or_none(reply) or read_model(WaveRow, reply)


async def current_wave(admin: SupabaseAdmin, place: str, owner: str | None) -> WaveRow | None:
    """Run wave_current: the running wave of an island or Pirate Point, or None."""
    reply = await admin.call_function("wave_current", {"p_place": place, "p_island_owner": owner})
    return None if reply is None else read_model(WaveRow, reply)


class RevivedRow(BaseModel):
    """The answer of wave_revive: what the helper paid and their coins after it."""

    status: Literal["done"]
    price: StrictInt
    balance: StrictInt
    repeat: StrictBool


async def revive_captain(admin: SupabaseAdmin, arguments: dict[str, Any]) -> RevivedRow | Refusal:
    """Run wave_revive (captain health). A refusal changed nothing."""
    reply = await admin.call_function("wave_revive", arguments)
    if isinstance(reply, dict) and reply.get("status") == "refused":
        refused = read_model(PaidRefusedRow, reply)
        return Refusal(refused.reason, price=refused.price)
    return read_model(RevivedRow, reply)


async def finish_wave(admin: SupabaseAdmin, arguments: dict[str, Any]) -> FinishedRow | Refusal:
    """Run wave_finish. Errors (all ApiErrors): 502 database_error, 503 the outcome is unknown."""
    reply = await admin.call_function("wave_finish", arguments)
    return refusal_or_none(reply) or read_model(FinishedRow, reply)
