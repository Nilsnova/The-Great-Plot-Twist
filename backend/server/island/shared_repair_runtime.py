"""Shared repair HTTP projection and explicit legacy guard; used by structure routes.

Account snapshots stay separate from immutable receipts. The guarded transaction owns all
money/HP/event changes; these HTTP helpers never read or mutate a personal wallet.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StrictBool

from server.errors import ApiError
from server.island import service, shared_combat_repair, structure_recovery
from server.island.catalogue import IslandCatalogue
from server.island.economy_http import require_economy_capability
from server.island.economy_permissions import require_economy_action
from server.island.shared_repair_transaction_models import SharedRepairReceipt, SharedRepairRequest
from server.island.treasury import resolve_economy_context
from server.island.treasury_store import EnvelopeRow, check_status, read_envelope
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class SharedStructureRecoveryView(structure_recovery.StructureRecoveryView):
    """The existing structure read plus its separately authenticated common account snapshot."""

    economy: EnvelopeRow


class SharedRepairHTTPReply(BaseModel):
    """Common effect receipt plus optional separately authorized current state, never coins."""

    receipt: SharedRepairReceipt
    repeat: StrictBool
    economy: EnvelopeRow | None = None
    currentState: structure_recovery.StructureRecoveryView | None = None


async def require_legacy_repair_target(
    admin: SupabaseAdmin,
    actor: str,
    code: str | None,
) -> None:
    """Only an explicit persisted legacy reply may reach the private-payment implementation."""
    owner = (await service.find_by_code(admin, code)).owner if code is not None else actor
    context = await resolve_economy_context(admin, actor, owner)
    if context.mode != "personal_legacy":
        raise ApiError(409, "economy_context_required", "Reload this island's shared repair offer.")


async def checked_envelope(
    admin: SupabaseAdmin,
    owner: str,
    account: str,
    epoch: str,
) -> EnvelopeRow:
    """Recheck account identity after a state read so a reset cannot mix two runs."""
    row = check_status(
        await admin.call_function(
            "island_economy_context",
            {
                "p_island_owner": owner,
            },
        )
    )
    if row.get("status") != "ok":
        raise ApiError(409, "economy_epoch_mismatch", "The island run changed. Refresh it.")
    current = read_envelope(row.get("economy"))
    if (current.island_owner, current.account_id, current.run_epoch) != (owner, account, epoch):
        raise ApiError(409, "economy_epoch_mismatch", "The island run changed. Refresh it.")
    return EnvelopeRow.model_validate(current.envelope())


async def read_shared_structures(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor: str,
    owner: str,
    request: Request,
    *,
    expected_epoch: str | None = None,
) -> SharedStructureRecoveryView:
    """Authorize a shared read without treating client capability as membership authority."""
    require_economy_capability(request)
    permit = await require_economy_action(
        admin,
        actor,
        owner,
        "island_visit",
        expected_epoch=expected_epoch,
    )
    state = await structure_recovery.read_state(admin, catalogue, owner)
    economy = await checked_envelope(
        admin,
        owner,
        permit.context.account_id,
        permit.context.run_epoch,
    )
    # A member can leave while either projection is awaited. Reauthorize the collected
    # snapshot before exposing it, without reading another unauthenticated balance after it.
    final_permit = await require_economy_action(
        admin,
        actor,
        owner,
        "island_visit",
        expected_epoch=permit.context.run_epoch,
    )
    if final_permit.context.account_id != permit.context.account_id:
        raise ApiError(409, "economy_epoch_mismatch", "The island run changed. Refresh it.")
    return SharedStructureRecoveryView.model_validate(
        {
            **state.model_dump(mode="json", by_alias=True),
            "economy": economy,
        }
    )


async def shared_repair_response(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor: str,
    body: SharedRepairRequest,
    request: Request,
) -> JSONResponse:
    """Keep owned historical replay independent of fresh membership/structure/wallet reads."""
    require_economy_capability(request)
    owner, epoch = str(body.economy.islandOwner), str(body.economy.runEpoch)
    try:
        result = await shared_combat_repair.repair_shared(admin, actor, body)
    except ApiError as error:
        if error.code != "stale_recovery_quote":
            raise
        try:
            fresh = await read_shared_structures(
                admin,
                catalogue,
                actor,
                owner,
                request,
                expected_epoch=epoch,
            )
        except (ApiError, SupabaseRejected):
            raise error from None
        current = fresh.model_dump(mode="json", by_alias=True)
        economy = current.pop("economy")
        return JSONResponse(
            status_code=409,
            content={
                "error": {"code": error.code, "message": error.message},
                "currentState": current,
                "economy": economy,
            },
            headers={"Cache-Control": "private, no-store"},
        )
    payload = {"receipt": result.receipt.model_dump(mode="json"), "repeat": result.repeat}
    if not result.repeat:
        try:
            fresh = await read_shared_structures(
                admin,
                catalogue,
                actor,
                owner,
                request,
                expected_epoch=epoch,
            )
        except (ApiError, SupabaseRejected):
            # The mutation is already committed; its receipt remains a successful result.
            fresh = None
        if fresh is not None:
            current = fresh.model_dump(mode="json", by_alias=True)
            payload["economy"] = current.pop("economy")
            payload["currentState"] = current
    return JSONResponse(content=payload, headers={"Cache-Control": "private, no-store"})
