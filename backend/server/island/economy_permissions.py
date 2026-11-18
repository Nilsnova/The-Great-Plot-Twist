"""New-mode island permissions, separate from legacy personal-wallet permissions (MP-ECO-08).

Used by: later shared-treasury integrations and isolated tests; existing routes do not import
this policy. Read checks are advisory. Every mutation must repeat them under database locks.
Saved-origin settlement is not a new player action and must load its original authorization.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import TYPE_CHECKING, Literal

from server.errors import ApiError
from server.island.economy_authority import (
    EconomyAuthority,
    authority_unavailable,
    read_economy_authority,
)
from server.supabase_admin import SupabaseAdmin

if TYPE_CHECKING:
    from server.island.treasury import EconomyContext

Funding = Literal["island_treasury", "none"]
Phase = Literal["any", "between_reservations", "reserved_wave"]
Role = Literal["host", "member"]


@dataclass(frozen=True)
class ActionRule:
    funding: Funding
    required_phase: Phase
    owner_only: bool = False
    leader_only: bool = False
    personal_idle: bool = False
    participant_only: bool = False


@dataclass(frozen=True)
class EconomyDecision:
    role: Role
    funding: Funding
    required_phase: Phase
    is_session_leader: bool


@dataclass(frozen=True)
class EconomyPermit:
    """A resolved island account and an advisory decision, never an atomic spending receipt."""

    context: EconomyContext
    action: str
    role: Role
    funding: Funding
    required_phase: Phase
    is_session_leader: bool


ACTIONS = MappingProxyType({
    "island_visit": ActionRule("none", "any"),
    "island_build": ActionRule("island_treasury", "between_reservations"),
    "island_upgrade": ActionRule("island_treasury", "between_reservations"),
    "island_research": ActionRule("island_treasury", "between_reservations"),
    "island_research_change": ActionRule("island_treasury", "between_reservations"),
    "island_tower_skill": ActionRule("island_treasury", "between_reservations"),
    "island_tower_tree": ActionRule("island_treasury", "between_reservations"),
    "island_hire": ActionRule("island_treasury", "between_reservations"),
    "island_wreck": ActionRule("island_treasury", "between_reservations"),
    "island_demolish": ActionRule("island_treasury", "between_reservations"),
    "island_move": ActionRule("none", "between_reservations"),
    "arsenal_buy": ActionRule("island_treasury", "between_reservations"),
    "arsenal_withdraw": ActionRule("none", "between_reservations"),
    "arsenal_swap": ActionRule("none", "between_reservations"),
    "arsenal_return": ActionRule("none", "between_reservations"),
    "island_reset": ActionRule("none", "between_reservations", owner_only=True),
    "island_delete": ActionRule("none", "between_reservations", owner_only=True),
    "wave_start": ActionRule("none", "between_reservations", leader_only=True),
    "wave_pause": ActionRule("none", "between_reservations", leader_only=True),
    "wave_auto_next": ActionRule("none", "any", leader_only=True),
    "island_bet": ActionRule("island_treasury", "any"),
    "structure_repair": ActionRule("island_treasury", "reserved_wave"),
    "combat_input": ActionRule("none", "reserved_wave", participant_only=True),
    "wave_revive": ActionRule("none", "reserved_wave", participant_only=True),
    "captain_role": ActionRule("none", "any", personal_idle=True),
    "captain_skill": ActionRule("none", "any", personal_idle=True),
    "captain_respec": ActionRule("none", "any", personal_idle=True),
})


def rule_of(action: str) -> ActionRule:
    if action not in ACTIONS:
        raise ValueError("Unknown shared-economy action.")
    return ACTIONS[action]


def _require_phase(state: EconomyAuthority, rule: ActionRule) -> None:
    is_reserved = state.reservation_id is not None
    if rule.required_phase == "between_reservations" and is_reserved:
        raise ApiError(409, "wave_running", "Use this action between wave reservations.")
    if rule.required_phase == "reserved_wave" and not is_reserved:
        raise ApiError(409, "wave_not_running", "This action needs a reserved wave.")
    if rule.personal_idle and state.actor_assignment_wave_id is not None:
        raise ApiError(409, "captain_assigned", "Finish your reserved wave before changing skills.")
    if rule.participant_only and state.actor_assignment_wave_id != state.reservation_id:
        raise ApiError(403, "not_in_wave", "Only an assigned participant may act in this wave.")


def authorize_economy_action(state: EconomyAuthority, action: str) -> EconomyDecision:
    """Apply the matrix to trusted state. No caller-selected role or payment account is accepted."""
    rule = rule_of(action)
    is_owner = state.actor_id == state.island_owner
    if not is_owner and not state.is_member:
        raise ApiError(403, "not_member", "Join this game before using its island economy.")
    is_leader = state.actor_id == state.session_leader_id
    if rule.owner_only and not is_owner:
        raise ApiError(403, "not_owner", "Only the island owner may reset or delete it.")
    if rule.leader_only and not is_leader:
        raise ApiError(403, "not_session_leader", "The current session leader controls waves.")
    _require_phase(state, rule)
    return EconomyDecision(
        "host" if is_owner else "member", rule.funding, rule.required_phase, is_leader,
    )


def require_captain_role_binding(
    *, engineer_commitment_id: str | None, resulting_role: str | None,
) -> None:
    """Guard intended personal role changes against a server-loaded pending commitment.

    MP-ECO-07 must read the commitment under the personal mutation lock and call this guard;
    generic action preflight has neither the role intent nor that private commitment state.
    """
    if engineer_commitment_id is not None and resulting_role != "engineer":
        raise ApiError(
            409, "engineer_bound", "Play your committed Engineer wave before changing role.",
        )


async def _resolve_context(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, *, expected_epoch: str | None,
) -> EconomyContext:
    """Keep the pure policy usable before the separately delivered MP-ECO-02 foundation lands."""
    try:
        from server.island.treasury import resolve_economy_context
    except ModuleNotFoundError as error:
        if error.name != "server.island.treasury":
            raise
        raise authority_unavailable() from error
    return await resolve_economy_context(
        admin, actor_id, island_owner, expected_epoch=expected_epoch,
    )


def _require_context(context: EconomyContext, actor_id: str, owner: str, epoch: str | None) -> None:
    if context.mode == "personal_legacy":
        raise ApiError(409, "economy_context_required", "This action needs an island treasury.")
    if (context.mode != "island_shared" or context.version != 1
            or not context.account_id or not context.run_epoch
            or context.actor_id != actor_id or context.island_owner != owner):
        raise authority_unavailable()
    if epoch is not None and context.run_epoch != epoch:
        raise ApiError(409, "economy_epoch_mismatch", "The island run changed. Reload its state.")


async def require_economy_action(
    admin: SupabaseAdmin, actor_id: str, island_owner: str, action: str,
    *, expected_epoch: str | None = None,
) -> EconomyPermit:
    """Resolve a shared account and server authority; mutations must recheck both under locks."""
    rule_of(action)
    if action != "island_visit" and not expected_epoch:
        raise ApiError(409, "economy_context_required", "Read the island's current run first.")
    context = await _resolve_context(admin, actor_id, island_owner, expected_epoch=expected_epoch)
    _require_context(context, actor_id, island_owner, expected_epoch)
    state = await read_economy_authority(admin, actor_id, island_owner)
    decision = authorize_economy_action(state, action)
    return EconomyPermit(context, action, decision.role, decision.funding,
                         decision.required_phase, decision.is_session_leader)
