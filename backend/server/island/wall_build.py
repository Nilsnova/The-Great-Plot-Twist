"""Trusted perimeter offers and original-intent reconciliation; atomic SQL owns mutations."""

from collections.abc import Mapping
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

from server.errors import ApiError
from server.flags import is_enabled
from server.island import layout, layout_store, permissions, service, store, wall_chain
from server.island.catalogue import IslandCatalogue
from server.island.store import read_model, refusal_or_none
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


class AdmissionResult(BaseModel):
    status: Literal["done"]
    repeat: StrictBool


class WallReceipt(BaseModel):
    """Immutable past result; its coordinates are not a command to rebuild current state."""

    model_config = ConfigDict(extra="forbid")
    actionUid: StrictStr
    totalCost: StrictInt = Field(ge=1)
    placements: list[dict[str, object]] = Field(min_length=1, max_length=32)
    repeat: StrictBool
    islandEpoch: UUID


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
            "walls_not_ready": (409, "Open perimeter wall building first."),
            "quote_changed": (409, "The wall quote changed. Review it before building."),
            "action_uid_conflict": (409, "That action was already used. Refresh and try again."),
            "spot_taken": (409, "A wall piece was built already. Refresh and try again."),
        }
        if refusal.reason == "not_member":
            raise permissions.refusal(permissions.BUILD)
        if refusal.reason in {"insufficient_funds", "player_not_set_up"}:
            raise service.paid_refusal(refusal, "This wall run")
        if refusal.reason == "no_island":
            raise service.no_such_island()
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


def read_receipt(reply: dict, intent: dict, action_uid: str) -> WallReceipt:
    """Require the exact original intent even if current prices, pieces or epoch changed."""
    if reply.get("status") != "done" or not isinstance(reply.get("receipt"), dict):
        raise SupabaseRejected("The wall construction receipt could not be read.")
    receipt = read_model(WallReceipt, reply["receipt"])
    if (
        receipt.actionUid != action_uid
        or receipt.totalCost != intent["quotedTotal"]
        or receipt.placements != intent["placements"]
        or str(receipt.islandEpoch) != intent["islandEpoch"]
    ):
        raise SupabaseRejected("The wall construction receipt could not be read.")
    return receipt


async def build(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    flags: Mapping[str, bool],
    placements: list[dict],
    quoted_total: int,
    action_uid: str,
    island_epoch: str,
    code: str | None = None,
) -> tuple[WallReceipt, service.IslandView]:
    island, payer_context = await service.target_island(
        admin, catalogue, player_id, code, permissions.BUILD
    )
    intent = {"placements": placements, "quotedTotal": quoted_total, "islandEpoch": island_epoch}
    identity = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_action_uid": action_uid,
        "p_intent": intent,
    }
    old = check_refusal(await admin.call_function("island_wall_build_receipt", identity))
    if old.get("status") == "done":
        receipt = read_receipt(old, intent, action_uid)
        return receipt, await service.look_open(admin, catalogue, island, payer_context)
    if old.get("status") != "missing":
        raise SupabaseRejected("The wall construction receipt could not be read.")
    await require_offers(admin, catalogue, flags, island.owner)
    snapshot = await layout_store.read_snapshot(admin, island.owner)
    if snapshot.island_epoch != island_epoch:
        raise ApiError(409, "quote_changed", "The island was reset. Review the wall quote again.")
    built = await store.read_built_spots(admin, island.owner)
    owner = await store.read_progress(admin, island.owner)
    payer = owner if island.owner == player_id else await store.read_progress(admin, player_id)
    quoted = wall_chain.quote_chain(
        catalogue,
        built,
        snapshot,
        [(p["x"], p["z"]) for p in placements],
        wave=owner.wave_best,
        role=payer.role,
        island_epoch=snapshot.island_epoch,
    )
    if [p.wire() for p in quoted.placements] != placements or quoted.total_cost != quoted_total:
        raise ApiError(409, "quote_changed", "The wall quote changed. Review it before building.")
    arguments = {
        **identity,
        "p_items": [
            {
                "spot": p.spot,
                "x_half": round(p.x * 2),
                "z_half": round(p.z * 2),
                "price": quoted.unit_cost,
            }
            for p in quoted.placements
        ],
        "p_seen": layout_store.seen_rows(snapshot.rows),
        "p_expected_role": payer.role,
        "p_expected_wave_best": owner.wave_best,
    }
    done = check_refusal(await admin.call_function("island_wall_build", arguments))
    receipt = read_receipt(done, intent, action_uid)
    return receipt, await service.look_open(admin, catalogue, island, payer_context)
