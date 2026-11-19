"""Take a snapshot of the actual layout before a fresh standard-wall purchase."""

from server.errors import ApiError
from server.island import layout, layout_store
from server.island.captain_recovery_policy import STRUCTURE_RECOVERY_VERSION
from server.island.catalogue import IslandCatalogue, catalogue_for_existing_structures
from server.island.rules import Built
from server.supabase_admin import SupabaseAdmin


async def checked_layout(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    owner: str,
    spot_id: str,
    built: dict[str, Built],
    recovery_version: int,
) -> dict:
    rows = await layout_store.read_rows(admin, owner)
    if rows is None:
        raise ApiError(503, "layout_unavailable", "Wall placement is not available yet.")
    recovery_v1 = recovery_version == STRUCTURE_RECOVERY_VERSION
    runtime = catalogue_for_existing_structures(catalogue, built) if recovery_v1 else catalogue
    rules = layout.island_layout(runtime.more_tower_spots)
    saved = layout_store.positions_from(rows)
    positions = layout.positions_of(rules, saved, built)
    effective = positions.get(spot_id)
    if effective is None:
        raise ApiError(409, "place_taken", layout.WALL_FULL_MESSAGE)
    current = layout.spot_named(rules, spot_id)
    assert current is not None  # checked by the ordinary purchase catalogue
    if rules.wall_perimeter:
        layout.check_move(rules, positions, spot_id, *effective)
        # Once bought, the wall must still stand in the same spot after a reload.
        materialize = saved.get(spot_id) != effective
    else:
        if scenery := layout.wall_scenery(rules, layout.box_of(rules, spot_id, effective)):
            raise layout.MoveRefused(409, "place_taken", f"That is too close to {scenery.name}.")
        materialize = saved.get(spot_id, (current.x, current.z)) != effective
    return {
        "p_seen": layout_store.seen_rows(rows),
        "p_x_half": round(effective[0] * layout_store.HALF),
        "p_z_half": round(effective[1] * layout_store.HALF),
        "p_materialize": materialize,
        "p_recovery_version": recovery_version,
        "p_hidden_extra_plots": (
            [plot for plot, _wave in catalogue.extra_tower_spots]
            if recovery_v1 and not catalogue.more_tower_spots
            else []
        ),
        "p_existing_extra_spots": runtime.more_tower_spots,
    }
