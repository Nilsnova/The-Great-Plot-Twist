"""Zero-coin teammate revival plans for future shared-wave journal integration.

Used by: focused policy tests and the future atomic combat event adapter. Canonical hold,
position, eligibility and frozen Captain stats must come from the journal, never the body.
The adapter owns authorization, unique fall claims, ordered events and receipt persistence.
"""

import math
import re
from dataclasses import dataclass
from uuid import UUID

from server.errors import ApiError
from server.supabase_admin import SupabaseRejected


@dataclass(frozen=True)
class RevivalAttempt:
    """Authenticated helper identity and validated fall/action identity, not combat authority."""

    actor_id: str
    wave_id: UUID
    target_token: UUID
    down_at: int
    action_uid: str


@dataclass(frozen=True)
class RevivalState:
    """Authoritative journal state and the helper's frozen timing/HP rules.

    The hold interval must belong to this helper, target and fall. The adapter resets it on
    release, leaving reach or switching targets; a start tick alone cannot prove continuity.
    """

    wave_id: UUID
    helper_actor_id: str
    is_running: bool
    helper_can_control: bool
    helper_is_standing: bool
    target_is_eligible: bool
    target_down_at: int | None
    target_token: UUID
    helper_token: UUID
    tick: int
    hold_started_tick: int
    hold_ticks: int
    distance: float
    reach: float
    restored_hp: int


@dataclass(frozen=True)
class RevivalOperation:
    """One free help-up to claim and journal atomically for this wave/target/fall."""

    attempt: RevivalAttempt
    restored_hp: int

    @property
    def price(self) -> int:
        """Shared-mode revival has no wallet or treasury debit, including at zero funds."""
        return 0


def prepare_revival(
    attempt: RevivalAttempt,
    state: RevivalState,
    *,
    previous: RevivalOperation | None = None,
) -> tuple[RevivalOperation, bool]:
    """Return the original successful operation on replay without emitting another revive.

    Prior receipts are actor/UID scoped by the adapter. Its transaction must also uniquely
    claim (wave, target, down_at), so a second helper cannot emit a second event for one fall.
    """
    if previous is not None:
        if previous.attempt != attempt:
            raise ApiError(409, "idempotency_conflict", "This revival ID has another intent.")
        return previous, True
    validate_attempt(attempt)
    validate_state(state)
    if not state.is_running or state.wave_id != attempt.wave_id:
        raise ApiError(409, "wave_over", "This wave is not accepting combat actions.")
    if (
        state.helper_actor_id != attempt.actor_id
        or not state.helper_can_control
        or not state.helper_is_standing
        or not state.target_is_eligible
        or state.target_token != attempt.target_token
        or state.helper_token == attempt.target_token
    ):
        raise ApiError(403, "not_in_wave", "Eligible teammates are required to help up.")
    if state.target_down_at is None or state.target_down_at != attempt.down_at:
        raise ApiError(409, "already_up", "This fall is no longer awaiting help.")
    if (
        state.hold_started_tick < attempt.down_at
        or state.tick - state.hold_started_tick < state.hold_ticks
        or state.distance > state.reach
    ):
        raise ApiError(409, "revive_not_ready", "Keep helping next to the fallen teammate.")
    return RevivalOperation(attempt, state.restored_hp), False


def validate_attempt(attempt: RevivalAttempt) -> None:
    """Refuse malformed fall identities even when the policy is called outside an HTTP model."""
    if (
        type(attempt.down_at) is not int
        or attempt.down_at < 0
        or not isinstance(attempt.action_uid, str)
        or re.fullmatch(r"[A-Za-z0-9_-]{8,64}", attempt.action_uid) is None
    ):
        raise ApiError(422, "validation_error", "The revival fall or action ID is invalid.")


def validate_state(state: RevivalState) -> None:
    """Reject invalid trusted clocks, reach or HP; no zero/NaN timing may bypass the hold."""
    counters = (
        (state.tick, 0),
        (state.hold_started_tick, 0),
        (state.hold_ticks, 1),
        (state.restored_hp, 1),
    )
    if any(type(value) is not int or value < low for value, low in counters):
        raise SupabaseRejected("The canonical revival state is invalid.")
    flags = (
        state.is_running,
        state.helper_can_control,
        state.helper_is_standing,
        state.target_is_eligible,
    )
    if any(type(value) is not bool for value in flags):
        raise SupabaseRejected("The canonical revival eligibility is invalid.")
    ranges = (state.distance, state.reach)
    if (
        any(
            type(value) not in (int, float) or not math.isfinite(value) or value < 0
            for value in ranges
        )
        or state.reach == 0
    ):
        raise SupabaseRejected("The canonical revival range is invalid.")
