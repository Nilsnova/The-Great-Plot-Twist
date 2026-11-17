"""Paid Repair now route for walls and supported towers.

The transaction is owned by `island_structure_repair()` and the canonical recovery read
adapter is owned by T55. The route only validates, authorizes, and returns fresh state.

Used by: app.py and the structure recovery card.
"""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.errors import ApiError
from server.game import islet_store
from server.island import permissions, service, structure_recovery, structure_repair
from server.island.service import IslandCatalogueDep
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


@router.post("/island/structures/repair", response_model=RepairResponse)
async def post_repair(
    body: RepairRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> RepairResponse | JSONResponse:
    """Charge once and return its immutable receipt plus current shared state and caller wallet."""
    request.app.state.island_build_budget.spend(player.id)

    try:
        island, receipt = await structure_repair.repair(
            admin, catalogue, player.id, body, structure_recovery.read_state
        )
    except ApiError as error:
        if error.code != "stale_recovery_quote":
            raise
        island, _ = await service.target_island(
            admin, catalogue, player.id, body.code, permissions.REPAIR
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
