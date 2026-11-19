"""Holder departure and grace rules. Used by pytest without a lifecycle worker or database."""

from datetime import UTC, datetime, timedelta

import pytest

from server.errors import ApiError
from server.island.shared_arsenal_lifecycle import (
    can_control_copy,
    disconnect_holder,
    expire_disconnections,
    reconnect_holder,
    settle_wave_returns,
    withdraw_holder,
)
from server.island.shared_arsenal_rules import freeze_loadouts, return_copy, take_copy
from server.island.shared_arsenal_state import ArsenalCopy, ArsenalInventory

NOW = datetime(2026, 11, 18, 18, tzinfo=UTC)
DEADLINE = NOW + timedelta(seconds=60)


def carried() -> ArsenalInventory:
    return ArsenalInventory((ArsenalCopy("copy", "pistols", "member", 1),))


def disconnect(inventory: ArsenalInventory, deadline: datetime = DEADLINE) -> ArsenalInventory:
    return disconnect_holder(inventory, "member", "copy", 1, deadline=deadline)


def withdraw(inventory: ArsenalInventory, wave: str | None = "wave") -> ArsenalInventory:
    return withdraw_holder(inventory, "member", "copy", 1, reservation_wave_id=wave)


def test_departure_between_reservations_returns_immediately():
    result = withdraw(carried(), None)
    assert result.copies == (ArsenalCopy("copy", "pistols", None, 2),)
    assert not can_control_copy(result, "member", "copy", 1)


def test_departure_during_reservation_revokes_control_without_reusing_copy():
    original = carried()
    frozen = freeze_loadouts(original, ("member",))
    pending = withdraw(original)
    assert pending.copies[0].pending_wave_id == "wave"
    assert pending.copies[0].holder_id == "member"
    assert not can_control_copy(pending, "member", "copy", 1)
    with pytest.raises(ApiError) as error:
        take_copy(pending, "other", "copy", 1, reservation_wave_id=None)
    assert error.value.code == "taken"
    assert freeze_loadouts(pending, ("member",))[0].weapon == "musket"
    assert frozen[0].weapon == "pistols"


@pytest.mark.parametrize("reserved", [None, "wave"])
def test_timeout_is_processed_without_an_arsenal_read_and_not_before_grace(reserved):
    disconnected = disconnect(carried())
    early = expire_disconnections(
        disconnected, now=DEADLINE - timedelta(microseconds=1), reservation_wave_id=reserved,
    )
    assert early == disconnected
    expired = expire_disconnections(disconnected, now=DEADLINE, reservation_wave_id=reserved)
    assert not can_control_copy(expired, "member", "copy", 1)
    assert expired.copies[0].pending_wave_id == reserved
    assert expired.copies[0].holder_id == ("member" if reserved else None)


def test_repeated_disconnect_cannot_extend_grace():
    original = disconnect(carried())
    repeated = disconnect(original, DEADLINE + timedelta(hours=1))
    assert repeated == original
    expired = expire_disconnections(repeated, now=DEADLINE, reservation_wave_id=None)
    assert expired.copies[0].holder_id is None


def test_reconnect_within_grace_changes_only_connection_state():
    original = carried()
    disconnected = disconnect(original)
    assert not can_control_copy(disconnected, "member", "copy", 1)
    resumed = reconnect_holder(disconnected, "member", "copy", 1, now=NOW)
    assert resumed == original
    assert can_control_copy(resumed, "member", "copy", 1)


def test_reconnect_at_expired_deadline_cannot_reclaim_slot():
    with pytest.raises(ApiError) as error:
        reconnect_holder(disconnect(carried()), "member", "copy", 1, now=DEADLINE)
    assert error.value.code == "holder_grace_expired"


def test_only_original_wave_closure_releases_pending_return_and_is_idempotent():
    pending = withdraw(carried())
    assert settle_wave_returns(pending, "other-wave") == pending
    settled = settle_wave_returns(pending, "wave")
    assert settled.copies == (ArsenalCopy("copy", "pistols", None, 2),)
    assert settle_wave_returns(settled, "wave") == settled
    assert settle_wave_returns(carried(), "wave") == carried()


def test_stale_lifecycle_event_cannot_affect_a_later_tenure():
    returned = withdraw(carried(), None)
    retaken = take_copy(returned, "member", "copy", 2, reservation_wave_id=None).inventory
    assert withdraw(retaken) == retaken
    assert disconnect(retaken) == retaken
    assert reconnect_holder(retaken, "member", "copy", 1, now=NOW) == retaken
    assert can_control_copy(retaken, "member", "copy", 3)
    assert not can_control_copy(retaken, "member", "copy", 1)


def test_deleted_member_withdrawal_preserves_over_capacity_continuing_inventory():
    original = ArsenalInventory((
        ArsenalCopy("copy", "pistols", "member", 1),
        *(ArsenalCopy(f"stored-{i}", "pistols") for i in range(24)),
    ))
    pending = withdraw(original)
    settled = settle_wave_returns(pending, "wave")
    assert len(settled.copies) == 25
    assert {copy.id for copy in settled.copies} == {copy.id for copy in original.copies}
    assert all(copy.holder_id is None for copy in settled.copies)


def test_pending_withdrawal_cannot_be_undone_by_disconnect_or_reconnect():
    pending = withdraw(disconnect(carried()))
    assert disconnect(pending) == pending
    assert reconnect_holder(pending, "member", "copy", 1, now=NOW) == pending
    assert not can_control_copy(pending, "member", "copy", 1)


def test_pending_copy_cannot_be_returned_or_swapped_before_canonical_closure():
    original = ArsenalInventory((*carried().copies, ArsenalCopy("spare", "rifle")))
    pending = withdraw(original)
    with pytest.raises(ApiError):
        return_copy(pending, "member", "copy", 1, reservation_wave_id=None)
    with pytest.raises(ApiError) as error:
        take_copy(pending, "member", "spare", 0, reservation_wave_id=None)
    assert error.value.code == "wave_running"
    assert pending.copies[0].pending_wave_id == "wave"


def test_authorized_between_wave_return_clears_disconnect_metadata():
    disconnected = disconnect(carried())
    returned = return_copy(disconnected, "member", "copy", 1, reservation_wave_id=None)
    assert returned.inventory.copies == (ArsenalCopy("copy", "pistols", None, 2),)


def test_timezone_naive_clock_is_rejected_before_processing_deadlines():
    with pytest.raises(ValueError):
        disconnect(carried(), datetime(2026, 11, 18))
    with pytest.raises(ValueError):
        expire_disconnections(carried(), now=datetime(2026, 11, 18), reservation_wave_id=None)
