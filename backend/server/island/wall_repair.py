"""Wall recovery with the database (tasks T31, T32, T47, decision D039, proposed).

    look()             every built wall of an island: health, timer and Repair/Rebuild price
    restore()          Repair a damaged wall or Rebuild a destroyed one between waves, paid once
    check_upgrade()    refuse an upgrade of a damaged wall (409 needs_repair)
    record()           the wall health at the end of a wave, kept by its first finish
    walls_for_wave()   the wall health a wave starts with, the same for every client of it

Everything here runs only while the feature flag "wall_recovery" is on (the routes check it),
because it needs the columns and functions of supabase/migrations/20261114100000_wall_recovery.sql.
The rules (prices, the 10-minute timer) are in wall_health.py. A Repair and a Rebuild are one
database function, island_wall_restore(): it takes the coins and makes the wall whole in ONE
step, works the price out from the wall's health as it is at that moment and refuses while a
wave runs on the island, so two clicks at once pay once and never heal above full.

Used by: routes/wall_recovery.py, routes/island.py (upgrade) and routes/waves.py.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, StrictInt, StrictStr

from server.errors import ApiError
from server.game import islet_store
from server.island import permissions, service, store, wall_health
from server.island.catalogue import IslandCatalogue
from server.island.rules import find_spot
from server.island.store import Island, Refusal, read_model
from server.island.wall_health import WallState
from server.island.waves import WaveStart
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

MAX_WALL_ROWS = 50


class WallRow(BaseModel):
    plot: StrictStr
    level: StrictInt
    wall_health: StrictInt
    wall_damaged_at: AwareDatetime | None = None


@dataclass(frozen=True)
class WallView:
    """One built wall as GET /api/island/walls shows it."""

    plot: str
    level: int
    health: int
    recovers_at: datetime | None
    repair_cost: int | None  # None while the wall is whole


@dataclass(frozen=True)
class WallsView:
    coins: int  # the caller's coins
    walls: tuple[WallView, ...]


async def read_walls(admin: SupabaseAdmin, owner: str) -> dict[str, WallState]:
    """{plot: WallState} of every wall that stands on the island of `owner`."""
    query = {
        "select": "plot,level,wall_health,wall_damaged_at",
        "player_id": f"eq.{owner}",
        "building_type": "eq.wall",
        "order": "plot.asc",
        "limit": str(MAX_WALL_ROWS),
    }
    walls = {}
    for row in await admin.select_rows("islet_buildings", query):
        checked = read_model(WallRow, row)
        walls[checked.plot] = WallState(
            checked.plot, checked.level, checked.wall_health, checked.wall_damaged_at
        )
    return walls


async def look(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    at: datetime,
    code: str | None = None,
) -> WallsView:
    """The walls of the player's own island, or of the island with `code` (whoever may visit
    it may look, D043). The prices are the caller's (an engineer pays less)."""
    island = await island_of(admin, catalogue, player_id, code)
    return await view_of(admin, catalogue, island, player_id, at)


async def island_of(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, code: str | None
) -> Island:
    if code is None:
        return await store.open_island(admin, player_id, catalogue.starting_coins)
    island = await service.find_by_code(admin, code)
    if island.owner != player_id:  # D043: who may look at a game's island, as for a visit
        await permissions.require_action(admin, island.owner, player_id, permissions.ISLAND_VISIT)
    return island


async def view_of(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, island: Island, payer: str, at: datetime
) -> WallsView:
    role = (await store.read_progress(admin, payer)).role
    walls = []
    for wall in (await read_walls(admin, island.owner)).values():
        health = wall_health.effective_health(wall, at)
        full = wall_health.full_price(catalogue, wall.level, role)
        price = None if health >= wall_health.FULL else wall_health.restore_price(full, health)
        when = wall_health.recovers_at(wall, at)
        walls.append(WallView(wall.plot, wall.level, health, when, price))
    coins = await islet_store.read_coins(admin, payer)
    return WallsView(coins, tuple(walls))


