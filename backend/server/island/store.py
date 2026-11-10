"""Island and wave database access: the reads and the four database functions.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on
the server only. The secret key skips row-level security, so the filter on the verified player id
in each read is the ONLY thing that keeps another player's rows out of an answer. The functions
are in supabase/migrations/20261110010000_islands_and_waves.sql:

    island_open(player, code, startingCoins)   the island with its code, and the starting coins
    wave_start(...)                            ring the bell; one running wave per island
    wave_finish(...)                           the result, the loot, the best wave and the flags

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
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# A new code collides with an existing one about once in 28.6 million; five tries are plenty.
CODE_TRIES = 5
# One player has at most 15 building rows (4 home islet plots and 11 island spots).
MAX_BUILDING_ROWS = 50


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


class NameRow(BaseModel):
    display_name: StrictStr


class StartedRow(BaseModel):
    status: Literal["started"]
    waveId: UUID
    wave: StrictInt
    seed: StrictInt
    startsAt: AwareDatetime
    weatherKind: StrictStr
    ships: float
    fog: float
    repeat: StrictBool


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
class Refusal:
    """A database function said no. Nothing changed."""

    reason: str
    wait_seconds: int = 0


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
            return Island(player_id, checked_code(row.code), row.waveBest, row.flags)
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


async def read_built_spots(admin: SupabaseAdmin, player_id: str) -> dict[str, str]:
    """{plot: building type} of every building that stands on the player's island."""
    query = {
        "select": "plot,building_type",
        "player_id": f"eq.{player_id}",
        "order": "plot.asc",
        "limit": str(MAX_BUILDING_ROWS),
    }
    rows = await admin.select_rows("islet_buildings", query)
    built = {}
    for row in rows:
        checked = read_model(BuildingRow, row)
        built[checked.plot] = checked.building_type
    return built


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


async def start_wave(admin: SupabaseAdmin, arguments: dict[str, Any]) -> StartedRow | Refusal:
    """Run wave_start. The arguments are built by service.py with the names of the SQL."""
    reply = await admin.call_function("wave_start", arguments)
    return refusal_or_none(reply) or read_model(StartedRow, reply)


async def finish_wave(admin: SupabaseAdmin, arguments: dict[str, Any]) -> FinishedRow | Refusal:
    """Run wave_finish. Errors (all ApiErrors): 502 database_error, 503 the outcome is unknown."""
    reply = await admin.call_function("wave_finish", arguments)
    return refusal_or_none(reply) or read_model(FinishedRow, reply)
