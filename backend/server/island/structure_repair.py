"""Paid Repair now: authorize, freeze stable intent, and call one atomic SQL transaction.

Used by: the Repair now route and paid repair service tests.
"""

from collections.abc import Awaitable, Callable
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, StrictBool, StrictInt, StrictStr

from server.errors import ApiError
from server.island import permissions, service
from server.island.catalogue import IslandCatalogue
from server.island.store import Island, read_model
from server.island.structure_repair_models import RepairReceipt, RepairRequest
from server.island.structure_repair_rules import (
    REPAIRABLE_KINDS,
    catalogue_price_schedule,
    request_intent_fingerprint,
)
from server.supabase_admin import SupabaseAdmin, SupabaseRejected
from server.wallet import MAX_DELTA


class ExistingReceiptRow(BaseModel):
    """Immutable table fields used to recognize a UID retry before stale quote checks."""

    payer_id: UUID
    action_uid: StrictStr
    island_owner: UUID
    reset_epoch: UUID
    instance_id: UUID
    spot: StrictStr
    building_kind: StrictStr
    level: StrictInt
    charged_price: StrictInt
    request_fingerprint: StrictStr


class RepairRefusalRow(BaseModel):
    """A side-effect-free refusal from island_structure_repair()."""

    status: Literal["refused"]
    reason: StrictStr
    price: StrictInt = 0


class RepairDoneRow(BaseModel):
    """The immutable receipt and ledger balance returned by the atomic transaction."""

    status: Literal["done"]
    repeat: StrictBool
    receipt: dict[str, object]
    balance: StrictInt
    event: dict[str, object] | None = None


ReadRecoveryState = Callable[[SupabaseAdmin, IslandCatalogue, str], Awaitable[object]]


async def repair(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    body: RepairRequest,
    read_state: ReadRecoveryState,
) -> tuple[Island, RepairReceipt]:
    """Repair the selected instance. Permission checks precede receipt lookup; SQL repeats them.

    `read_state` is T55's canonical, read-only recovery adapter. It is called only when this UID
    has no receipt, so a previous successful UID can be returned even after a reset or demolition.
    """
    island, _ = await service.target_island(
        admin, catalogue, player_id, body.code, permissions.REPAIR
    )
    repair_kind = await kind_for_intent(admin, catalogue, island.owner, player_id, body, read_state)
    arguments = rpc_arguments(catalogue, island, player_id, body, repair_kind)
    reply = await admin.call_function("island_structure_repair", arguments)
    if isinstance(reply, dict) and reply.get("status") == "refused":
        raise repair_refusal(read_model(RepairRefusalRow, reply))
    done = read_model(RepairDoneRow, reply)
    return island, read_model(RepairReceipt, done.receipt)


async def kind_for_intent(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    owner_id: str,
    player_id: str,
    body: RepairRequest,
    read_state: ReadRecoveryState,
) -> str:
    """Use a prior receipt's kind on retry; otherwise read the server's current target kind."""
    old_receipt = await existing_receipt(admin, player_id, body.action_uid)
    if old_receipt is not None:
        return old_receipt.building_kind
    state = await read_state(admin, catalogue, owner_id)
    repair_kind = kind_for_instance(state, body.instance_id)
    if repair_kind is None:
        raise ApiError(
            409,
            "stale_recovery_quote",
            "The structure changed. Refresh it and confirm the repair again.",
        )
    if repair_kind not in REPAIRABLE_KINDS:
        raise ApiError(422, "wrong_kind", "Only walls and towers can be repaired.")
    return repair_kind


def rpc_arguments(
    catalogue: IslandCatalogue,
    island: Island,
    player_id: str,
    body: RepairRequest,
    repair_kind: str,
) -> dict[str, object]:
    """Build the database command from the authenticated caller and server catalogue."""
    fingerprint = request_intent_fingerprint(str(island.owner), repair_kind, body)
    return {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_spot": body.spot,
        "p_instance_id": str(body.instance_id),
        "p_action_uid": body.action_uid,
        "p_expected_epoch": str(body.expected_epoch),
        "p_expected_window": body.expected_window,
        "p_expected_wave_id": (
            str(body.expected_wave_id) if body.expected_wave_id is not None else None
        ),
        "p_expected_level": body.expected_level,
        "p_expected_repair_seq": body.expected_repair_seq,
        "p_quoted_price": body.quoted_price,
        "p_request_fingerprint": fingerprint,
        "p_prices": catalogue_price_schedule(catalogue),
    }


async def existing_receipt(
    admin: SupabaseAdmin, player_id: str, action_uid: str
) -> ExistingReceiptRow | None:
    """Read an immutable UID receipt after the route has already checked island permission."""
    rows = await admin.select_rows(
        "structure_repair_receipts",
        {
            "select": (
                "payer_id,action_uid,island_owner,reset_epoch,instance_id,spot,building_kind,"
                "level,charged_price,request_fingerprint"
            ),
            "payer_id": f"eq.{player_id}",
            "action_uid": f"eq.{action_uid}",
            "limit": "1",
        },
    )
    return read_model(ExistingReceiptRow, rows[0]) if rows else None


def kind_for_instance(state: object, instance_id: UUID) -> str | None:
    """Find the server-read kind for the exact instance, independent of its current spot."""
    wire = state.model_dump(mode="json", by_alias=True) if hasattr(state, "model_dump") else state
    if not isinstance(wire, dict) or not isinstance(wire.get("structures"), list):
        raise SupabaseRejected("The recovery service sent an answer we could not read.")
    for item in wire["structures"]:
        if not isinstance(item, dict) or item.get("instanceId") != str(instance_id):
            continue
        value = item.get("kind")
        return value if isinstance(value, str) else None
    return None


def repair_refusal(row: RepairRefusalRow) -> ApiError:
    """Map transaction refusals to existing API errors without inventing wallet reasons."""
    if row.reason == "not_member":
        return ApiError(403, "not_member", "Join this game first to repair buildings here.")
    if row.reason == "no_such_island":
        return ApiError(404, "no_such_island", "That island does not exist.")
    if row.reason == "player_not_set_up":
        return ApiError(
            404, "player_not_set_up", "Set up your player before repairing a structure."
        )
    if row.reason == "wrong_kind":
        return ApiError(422, "wrong_kind", "Only walls and towers can be repaired.")
    if row.reason == "intact":
        return ApiError(409, "intact", "This structure is already at full health.")
    if row.reason == "insufficient_funds":
        price = min(max(row.price, 1), MAX_DELTA)
        return ApiError(
            409,
            "insufficient_funds",
            f"Repairing this structure costs {price} coins. You need more coins.",
        )
    if row.reason == "repair_limit_reached":
        return ApiError(409, row.reason, "This island has used all three repairs for this wave.")
    if row.reason == "action_uid_conflict":
        return ApiError(409, row.reason, "This repair ID was already used for a different action.")
    if row.reason == "stale_recovery_quote":
        return ApiError(
            409, row.reason, "The structure changed. Refresh it and confirm the repair again."
        )
    if row.reason == "feature_off":
        return ApiError(404, row.reason, "Structure recovery is not open for this island yet.")
    if row.reason == "health_sync_required":
        return ApiError(409, row.reason, "Update the wave health state, then try the repair again.")
    if row.reason == "recovery_unavailable":
        return ApiError(
            503, row.reason, "Structure recovery is not available right now. Try again soon."
        )
    return SupabaseRejected()
