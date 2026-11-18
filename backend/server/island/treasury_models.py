"""Exact account/context/receipt values for the shared island treasury.

Used by treasury.py, its checked database adapter and future shared-economy routes.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal


def decimal_string(value: int) -> str:
    """Serialize exact integers without Python's decimal digit conversion ceiling."""
    return format(Decimal(value), "f")


def decimal_integer(value: str) -> int:
    """Read an already validated integral decimal string without a fixed digit cap."""
    return int(Decimal(value))


@dataclass(frozen=True)
class EconomyContext:
    """Persisted accounting identity; resolving it does not authorize an action."""

    mode: Literal["personal_legacy", "island_shared"]
    version: int
    actor_id: str
    island_owner: str
    account_id: str | None
    run_epoch: str | None
    revision: int | None


@dataclass(frozen=True)
class TreasuryAccount:
    """Originating account snapshot; balance includes the committed principal."""

    account_id: str
    island_owner: str
    run_epoch: str
    balance_coins: int
    committed_coins: int
    revision: int
    state: Literal["active", "retired"]
    admission_state: Literal["active", "paused"] | None

    @property
    def available_coins(self) -> int:
        return self.balance_coins - self.committed_coins

    def envelope(self) -> dict:
        return {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": self.island_owner,
            "accountId": self.account_id,
            "runEpoch": self.run_epoch,
            "revision": decimal_string(self.revision),
            "treasury": {
                "balanceCoins": decimal_string(self.balance_coins),
                "committedCoins": decimal_string(self.committed_coins),
                "availableCoins": decimal_string(self.available_coins),
            },
        }


@dataclass(frozen=True)
class TreasuryReceipt:
    """Immutable original effect; these balances are never a fresh HUD value."""

    id: str
    account_id: str
    run_epoch: str
    actor_id: str
    action_uid: str
    kind: Literal["credit", "spend", "reserve", "settle"]
    reason: str
    reference: str
    balance_delta: int
    committed_delta: int
    balance_at_commit: int
    committed_at_commit: int
    revision_at_commit: int
    source_reservation_id: str | None


@dataclass(frozen=True)
class TreasuryResult:
    """Original receipt plus fresh state of that same originating account."""

    receipt: TreasuryReceipt
    account: TreasuryAccount
    repeat: bool
