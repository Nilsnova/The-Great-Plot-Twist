"""Paid Repair now route for walls and supported towers.

Persisted shared mode uses the atomic treasury repair and common receipt. Explicit legacy
mode keeps its personal-payment transaction. The route validates and projects domain results.

Used by: app.py and the structure recovery card.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.errors import ApiError
from server.game import islet_store
from server.island import (
    shared_repair_runtime,
    structure_recovery,
    structure_repair,
)
from server.island.service import IslandCatalogueDep
from server.island.shared_repair_transaction_models import SharedRepairRequest
from server.island.structure_repair_models import RepairRequest, RepairResponse
from server.routes.island import IslandPlayerDep
from server.supabase_admin import AdminDep

router = APIRouter()


class RepairConflict(BaseModel):
    """A stale quote includes current state so the caller can refresh before retrying."""

    error: dict[str, str]
    currentState: dict[str, object]
    coins: int


def state_payload(value: object) -> dict[str, object]:
    """Serialize T55's canonical read model with the public camel-case wire names."""
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        result = value.model_dump(mode="json", by_alias=True)
        if isinstance(result, dict):
            return result
    raise ApiError(503, "island_unavailable", "The structure state could not be read.")


def stale_quote_response(current_state: dict[str, object], coins: int) -> JSONResponse:
    """Return the ordinary error envelope together with the fresh quote context."""
    body = RepairConflict(
        error={
            "code": "stale_recovery_quote",
            "message": "The structure changed. Refresh it and confirm the repair again.",
        },
        currentState=current_state,
        coins=coins,
    )
    return JSONResponse(
        status_code=409,
        content=body.model_dump(mode="json", by_alias=True),
        headers={"Cache-Control": "private, no-store"},
    )


@router.post(
    "/island/structures/repair",
    response_model=RepairResponse | shared_repair_runtime.SharedRepairHTTPReply,
)
async def post_repair(
    body: SharedRepairRequest | RepairRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> RepairResponse | JSONResponse:
    """Choose persisted accounting, then return its immutable receipt and authorized state."""
    request.app.state.island_build_budget.spend(player.id)
    if isinstance(body, SharedRepairRequest):
        return await shared_repair_runtime.shared_repair_response(
            admin,
            catalogue,
            player.id,
            body,
            request,
        )
    await shared_repair_runtime.require_legacy_repair_target(admin, player.id, body.code)

    try:
        island, receipt = await structure_repair.repair(
            admin, catalogue, player.id, body, structure_recovery.read_state
        )
    except ApiError as error:
        if error.code != "stale_recovery_quote":
            raise
        island = await structure_recovery.resolve_target_island(
            admin, catalogue, player.id, body.code
        )
        fresh = state_payload(await structure_recovery.read_state(admin, catalogue, island.owner))
        coins = await islet_store.read_coins(admin, player.id)
        return stale_quote_response(fresh, coins)

    current_state = state_payload(
        await structure_recovery.read_state(admin, catalogue, island.owner)
    )
    coins = await islet_store.read_coins(admin, player.id)
    return RepairResponse(
        receipt=receipt,
        currentState=current_state,
        coins=coins,
    )
