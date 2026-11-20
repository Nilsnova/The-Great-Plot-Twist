"""Shared wire intents resolved atomically to original accounts. Used by arsenal HTTP service."""

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue
from server.island.economy_operations import root_action_uid
from server.island.shared_arsenal_store import ACTIONS, read_result
from server.island.treasury import identifier
from server.island.treasury_models import decimal_integer, decimal_string
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


async def request_change(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor_id: str,
    owner: str,
    epoch: str,
    action_uid: str,
    kind: str,
    *,
    weapon: str | None = None,
    copy_id: str | None = None,
    generation: str | None = None,
) -> dict:
    """Only the SQL wrapper selects account identity; no current-member preflight blocks replay."""
    if kind not in ACTIONS:
        raise ApiError(422, "invalid_transaction", "The arsenal action is not valid.")
    if kind != "buy" and (copy_id is None or generation is None):
        raise ApiError(422, "invalid_transaction", "Select the exact copy and holder generation.")
    entry = next((entry for entry in catalogue.weapons if entry.weapon == weapon), None)
    values = {
        "p_actor_id": identifier(actor_id),
        "p_island_owner": identifier(owner),
        "p_run_epoch": identifier(epoch),
        "p_action_uid": root_action_uid(action_uid),
        "p_kind": kind,
        "p_weapon": weapon,
        "p_copy_id": identifier(copy_id) if copy_id else None,
        "p_expected_generation": generation,
        "p_price": decimal_string(entry.coins) if entry else None,
        "p_unlock_wave": entry.unlock_wave if entry else None,
    }
    result = read_result(await admin.call_function("island_shared_arsenal_request", values))
    receipt, origin, effect = (
        result["receipt"],
        result["receipt"]["origin"],
        result["receipt"]["result"],
    )
    if (
        receipt["actorId"],
        receipt["actionUid"],
        receipt["action"],
        origin["islandOwner"],
        origin["runEpoch"],
    ) != (actor_id, action_uid, ACTIONS[kind], owner, epoch):
        raise SupabaseRejected("The arsenal receipt has a different intent or origin.")
    if kind == "buy":
        if effect["weapon"] != weapon or (
            not result["repeat"] and effect["priceCoins"] != values["p_price"]
        ):
            raise SupabaseRejected("The arsenal purchase receipt changed its weapon or price.")
    elif (
        effect["copyId"] != values["p_copy_id"]
        or decimal_integer(effect["holderGeneration"]) != decimal_integer(generation) + 1
    ):
        raise SupabaseRejected("The arsenal move receipt changed its copy or tenure.")
    return result
