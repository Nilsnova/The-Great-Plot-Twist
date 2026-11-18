"""Immutable shared-arsenal values. Used by isolated copy rules and future locked persistence."""

from dataclasses import dataclass

from server.island.catalogue import STARTING_WEAPON


@dataclass(frozen=True)
class ArsenalCopy:
    id: str
    weapon: str
    holder_id: str | None = None
    generation: int = 0

    def __post_init__(self) -> None:
        if not self.id or not self.weapon or self.weapon == STARTING_WEAPON:
            raise ValueError("A copy needs an identity and a special weapon type.")
        if self.holder_id == "":
            raise ValueError("A holder identity cannot be empty.")
        if type(self.generation) is not int or self.generation < 0:
            raise ValueError("A holder generation must be a nonnegative integer.")


@dataclass(frozen=True)
class ArsenalInventory:
    """All copies of one trusted island/run snapshot, including grandfathered excess."""

    copies: tuple[ArsenalCopy, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.copies, tuple):
            raise ValueError("An immutable inventory needs a tuple of copies.")
        if len({copy.id for copy in self.copies}) != len(self.copies):
            raise ValueError("Copy identities must be unique.")
        holders = [copy.holder_id for copy in self.copies if copy.holder_id is not None]
        if len(set(holders)) != len(holders):
            raise ValueError("A Captain may hold at most one copy on an island.")


@dataclass(frozen=True)
class ArsenalChange:
    """Inventory proposal; its price must be debited atomically by the common treasury."""

    inventory: ArsenalInventory
    price_coins: int = 0


@dataclass(frozen=True)
class FrozenLoadout:
    player_id: str
    weapon: str
    copy_id: str | None = None
    generation: int | None = None
