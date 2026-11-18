"""Checked effective position and exact snapshot for a fresh original-wall purchase.

The guarded SQL overload compares these raw rows and policy under the owner lock
before it materializes only this fresh wall's effective position and pays for it.
"""

from server.island import layout, layout_store
from server.supabase_admin import SupabaseAdmin


async def checked_layout(admin: SupabaseAdmin, owner: str, spot: str, more: bool) -> dict:
    snapshot = await layout_store.read_snapshot(admin, owner)
    geometry = layout.island_layout(more or snapshot.rule_version == 1)
    policy = {"wall_rule_version": snapshot.rule_version, "wall_capacity": snapshot.capacity}
    positions = layout.positions_of(geometry, layout_store.positions_from(snapshot.rows), **policy)
    x, z = positions[spot]
    layout.check_move(geometry, positions, spot, x, z, **policy)
    return {
        "p_x_half": round(x * 2),
        "p_z_half": round(z * 2),
        "p_seen": layout_store.seen_rows(snapshot.rows),
        "p_expected_rule_version": snapshot.rule_version,
        "p_expected_capacity": snapshot.capacity,
    }
