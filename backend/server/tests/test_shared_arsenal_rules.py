"""Shared arsenal copy rules. Used by pytest without persistence or treasury fixtures."""

from dataclasses import FrozenInstanceError

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.shared_arsenal_rules import buy_copy, freeze_loadouts, return_copy, take_copy
from server.island.shared_arsenal_state import ArsenalCopy, ArsenalInventory


def buy(inventory: ArsenalInventory, **changes: object):
    arguments = {
        "catalogue": load_island(), "weapon": "pistols", "player_id": "member",
        "copy_id": "new", "island_best_wave": 100, "capacity": 2,
        "reservation_wave_id": None,
    }
    arguments.update(changes)
    return buy_copy(inventory, **arguments)


def test_buy_counts_carried_and_stored_copies_and_uses_exact_catalogue_price():
    original = ArsenalInventory((ArsenalCopy("first", "pistols", "owner", 1),))
    change = buy(original)
    catalogue_price = next(w.coins for w in load_island().weapons if w.weapon == "pistols")
    assert change.price_coins == catalogue_price
    assert change.inventory.copies[-1] == ArsenalCopy("new", "pistols", "member", 1)
    with pytest.raises(ApiError, match="full") as error:
        buy(change.inventory, copy_id="third")
    assert error.value.code == "arsenal_full"
    assert len(original.copies) == 1


def test_buy_puts_second_weapon_in_storage_without_replacing_carried_copy():
    original = ArsenalInventory((ArsenalCopy("first", "pistols", "member", 1),))
    change = buy(original)
    assert change.inventory.copies[0] == original.copies[0]
    assert change.inventory.copies[1].holder_id is None


def test_island_unlock_cannot_be_bypassed_by_a_veteran():
    with pytest.raises(ApiError) as error:
        buy(ArsenalInventory(()), island_best_wave=0)
    assert error.value.code == "locked"


def test_basic_weapon_is_free_and_never_an_inventory_copy():
    with pytest.raises(ApiError) as error:
        buy(ArsenalInventory(()), weapon="musket")
    assert error.value.code == "standard_weapon"
    assert freeze_loadouts(ArsenalInventory(()), ("member",))[0].weapon == "musket"


def test_grandfathered_excess_inventory_preserves_every_copy_and_accepts_return():
    original = ArsenalInventory(tuple(
        ArsenalCopy(str(i), "pistols", "member" if i == 0 else None, 1) for i in range(5)
    ))
    with pytest.raises(ApiError) as error:
        buy(original, capacity=2)
    assert error.value.code == "arsenal_full"
    result = return_copy(original, "member", "0", 1, reservation_wave_id=None)
    assert len(result.inventory.copies) == 5
    assert all(copy.holder_id is None for copy in result.inventory.copies)


def test_full_inventory_swap_is_atomic_and_preserves_identity():
    original = ArsenalInventory((
        ArsenalCopy("first", "pistols", "member", 2), ArsenalCopy("second", "rifle", None, 4),
    ))
    result = take_copy(original, "member", "second", 4, reservation_wave_id=None)
    assert result.price_coins == 0
    assert result.inventory.copies == (
        ArsenalCopy("first", "pistols", None, 3), ArsenalCopy("second", "rifle", "member", 5),
    )
    assert original.copies[0].holder_id == "member"


@pytest.mark.parametrize("operation", ["buy", "take", "return"])
def test_accepted_bell_blocks_every_player_inventory_change(operation):
    original = ArsenalInventory((
        ArsenalCopy("first", "pistols", "member", 1), ArsenalCopy("second", "rifle"),
    ))
    with pytest.raises(ApiError) as error:
        if operation == "buy":
            buy(original, capacity=3, reservation_wave_id="wave")
        elif operation == "take":
            take_copy(original, "member", "second", 0, reservation_wave_id="wave")
        else:
            return_copy(original, "member", "first", 1, reservation_wave_id="wave")
    assert error.value.code == "wave_running"


def test_obsolete_return_does_not_release_a_new_holder_tenure():
    original = ArsenalInventory((ArsenalCopy("first", "pistols", "member", 1),))
    released = return_copy(original, "member", "first", 1, reservation_wave_id=None).inventory
    retaken = take_copy(released, "member", "first", 2, reservation_wave_id=None).inventory
    with pytest.raises(ApiError) as error:
        return_copy(retaken, "member", "first", 1, reservation_wave_id=None)
    assert error.value.code == "stale_holder"
    assert retaken.copies[0].holder_id == "member"


def test_taken_copy_cannot_be_taken_by_a_second_member():
    original = ArsenalInventory((ArsenalCopy("first", "pistols", "owner", 1),))
    with pytest.raises(ApiError) as error:
        take_copy(original, "member", "first", 1, reservation_wave_id=None)
    assert error.value.code == "taken"


def test_frozen_loadout_survives_later_inventory_return():
    original = ArsenalInventory((ArsenalCopy("first", "pistols", "member", 1),))
    frozen = freeze_loadouts(original, ("member", "owner"))
    changed = return_copy(original, "member", "first", 1, reservation_wave_id=None)
    assert frozen[0].copy_id == "first"
    assert frozen[0].generation == 1
    assert frozen[0].weapon == "pistols"
    assert frozen[1].copy_id is None
    assert frozen[1].weapon == "musket"
    assert changed.inventory.copies[0].holder_id is None
    with pytest.raises(FrozenInstanceError):
        frozen[0].weapon = "musket"


@pytest.mark.parametrize("copies", [
    (ArsenalCopy("same", "pistols"), ArsenalCopy("same", "rifle")),
    (ArsenalCopy("one", "pistols", "member"), ArsenalCopy("two", "rifle", "member")),
])
def test_inventory_rejects_duplicate_copy_identity_or_holder(copies):
    with pytest.raises(ValueError):
        ArsenalInventory(copies)


@pytest.mark.parametrize("capacity", [0, -1, True, 2.5])
def test_capacity_requires_explicit_positive_whole_policy(capacity):
    with pytest.raises(ValueError):
        buy(ArsenalInventory(()), capacity=capacity)


def test_default_capacity_is_twenty_total_copies():
    original = ArsenalInventory(tuple(ArsenalCopy(str(i), "pistols") for i in range(19)))
    arguments = {
        "catalogue": load_island(), "weapon": "pistols", "player_id": "member",
        "copy_id": "twentieth", "island_best_wave": 100, "reservation_wave_id": None,
    }
    full = buy_copy(original, **arguments).inventory
    assert len(full.copies) == 20
    arguments["copy_id"] = "twenty-first"
    with pytest.raises(ApiError) as error:
        buy_copy(full, **arguments)
    assert error.value.code == "arsenal_full"
