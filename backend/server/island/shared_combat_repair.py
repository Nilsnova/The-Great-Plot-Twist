"""Shared repair transaction adapter; used by the authenticated shared repair HTTP branch.

Used by integration tests and shared_repair_runtime.py. SQL atomically owns the debit, HP,
quota, event and root receipt. Python never performs a separate financial write. Timed free
revival stays refused until canonical target-bound hold/fall provenance is available.
"""

from typing import Never
from uuid import UUID

from pydantic import ValidationError

from server.errors import ApiError
from server.island.economy_operations import effect_uid, root_action_uid
from server.island.economy_permissions import require_economy_action
from server.island.shared_repair_transaction_models import (
    RepairEconomyIntent,
    SharedRepairReply,
    SharedRepairRequest,
)
from server.island.treasury_models import decimal_integer
from server.island.treasury_store import check_status, read_envelope
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

__all__ = ["SharedRepairRequest", "repair_shared", "require_shared_revival"]


REFUSALS = {
    "stale_recovery_quote": (409, "Refresh and confirm this repair again."),
    "intact": (409, "This structure is already at full health."),
    "wrong_kind": (422, "Only walls and towers can be repaired."),
    "repair_limit_reached": (409, "This island has used all three shared repairs."),
}


def fingerprint(body: SharedRepairRequest) -> dict[str, object]:
    """Normalize original client intent without rereading current prices or phase."""
    return {
        "islandOwner": str(body.economy.islandOwner),
        "recoveryEpoch": str(body.expected_epoch),
        "instanceId": str(body.instance_id),
        "spot": body.spot,
        "level": body.expected_level,
        "quotedPrice": str(body.quoted_price),
    }


def read_reply(value: object, actor: str, body: SharedRepairRequest) -> SharedRepairReply:
    """Reject mismatched domain/financial origins rather than returning unrelated receipts."""
    if isinstance(value, dict) and value.get("status") == "refused":
        reason = value.get("reason")
        if not isinstance(reason, str):
            raise SupabaseRejected("The shared repair refusal could not be verified.")
        if reason in REFUSALS:
            status, message = REFUSALS[reason]
            raise ApiError(status, reason, message)
    check_status(value)
    try:
        row = SharedRepairReply.model_validate(value)
        origin, facts = row.receipt.origin, row.receipt.result
        financial = facts.financialReceipt
        expected = (
            UUID(actor),
            body.action_uid,
            body.economy.islandOwner,
            body.economy.runEpoch,
            body.expected_epoch,
            body.spot,
            body.instance_id,
            body.expected_level,
            body.quoted_price,
        )
        actual = (
            row.receipt.actorId,
            row.receipt.actionUid,
            origin.islandOwner,
            origin.runEpoch,
            facts.recoveryEpoch,
            facts.spot,
            facts.instanceId,
            facts.level,
            decimal_integer(facts.chargedPrice),
        )
        if expected != actual or (
            financial.actorId != row.receipt.actorId
            or financial.accountId != origin.accountId
            or financial.runEpoch != origin.runEpoch
            or financial.kind != "spend"
            or financial.reason != "structure_repair"
            or financial.actionUid != effect_uid(str(row.receipt.receiptId), "repair")
            or financial.reference != f"repair:{row.receipt.receiptId}"
            or decimal_integer(financial.balanceDelta) != -body.quoted_price
            or financial.committedDelta != "0"
            or financial.sourceReservationId is not None
            or decimal_integer(financial.revisionAtCommit) < 1
            or decimal_integer(financial.balanceAtCommit)
            < decimal_integer(financial.committedAtCommit)
        ):
            raise ValueError("Unrelated repair receipt.")
        if row.repeat and row.currentEconomy is not None:
            raise ValueError("Historical receipt must not expose current treasury state.")
        if not row.repeat:
            if (facts.waveId, facts.repairSeq) != (
                body.expected_wave_id,
                body.expected_repair_seq + 1,
            ):
                raise ValueError("Unrelated new repair cursors.")
            current = read_envelope(row.currentEconomy.model_dump())
            if decimal_integer(financial.revisionAtCommit) > current.revision:
                raise ValueError("Unrelated account revision.")
            if (current.account_id, current.run_epoch, current.island_owner) != (
                str(origin.accountId),
                str(origin.runEpoch),
                str(origin.islandOwner),
            ):
                raise ValueError("Unrelated current account.")
        return row
    except (ValidationError, ValueError, AttributeError, TypeError) as error:
        raise SupabaseRejected("The shared repair receipt could not be verified.") from error


async def repair_shared(
    admin: SupabaseAdmin,
    actor_id: str,
    body: SharedRepairRequest,
) -> SharedRepairReply:
    """Resolve an owned historical receipt first, then authorize a new atomic repair."""
    actor_id = str(UUID(actor_id))
    root_action_uid(body.action_uid)
    owner, epoch = str(body.economy.islandOwner), str(body.economy.runEpoch)
    prior = await admin.call_function(
        "island_shared_repair_replay",
        {
            "p_actor_id": actor_id,
            "p_island_owner": owner,
            "p_account_id": None,
            "p_run_epoch": epoch,
            "p_action_uid": body.action_uid,
            "p_fingerprint": fingerprint(body),
        },
    )
    if prior is not None:
        return read_reply(prior, actor_id, body)
    permit = await require_economy_action(
        admin,
        actor_id,
        owner,
        "structure_repair",
        expected_epoch=epoch,
    )
    context = permit.context
    reply = await admin.call_function(
        "island_shared_structure_repair",
        {
            "p_actor_id": actor_id,
            "p_island_owner": owner,
            "p_account_id": context.account_id,
            "p_run_epoch": context.run_epoch,
            "p_action_uid": body.action_uid,
            "p_expected_epoch": str(body.expected_epoch),
            "p_expected_wave_id": str(body.expected_wave_id),
            "p_spot": body.spot,
            "p_instance_id": str(body.instance_id),
            "p_expected_level": body.expected_level,
            "p_expected_repair_seq": body.expected_repair_seq,
            "p_quoted_price": body.quoted_price,
        },
    )
    result = read_reply(reply, actor_id, body)
    if str(result.receipt.origin.accountId) != context.account_id:
        raise SupabaseRejected("The repair used an unrelated treasury account.")
    return result


async def require_shared_revival(
    admin: SupabaseAdmin,
    actor_id: str,
    economy: RepairEconomyIntent,
) -> Never:
    """Guard the future free path without accepting client timing/fall/HP as authority.

    This is deliberately unavailable after permission succeeds too. No canonical provider
    currently proves target-bound uninterrupted holds, so no event or payment RPC is called.
    """
    await require_economy_action(
        admin,
        str(UUID(actor_id)),
        str(economy.islandOwner),
        "wave_revive",
        expected_epoch=str(economy.runEpoch),
    )
    raise ApiError(409, "economy_path_unavailable", "Canonical timed revival is unavailable.")
