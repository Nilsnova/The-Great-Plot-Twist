"""Moving a build spot on the island's grid (T36, flexible placement, decision D041).

    move()   one spot (built or empty) to one cell of the grid, on your own island or, with
             `code`, on the island of a game you are a member of; free, between waves only

How a move is made:
  1. The island is found as for a build (service.target_island): your own, or a game's island
     whose permissions.py row MOVE allows you (host or member; 403 not_member otherwise).
  2. The island's stored cells are read. Moving the spot to where it stands already changes
     nothing and answers the island: a repeat is safe without a click id.
  3. layout.py checks the rules (grid, land, overlaps, a way from the heart to the beach).
  4. island_move() stores the cell under the island lock, between waves only, and only if the
     stored cells are still the ones step 3 checked. When another move came first it answers
     busy; the server then reads and checks once more before it gives up (409 busy).

Used by: routes/island_layout.py.
"""

from server.errors import ApiError
from server.island import layout, layout_store, permissions, service
from server.island.catalogue import IslandCatalogue, catalogue_for_existing_structures
from server.island.service import IslandView
from server.island.store import Island, Refusal
from server.supabase_admin import SupabaseAdmin

# One fresh read and check after a busy answer; a second busy goes back to the player.
TRIES = 2


def unavailable() -> ApiError:
    return ApiError(503, "layout_unavailable", "Moving buildings is not available yet.")


def move_refusal(refusal: Refusal) -> ApiError:
    """The error for a move that island_move() refused. Nothing was changed."""
    if refusal.reason == "wave_running":
        return ApiError(409, "wave_running", "A wave is under way. Move buildings between waves.")
    if refusal.reason == "busy":
        return ApiError(409, "busy", "Someone else moved a building just now. Try again.")
    return ApiError(404, "no_such_island", "There is no island with that code.")


async def try_move(
    admin: SupabaseAdmin,
    island: Island,
    mover: str,
    spot_id: str,
    where: layout.Position,
    more: bool = False,
) -> Refusal | None:
    """One read, check and store. None when the spot stands at `where` afterwards."""
    rows = await layout_store.read_rows(admin, island.owner)
    if rows is None:
        raise unavailable()
    rules = layout.island_layout(more)  # D060: with the extra tower spots while they are offered
    positions = layout.positions_of(rules, layout_store.positions_from(rows))
    if positions.get(spot_id) == where:
        return None  # it stands there already: nothing to do
    layout.check_move(rules, positions, spot_id, where[0], where[1])
    return await layout_store.save_move(admin, island.owner, mover, spot_id, where, rows)


async def move(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    x: float,
    z: float,
    code: str | None = None,
) -> IslandView:
    """Move `spot_id` to (x, z) and answer the island after the move (with the mover's coins).

    Errors (ApiErrors): 404 feature_off (the flag "placement" is off), 404 no_such_island,
    403 not_member, 404 no_such_spot, 422 off_grid, 409 not_on_land, 409 place_taken,
    409 blocks_route, 409 wave_running, 409 busy,
    503 layout_unavailable (the layout table is not there yet), 502 database_error,
    503 database_unavailable.
    """
    if not catalogue.placement:
        raise ApiError(404, "feature_off", "Moving buildings is not open yet.")
    island, payer = await service.target_island(admin, catalogue, player_id, code, permissions.MOVE)
    runtime_catalogue = catalogue
    if (
        await service.read_recovery_version(admin, island.owner)
        == service.STRUCTURE_RECOVERY_VERSION
    ):
        built = await service.store.read_built_spots(admin, island.owner)
        runtime_catalogue = catalogue_for_existing_structures(catalogue, built)
    refusal = None
    for _ in range(TRIES):
        refusal = await try_move(
            admin, island, player_id, spot_id, (x, z), runtime_catalogue.more_tower_spots
        )
        if refusal is None or refusal.reason != "busy":
            break
    if refusal is not None:
        raise move_refusal(refusal)
    return await service.look_open(admin, catalogue, island, payer)
