"""Server-only RPC adapters for opt-in personal Captain profiles.

Used by future shared-mode integrations and isolated tests. These are not public endpoints;
callers authenticate the personal actor, and no adapter debits a wallet or treasury.
"""

import re

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue
from server.island.personal_captain import configuration, read_profile
from server.island.treasury import EconomyContext, identifier, operation
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

REFUSALS = {
    "captain_not_initialized", "captain_assigned", "engineer_bound", "locked", "known",
    "closed", "wrong_role", "no_points", "role_known", "retired_skill", "respec_required",
    "captain_conversion_required", "captain_rules_mismatch", "economy_context_required",
    "economy_epoch_mismatch", "economy_path_unavailable", "not_member", "action_conflict",
    "captain_context_required", "captain_revision_mismatch",
    "bad_skill",
}


async def _call(admin: SupabaseAdmin, name: str, arguments: dict) -> dict:
    value = await admin.call_function(name, arguments)
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if reason not in REFUSALS:
            raise SupabaseRejected("The database sent an unknown personal Captain refusal.")
        code = "captain_context_required" if reason == "captain_not_initialized" else reason
        status = 403 if reason == "not_member" else (400 if reason == "bad_skill" else 409)
        raise ApiError(status, code,
                       "Reload your Captain or finish the required wave before this change.")
    if not isinstance(value, dict):
        raise SupabaseRejected("The database sent an unreadable personal Captain answer.")
    return value


async def initialize(
    admin: SupabaseAdmin, context: EconomyContext, catalogue: IslandCatalogue
) -> dict:
    if context.mode != "island_shared" or context.version != 1:
        raise ApiError(409, "economy_context_required", "Use the shared Captain profile.")
    return read_profile(await _call(admin, "personal_captain_initialize", {
        "p_actor_id": identifier(context.actor_id),
        "p_island_owner": identifier(context.island_owner),
        "p_expected_epoch": identifier(context.run_epoch),
        "p_rules": configuration(catalogue),
    }))


async def read(admin: SupabaseAdmin, player_id: str) -> dict:
    return read_profile(await _call(admin, "personal_captain_read", {
        "p_player_id": identifier(player_id),
    }))


async def read_optional(admin: SupabaseAdmin, player_id: str) -> dict | None:
    """Resolve global personal mode independently of the viewed island's accounting mode."""
    value = await _call(admin, "personal_captain_context", {"p_player_id": identifier(player_id)})
    if value == {"status": "legacy"}:
        return None
    return read_profile(value)


async def change(
    admin: SupabaseAdmin, player_id: str, action_uid: str, action: str, value: str | None = None,
    *, expected_revision: str,
) -> dict:
    operation(action_uid, "personal_captain")
    if (not isinstance(expected_revision, str)
            or re.fullmatch(r"0|[1-9][0-9]*", expected_revision) is None):
        raise ApiError(422, "validation_error", "Use the current personal revision string.")
    if action not in {"role", "learn", "respec"}:
        raise ApiError(422, "bad_captain_action", "Choose a valid Captain action.")
    result = await _call(admin, "personal_captain_change", {
        "p_player_id": identifier(player_id), "p_action_uid": action_uid,
        "p_action": action, "p_value": value, "p_expected_revision": expected_revision,
    })
    if (result.get("status") != "done" or not isinstance(result.get("repeat"), bool)
            or not isinstance(result.get("receipt"), dict)):
        raise SupabaseRejected("The database sent an unreadable Captain change receipt.")
    read_profile(result.get("profile"))
    return result
