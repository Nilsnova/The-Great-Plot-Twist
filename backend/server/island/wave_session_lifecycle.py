"""Pure shared-wave transitions, used by future atomic authority integration and tests.

Callers must authenticate and lock persisted assignments before applying these transitions.
There are no route hooks while the common prerequisites are unavailable.
"""

from dataclasses import replace
from datetime import datetime, timedelta
from uuid import UUID

from server.errors import ApiError
from server.island.wave_session_state import (
    ControlLease,
    Outcome,
    ParticipantSlot,
    ParticipantSnapshot,
    Reservation,
)

DISCONNECT_GRACE = timedelta(seconds=60)


def reserve_wave(
    wave_id: UUID,
    island_owner: UUID,
    run_epoch: UUID,
    accepted_at: datetime,
    starts_at: datetime,
    expires_at: datetime,
    snapshots: tuple[ParticipantSnapshot, ...],
    leases: tuple[ControlLease, ...],
    assigned_players: frozenset[UUID],
    world_snapshot: bytes,
) -> Reservation:
    """Freeze the authoritative bell roster after membership/leader checks and locking."""
    if not accepted_at <= starts_at < expires_at:
        raise ValueError("invalid reservation clock boundaries")
    players = [snapshot.player_id for snapshot in snapshots]
    if not players or len(players) != len(set(players)):
        raise ValueError("a bell requires distinct controlling Captains")
    if len({lease.player_id for lease in leases}) != len(leases):
        raise ValueError("a player cannot hold duplicate controlling leases")
    for snapshot in snapshots:
        if not any(
            lease.player_id == snapshot.player_id
            and lease.session_id == snapshot.session_id
            and lease.island_owner == island_owner
            and lease.active_since is not None
            for lease in leases
        ):
            raise ApiError(403, "not_controller", "This session does not control that Captain.")
        if snapshot.player_id in assigned_players:
            raise ApiError(409, "captain_assigned", "That Captain is already assigned to a wave.")
    return Reservation(
        wave_id,
        island_owner,
        run_epoch,
        accepted_at,
        starts_at,
        expires_at,
        tuple(
            ParticipantSlot(
                snapshot,
                connection_generation=next(
                    lease.connection_generation
                    for lease in leases
                    if lease.player_id == snapshot.player_id
                ),
            )
            for snapshot in snapshots
        ),
        world_snapshot,
    )


def find_slot(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    connection_generation: int,
) -> ParticipantSlot:
    """A late arrival cannot become a new participant after the bell."""
    for slot in wave.slots:
        if slot.snapshot.player_id == player_id:
            if slot.snapshot.session_id != session_id or (
                slot.connection_generation != connection_generation
            ):
                raise ApiError(403, "not_controller", "This session does not control that Captain.")
            return slot
    raise ApiError(403, "not_in_wave", "This Captain is not in the frozen wave roster.")


def replace_slot(wave: Reservation, changed: ParticipantSlot) -> Reservation:
    return replace(
        wave,
        slots=tuple(
            changed if slot.snapshot.player_id == changed.snapshot.player_id else slot
            for slot in wave.slots
        ),
    )


def require_open(wave: Reservation, now: datetime) -> None:
    if wave.outcome is not None or now >= wave.expires_at:
        raise ApiError(409, "wave_over", "That wave has ended.")
    if now < wave.accepted_at:
        raise ValueError("server time precedes the reservation")


def disconnect(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    now: datetime,
    *,
    connection_generation: int,
) -> Reservation:
    require_open(wave, now)
    slot = find_slot(wave, player_id, session_id, connection_generation)
    if slot.status != "active":
        return wave
    return replace_slot(
        wave,
        replace(
            slot,
            status="disconnected",
            grace_until=now + DISCONNECT_GRACE,
        ),
    )


def reconnect(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    now: datetime,
    *,
    connection_generation: int,
) -> Reservation:
    require_open(wave, now)
    slot = find_slot(wave, player_id, session_id, connection_generation)
    if slot.status == "withdrawn" or (slot.grace_until is not None and now >= slot.grace_until):
        raise ApiError(409, "slot_expired", "This retained Captain slot is no longer resumable.")
    if slot.status == "active":
        return wave
    return replace_slot(
        wave,
        replace(
            slot,
            status="active",
            grace_until=None,
            connection_generation=connection_generation + 1,
        ),
    )


def withdraw(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    now: datetime,
    *,
    connection_generation: int,
) -> Reservation:
    require_open(wave, now)
    slot = find_slot(wave, player_id, session_id, connection_generation)
    changed = replace_slot(wave, replace(slot, status="withdrawn", grace_until=None))
    return expire_slots(changed, now)


def accepts_input(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    now: datetime,
    *,
    connection_generation: int,
) -> bool:
    if wave.outcome is not None or not wave.starts_at <= now < wave.expires_at:
        return False
    return any(
        slot.snapshot.player_id == player_id
        and slot.snapshot.session_id == session_id
        and slot.connection_generation == connection_generation
        and slot.status == "active"
        for slot in wave.slots
    )


def close_wave(wave: Reservation, outcome: Outcome, now: datetime) -> Reservation:
    """Canonical closure wins once; a later report cannot turn loss/expiry into victory."""
    if wave.outcome is not None:
        return wave
    if outcome not in {"won", "lost", "abandoned", "expired"}:
        raise ValueError("unknown canonical wave outcome")
    if now < wave.accepted_at:
        raise ValueError("server time precedes the reservation")
    if outcome in {"won", "lost"} and now < wave.starts_at:
        raise ApiError(409, "wave_too_early", "Combat has not begun.")
    slots = expired_slots(wave, now)
    if not any(slot.status != "withdrawn" for slot in slots):
        outcome = "abandoned"
    if now >= wave.expires_at:
        outcome = "expired"
    return replace(wave, slots=slots, outcome=outcome, closed_at=now)


def expired_slots(wave: Reservation, now: datetime) -> tuple[ParticipantSlot, ...]:
    """Evaluate deadlines during every close, even if an expiry worker was delayed."""
    return tuple(
        replace(slot, status="withdrawn", grace_until=None)
        if slot.status == "disconnected"
        and slot.grace_until is not None
        and now >= slot.grace_until
        else slot
        for slot in wave.slots
    )


def expire_slots(wave: Reservation, now: datetime) -> Reservation:
    """Run from a trusted expiry worker, without depending on a client read or next bell."""
    if wave.outcome is not None:
        return wave
    if now < wave.accepted_at:
        raise ValueError("server time precedes the reservation")
    if now >= wave.expires_at:
        return close_wave(wave, "expired", now)
    slots = expired_slots(wave, now)
    changed = replace(wave, slots=slots)
    if not any(slot.status != "withdrawn" for slot in slots):
        return close_wave(changed, "abandoned", now)
    return changed
