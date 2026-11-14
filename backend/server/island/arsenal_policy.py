"""Who may use an island's arsenal (T40, D042): ONE place for the rule, so task T37 can replace it.

The policy today (an assumption until T37's permission matrix is agreed):

    action   who may            who pays
    look     any active member  nobody
    buy      any active member  the buyer, from their own coins (there is no shared wallet)
    take     any active member  nobody (withdraw, or swap for the copy you carry)
    return   any active member  nobody

The host (the island's owner) is always a member. The same rule is written once more in SQL,
arsenal_may() in supabase/migrations/20261114120000_arsenal.sql, which the database checks under
the island lock (a member who left a moment ago is refused there). Change both together.

Used by: arsenal.py.
"""

from server.island import games
from server.island.store import Island
from server.supabase_admin import SupabaseAdmin

ACTIONS = ("look", "buy", "take", "return")
# action -> who may: "member" means any active member of the island's game, the host included.
WHO_MAY = {action: "member" for action in ACTIONS}


async def require_permission(
    admin: SupabaseAdmin, island: Island, player_id: str, action: str
) -> None:
    """Refuse (403 not_member) unless the player may do `action` at this island's arsenal."""
    if action not in WHO_MAY:
        raise ValueError(f"Unknown arsenal action '{action}'.")
    if island.owner == player_id:
        return
    await games.require_member(admin, island, player_id)
