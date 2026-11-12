"""Home islet database access: the reads, the build function and the finale's question.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on the
server only. The secret key skips row-level security, so the filter on the verified player id in
each read is the ONLY thing that keeps another player's rows out of an answer. The tests check
every filter. Reads use select_rows. The one write is a database function, run with call_function:
  * islet_build   the one atomic build: the coins, the timber and the building row in a single step
(supabase/migrations/20261106070000_home_islet.sql explains it.)

Three tables are read: wallets (the coins), islets (the timber, one row per player, made by the
first build) and islet_buildings (one row per building that stands).

The finale (packages S3 and L3) asks one question of this file: does this player have a signal
station? Use players_with_signal_station for a crew, or has_signal_station_built for one player.
A signal station is never removed or downgraded (island_demolish() of 20261112080000_demolish.sql
tears down only island build spots and refuses every home islet plot), so the answer can only
change from "no" to "yes". A check made before the finale's own transaction stays
true. In SQL the same fact is:
    exists (select 1 from public.islet_buildings
             where player_id = <player> and building_type = 'signal_station')

Used by: islet_service.py and, for the finale, the case code (packages S3 and L3).
"""

import logging
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import AwareDatetime, BaseModel, StrictInt, StrictStr, ValidationError

from server.errors import ApiError
from server.game.building import StandingBuilding
from server.game.building_catalogue import MAX_SPOTS, SIGNAL_STATION, Cost
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

BUILDING_COLUMNS = "plot,building_type,level,built_at"

# One crew has at most four seats, so the finale never asks about more than four players.
MAX_FINALE_PLAYERS = 4


@dataclass(frozen=True)
class BuildOutcome:
    """The answer of the database function islet_build. Either done, or refused with a reason."""

    done: bool
    balance: int = 0  # done: the wallet balance after the build
    timber: int = 0  # done: the timber held after the build
    level: int = 0  # done: the level that was built
    reason: str = ""  # refused: player_not_set_up, plot_occupied or not_enough_timber
    standing: str | None = None  # refused (plot_occupied): the building that stands there
    timber_held: int = 0  # refused (not_enough_timber): the timber the player holds


# The rows we read, as small models. The database sends plain JSON, and a model checks that each
# row looks the way we expect. StrictInt and StrictStr mean "no conversions": the text "70" is not
# accepted where a number belongs. AwareDatetime refuses a time without a time zone.
class WalletRow(BaseModel):
    balance: StrictInt


class IsletRow(BaseModel):
    timber: StrictInt


class BuildingRow(BaseModel):
    plot: StrictStr
    building_type: StrictStr
    level: StrictInt
    built_at: AwareDatetime


class PlayerRow(BaseModel):
    player_id: StrictStr


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def player_not_set_up() -> ApiError:
    """The 404 for a signed-in player who has no wallet row. It says the same as GET /api/me."""
    message = "Your player record is not set up yet. Ask the team to reset your account."
    return ApiError(404, "player_not_set_up", message)


def read_row(model: type[BaseModel], row: object) -> Any:
    """Check one row from the database against its model. A row we cannot read becomes a 502."""
    try:
        return model.model_validate(row)
    except ValidationError as error:
        # Say nothing about the row itself: it holds data. The model's name is enough.
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise unreadable() from error


