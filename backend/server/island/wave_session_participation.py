"""Participation eligibility from acknowledged sessions, used by shared-session domain tests.

This module selects personal receipt candidates; it does not issue or persist receipts.
"""

from dataclasses import replace
from datetime import datetime
from uuid import UUID

from server.errors import ApiError
from server.island.wave_session_lifecycle import find_slot, replace_slot, require_open
from server.island.wave_session_state import Reservation


def acknowledge_combat(
    wave: Reservation,
    player_id: UUID,
    session_id: UUID,
    now: datetime,
    *,
    connection_generation: int,
) -> Reservation:
    """Called only after a server-authorized active session acknowledgment, never presence."""
    require_open(wave, now)
    slot = find_slot(wave, player_id, session_id, connection_generation)
    if slot.status != "active":
        raise ApiError(403, "not_controller", "This Captain has no active combat session.")
    if now < wave.starts_at:
        return wave
    return replace_slot(wave, replace(slot, participated=True))


def victory_participants(wave: Reservation) -> tuple[UUID, ...]:
    """Disconnected/withdrawn confirmed participants remain eligible for a canonical win."""
    if wave.outcome != "won":
        return ()
    return tuple(slot.snapshot.player_id for slot in wave.slots if slot.participated)


def completed_participants(wave: Reservation) -> tuple[UUID, ...]:
    """Confirmed normal win/defeat can satisfy the frozen Engineer obligation generation."""
    if wave.outcome not in {"won", "lost"}:
        return ()
    return tuple(slot.snapshot.player_id for slot in wave.slots if slot.participated)
