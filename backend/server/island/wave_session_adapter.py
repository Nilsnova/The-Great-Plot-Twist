"""Read-only reserved-session binding, used by coordinated wave integration and contract tests.

This adapter writes nothing. Its caller must load actual canonical reservation/frozen origin
and controller state; fixture preflight cannot supply missing persistent authority. Every
eventual mutation must independently recheck these conditions atomically under its locks.
"""

from datetime import datetime
from uuid import UUID

from server.errors import ApiError
from server.island.economy_authority import authority_unavailable, read_economy_authority
from server.island.economy_permissions import EconomyPermit, authorize_economy_action
from server.island.treasury import EconomyContext, identifier, resolve_economy_context
from server.island.wave_session_lifecycle import find_slot, require_open
from server.island.wave_session_state import Reservation
from server.supabase_admin import SupabaseAdmin

RESERVED_SESSION_ACTIONS = frozenset({"combat_input", "wave_revive"})


def _require_frozen_origin(wave: Reservation, frozen: EconomyContext | None) -> EconomyContext:
    if (
        not isinstance(frozen, EconomyContext)
        or frozen.mode != "island_shared"
        or type(frozen.version) is not int
        or frozen.version != 1
        or frozen.island_owner != str(wave.island_owner)
    ):
        raise authority_unavailable()
    try:
        if str(UUID(frozen.account_id)) != frozen.account_id:
            raise ValueError("Frozen account identity is not canonical.")
    except (ValueError, TypeError, AttributeError) as error:
        raise authority_unavailable() from error
    if frozen.run_epoch != str(wave.run_epoch):
        raise ApiError(409, "economy_epoch_mismatch", "The frozen wave belongs to another run.")
    return frozen


def _require_active_controller(
    wave: Reservation,
    actor_id: str,
    session_id: UUID,
    generation: int,
    now: datetime,
) -> None:
    require_open(wave, now)
    if type(generation) is not int or generation < 0:
        raise ApiError(403, "not_controller", "This connection does not control that Captain.")
    slot = find_slot(wave, UUID(actor_id), session_id, generation)
    if slot.status != "active":
        raise ApiError(403, "not_controller", "This Captain has no active controlling connection.")
    if now < wave.starts_at:
        raise ApiError(409, "wave_too_early", "Combat has not begun.")


async def read_reserved_session_preflight(
    admin: SupabaseAdmin,
    actor_id: str,
    wave: Reservation,
    frozen_context: EconomyContext | None,
    session_id: UUID,
    connection_generation: int,
    now: datetime,
    *,
    action: str = "combat_input",
) -> EconomyPermit:
    """Bind existing advisory policy to a specific frozen origin, wave and controller.

    The frozen context's initiating actor is not the current authenticated actor. The
    independently resolved context always uses the latter; only origin identity is frozen.
    No recovery epoch, presence record or client capability can replace a missing origin.
    """
    if action not in RESERVED_SESSION_ACTIONS:
        raise ValueError("Unsupported reserved-session preflight action.")
    actor_id = identifier(actor_id)
    frozen = _require_frozen_origin(wave, frozen_context)
    context = await resolve_economy_context(
        admin,
        actor_id,
        str(wave.island_owner),
        expected_epoch=str(wave.run_epoch),
    )
    authority = await read_economy_authority(admin, actor_id, str(wave.island_owner))
    decision = authorize_economy_action(authority, action)
    if authority.reservation_id != str(wave.wave_id):
        raise ApiError(409, "wave_over", "This is no longer the island's current reservation.")
    if context.account_id != frozen.account_id:
        raise authority_unavailable()
    _require_active_controller(wave, actor_id, session_id, connection_generation, now)
    return EconomyPermit(
        context,
        action,
        decision.role,
        decision.funding,
        decision.required_phase,
        decision.is_session_leader,
    )