def restore_refusal(refusal: Refusal) -> ApiError:
    """The error for a Repair or Rebuild that island_wall_restore() refused. Nothing changed."""
    if refusal.reason == "intact":
        return ApiError(409, "intact", "This wall is whole already.")
    if refusal.reason == "wave_running":
        return ApiError(409, "wave_running", "Repair it between waves, or press E at it now.")
    if refusal.reason == "not_built":
        return ApiError(409, "not_built", "Build a wall on this spot first.")
    if refusal.reason == "wrong_kind":
        return ApiError(422, "wrong_kind", "Only walls are repaired here.")
    if refusal.reason in ("insufficient_funds", "player_not_set_up"):
        return service.paid_refusal(refusal, "The repair")
    return SupabaseRejected()


async def restore(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    action_uid: str,
    at: datetime,
    code: str | None = None,
) -> WallsView:
    """Repair (damaged) or Rebuild (destroyed) the wall on `spot_id`, on the player's own island
    or, with `code`, on the island of a game they are a member of; the clicker pays. The kind
    and level stay. 404 no_such_spot, 404 no_such_island, 403 not_member, 409 not_built, 422
    wrong_kind, 409 intact, 409 wave_running, 409 insufficient_funds. A repeated actionUid
    charges nothing and answers the walls as they are now."""
    # D043 (T37): repair and rebuild have the same row (members, paid by the clicker).
    island, _ = await service.target_island(admin, catalogue, player_id, code, permissions.REPAIR)
    spot = find_spot(catalogue, spot_id)
    wall = (await read_walls(admin, island.owner)).get(spot.id)
    role = (await store.read_progress(admin, player_id)).role
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_plot": spot.id,
        "p_action_uid": action_uid,
        # The price of a whole rebuild; the database takes the missing share of it.
        "p_full_price": wall_health.full_price(catalogue, wall.level if wall else 1, role),
        "p_recover_seconds": wall_health.RECOVERY_SECONDS,
    }
    outcome = await store.run_paid(admin, "island_wall_restore", arguments)
    if isinstance(outcome, Refusal):
        raise restore_refusal(outcome)
    return await view_of(admin, catalogue, island, player_id, at)


async def check_upgrade(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    at: datetime,
    code: str | None = None,
) -> None:
    """T47: 409 needs_repair when the spot holds a damaged or destroyed wall. Other spots, and
    a code the player may not build on, are left to the upgrade itself to answer."""
    if not spot_id.startswith(wall_health.WALL):
        return
    island = await island_of(admin, catalogue, player_id, code)
    wall_health.check_upgradable((await read_walls(admin, island.owner)).get(spot_id), at)


async def record(
    admin: SupabaseAdmin, player_id: str, wave_id: UUID, walls: dict[str, int] | None
) -> None:
    """Keep the wall health a finishing player's simulation ended the wave with. Only the first
    finish of an island wave counts (island_walls_record() keeps one record per wave); Pirate
    Point and a finish without walls are left alone. The browser's numbers cannot be proven,
    like its `survived`: they are bounded to 0..100 and to the walls that stand on that island."""
    if not walls:
        return
    arguments = {"p_player_id": player_id, "p_wave_id": str(wave_id), "p_walls": walls}
    reply = await admin.call_function("island_walls_record", arguments)
    if not isinstance(reply, dict) or reply.get("status") not in ("recorded", "repeat", "skipped"):
        raise store.unreadable()


async def walls_for_wave(admin: SupabaseAdmin, wave: WaveStart) -> dict[str, int] | None:
    """{wall spot: health percent} for an island wave, worked out at its startsAt, so a friend
    who joins later starts the same walls; None on Pirate Point (its walls start whole)."""
    where = await store.read_wave_place(admin, str(wave.wave_id))
    if where is None or where.place != "island" or where.island_owner is None:
        return None
    return wall_health.wave_walls(await read_walls(admin, where.island_owner), wave.starts_at)
