"""Immutable shared-wave domain values, used by lifecycle preparation and its tests.

These values are internal only: they define no HTTP, persistence or recovery-journal API.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

Connection = Literal["active", "disconnected", "withdrawn"]
Outcome = Literal["won", "lost", "abandoned", "expired"]


@dataclass(frozen=True)
class ControlLease:
    player_id: UUID
    session_id: UUID
    island_owner: UUID
    active_since: datetime | None = None
    connection_generation: int = 0


@dataclass(frozen=True)
class FrozenCaptain:
    level: int
    role: str
    skills: tuple[str, ...]
    weapon: str
    copy_id: UUID | None = None
    copy_generation: int | None = None
    engineer_generation: UUID | None = None

    def __post_init__(self) -> None:
        if (self.copy_id is None) != (self.copy_generation is None):
            raise ValueError("special copy identity requires its tenure generation")
        if self.copy_generation is not None and self.copy_generation < 0:
            raise ValueError("copy tenure generation must not be negative")


@dataclass(frozen=True)
class ParticipantSnapshot:
    player_id: UUID
    session_id: UUID
    captain: FrozenCaptain
    # Opaque trusted journal state: no connection transition reconstructs combat stats or HP.
    checkpoint: bytes


@dataclass(frozen=True)
class ParticipantSlot:
    snapshot: ParticipantSnapshot
    status: Connection = "active"
    grace_until: datetime | None = None
    participated: bool = False
    connection_generation: int = 0

    @property
    def is_targetable(self) -> bool:
        return self.status != "withdrawn"


@dataclass(frozen=True)
class Reservation:
    wave_id: UUID
    island_owner: UUID
    run_epoch: UUID
    accepted_at: datetime
    starts_at: datetime
    expires_at: datetime
    slots: tuple[ParticipantSlot, ...]
    # Includes trusted difficulty, defense and crew snapshots; never derived from live roster size.
    world_snapshot: bytes
    outcome: Outcome | None = None
    closed_at: datetime | None = None
