"""Guests of the class demo: get a guest ready to play, and clean old guests up.

Getting ready (provision_guest). A guest skips Act 1 (decision D029). On the first call the demo
gate lets through, the guest gets, in this order and each step only once:

  1. a generated captain name, through assign_captain_name (the same database function as
     POST /api/me/name: the name is written only while the sign-up placeholder is still there),
  2. the default kit, through grant_entry_kit (the same database function as Act 1: the profile
     is written once and the kit coins are paid once, reason kit_grant, ref kit).

The default kit is the Stranger: the kit of a player who "took no side", which is what a guest who
never played Act 1 did. Its start place is saltreach_harbor, the harbor of the class demo. The
profile is stored with:

    ending       ending_demo   not a scene of the story, so the profile always shows that it came
                               from the demo, never from a replay. The table rule
                               entry_profiles_ending_format allows any id of 2 to 40 characters.
    decision     none          the Stranger's decision (the table allows warned, trusted, none)
    read_log     false         a guest never read the logbook
    move_count   1             the table rule asks for 1 to 300 moves; no move was replayed, and 1
                               is the closest allowed value (documented in D029)
    story_sha256 the SHA-256 of the story file, as for every profile

A GitHub or email user who did not play Act 1 is never given a kit: POST /api/crews still answers
409 kit_needed for them.

Cleaning up (cleanup_guests). The host's "Clean up guests" button deletes every anonymous user whose
account is older than 24 hours, through the database function delete_player (the same as "Delete my
data", so a shared crew is handed over and nothing is left half-deleted). The list of users comes
from Supabase Auth's admin list, because only it knows today whether a user is still anonymous. A
user counts as a guest only if ALL of these hold, so a GitHub or email user is never deleted:

    is_anonymous is true, there is no e-mail address and no phone number, every linked identity
    and every provider in app_metadata is "anonymous", and the id is not a host.

A guest who linked GitHub or confirmed an email address is no longer anonymous and is kept. A guest
whose email confirmation is still open has no e-mail address yet and still counts as a guest. At
most 100 guests are deleted per call (a Vercel function has limited time); the answer says
"more": true when the host should press the button again.

Used by: demo/gate.py (provision_guest) and routes/demo.py (cleanup_guests).
"""

import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from plot_twist.engine import STORY_PATH
from server.account.deletion import delete_player
from server.account.name_store import assign_name
from server.account.names import load_word_lists, pick_name, placeholder_name
from server.errors import ApiError
from server.game.entry_kits import ENTRY_KITS_PATH, kit_by_id, load_entry_kits
from server.game.entry_profile_store import KIT_REASON, KIT_REF, grant_entry_kit
from server.game.referee import Verdict, story_fingerprint
from server.supabase_admin import SupabaseAdmin
from server.wallet import validate_transaction

logger = logging.getLogger(__name__)

# The default kit of a guest and the values stored with it (see the top of this file).
GUEST_KIT = "stranger"
GUEST_ENDING = "ending_demo"
GUEST_MOVE_COUNT = 1

# Cleanup: guests whose account is older than this are deleted.
GUEST_MAX_AGE = timedelta(hours=24)
# Supabase Auth lists users page by page. 200 per page and at most 25 pages: 5,000 users.
PAGE_SIZE = 200
MAX_PAGES = 25
# At most this many deletions per call, so one call stays well inside a function's time limit.
MAX_DELETIONS = 100


def player_not_set_up() -> ApiError:
    message = "Your player record is not set up yet. Sign in again in a minute."
    return ApiError(404, "player_not_set_up", message)


def guest_verdict() -> Verdict:
    """The values stored as the entry profile of a guest."""
    return Verdict(
        ending=GUEST_ENDING, decision="none", read_log=False, move_count=GUEST_MOVE_COUNT
    )


async def provision_guest(admin: SupabaseAdmin, player_id: str) -> None:
    """Give a guest a captain name and the default kit, each once. Safe to call again.

    A guest who has an entry profile already is ready: nothing else is asked.
    """
    rows = await admin.select_rows(
        "entry_profiles", {"select": "kit", "player_id": f"eq.{player_id}", "limit": "1"}
    )
    if rows:
        return
    named = await assign_name(
        admin, player_id, placeholder_name(player_id), pick_name(load_word_lists())
    )
    if named.status == "missing":
        raise player_not_set_up()
    kit = kit_by_id(load_entry_kits(ENTRY_KITS_PATH), GUEST_KIT)
    verdict = guest_verdict()
    if kit.decision != verdict.decision:
        raise ValueError("The guest kit must be the kit of a player who took no side.")
    # Check the amount with the wallet rules first, as the intro route does. The coins move
    # inside grant_entry_kit, never here.
    validate_transaction(kit.coins, KIT_REASON, KIT_REF)
    reply = await grant_entry_kit(admin, player_id, verdict, kit, story_fingerprint(STORY_PATH))
    if reply.status == "missing":
        raise player_not_set_up()


@dataclass(frozen=True)
class CleanupResult:
    checked: int  # users looked at
    deleted: int  # guests deleted by this call
    more: bool  # true when old guests are left: press the button again


def only_anonymous(values: Iterable[Any]) -> bool:
    return all(value == "anonymous" for value in values)


def created_before(user: dict[str, Any], cutoff: datetime) -> bool:
    text = user.get("created_at")
    if not isinstance(text, str):
        return False
    try:
        created = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return False
    return created.tzinfo is not None and created < cutoff


def is_old_guest(user: dict[str, Any], cutoff: datetime, hosts: frozenset[str]) -> bool:
    """True only for an anonymous user made before `cutoff`. Every doubt keeps the user."""
    user_id = user.get("id")
    if not isinstance(user_id, str) or not user_id or user_id in hosts:
        return False
    if user.get("is_anonymous") is not True or user.get("email") or user.get("phone"):
        return False
    identities = user.get("identities") or []
    if not isinstance(identities, list):
        return False
    providers = [item.get("provider") if isinstance(item, dict) else None for item in identities]
    metadata = user.get("app_metadata") or {}
    if not isinstance(metadata, dict):
        return False
    listed = metadata.get("providers") or []
    if not isinstance(listed, list):
        return False
    named = [metadata["provider"]] if "provider" in metadata else []
    if not only_anonymous([*providers, *listed, *named]):
        return False
    return created_before(user, cutoff)


async def find_old_guests(
    admin: SupabaseAdmin, cutoff: datetime, hosts: frozenset[str]
) -> tuple[list[str], int, bool]:
    """The ids of old guests, how many users were looked at, and whether the list went on."""
    guests: list[str] = []
    checked = 0
    for page in range(1, MAX_PAGES + 1):
        users = await admin.list_auth_users(page, PAGE_SIZE)
        checked += len(users)
        guests += [user["id"] for user in users if is_old_guest(user, cutoff, hosts)]
        if len(users) < PAGE_SIZE:
            return guests, checked, False
    return guests, checked, True


async def cleanup_guests(
    admin: SupabaseAdmin, now: datetime, hosts: frozenset[str]
) -> CleanupResult:
    """Delete anonymous users older than 24 hours, at most MAX_DELETIONS per call."""
    guests, checked, listing_went_on = await find_old_guests(admin, now - GUEST_MAX_AGE, hosts)
    deleted = 0
    for player_id in guests[:MAX_DELETIONS]:
        if await delete_player(admin, player_id) == "deleted":
            deleted += 1
    # A count only: the log never names a player.
    logger.info("Demo cleanup deleted %s guest(s).", deleted)
    more = listing_went_on or len(guests) > MAX_DELETIONS
    return CleanupResult(checked=checked, deleted=deleted, more=more)
