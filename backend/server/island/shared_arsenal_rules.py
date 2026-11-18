"""Shared copy transitions. Used by future arsenal persistence after authority and receipt checks.

These pure proposals do not authorize a player, check money, replay receipts or persist anything.
The caller must fence the island/run, hold the common locks and commit money/copies/receipt once.
"""

from dataclasses import replace

from server.errors import ApiError
from server.island.arsenal_rules import check_buy
from server.island.catalogue import STARTING_WEAPON, IslandCatalogue
from server.island.shared_arsenal_state import (
    ArsenalChange,
    ArsenalCopy,
    ArsenalInventory,
    FrozenLoadout,
)


def require_between_reservations(reservation_wave_id: str | None) -> None:
    if reservation_wave_id is not None:
        raise ApiError(409, "wave_running", "Use the arsenal between wave reservations.")


def copy_named(inventory: ArsenalInventory, copy_id: str, generation: int) -> ArsenalCopy:
    copy = next((item for item in inventory.copies if item.id == copy_id), None)
    if copy is None:
        raise ApiError(404, "no_such_copy", "That copy is not in this island's arsenal.")
    if type(generation) is not int or copy.generation != generation:
        raise ApiError(409, "stale_holder", "This copy changed hands. Refresh the arsenal.")
    return copy


def held_by(inventory: ArsenalInventory, player_id: str) -> ArsenalCopy | None:
    return next((copy for copy in inventory.copies if copy.holder_id == player_id), None)


def buy_copy(
    inventory: ArsenalInventory,
    *,
    catalogue: IslandCatalogue,
    weapon: str,
    player_id: str,
    copy_id: str,
    island_best_wave: int,
    capacity: int,
    reservation_wave_id: str | None,
) -> ArsenalChange:
    require_between_reservations(reservation_wave_id)
    if type(capacity) is not int or capacity < 1:
        raise ValueError("Total capacity must be an agreed positive integer.")
    entry = check_buy(catalogue, weapon, island_best_wave)
    if len(inventory.copies) >= capacity:
        raise ApiError(409, "arsenal_full", "The island's total arsenal inventory is full.")
    if any(copy.id == copy_id for copy in inventory.copies):
        raise ValueError("A new copy identity must not already exist.")
    holder = None if held_by(inventory, player_id) else player_id
    copy = ArsenalCopy(copy_id, entry.weapon, holder, 0 if holder is None else 1)
    return ArsenalChange(ArsenalInventory((*inventory.copies, copy)), entry.coins)


def take_copy(
    inventory: ArsenalInventory,
    player_id: str,
    copy_id: str,
    generation: int,
    *,
    reservation_wave_id: str | None,
) -> ArsenalChange:
    require_between_reservations(reservation_wave_id)
    selected = copy_named(inventory, copy_id, generation)
    if selected.holder_id is not None:
        raise ApiError(409, "taken", "A Captain already holds that copy.")
    copies = []
    for copy in inventory.copies:
        if copy.id == selected.id:
            copy = replace(copy, holder_id=player_id, generation=copy.generation + 1)
        elif copy.holder_id == player_id:
            copy = replace(copy, holder_id=None, generation=copy.generation + 1)
        copies.append(copy)
    return ArsenalChange(ArsenalInventory(tuple(copies)))


def return_copy(
    inventory: ArsenalInventory,
    player_id: str,
    copy_id: str,
    generation: int,
    *,
    reservation_wave_id: str | None,
) -> ArsenalChange:
    require_between_reservations(reservation_wave_id)
    selected = copy_named(inventory, copy_id, generation)
    if selected.holder_id != player_id:
        raise ApiError(409, "nothing_held", "You no longer hold that copy.")
    copies = tuple(
        replace(copy, holder_id=None, generation=copy.generation + 1)
        if copy.id == selected.id else copy
        for copy in inventory.copies
    )
    return ArsenalChange(ArsenalInventory(copies))


def freeze_loadouts(
    inventory: ArsenalInventory, participant_ids: tuple[str, ...]
) -> tuple[FrozenLoadout, ...]:
    """Capture weapons at accepted bell, in the roster and difficulty's transaction."""
    if len(set(participant_ids)) != len(participant_ids):
        raise ValueError("A Captain cannot occupy two frozen roster slots.")
    loadouts = []
    for player_id in participant_ids:
        copy = held_by(inventory, player_id)
        loadouts.append(
            FrozenLoadout(player_id, copy.weapon, copy.id, copy.generation)
            if copy else FrozenLoadout(player_id, STARTING_WEAPON)
        )
    return tuple(loadouts)
