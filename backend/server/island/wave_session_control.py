"""Exclusive controllers and session leadership rules, used by future authority integration.

The caller persists these pure transitions atomically with assignment and membership checks.
Connected activity timestamps come from trusted session state, never browser presence.
"""

from dataclasses import dataclass, replace
from datetime import datetime
from uuid import UUID

from server.errors import ApiError
from server.island.wave_session_state import DISCONNECT_GRACE, ControlLease


def same_controller(left: ControlLease, right: ControlLease) -> bool:
    return (
        left.player_id == right.player_id
        and left.session_id == right.session_id
        and left.island_owner == right.island_owner
    )


def acquire_control(
    leases: tuple[ControlLease, ...],
    asked: ControlLease,
) -> tuple[ControlLease, ...]:
    for lease in leases:
        if lease.player_id == asked.player_id:
            if same_controller(lease, asked):
                return leases
            raise ApiError(409, "captain_assigned", "That Captain already has a controller.")
    return (*leases, asked)


def release_control(
    leases: tuple[ControlLease, ...],
    asked: ControlLease,
) -> tuple[ControlLease, ...]:
    if not any(
        same_controller(lease, asked) and lease.connection_generation == asked.connection_generation
        for lease in leases
    ):
        raise ApiError(403, "not_controller", "This session does not control that Captain.")
    return tuple(lease for lease in leases if not same_controller(lease, asked))


def set_connection(
    leases: tuple[ControlLease, ...],
    asked: ControlLease,
    *,
    now: datetime,
    is_connected: bool,
) -> tuple[ControlLease, ...]:
    """A reconnect starts a new continuous interval; repeated acknowledgments retain it."""
    if not any(
        same_controller(lease, asked) and lease.connection_generation == asked.connection_generation
        for lease in leases
    ):
        raise ApiError(403, "not_controller", "This session does not control that Captain.")
    current = next(lease for lease in leases if same_controller(lease, asked))
    if (current.active_since is not None) == is_connected:
        return leases
    if is_connected and current.grace_until is not None and now >= current.grace_until:
        raise ApiError(409, "slot_expired", "This retained controller is no longer resumable.")
    changed = replace(
        current,
        active_since=now if is_connected else None,
        connection_generation=current.connection_generation + int(is_connected),
        grace_until=None if is_connected else now + DISCONNECT_GRACE,
    )
    return tuple(changed if same_controller(lease, asked) else lease for lease in leases)


def select_leader(
    leases: tuple[ControlLease, ...],
    island_owner: UUID,
    eligible_members: frozenset[UUID],
    current_leader: UUID | None,
    *,
    now: datetime,
) -> UUID | None:
    """Keep the eligible leader through grace, then prefer longest activity and player ID."""
    eligible = tuple(
        lease
        for lease in leases
        if lease.island_owner == island_owner and lease.player_id in eligible_members
    )
    if any(
        lease.player_id == current_leader
        and (
            lease.active_since is not None
            or lease.grace_until is not None
            and now < lease.grace_until
        )
        for lease in eligible
    ):
        return current_leader
    candidates = tuple(lease for lease in eligible if lease.active_since is not None)
    if not candidates:
        return None
    return min(candidates, key=lambda lease: (lease.active_since, lease.player_id.int)).player_id


@dataclass(frozen=True)
class SessionSettings:
    paused: bool = False
    auto_next: bool = False


def update_settings(
    settings: SessionSettings,
    actor_id: UUID,
    leader_id: UUID | None,
    *,
    is_reserved: bool,
    paused: bool | None = None,
    auto_next: bool | None = None,
) -> SessionSettings:
    if leader_id is None or actor_id != leader_id:
        raise ApiError(403, "not_session_leader", "Only the session leader can change settings.")
    if paused is not None and is_reserved:
        raise ApiError(409, "wave_running", "A construction break cannot pause a reserved wave.")
    return replace(
        settings,
        paused=settings.paused if paused is None else paused,
        auto_next=settings.auto_next if auto_next is None else auto_next,
    )
