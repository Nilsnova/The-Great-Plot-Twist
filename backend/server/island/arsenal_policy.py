"""Who may use an island's arsenal (T40, D042): the arsenal's four actions mapped onto the co-op
permission matrix of T37 (permissions.py, D043), which is the one place the rule lives in Python.

    arsenal action   permissions.py action   who may            who pays
    look             island_visit            host and members   nobody
    buy              arsenal_buy             host and members   the buyer (no shared wallet)
    take             arsenal_withdraw        host and members   nobody (withdraw, or a swap)
    return           arsenal_return          host and members   nobody

The database checks the same rule again under the island lock: arsenal_may() in
supabase/migrations/20261114120000_arsenal.sql (a member who left a moment ago is refused there).
If D043's matrix changes for these actions, change arsenal_may() with it.

Used by: arsenal.py.
"""

from server.island import permissions
from server.island.store import Island
from server.supabase_admin import SupabaseAdmin

ACTIONS = ("look", "buy", "take", "return")
# arsenal action -> the permissions.py action it is checked as.
MATRIX_ACTION = {
    "look": permissions.ISLAND_VISIT,
    "buy": permissions.ARSENAL_BUY,
    "take": permissions.ARSENAL_WITHDRAW,
    "return": permissions.ARSENAL_RETURN,
}


async def require_permission(
    admin: SupabaseAdmin, island: Island, player_id: str, action: str
) -> permissions.Permit:
    """403 not_member unless the player may do `action` at this island's arsenal; else the
    Permit (their role, and who pays: the player for a buy, nobody otherwise)."""
    if action not in MATRIX_ACTION:
        raise ValueError(f"Unknown arsenal action '{action}'.")
    return await permissions.require_action(admin, island.owner, player_id, MATRIX_ACTION[action])
