"""Version-aware shared member reads for the existing island HTTP routes.

Used by routes/island.py. Explicit legacy mode preserves its serializer; unknown state fails.
"""

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue
from server.island.economy_http import persisted_context, target_owner
from server.island.shared_snapshot import read_shared_snapshot
from server.supabase_admin import SupabaseAdmin


async def shared_read(
    admin: SupabaseAdmin,
    actor_id: str,
    catalogue: IslandCatalogue,
    version: str | None,
    code: str | None = None,
) -> dict | None:
    owner = await target_owner(admin, actor_id, code)
    context = await persisted_context(admin, actor_id, owner, allow_missing_own=code is None)
    if context is None or context.mode == "personal_legacy":
        return None
    if version != "1":
        raise ApiError(409, "economy_context_required", "This island requires economy version one.")
    return await read_shared_snapshot(admin, actor_id, owner, catalogue)


async def shared_demolish_quote(
    admin: SupabaseAdmin,
    actor_id: str,
    catalogue: IslandCatalogue,
    version: str | None,
    spot: str,
    code: str | None = None,
) -> dict | None:
    current = await shared_read(admin, actor_id, catalogue, version, code)
    if current is None:
        return None
    quote = next(
        (row for row in current["quotes"]["demolish"] if row["target"] == {"spot": spot}), None
    )
    if quote is None:
        raise ApiError(404, "no_such_spot", "That structure does not exist.")
    if quote["intent"] is None:
        raise ApiError(409, quote["reason"], "This structure has no eligible shared refund quote.")
    return {"quoteVersion": 1, "actorId": actor_id, "economy": current["economy"], "quote": quote}
