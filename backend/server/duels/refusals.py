"""Duel refusals: the standard error for every way a duel request can be refused.

A database function REFUSES with a reason word ({"status": "refused", "reason": "duel_taken"}),
and the service itself refuses a few things before it asks the database (a second seal, a duel
that is not there). All of them become one ApiError, so the browser always gets the same JSON
shape and the same code (docs/INTERFACES.md, section 1). The table is the one in
specs/A7-lantern-duels.md, section 7.3.

    reason                  status  when
    no_such_duel            404     unknown, a named duel you are not in, or a closed open challenge
    no_such_captain         404     no captain has that name
    name_not_unique         409     several captains share that name
    too_many_waiting        409     the challenger already has the most challenges waiting
    already_sealed          409     you sealed your signals in this duel already
    duel_taken              409     another captain answered this open challenge first
    duel_closed             409     withdrawn, declined or already decided
    duel_expired            409     the answer window has passed
    daily_pair_limit        409     the most staked duels between two captains today
    not_your_duel           403     only the challenger withdraws, only the named captain declines
    cannot_duel_yourself    422     the name is the challenger's own

A reason we do not know (and not_expired, which only the quiet clean-up of expired challenges
sees) means the database and the server disagree: 502 database_error, like every other odd reply.

The four 422 codes of the sealing rules (bad_rounds, bad_stake, wrong_signal_count,
not_enough_oil) are raised by rules.py. Messages never repeat what the player sent.

Used by: service.py.
"""

from server.duels.rules import MAX_WAITING, PAIR_DAILY_LIMIT
from server.errors import ApiError
from server.supabase_admin import SupabaseRejected

# reason -> (HTTP status, plain-English message)
REFUSALS: dict[str, tuple[int, str]] = {
    "no_such_duel": (404, "That duel is not here."),
    "no_such_captain": (
        404,
        "No captain has that name. Check the spelling, or send an open challenge.",
    ),
    "name_not_unique": (
        409,
        "Several captains share that name. Send an open challenge instead.",
    ),
    "too_many_waiting": (
        409,
        f"You have {MAX_WAITING} challenges waiting. Withdraw one or wait for an answer.",
    ),
    "already_sealed": (409, "Your signals for this duel are already sealed."),
    "duel_taken": (409, "Another captain answered first. Your coins did not move."),
    "duel_closed": (409, "This challenge is closed."),
    "duel_expired": (
        409,
        "This challenge ran out of time. Its stake went back to the challenger.",
    ),
    "daily_pair_limit": (
        409,
        f"You have played {PAIR_DAILY_LIMIT} staked duels with this captain today. "
        "Try a friendly duel.",
    ),
    "not_your_duel": (
        403,
        "Only the challenger can withdraw this challenge, and only the named captain can "
        "decline it.",
    ),
    "cannot_duel_yourself": (422, "You cannot challenge yourself."),
}


def refusal_error(reason: str) -> ApiError:
    """The ApiError for a refusal reason. A reason we do not know becomes a 502."""
    known = REFUSALS.get(reason)
    if known is None:
        return SupabaseRejected()
    status_code, message = known
    return ApiError(status_code, reason, message)
