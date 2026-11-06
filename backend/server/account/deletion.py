"""Delete a player: one database call that removes the login and everything that belongs to it.

"Delete my data" calls the database function delete_player (supabase/migrations/
20261106020000_accounts.sql). It deletes the login (the row in auth.users), and the database
removes the rest by cascade: the profile, save, wallet, ALL ledger rows, seats, Island Exchange
positions and trades, the name re-roll and every table that a later package ties to the player.
Before that, it hands a crew that the player started and that other players sit in to the player in
the lowest seat, so friends keep their game. The ledger keeps nothing about the player (decision
D022). That handover happens only in this function: deleting a user in the Supabase dashboard
(Authentication > Users) skips it and deletes every crew the user started, with everyone's seats.

Not deleted: Supabase Auth's own audit log (the table auth.audit_log_entries, which can hold the
login e-mail address and an IP address, and which has no link to auth.users) and Supabase's
platform logs, which expire on Supabase's own schedule.

This file does not delete any row itself. The database function does it all in one step, so there is
never a half-deleted player. The server only passes the id of the verified player.

Used by: routes/delete_me.py.
"""

import logging
from typing import Any

from server.errors import ApiError
from server.supabase_admin import (
    AlreadyApplied,
    SupabaseAdmin,
    SupabaseRejected,
    SupabaseUnavailable,
)

logger = logging.getLogger(__name__)

DELETE_STATUSES = ("deleted", "not_found")


def delete_arguments(player_id: str) -> dict[str, Any]:
    """The arguments of delete_player. The name is the parameter name in the SQL."""
    return {"p_player_id": player_id}


def outcome_unknown() -> ApiError:
    """The 503 when the database did not answer: the player may be deleted already."""
    return ApiError(
        503,
        "database_unavailable",
        "We could not confirm the deletion. Try again: deleting twice is safe.",
    )


# PENDING Nils' decision (N4 in specs/M1-backbone.md, D022): deletes every row, ledger included,
# and hands shared crews to the lowest other seat.
async def delete_player(admin: SupabaseAdmin, player_id: str) -> str:
    """Delete the player. Answers "deleted", or "not_found" if they were gone already.

    Both are a success for the caller: the player has no data left. A 503 from the database
    (outcome_unknown) means the deletion may or may not have happened. Deleting again is safe.
    """
    try:
        reply = await admin.call_function("delete_player", delete_arguments(player_id))
    except AlreadyApplied as error:
        # supabase_admin turns EVERY unique violation (code 23505) into AlreadyApplied. Deleting
        # breaks no unique rule, so here it can only be a bug on our side, never a repeat.
        raise SupabaseRejected() from error
    except SupabaseUnavailable as error:
        raise outcome_unknown() from error
    status = reply.get("status") if isinstance(reply, dict) else None
    if status not in DELETE_STATUSES:
        raise SupabaseRejected("The database sent an answer we could not read.")
    return status