def whole_number(value: object) -> int:
    """A whole number from the database function. A bool is not one, although Python says so."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise unreadable()
    return value


async def read_coins(admin: SupabaseAdmin, player_id: str) -> int:
    """The player's coins. The wallet row exists for every player (the sign-up trigger)."""
    query = {"select": "balance", "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("wallets", query)
    if not rows:
        logger.warning("A signed-in player has no wallet row.")
        raise player_not_set_up()
    return read_row(WalletRow, rows[0]).balance


async def read_timber(admin: SupabaseAdmin, player_id: str) -> int | None:
    """The timber the player holds, or None if the player has no islet row yet (no build so far)."""
    query = {"select": "timber", "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("islets", query)
    if not rows:
        return None
    return read_row(IsletRow, rows[0]).timber


async def read_buildings(admin: SupabaseAdmin, player_id: str) -> list[StandingBuilding]:
    """The buildings that stand on the player's islet: one per spot, so at most MAX_SPOTS."""
    query = {
        "select": BUILDING_COLUMNS,
        "player_id": f"eq.{player_id}",
        "order": "plot.asc",
        "limit": str(MAX_SPOTS),
    }
    rows = await admin.select_rows("islet_buildings", query)
    buildings = []
    for row in rows:
        checked = read_row(BuildingRow, row)
        buildings.append(
            StandingBuilding(checked.plot, checked.building_type, checked.level, checked.built_at)
        )
    return buildings


async def build_exists(admin: SupabaseAdmin, player_id: str, ref: str) -> bool:
    """True if this player has already built with this ref (the same click, sent again).

    islet_build() refuses a repeated ref too, and that is the lock that cannot be passed. This
    read comes first, so that a repeat is always answered "already applied", whatever else has
    changed since.
    """
    query = {"select": "plot", "player_id": f"eq.{player_id}", "ref": f"eq.{ref}", "limit": "1"}
    rows = await admin.select_rows("islet_buildings", query)
    return len(rows) > 0


def build_arguments(
    player_id: str,
    plot: str,
    building_type: str,
    cost: Cost,
    starter_timber: int,
    ref: str,
) -> dict[str, Any]:
    """The arguments of islet_build. The names are the parameter names in the SQL.

    The prices and the starter pack come from buildings.json, so the numbers live in one place and
    the database only compares against what it is given.
    """
    return {
        "p_player_id": player_id,
        "p_plot": plot,
        "p_building_type": building_type,
        "p_coins": cost.coins,
        "p_timber": cost.timber,
        "p_starter_timber": starter_timber,
        "p_ref": ref,
    }


def read_build_reply(reply: object) -> BuildOutcome:
    """Understand the JSON that islet_build returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return BuildOutcome(
            done=True,
            balance=whole_number(reply.get("balance")),
            timber=whole_number(reply.get("timber")),
            level=whole_number(reply.get("level")),
        )
    if reply.get("status") == "refused" and isinstance(reply.get("reason"), str):
        standing = reply.get("standing")
        if standing is not None and not isinstance(standing, str):
            raise unreadable()
        return BuildOutcome(
            done=False,
            reason=reply["reason"],
            standing=standing,
            timber_held=whole_number(reply.get("timberHeld", 0)),
        )
    raise unreadable()


async def run_build(admin: SupabaseAdmin, arguments: dict[str, Any]) -> BuildOutcome:
    """Run the atomic database function islet_build.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      InsufficientFunds (409)    not enough coins; nothing changed
      AlreadyApplied (409)       this ref was used before; nothing changed
      SupabaseRejected (502)     the database refused the call or sent an answer we cannot read
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; look the ref up before you retry
    """
    reply = await admin.call_function("islet_build", arguments)
    return read_build_reply(reply)


def canonical_player_id(player_id: str) -> str:
    """The id in the one spelling the database uses. Raises ValueError if it is not a uuid."""
    try:
        return str(uuid.UUID(player_id))
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError("A player id must be a uuid.") from error


async def players_with_signal_station(
    admin: SupabaseAdmin, player_ids: Sequence[str]
) -> frozenset[str]:
    """The players among player_ids whose islet has a signal station. One read, at most 4 ids.

    The ids come from the server's own records (the seats of a crew), never from a player, so an id
    that is not a uuid, or more than four ids, is a bug: it raises ValueError and asks nobody. The
    answer holds the ids in the spelling the caller used.
    """
    if len(player_ids) > MAX_FINALE_PLAYERS:
        raise ValueError(f"Ask about at most {MAX_FINALE_PLAYERS} players at a time (one crew).")
    spelled = {player_id: canonical_player_id(player_id) for player_id in player_ids}
    if not spelled:
        return frozenset()
    query = {
        "select": "player_id",
        "building_type": f"eq.{SIGNAL_STATION}",
        "player_id": f"in.({','.join(spelled.values())})",
        "limit": str(MAX_FINALE_PLAYERS),
    }
    rows = await admin.select_rows("islet_buildings", query)
    found = {read_row(PlayerRow, row).player_id for row in rows}
    return frozenset(player_id for player_id, canonical in spelled.items() if canonical in found)


async def has_signal_station_built(admin: SupabaseAdmin, player_id: str) -> bool:
    """True if this player has built a signal station on their islet."""
    return player_id in await players_with_signal_station(admin, [player_id])
