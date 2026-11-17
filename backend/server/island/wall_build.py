"""Trusted perimeter admission and current quotes; atomic SQL owns every mutation."""

from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, StrictBool

from server.errors import ApiError
from server.flags import is_enabled
from server.island import layout, layout_store, permissions, service, store, wall_chain
from server.island.catalogue import IslandCatalogue
from server.island.store import read_model, refusal_or_none
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class AdmissionResult(BaseModel):
    status: Literal["done"]
    repeat: StrictBool


def check_refusal(reply: object) -> dict:
    """Stable SQL refusals are player errors; an unknown answer is never success."""
    if not isinstance(reply, dict):
        raise SupabaseRejected("The wall action could not be read.")
    refusal = refusal_or_none(reply)
    if refusal is not None:
        errors = {
            "owner_only": (403, "Only the island owner can open perimeter wall building."),
            "busy": (409, "The island changed. Refresh and try again."),
            "wave_running": (409, "A wave is under way. Build walls between waves."),
            "no_island": (404, "There is no island with that code."),
        }
        if refusal.reason == "not_member":
            raise permissions.refusal(permissions.BUILD)
        if refusal.reason not in errors:
            raise SupabaseRejected("The wall action could not be read.")
        status, message = errors[refusal.reason]
        raise ApiError(status, refusal.reason, message)
    return reply


async def require_offers(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, flags: Mapping[str, bool], owner: str
) -> None:
    """Pause new offers without changing the interpretation of existing paid state."""
    if not is_enabled("perimeter_walls", flags) or not catalogue.placement:
        raise ApiError(404, "feature_off", "Perimeter wall building is not open yet.")
    if (
        not is_enabled("structure_recovery", flags)
        and await service.read_recovery_version(admin, owner) != 1
    ):
        raise ApiError(
            409, "client_update_required", "Perimeter walls need structure recovery support."
        )


async def enable(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    flags: Mapping[str, bool],
    code: str | None = None,
) -> service.IslandView:
    island, _ = await service.target_island(admin, catalogue, player_id, code, permissions.MOVE)
    if island.owner != player_id:
        raise ApiError(403, "owner_only", "Only the island owner can open perimeter wall building.")
    snapshot = await layout_store.read_snapshot(admin, island.owner)
    if snapshot.rule_version == 1:
        return await service.look_open(admin, catalogue, island)  # Idempotent after offers pause.
    await require_offers(admin, catalogue, flags, island.owner)
    effective = layout.positions_of(
        layout.island_layout(more=True), layout_store.positions_from(snapshot.rows)
    )
    rows = [
        {"plot": spot, "x_half": round(x * 2), "z_half": round(z * 2)}
        for spot, (x, z) in sorted(effective.items())
    ]
    reply = await admin.call_function(
        "island_wall_policy_admit",
        {
            "p_player_id": player_id,
            "p_island_owner": island.owner,
            "p_seen": layout_store.seen_rows(snapshot.rows),
            "p_effective": rows,
        },
    )
    read_model(AdmissionResult, check_refusal(reply))
    return await service.look_open(admin, catalogue, island)


async def quote(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    flags: Mapping[str, bool],
    cells: list[tuple[float, float]],
    code: str | None = None,
) -> wall_chain.WallQuote:
    island, _ = await service.target_island(admin, catalogue, player_id, code, permissions.BUILD)
    await require_offers(admin, catalogue, flags, island.owner)
    snapshot = await layout_store.read_snapshot(admin, island.owner)
    built = await store.read_built_spots(admin, island.owner)
    owner = await store.read_progress(admin, island.owner)
    payer = owner if island.owner == player_id else await store.read_progress(admin, player_id)
    return wall_chain.quote_chain(
        catalogue,
        built,
        snapshot,
        cells,
        wave=owner.wave_best,
        role=payer.role,
        island_epoch=snapshot.island_epoch,
    )
