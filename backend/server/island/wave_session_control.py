"""Exclusive controllers and session leadership rules, used by future authority integration.

The caller persists these pure transitions atomically with assignment and membership checks.
Connected activity timestamps come from trusted session state, never browser presence.
"""

from dataclasses import dataclass, replace
from datetime import datetime
from uuid import UUID

from server.errors import ApiError
from server.island.wave_session_state import ControlLease


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
    connected_at: datetime | None,
) -> tuple[ControlLease, ...]:
    """A reconnect starts a new continuous interval; repeated acknowledgments retain it."""
    if not any(
        same_controller(lease, asked) and lease.connection_generation == asked.connection_generation
        for lease in leases
    ):
        raise ApiError(403, "not_controller", "This session does not control that Captain.")
    return tuple(
        replace(
            lease,
            active_since=connected_at,
            connection_generation=lease.connection_generation + int(connected_at is not None),
        )
        if same_controller(lease, asked) and (connected_at is None or lease.active_since is None)
        else lease
        for lease in leases
    )


def select_leader(
    leases: tuple[ControlLease, ...],
    island_owner: UUID,
    eligible_members: frozenset[UUID],
    current_leader: UUID | None,
) -> UUID | None:
    """Retain an eligible leader; otherwise prefer longest continuous activity, then player ID."""
    candidates = tuple(
        lease
        for lease in leases
        if lease.island_owner == island_owner
        and lease.player_id in eligible_members
        and lease.active_since is not None
    )
    if any(lease.player_id == current_leader for lease in candidates):
        return current_leader
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
