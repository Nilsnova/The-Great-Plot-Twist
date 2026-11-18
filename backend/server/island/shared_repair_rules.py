"""Repair plans for the shared economy's reserved-wave transaction integration.

Used by: focused policy tests and the future atomic repair transaction adapter. These rules
never authorize an actor, move money, heal HP or commit receipts. The adapter must use the
common economy authority and treasury contract and repeat every check under its locks.
"""

from dataclasses import dataclass
from uuid import UUID

from server.errors import ApiError
from server.island.structure_repair_models import RepairRequest
from server.island.structure_repair_rules import (
    REPAIRABLE_KINDS,
    repair_price_from_schedule,
    request_intent_fingerprint,
)
from server.supabase_admin import SupabaseRejected

FULL_HP_UNITS = 1_000_000
PAID_REPAIR_LIMIT = 3
MAX_SEQUENCE = 2**63 - 1


@dataclass(frozen=True)
class RepairTarget:
    """One existing structure from authoritative recovery state, not a client quote."""

    instance_id: UUID
    spot: str
    kind: str
    level: int
    hp_units: int
    repair_seq: int


@dataclass(frozen=True)
class ReservedRepairState:
    """Recovery guards; economy run epoch/account/membership are checked by the adapter."""

    owner_id: str
    recovery_epoch: UUID
    wave_id: UUID | None
    successful_repairs: int
    target: RepairTarget
    prices: dict[str, list[int]]
    health_sync_required: bool = False


@dataclass(frozen=True)
class RepairOperation:
    """Facts to persist only after treasury debit, HP, quota and event changes succeed together."""

    action_uid: str
    fingerprint: str
    instance_id: UUID
    wave_id: UUID
    kind: str
    level: int
    price: int
    repair_seq: int
    use_ordinal: int

    @property
    def restored_hp_units(self) -> int:
        """A successful new repair restores the selected instance to its full normalized HP."""
        return FULL_HP_UNITS


def prepare_repair(
    request: RepairRequest,
    state: ReservedRepairState,
    *,
    previous: RepairOperation | None = None,
) -> tuple[RepairOperation, bool]:
    """Return a new plan or original successful operation plus an explicit replay flag.

    The adapter looks up `previous` by authenticated actor and UID after economy authorization.
    A True replay flag means return the receipt only: never debit, heal, append an event or use
    quota again. Current phase/cursors/HP do not invalidate an already committed paid intent.
    """
    if previous is not None:
        fingerprint = request_intent_fingerprint(state.owner_id, previous.kind, request)
        if previous.action_uid != request.action_uid or previous.fingerprint != fingerprint:
            raise ApiError(409, "idempotency_conflict", "This repair ID has another paid intent.")
        return previous, True
    validate_state(state)
    validate_quote(request, state)
    if state.target.kind not in REPAIRABLE_KINDS:
        raise ApiError(422, "wrong_kind", "Only walls and towers can be repaired.")
    if state.health_sync_required:
        raise ApiError(409, "health_sync_required", "Update wave health before repairing.")
    if state.target.hp_units == FULL_HP_UNITS:
        raise ApiError(409, "intact", "This structure is already at full health.")
    if state.successful_repairs == PAID_REPAIR_LIMIT:
        raise ApiError(409, "repair_limit_reached", "All three shared repairs have been used.")
    return new_operation(request, state), False


def validate_state(state: ReservedRepairState) -> None:
    """Reject malformed trusted data instead of preparing a possibly invalid transaction."""
    values = (
        (state.successful_repairs, 0, PAID_REPAIR_LIMIT),
        (state.target.hp_units, 0, FULL_HP_UNITS),
        (state.target.repair_seq, 0, MAX_SEQUENCE - 1),
        (state.target.level, 1, 5),
    )
    if any(type(value) is not int or not low <= value <= high for value, low, high in values):
        raise SupabaseRejected("The canonical repair state is invalid.")


def validate_quote(request: RepairRequest, state: ReservedRepairState) -> None:
    """Use accepted reservation, including countdown, rather than startsAt as the boundary."""
    if state.wave_id is None:
        raise ApiError(409, "intact", "Buildings are fully repaired when the wave ends.")
    target = state.target
    actual = (
        state.recovery_epoch,
        "reserved_wave",
        state.wave_id,
        target.instance_id,
        target.spot,
        target.level,
        target.repair_seq,
    )
    expected = (
        request.expected_epoch,
        request.expected_window,
        request.expected_wave_id,
        request.instance_id,
        request.spot,
        request.expected_level,
        request.expected_repair_seq,
    )
    if actual != expected:
        raise ApiError(409, "stale_recovery_quote", "Refresh and confirm this repair again.")


def new_operation(request: RepairRequest, state: ReservedRepairState) -> RepairOperation:
    """Bind the full frozen catalogue increment; no role or private-wallet discount applies."""
    target = state.target
    try:
        price = repair_price_from_schedule(state.prices, target.kind, target.level)
    except ValueError as error:
        raise SupabaseRejected("The frozen repair price is unavailable.") from error
    if request.quoted_price != price:
        raise ApiError(409, "stale_recovery_quote", "The repair price changed. Confirm it again.")
    return RepairOperation(
        action_uid=request.action_uid,
        fingerprint=request_intent_fingerprint(state.owner_id, target.kind, request),
        instance_id=target.instance_id,
        wave_id=state.wave_id,
        kind=target.kind,
        level=target.level,
        price=price,
        repair_seq=target.repair_seq + 1,
        use_ordinal=state.successful_repairs + 1,
    )
