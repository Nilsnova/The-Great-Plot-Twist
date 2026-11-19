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
    effective = layout.positions_of(rules, saved)[spot_id]
    layout.check_wall_scenery(rules, spot_id, effective)

    current = layout.spot_named(rules, spot_id)
    assert current is not None  # checked by the ordinary purchase catalogue
    raw = saved.get(spot_id, (current.x, current.z))
    # A checked legacy position that actually changed needs a saved coordinate inside the
    # purchase. Existing matching rows and implicit defaults need no write.
    materialize = raw != effective
    return {
        "p_seen": layout_store.seen_rows(rows),
        "p_x_half": round(effective[0] * layout_store.HALF),
        "p_z_half": round(effective[1] * layout_store.HALF),
        "p_materialize": materialize,
        "p_recovery_version": recovery_version,
        "p_hidden_extra_plots": (
            [plot for plot, _wave in catalogue.extra_tower_spots]
            if recovery_v1 and not catalogue.more_tower_spots else []
        ),
        "p_existing_extra_spots": runtime.more_tower_spots,
    }
