"""Lifecycle integration guards used by authenticated server dependencies.

Reset/deletion orchestration is composed with the existing domain transaction
hooks. This first boundary never initializes a player or grants any authority.
"""

from server.errors import ApiError
from server.island.treasury import identifier
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


async def ensure_not_deleted(admin: SupabaseAdmin, actor_id: str) -> None:
    """A cached provider identity cannot restore access after a committed deletion."""
    reply = await admin.call_function(
        "island_lifecycle_actor_status", {"p_player_id": identifier(actor_id)}
    )
    if not isinstance(reply, dict) or set(reply) != {"status"}:
        raise SupabaseRejected("The database sent an unreadable player lifecycle status.")
    if reply["status"] == "deleted":
        raise ApiError(
            401,
            "unauthorized",
            "This player account is no longer active. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if reply["status"] != "active":
        raise SupabaseRejected("The database sent an unreadable player lifecycle status.")
