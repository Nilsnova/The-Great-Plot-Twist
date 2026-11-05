"""Captain names in the database: read the current name, give the first name, re-roll once.

The rules for a name (the words, the numbers) are in names.py. This file only talks to the database
(supabase_admin.py). Giving a name and re-rolling it are two database functions,
assign_captain_name and reroll_captain_name (supabase/migrations/20261106020000_accounts.sql). Each
one does its job in a single step, so two requests at the same moment cannot give a player two
names or two re-rolls.

A function answers with a small JSON object, and read_name_reply turns it into a NameReply:
    named     the player has this name now (or had it already: a repeat changes nothing)
    refused   a rule said no and nothing changed; `reason` says which rule (only for a re-roll)
    missing   the player has no profile row

Used by: routes/captain_name.py.
"""

from dataclasses import dataclass
from typing import Any

from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

# The reasons reroll_captain_name gives when it says no. Anything else is an answer we cannot read.
REFUSAL_REASONS = ("already_applied", "no_rerolls_left", "no_name_yet")


@dataclass(frozen=True)
class NameReply:
    """What a name function of the database answered."""

    status: str  # named, refused or missing
    name: str = ""  # named and refused: the name the player has now
    rerolls_used: int = 0  # named: 0 or 1
    reason: str = ""  # refused: one of REFUSAL_REASONS


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def read_count(value: object) -> int:
    """A count from the database: a whole number, 0 or more. A bool is not a count."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise unreadable()
    return value


def read_name_reply(reply: object) -> NameReply:
    """Understand the JSON that assign_captain_name or reroll_captain_name returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    status = reply.get("status")
    if status == "missing":
        return NameReply(status="missing")
    name = reply.get("name")
    if not isinstance(name, str):
        raise unreadable()
    if status == "named":
        return NameReply(
            status="named", name=name, rerolls_used=read_count(reply.get("rerollsUsed"))
        )
    reason = reply.get("reason")
    if status == "refused" and reason in REFUSAL_REASONS:
        return NameReply(status="refused", name=name, reason=reason)
    raise unreadable()


def assign_arguments(player_id: str, placeholder: str, name: str) -> dict[str, Any]:
    """The arguments of assign_captain_name. The names are the parameter names in the SQL."""
    return {"p_player_id": player_id, "p_placeholder": placeholder, "p_name": name}


def reroll_arguments(
    player_id: str, placeholder: str, new_name: str, action_uid: str
) -> dict[str, Any]:
    """The arguments of reroll_captain_name. The names are the parameter names in the SQL."""
    return {
        "p_player_id": player_id,
        "p_placeholder": placeholder,
        "p_new_name": new_name,
        "p_action_uid": action_uid,
    }


async def call_name_function(
    admin: SupabaseAdmin, function_name: str, arguments: dict[str, Any]
) -> NameReply:
    """Run one of the two name functions and read its answer."""
    try:
        reply = await admin.call_function(function_name, arguments)
    except AlreadyApplied as error:
        # supabase_admin turns EVERY unique violation (code 23505) into AlreadyApplied, because for
        # the wallet that is what it means. Here it cannot mean a repeat: both functions lock the
        # profile first, so a repeat is answered with a normal reply. A unique violation can only
        # be a bug on our side, and the browser must not read it as "this was already done".
        raise SupabaseRejected() from error
    return read_name_reply(reply)


async def read_current_name(admin: SupabaseAdmin, player_id: str) -> str | None:
    """The player's name in the table profiles, or None if the player has no profile row."""
    query = {"select": "display_name", "id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("profiles", query)
    if not rows:
        return None
    row = rows[0]
    name = row.get("display_name") if isinstance(row, dict) else None
    if not isinstance(name, str):
        raise unreadable()
    return name


async def assign_name(
    admin: SupabaseAdmin, player_id: str, placeholder: str, name: str
) -> NameReply:
    """Give the player this name, unless they have a name already. Answers named or missing."""
    arguments = assign_arguments(player_id, placeholder, name)
    reply = await call_name_function(admin, "assign_captain_name", arguments)
    if reply.status == "refused":
        raise unreadable()  # assign_captain_name never refuses
    return reply


async def reroll_name(
    admin: SupabaseAdmin, player_id: str, placeholder: str, new_name: str, action_uid: str
) -> NameReply:
    """Change the player's name, once. Answers named, refused (with a reason) or missing."""
    arguments = reroll_arguments(player_id, placeholder, new_name, action_uid)
    return await call_name_function(admin, "reroll_captain_name", arguments)
