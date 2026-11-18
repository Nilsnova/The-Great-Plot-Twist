"""Lifecycle integration guards used by authenticated server dependencies.

Reset/deletion orchestration is composed with the existing domain transaction
hooks. This first boundary never initializes a player or grants any authority.
"""

from pydantic import ValidationError

from server.errors import ApiError
from server.island import codes
from server.island.catalogue import IslandCatalogue
from server.island.economy_operations import root_action_uid
from server.island.island_lifecycle import ResetResult
from server.island.treasury import identifier
from server.island.treasury_models import decimal_string
from server.supabase_admin import (
    AlreadyApplied,
    SupabaseAdmin,
    SupabaseRejected,
    SupabaseUnavailable,
)

GRANT_POLICY_VERSION = "catalogue-starting-coins-v1"


def check_refusal(reply: object) -> None:
    """Only fixed, known domain refusals cross the HTTP boundary."""
    if not isinstance(reply, dict) or reply.get("status") != "refused":
        return
    refusals = {
        "owned_island_confirmation_required": (409, "owned_island_confirmation_required"),
        "wrong_code": (400, "wrong_code"),
        "not_owner": (403, "not_owner"),
        "actor_inactive": (401, "unauthorized"),
        "epoch_mismatch": (409, "economy_epoch_mismatch"),
        "path_unavailable": (409, "economy_path_unavailable"),
        "action_conflict": (409, "idempotency_conflict"),
        "wave_running": (409, "wave_running"),
        "lifecycle_busy": (503, "lifecycle_busy"),
        "invalid_change": (422, "invalid_transaction"),
    }
    reason = reply.get("reason")
    if set(reply) != {"status", "reason"} or not isinstance(reason, str) or reason not in refusals:
        raise SupabaseRejected("The database sent an unreadable lifecycle refusal.")
    status, code = refusals[reason]
    message = (
        "Confirm that deleting this account also deletes its owned shared island."
        if reason == "owned_island_confirmation_required"
        else "The lifecycle action could not be applied. Retry its original request."
    )
    raise ApiError(status, code, message)


async def call_lifecycle(admin: SupabaseAdmin, function: str, arguments: dict) -> dict:
    """A lost response never authorizes a new identity or a replacement operation."""
    try:
        reply = await admin.call_function(function, arguments)
    except AlreadyApplied as error:
        raise SupabaseRejected() from error
    except SupabaseUnavailable as error:
        raise ApiError(
            503,
            "database_unavailable",
            "We could not confirm the lifecycle action. Retry the original request.",
        ) from error
    check_refusal(reply)
    if not isinstance(reply, dict):
        raise SupabaseRejected("The database sent an unreadable lifecycle result.")
    return reply


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


async def delete_player(
    admin: SupabaseAdmin, actor_id: str, confirm_owned_island: bool = False
) -> str:
    """Preserve one database transaction for disposition, crew handover and Auth deletion."""
    if type(confirm_owned_island) is not bool:
        raise ApiError(422, "validation_error", "Island deletion confirmation must be a boolean.")
    reply = await call_lifecycle(
        admin,
        "island_lifecycle_delete_player",
        {"p_actor_id": identifier(actor_id), "p_confirm_owned_island": confirm_owned_island},
    )
    if set(reply) != {"status"} or reply["status"] not in {"deleted", "not_found"}:
        raise SupabaseRejected("The database sent an unreadable deletion result.")
    return reply["status"]


async def reset_island(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor_id: str,
    island_owner: str,
    run_epoch: str,
    action_uid: str,
    confirm_code: str,
) -> dict:
    """Reset an owner's original epoch; a fresh GET alone adopts the new run."""
    actor, owner, epoch = identifier(actor_id), identifier(island_owner), identifier(run_epoch)
    if actor != owner:
        raise ApiError(403, "not_owner", "Only this island's owner may reset it.")
    typed = codes.read_code(confirm_code)
    if typed is None:
        raise ApiError(400, "wrong_code", "Type the code of your own island to confirm.")
    root_action_uid(action_uid)
    reply = await call_lifecycle(
        admin,
        "island_lifecycle_reset",
        {
            "p_actor_id": actor,
            "p_island_owner": owner,
            "p_run_epoch": epoch,
            "p_action_uid": action_uid,
            "p_confirm_code": typed,
            "p_starting_coins": catalogue.starting_coins,
            "p_grant_policy_version": GRANT_POLICY_VERSION,
        },
    )
    try:
        row = ResetResult.model_validate(reply)
        receipt = row.receipt
        if (
            str(receipt.actorId) != actor
            or receipt.actionUid != action_uid
            or str(receipt.origin.islandOwner) != owner
            or str(receipt.origin.runEpoch) != epoch
            or row.currentEconomy is not None
        ):
            raise ValueError("The reset reply belongs to another original request.")
        if not row.repeat and (
            receipt.result.startingCoins != decimal_string(catalogue.starting_coins)
            or receipt.result.grantPolicyVersion != GRANT_POLICY_VERSION
        ):
            raise ValueError("The reset used another server grant configuration.")
        return row.model_dump(mode="json")
    except (ValidationError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable original reset receipt.") from error
