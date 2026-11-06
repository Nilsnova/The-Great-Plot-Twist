"""Pool rules: who gets how many coins when a prediction question is decided.

Pure Python. These functions touch no network, no database, no clock and no settings. They take
plain values and return plain values, so the tests can check them with fixed numbers
(backend/server/tests/test_prediction_pools.py). The sports predictions (L6) share this file:
it works for two outcomes (yes, no) and for three (home, draw, away).

The rules, in plain words
  * T is all the coins in the pool. W is the coins on the winning side (0 when the question is
    void). L is the coins on the losing side: L = T - W.
  * Everybody gets a full refund when the question is void, when nobody picked the winning side
    (W = 0) and when everybody picked the same side (L = 0).
  * Otherwise the winners share the pool in proportion to their stakes. A cut of 5 % of the
    LOSING side (L), rounded down, leaves the game. The winners share D = T - cut. Because the
    cut is never more than L, D is at least W, so a right forecast never gets back less than it
    staked.
  * Rounding is against nobody. Each winner first gets the whole coins of their exact share
    (stake x D / W, rounded down). The coins that are left over (always fewer than the number of
    winners) go one each to the stakes with the largest remainders, and on a tie to the earliest
    stake. So the payouts plus the cut are exactly T, and each payout is less than one coin
    away from its exact share. The pool never creates or loses a coin.

The database function prediction_settle_pool() checks these same numbers again, so the pool stays
right even if this file has a bug. The settlement names below are the ones the database stores.

Used by: desk.py (settles a pool and shows the payout per coin) and the tests.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal

# The outcome of a question that was cancelled or is unclear. Every stake is refunded.
VOID = "void"

# The four ways a pool can end. The database stores these exact words (prediction_pools.settlement).
WINNERS = "winners"
REFUND_VOID = "refund_void"
REFUND_NO_WINNERS = "refund_no_winners"
REFUND_ONE_SIDED = "refund_one_sided"

ONE_HUNDRED = 100
TWO_DECIMALS = Decimal("0.01")


@dataclass(frozen=True)
class Stake:
    """One stake in a pool."""

    row_id: int  # prediction_stakes.id: the order in which stakes were placed, used for ties
    player_id: str
    side: str
    amount: int  # whole coins, at least 1

    def __post_init__(self) -> None:
        if self.amount < 1:
            raise ValueError("A stake must be at least 1 coin.")


@dataclass(frozen=True)
class Payout:
    """The coins one stake gets back."""

    row_id: int
    player_id: str
    coins: int


@dataclass(frozen=True)
class SettlementPlan:
    """How a pool ends: which of the four ways, the coins that leave the game, and the payouts."""

    settlement: str
    cut: int
    payouts: tuple[Payout, ...]  # one per paid stake; a losing stake gets no Payout


def check_cut_percent(cut_percent: int) -> None:
    if not 0 <= cut_percent <= ONE_HUNDRED:
        raise ValueError(f"cut_percent must be from 0 to 100 (got {cut_percent}).")


def cut_for(losing_coins: int, cut_percent: int) -> int:
    """The coins that leave the game: cut_percent of the losing side, rounded down."""
    check_cut_percent(cut_percent)
    return losing_coins * cut_percent // ONE_HUNDRED


def coins_by_side(stakes: Sequence[Stake]) -> dict[str, int]:
    """The coins on each side. A side nobody picked is not in the answer."""
    totals: dict[str, int] = {}
    for stake in stakes:
        totals[stake.side] = totals.get(stake.side, 0) + stake.amount
    return totals


def by_row_id(payout: Payout) -> int:
    """Sort key: payouts are listed in the order the stakes were placed."""
    return payout.row_id


def refund_everyone(stakes: Sequence[Stake], settlement: str) -> SettlementPlan:
    """Give every stake back in full. `settlement` says why (one of the three refund names)."""
    payouts = [Payout(stake.row_id, stake.player_id, stake.amount) for stake in stakes]
    return SettlementPlan(settlement, 0, tuple(sorted(payouts, key=by_row_id)))


def remainder_order(item: tuple[Stake, int]) -> tuple[int, int]:
    """Sort key for the leftover coins: the largest remainder first, then the earliest stake.

    `item` is a winning stake with the remainder of its share. A bigger remainder sorts first
    because it is negated, and a lower row id sorts first on a tie.
    """
    stake, remainder = item
    return (-remainder, stake.row_id)


def share_among_winners(winners: Sequence[Stake], shared_coins: int) -> tuple[Payout, ...]:
    """Share `shared_coins` among the winning stakes in proportion to their stakes.

    Each winner gets the whole coins of their exact share. The leftover coins go one each to the
    largest remainders, and on a tie to the earliest stake. The payouts add up to `shared_coins`.
    """
    winning_coins = sum(stake.amount for stake in winners)
    whole_shares: dict[int, int] = {}
    remainders: list[tuple[Stake, int]] = []
    for stake in winners:
        whole_share, remainder = divmod(stake.amount * shared_coins, winning_coins)
        whole_shares[stake.row_id] = whole_share
        remainders.append((stake, remainder))

    leftover = shared_coins - sum(whole_shares.values())
    for stake, _remainder in sorted(remainders, key=remainder_order)[:leftover]:
        whole_shares[stake.row_id] += 1

    payouts = [
        Payout(stake.row_id, stake.player_id, whole_shares[stake.row_id]) for stake in winners
    ]
    return tuple(sorted(payouts, key=by_row_id))


def plan_settlement(stakes: Sequence[Stake], outcome: str, cut_percent: int) -> SettlementPlan:
    """Decide how a pool ends, and who gets how many coins.

    `outcome` is the winning side, or VOID. The order of the checks matters: a void question is
    refunded even if one side is empty.
    """
    check_cut_percent(cut_percent)
    if outcome == VOID:
        return refund_everyone(stakes, REFUND_VOID)

    winners = [stake for stake in stakes if stake.side == outcome]
    winning_coins = sum(stake.amount for stake in winners)
    losing_coins = sum(stake.amount for stake in stakes) - winning_coins
    if winning_coins == 0:
        return refund_everyone(stakes, REFUND_NO_WINNERS)
    if losing_coins == 0:
        return refund_everyone(stakes, REFUND_ONE_SIDED)

    cut = cut_for(losing_coins, cut_percent)
    shared_coins = winning_coins + losing_coins - cut
    return SettlementPlan(WINNERS, cut, share_among_winners(winners, shared_coins))


def payout_per_coin(side_coins: Mapping[str, int], side: str, cut_percent: int) -> Decimal | None:
    """About how many coins one staked coin brings back if `side` wins. For display only.

    None when nobody staked on that side. Exactly 1.00 when the other sides are empty, because
    the pool would be refunded. Otherwise the shared coins divided by the winning coins, rounded
    DOWN to 2 decimals, so the screen never promises more than the pool pays.
    """
    winning_coins = side_coins.get(side, 0)
    if winning_coins == 0:
        return None
    losing_coins = sum(side_coins.values()) - winning_coins
    if losing_coins == 0:
        return Decimal("1.00")
    shared_coins = winning_coins + losing_coins - cut_for(losing_coins, cut_percent)
    return (Decimal(shared_coins) / Decimal(winning_coins)).quantize(
        TWO_DECIMALS, rounding=ROUND_FLOOR
    )
