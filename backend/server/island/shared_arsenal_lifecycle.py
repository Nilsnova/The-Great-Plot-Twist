"""Pure holder-return rules. Used by future session transactions and server lifecycle workers.

The caller supplies canonical wave/deadline authority and locks the original island/run.
These functions neither revoke Captain authority nor schedule persistence by themselves.
"""

from dataclasses import replace
from datetime import datetime

from server.errors import ApiError
from server.island.shared_arsenal_state import ArsenalCopy, ArsenalInventory


def require_clock(value: datetime) -> None:
    if value.utcoffset() is None:
        raise ValueError("The authoritative clock and deadlines need a timezone.")


def matching_holder(
    inventory: ArsenalInventory, player_id: str, copy_id: str, generation: int
) -> ArsenalCopy | None:
    """Delayed lifecycle events are harmless after the copy has changed hands."""
    return next((
        copy for copy in inventory.copies
        if copy.id == copy_id and copy.holder_id == player_id
        and type(generation) is int and copy.generation == generation
    ), None)


def with_copy(inventory: ArsenalInventory, replacement: ArsenalCopy) -> ArsenalInventory:
    return ArsenalInventory(tuple(
        replacement if copy.id == replacement.id else copy for copy in inventory.copies
    ))


def released(copy: ArsenalCopy) -> ArsenalCopy:
    return replace(
        copy, holder_id=None, generation=copy.generation + 1,
        pending_wave_id=None, disconnected_until=None,
    )


def disconnect_holder(
    inventory: ArsenalInventory,
    player_id: str,
    copy_id: str,
    generation: int,
    *,
    deadline: datetime,
) -> ArsenalInventory:
    require_clock(deadline)
    copy = matching_holder(inventory, player_id, copy_id, generation)
    if copy is None or copy.pending_wave_id is not None:
        return inventory
    until = min(deadline, copy.disconnected_until) if copy.disconnected_until else deadline
    return with_copy(inventory, replace(copy, disconnected_until=until))


def reconnect_holder(
    inventory: ArsenalInventory,
    player_id: str,
    copy_id: str,
    generation: int,
    *,
    now: datetime,
) -> ArsenalInventory:
    require_clock(now)
    copy = matching_holder(inventory, player_id, copy_id, generation)
    if copy is None or copy.pending_wave_id is not None:
        return inventory
    if copy.disconnected_until is not None and now >= copy.disconnected_until:
        raise ApiError(409, "holder_grace_expired", "The retained weapon slot has expired.")
    return with_copy(inventory, replace(copy, disconnected_until=None))


def withdraw_holder(
    inventory: ArsenalInventory,
    player_id: str,
    copy_id: str,
    generation: int,
    *,
    reservation_wave_id: str | None,
) -> ArsenalInventory:
    copy = matching_holder(inventory, player_id, copy_id, generation)
    if copy is None or copy.pending_wave_id is not None:
        return inventory
    replacement = (
        replace(copy, pending_wave_id=reservation_wave_id, disconnected_until=None)
        if reservation_wave_id is not None else released(copy)
    )
    return with_copy(inventory, replacement)


def expire_disconnections(
    inventory: ArsenalInventory, *, now: datetime, reservation_wave_id: str | None
) -> ArsenalInventory:
    """A worker invokes this under locks; it requires no browser/read/new-wave trigger."""
    require_clock(now)
    for copy in inventory.copies:
        if copy.disconnected_until is not None and now >= copy.disconnected_until:
            inventory = withdraw_holder(
                inventory, copy.holder_id, copy.id, copy.generation,
                reservation_wave_id=reservation_wave_id,
            )
    return inventory


def settle_wave_returns(inventory: ArsenalInventory, wave_id: str) -> ArsenalInventory:
    """Only the original canonical wave closure may make its pending copies available."""
    if not wave_id:
        raise ValueError("Canonical closure requires its original wave identity.")
    return ArsenalInventory(tuple(
        released(copy) if copy.pending_wave_id == wave_id else copy for copy in inventory.copies
    ))


def can_control_copy(
    inventory: ArsenalInventory, player_id: str, copy_id: str, generation: int
) -> bool:
    """Additional copy fence; the session authority must also authorize every combat input."""
    copy = matching_holder(inventory, player_id, copy_id, generation)
    return (
        copy is not None and copy.pending_wave_id is None and copy.disconnected_until is None
    )
