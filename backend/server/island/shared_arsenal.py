"""Dual-mode arsenal service. Routes resolve mode before legacy side effects."""

from fastapi import Request

from server.errors import ApiError
from server.island import arsenal, arsenal_policy, arsenal_rules, arsenal_store, service, store
from server.island.catalogue import IslandCatalogue
from server.island.codes import new_code
from server.island.economy_http import require_economy_capability
from server.island.shared_arsenal_requests import request_change
from server.island.shared_arsenal_views import EconomyIntent, read_view
from server.island.treasury import EconomyContext, resolve_economy_context
from server.supabase_admin import SupabaseAdmin


async def target(
    admin: SupabaseAdmin, actor: str, code: str | None
) -> tuple[str, store.Island | None]:
    island = await service.find_by_code(admin, code) if code is not None else None
    return (island.owner, island) if island else (actor, None)


async def context(
    admin: SupabaseAdmin, actor: str, owner: str, *, may_create: bool
) -> EconomyContext:
    try:
        return await resolve_economy_context(admin, actor, owner)
    except ApiError as error:
        if may_create and error.status_code == 404 and error.code == "no_such_island":
            # Successful absence permits only the atomic, guarded legacy initialization RPC.
            return EconomyContext("personal_legacy", 0, actor, owner, None, None, None)
        raise


async def shared_view(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, actor: str, owner: str
) -> dict:
    reply = await admin.call_function(
        "island_shared_arsenal_read",
        {
            "p_actor_id": actor,
            "p_island_owner": owner,
        },
    )
    return read_view(reply, catalogue, actor, owner)


async def legacy_request(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor: str,
    owner: str,
    island: store.Island | None,
    kind: str,
    *,
    action_uid: str | None = None,
    weapon: str | None = None,
    copy_id: str | None = None,
) -> arsenal.ArsenalView:
    await arsenal_policy.require_permission(
        admin,
        island or store.Island(owner, "", 0, 0),
        actor,
        "look" if kind == "state" else kind,
    )
    entry = None
    if kind == "buy":
        try:
            unlock = (await store.read_progress(admin, actor)).unlock_wave
        except ApiError as error:
            if error.status_code != 404:
                raise
            unlock = 0
        entry = arsenal_rules.check_buy(catalogue, weapon, unlock)
    for _ in range(store.CODE_TRIES):
        reply = await admin.call_function(
            "island_arsenal_legacy_request",
            {
                "p_actor_id": actor,
                "p_island_owner": owner,
                "p_kind": kind,
                "p_action_uid": action_uid,
                "p_weapon": weapon,
                "p_copy_id": copy_id,
                "p_starting_coins": catalogue.starting_coins,
                "p_price": entry.coins if entry else 0,
                "p_unlock_wave": entry.unlock_wave if entry else 0,
                "p_new_code": new_code(),
            },
        )
        if isinstance(reply, dict) and reply.get("status") == "code_taken":
            continue
        if isinstance(reply, dict) and reply.get("status") == "missing":
            raise store.player_not_set_up()
        outcome = arsenal_store.read_outcome(reply)
        if outcome.refusal:
            raise arsenal_rules.refusal_error(
                outcome.refusal, entry.name if entry else "This weapon", outcome.price
            )
        row = store.read_model(store.IslandRow, reply.get("island"))
        resolved = store.Island(row.player_id, row.code, row.wave_best, row.flags)
        return await arsenal.answer(admin, catalogue, resolved, actor, outcome)
    raise ApiError(503, "island_unavailable", "Your island could not be opened. Try again.")


async def look(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor: str,
    code: str | None,
    request: Request,
) -> arsenal.ArsenalView | dict:
    owner, island = await target(admin, actor, code)
    current = await context(admin, actor, owner, may_create=code is None)
    if current.mode == "personal_legacy":
        return await legacy_request(admin, catalogue, actor, owner, island, "state")
    require_economy_capability(request)
    return await shared_view(admin, catalogue, actor, owner)


async def change(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    actor: str,
    code: str | None,
    request: Request,
    intent: EconomyIntent | None,
    kind: str,
    action_uid: str,
    *,
    weapon: str | None = None,
    copy_id: str | None = None,
    generation: str | None = None,
) -> arsenal.ArsenalView | dict:
    if intent is not None:
        require_economy_capability(request)
        owner = str(intent.islandOwner)
        if code is not None:
            raise ApiError(
                422, "invalid_transaction", "A shared arsenal action uses its economy target."
            )
        result = await request_change(
            admin,
            catalogue,
            actor,
            owner,
            str(intent.runEpoch),
            action_uid,
            kind,
            weapon=weapon,
            copy_id=copy_id,
            generation=generation,
        )
        # A later read is independently authorized. An old receipt cannot select a reset run.
        result["arsenal"] = None
        try:
            fresh = await shared_view(admin, catalogue, actor, owner)
            origin = result["receipt"]["origin"]
            if all(
                fresh["economy"][key] == origin[key]
                for key in ("islandOwner", "accountId", "runEpoch")
            ):
                result["arsenal"] = fresh
        except ApiError:
            pass
        return result
    owner, island = await target(admin, actor, code)
    current = await context(admin, actor, owner, may_create=code is None)
    if (
        current.mode != "personal_legacy"
        or generation is not None
        or (kind == "return" and copy_id is not None)
    ):
        raise ApiError(
            409, "economy_context_required", "Use the original shared island action context."
        )
    return await legacy_request(
        admin,
        catalogue,
        actor,
        owner,
        island,
        kind,
        action_uid=action_uid,
        weapon=weapon,
        copy_id=copy_id,
    )
