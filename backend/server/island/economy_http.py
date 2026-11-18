"""Persisted-mode HTTP dispatch and original-root resolution for shared island actions.

Used by island routes. New actions require the real authority provider; exact retries retain
their original account and let the atomic domain transaction validate the frozen intent.
"""

from fastapi import Request
from pydantic import BaseModel, ValidationError

from server.errors import ApiError
from server.island import construction_store, economy_progression, service, shared_crew
from server.island.catalogue import IslandCatalogue
from server.island.construction_rules import ConstructionIntent
from server.island.economy_http_models import SharedBody, intent_fields
from server.island.economy_operations import root_action_uid
from server.island.economy_permissions import require_economy_action
from server.island.shared_crew_rules import HireIntent
from server.island.treasury import EconomyContext, resolve_economy_context
from server.island.treasury_store import check_status
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

DOMAIN_ACTIONS = {
    "build": "construction:build",
    "upgrade": "construction:upgrade",
    "demolish": "construction:demolish",
    "research": "progression:research",
    "towerSkill": "progression:specialise",
    "towerTree": "progression:tower_tree",
    "wreck": "progression:wreck",
    "hire": "crew:hire",
}
POLICY_ACTIONS = {"towerSkill": "island_tower_skill", "towerTree": "island_tower_tree"}
PROGRESSION_ACTIONS = {"towerSkill": "specialise", "towerTree": "tower_tree"}


async def target_owner(admin: SupabaseAdmin, actor_id: str, code: str | None) -> str:
    if code is None:
        return actor_id
    return (await service.find_by_code(admin, code)).owner


async def persisted_context(
    admin: SupabaseAdmin,
    actor_id: str,
    owner: str,
    *,
    allow_missing_own: bool = False,
) -> EconomyContext | None:
    """Only an explicit missing own island permits the guarded legacy creation path."""
    try:
        return await resolve_economy_context(admin, actor_id, owner)
    except ApiError as error:
        if allow_missing_own and owner == actor_id and error.code == "no_such_island":
            return None
        raise


async def require_legacy_target(
    admin: SupabaseAdmin,
    actor_id: str,
    code: str | None = None,
) -> None:
    owner = await target_owner(admin, actor_id, code)
    context = await persisted_context(admin, actor_id, owner, allow_missing_own=code is None)
    if context is not None and context.mode != "personal_legacy":
        raise ApiError(409, "economy_context_required", "Read this island's shared context first.")


async def original_context(
    admin: SupabaseAdmin,
    actor_id: str,
    action: str,
    body: SharedBody,
) -> EconomyContext | None:
    value = await admin.call_function(
        "island_economy_operation_origin",
        {
            "p_actor_id": actor_id,
            "p_island_owner": str(body.economy.islandOwner),
            "p_run_epoch": str(body.economy.runEpoch),
            "p_action_uid": body.actionUid,
            "p_domain_action": DOMAIN_ACTIONS[action],
        },
    )
    check_status(value)
    if value == {"status": "new"}:
        return None
    try:
        if set(value) != {"status", "origin"} or value["status"] != "replay":
            raise ValueError("Unreadable operation origin.")
        origin = construction_store.Origin.model_validate(value["origin"])
        if (origin.islandOwner, origin.runEpoch) != (
            body.economy.islandOwner,
            body.economy.runEpoch,
        ):
            raise ValueError("Another operation origin.")
        return EconomyContext(
            "island_shared",
            1,
            actor_id,
            str(origin.islandOwner),
            str(origin.accountId),
            str(origin.runEpoch),
            None,
        )
    except (ValueError, ValidationError) as error:
        raise SupabaseRejected("The database sent an unreadable operation origin.") from error


async def new_context(
    admin: SupabaseAdmin,
    actor_id: str,
    action: str,
    body: SharedBody,
) -> EconomyContext:
    owner = str(body.economy.islandOwner)
    if body.code is not None and await target_owner(admin, actor_id, body.code) != owner:
        raise ApiError(409, "economy_context_required", "The code names another island.")
    policy = POLICY_ACTIONS.get(action, "island_" + action)
    if action == "research" and body.change:
        policy = "island_research_change"
    permit = await require_economy_action(
        admin,
        actor_id,
        owner,
        policy,
        expected_epoch=str(body.economy.runEpoch),
    )
    return permit.context


async def dispatch(
    admin: SupabaseAdmin,
    context: EconomyContext,
    action: str,
    body: SharedBody,
    catalogue: IslandCatalogue,
) -> dict:
    fields = intent_fields(body)
    if action in {"build", "upgrade", "demolish"}:
        intent = ConstructionIntent.model_validate({"action": action, **fields})
        return await construction_store.construct(admin, context, body.actionUid, intent, catalogue)
    if action == "hire":
        return await shared_crew.hire(
            admin, context, body.actionUid, HireIntent(**fields), catalogue
        )
    result = await economy_progression.mutate(
        admin,
        catalogue,
        context,
        body.actionUid,
        {
            "action": PROGRESSION_ACTIONS.get(action, action),
            **fields,
        },
    )
    return result.model_dump(mode="json")


async def shared_write(
    admin: SupabaseAdmin,
    actor_id: str,
    action: str,
    body: BaseModel,
    catalogue: IslandCatalogue,
) -> dict | None:
    if not isinstance(body, SharedBody):
        await require_legacy_target(admin, actor_id, getattr(body, "code", None))
        return None
    root_action_uid(body.actionUid)
    context = await original_context(admin, actor_id, action, body)
    if context is None:
        context = await new_context(admin, actor_id, action, body)
    return await dispatch(admin, context, action, body, catalogue)


ECONOMY_CAPABILITY_HEADER = "X-Island-Economy-Version"


def require_economy_version(version: str | None) -> None:
    """Check transport compatibility without selecting an account or granting authority."""
    if version is None:
        raise ApiError(
            409, "economy_context_required", "Reload to use this shared island economy."
        )
    if version != "1":
        raise ApiError(
            409, "economy_version_mismatch", "This client does not support this island economy."
        )


def require_economy_capability(request: Request) -> None:
    """Refuse an old/unsupported client before exposing a shared snapshot or mutation."""
    require_economy_version(request.headers.get(ECONOMY_CAPABILITY_HEADER))


def require_body_capability(request: Request, body: BaseModel) -> None:
    """Shared HTTP intents negotiate before a root lookup or any domain transaction."""
    if isinstance(body, SharedBody):
        require_economy_capability(request)
        root_action_uid(body.actionUid)
