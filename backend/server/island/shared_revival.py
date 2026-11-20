"""Free shared revival receipt adapter; canonical session/hold SQL owns the actual effect."""

from uuid import UUID

from pydantic import ValidationError

from server.errors import ApiError
from server.island.economy_operations import root_action_uid
from server.island.economy_permissions import require_economy_action
from server.island.shared_revival_models import SharedRevivalReply, SharedRevivalRequest
from server.island.treasury_store import check_status
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

REFUSALS = {
    "hold_missing": (409, "Start helping this Captain again."),
    "hold_incomplete": (409, "Keep holding to help this Captain up."),
    "hold_invalidated": (409, "This hold ended. Start helping again."),
    "fall_mismatch": (409, "This Captain's fall changed. Read the wave again."),
    "target_unavailable": (409, "This Captain cannot be helped up now."),
    "not_controller": (403, "This connection does not control that Captain."),
    "not_in_wave": (403, "Only a current participant may help in this wave."),
    "not_member": (403, "Join this game before helping a Captain here."),
    "wave_over": (409, "This wave is over."),
    "out_of_range": (409, "Move closer to this Captain before helping."),
    "health_sync_required": (409, "Read and confirm the current wave state before helping."),
}


def fingerprint(body: SharedRevivalRequest) -> dict[str, str]:
    """Hold/session fences may refresh; the intended wave, target and fall cannot change."""
    return {
        "islandOwner": str(body.economy.islandOwner),
        "waveId": str(body.waveId),
        "targetToken": str(body.targetToken),
        "fallId": str(body.fallId),
    }


def read_reply(value: object, actor: str, body: SharedRevivalRequest) -> SharedRevivalReply:
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if isinstance(reason, str) and reason in REFUSALS:
            status, message = REFUSALS[reason]
            raise ApiError(status, reason, message)
    check_status(value)
    try:
        row = SharedRevivalReply.model_validate(value)
        receipt, facts = row.receipt, row.receipt.result
        if (
            receipt.actorId != UUID(actor)
            or receipt.actionUid != body.actionUid
            or receipt.origin.islandOwner != body.economy.islandOwner
            or receipt.origin.runEpoch != body.economy.runEpoch
            or (facts.waveId, facts.targetToken, facts.fallId)
            != (body.waveId, body.targetToken, body.fallId)
            or not row.repeat and facts.holdId != body.holdId
        ):
            raise ValueError("Unrelated revival receipt.")
        return row
    except (ValidationError, ValueError, AttributeError, TypeError) as error:
        raise SupabaseRejected("The free revival receipt could not be verified.") from error


async def revive_shared(
    admin: SupabaseAdmin, actor_id: str, body: SharedRevivalRequest,
) -> SharedRevivalReply:
    """Resolve owned history before any current membership, hold or Captain-state check."""
    actor_id = str(UUID(actor_id))
    root_action_uid(body.actionUid)
    owner, epoch = str(body.economy.islandOwner), str(body.economy.runEpoch)
    previous = await admin.call_function("island_shared_revival_replay", {
        "p_actor_id": actor_id, "p_island_owner": owner, "p_account_id": None,
        "p_run_epoch": epoch, "p_action_uid": body.actionUid, "p_fingerprint": fingerprint(body),
    })
    if previous is not None:
        return read_reply(previous, actor_id, body)
    permit = await require_economy_action(
        admin, actor_id, owner, "wave_revive", expected_epoch=epoch,
    )
    result = await admin.call_function("island_shared_captain_revive", {
        "p_actor_id": actor_id, "p_island_owner": owner,
        "p_account_id": permit.context.account_id, "p_run_epoch": epoch,
        "p_action_uid": body.actionUid, "p_wave_id": str(body.waveId),
        "p_target_token": str(body.targetToken), "p_fall_id": str(body.fallId),
        "p_hold_id": str(body.holdId), "p_session_id": str(body.sessionId),
        "p_connection_generation": body.connectionGeneration,
    })
    reply = read_reply(result, actor_id, body)
    if not reply.repeat and str(reply.receipt.origin.accountId) != permit.context.account_id:
        raise SupabaseRejected("The free revival account could not be verified.")
    return reply
