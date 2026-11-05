"""The entry profile in the database: grant the kit once, and read a player's kit and start place.

The rules (which ending leads to which kit) are in entry_kits.py and referee.py. This file only
talks to the database (supabase_admin.py). Granting is ONE database function, grant_entry_kit
(supabase/migrations/20261106030000_entry_profiles.sql), that stores the profile and pays the kit
coins in a single step. Python never moves the kit coins itself: the profile and the payment must be
saved together or not at all, and two requests of one player at the same moment must pay once.

grant_entry_kit answers with a small JSON object, and read_grant_reply turns it into a GrantReply:
    granted   this call stored the profile (and paid the coins)
    stored    the player had a profile already; nothing changed and nothing was paid, and the values
              are the STORED ones, whatever this call was given
    missing   the player has no profile row

PENDING Nils' decision (N6 in specs/M1-backbone.md): the first ending counts. A second playthrough
never changes the kit and pays nothing. That is what "stored" means.

Used by: routes/intro.py (grant_entry_kit) and routes/me.py (read_kit_and_place).
"""

import logging
from dataclasses import dataclass
from typing import Any

from server.game.entry_kits import Kit
from server.game.referee import Verdict
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# The kit coins are paid with this reason and this fixed ref. The ledger holds each player, reason
# and ref only once, so the database itself stops a second payout. A test compares both words with
# the SQL function.
KIT_REASON = "kit_grant"
KIT_REF = "kit"

# The two statuses that come with a profile. The third status, "missing", comes without one.
PROFILE_STATUSES = ("granted", "stored")


@dataclass(frozen=True)
class EntryProfile:
    """A stored entry profile, as grant_entry_kit returns it."""

    ending: str
    decision: str
    read_log: bool
    kit: str
    start_place: str
    kit_coins: int  # the coins the kit paid, as stored (the kits file may say something else today)


@dataclass(frozen=True)
class GrantReply:
    """What grant_entry_kit answered."""

    status: str  # granted, stored or missing
    coins_paid: int = 0  # granted: the coins this call paid. stored: always 0.
    profile: EntryProfile | None = None  # granted and stored: the profile; missing: None


@dataclass(frozen=True)
class KitAndPlace:
    """The two values GET /api/me shows for a player who finished Act 1."""

    kit: str
    place: str


def unreadable(what: str) -> SupabaseRejected:
    """The 502 for an answer we cannot read. The log names what it was, never the values."""
    logger.warning("The database sent %s that we could not read.", what)
    return SupabaseRejected("The database sent an answer we could not read.")


def read_text(value: object, what: str) -> str:
    if not isinstance(value, str) or not value:
        raise unreadable(what)
    return value


def read_flag(value: object, what: str) -> bool:
    """A true or false from the database. Text such as "no" is not accepted."""
    if not isinstance(value, bool):
        raise unreadable(what)
    return value


def read_count(value: object, what: str) -> int:
    """A number of coins from the database: a whole number, 0 or more. A bool is not a number."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise unreadable(what)
    return value


def check_paid(status: str, paid: int, kit_coins: int) -> None:
    """A call pays nothing or the whole kit. A stored profile never pays."""
    if paid not in (0, kit_coins) or (status == "stored" and paid != 0):
        raise unreadable("a payment that does not fit the kit")


def read_grant_reply(reply: object) -> GrantReply:
    """Understand the JSON that grant_entry_kit returns."""
    what = "an answer of grant_entry_kit"
    if not isinstance(reply, dict):
        raise unreadable(what)
    status = reply.get("status")
    if status == "missing":
        return GrantReply(status="missing")
    if status not in PROFILE_STATUSES:
        raise unreadable(what)
    profile = EntryProfile(
        ending=read_text(reply.get("ending"), what),
        decision=read_text(reply.get("decision"), what),
        read_log=read_flag(reply.get("readLog"), what),
        kit=read_text(reply.get("kit"), what),
        start_place=read_text(reply.get("startPlace"), what),
        kit_coins=read_count(reply.get("kitCoins"), what),
    )
    paid = read_count(reply.get("paid"), what)
    check_paid(status, paid, profile.kit_coins)
    return GrantReply(status=status, coins_paid=paid, profile=profile)


def grant_arguments(
    player_id: str, verdict: Verdict, kit: Kit, story_sha256: str
) -> dict[str, Any]:
    """The arguments of grant_entry_kit. The names are the parameter names in the SQL."""
    return {
        "p_player_id": player_id,
        "p_ending": verdict.ending,
        "p_decision": verdict.decision,
        "p_read_log": verdict.read_log,
        "p_kit": kit.id,
        "p_start_place": kit.start_place,
        "p_kit_coins": kit.coins,
        "p_move_count": verdict.move_count,
        "p_story_sha256": story_sha256,
    }


async def grant_entry_kit(
    admin: SupabaseAdmin, player_id: str, verdict: Verdict, kit: Kit, story_sha256: str
) -> GrantReply:
    """Store the player's entry profile and pay the kit, once. Answers granted, stored or missing.

    A repeat is safe: the database answers "stored" with the first profile and pays nothing.

    Raises (all of them become the standard error answer in a route):
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN: the call may have been saved before it
                                 timed out. Asking again is safe, and GET /api/me shows the kit once
                                 it was granted.
      SupabaseRejected (502)     the database refused the call or answered with something odd.
    """
    arguments = grant_arguments(player_id, verdict, kit, story_sha256)
    try:
        reply = await admin.call_function("grant_entry_kit", arguments)
    except AlreadyApplied as error:
        # supabase_admin turns EVERY unique violation (code 23505) into AlreadyApplied, because for
        # the wallet that is what it means. Here it cannot mean a repeat: grant_entry_kit locks the
        # player first and answers a repeat with a normal reply ("stored"). A unique violation can
        # only be a bug on our side, and the browser must not read it as "this was already done".
        raise SupabaseRejected() from error
    return read_grant_reply(reply)


async def read_kit_and_place(admin: SupabaseAdmin, player_id: str) -> KitAndPlace | None:
    """The player's kit and start place, or None if they have not finished Act 1 yet."""
    query = {"select": "kit,start_place", "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("entry_profiles", query)
    if not rows:
        return None
    row = rows[0]
    if not isinstance(row, dict):
        raise unreadable("an entry profile")
    return KitAndPlace(
        kit=read_text(row.get("kit"), "an entry profile"),
        place=read_text(row.get("start_place"), "an entry profile"),
    )
