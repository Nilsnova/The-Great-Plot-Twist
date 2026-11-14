"""Wall health that stays after a wave (tasks T29-T32 and T47, decision D039, proposed).

Behind the feature flag "wall_recovery" (off by default). A wall keeps the health it had at the
end of its last wave, as a percent of its full health (islet_buildings.wall_health, 0 to 100,
written by island_walls_record() of 20261114100000_wall_recovery.sql). Below 100 it is damaged,
at 0 destroyed. It comes back to full in one of two ways:

  * a paid Repair or Rebuild between waves (wall_repair.py, island_wall_restore()), or
  * by itself, RECOVERY_SECONDS after the wave that left it damaged, by the server's clock
    (offline time counts; a later wave that ends with the wall still damaged starts it again).

The level never changes here: a destroyed wall keeps its level and is rebuilt at it, and an
upgrade is refused until the wall is whole again (needs_repair), so an upgrade never heals.

Pure functions only (no database). Used by: wall_repair.py and its tests.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue
from server.island.rules import engineer_price, kind_of

WALL = "wall"
FULL = 100  # percent: an intact wall
RECOVERY_SECONDS = 600  # a damaged or destroyed wall mends by itself 10 minutes after its wave
REBUILD_SHARE_PERCENT = 30  # a rebuild costs 30% of what the wall's levels cost to build


@dataclass(frozen=True)
class WallState:
    """One built wall as the database keeps it."""

    plot: str
    level: int
    health: int  # percent after its last wave; 100 for a wall that never took lasting damage
    damaged_at: datetime | None  # when the wave that left it damaged was recorded


def effective_health(wall: WallState, at: datetime) -> int:
    """The wall's health in percent at the time `at`: the stored value, or FULL once the
    recovery timer of its last wave has run out."""
    if wall.health >= FULL:
        return FULL
    if wall.damaged_at is not None and wall.damaged_at + recovery_time() <= at:
        return FULL
    return max(0, wall.health)


def recovery_time() -> timedelta:
    return timedelta(seconds=RECOVERY_SECONDS)


def recovers_at(wall: WallState, at: datetime) -> datetime | None:
    """When the wall mends by itself, or None (it is whole, or has no timer)."""
    if effective_health(wall, at) >= FULL or wall.damaged_at is None:
        return None
    return wall.damaged_at + recovery_time()


def rebuild_price(catalogue: IslandCatalogue, level: int) -> int:
    """30% (rounded up) of the catalogue prices of the wall's levels: 3, 9, 21, 45, 93 coins."""
    prices = kind_of(catalogue, WALL).prices
    paid = sum(prices[: max(1, min(level, len(prices)))])
    return max(1, (paid * REBUILD_SHARE_PERCENT + 99) // 100)


def full_price(catalogue: IslandCatalogue, level: int, role: str | None) -> int:
    """The price of a whole rebuild for this payer: an engineer pays less, as for a build."""
    return engineer_price(catalogue, rebuild_price(catalogue, level), role)


def restore_price(full: int, health: int) -> int:
    """What a Repair (damaged) or a Rebuild (destroyed) costs: the full price times the missing
    share, rounded up, at least 1 coin. island_wall_restore() does the same sum in SQL."""
    missing = FULL - max(0, min(FULL, health))
    return max(1, (full * missing + 99) // 100)


def wave_walls(walls: dict[str, WallState], at: datetime) -> dict[str, int]:
    """{wall spot: health percent} at the start of a wave, the same for every client of it."""
    return {plot: effective_health(wall, at) for plot, wall in sorted(walls.items())}


def needs_repair() -> ApiError:
    return ApiError(409, "needs_repair", "Repair this wall before you upgrade it.")


def check_upgradable(wall: WallState | None, at: datetime) -> None:
    """T47: an upgrade never heals a wall or skips its repair. 409 needs_repair otherwise."""
    if wall is not None and effective_health(wall, at) < FULL:
        raise needs_repair()
