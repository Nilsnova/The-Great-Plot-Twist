"""Prediction desk views: the plain data that the desk hands to the routes.

Nothing here does any work. These are the small records the service in desk.py builds and
routes/predictions.py turns into JSON: the sides of a question, a question with its state, one of
my stakes, and the orders and receipts of a stake and of a settlement. The two helpers at the end
build the two sides of a pool (with the payout per coin) and say how one of my stakes ended.

Used by: desk.py (builds them), routes/predictions.py (shows them) and the tests.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from server.predictions.pools import payout_per_coin
from server.predictions.questions import Question
from server.predictions.stake_rules import POOL_CUT_PERCENT
from server.predictions.state import SETTLED, QuestionState
from server.predictions.store import PoolRow, SideTotals, StakeRow

# The two sides of every question, in the order the screen shows them.
SIDES = ("yes", "no")
SIDE_LABELS = {"yes": "Yes", "no": "No"}


@dataclass(frozen=True)
class SideView:
    """One side of one question: the coins and captains on it, and what one coin brings back."""

    side: str
    label: str
    coins: int
    players: int
    payout_per_coin: Decimal | None  # None while nobody has staked on this side


@dataclass(frozen=True)
class QuestionView:
    """A question with everything the list shows."""

    question: Question
    state: QuestionState
    pool: PoolRow | None
    sides: tuple[SideView, ...]
    total_coins: int


@dataclass(frozen=True)
class StakeLine:
    """One of my stakes with the result of its pool."""

    stake: StakeRow
    question: Question | None  # None if the question has left the list
    status: str  # "open", "closed" or "settled"
    pool: PoolRow | None
    result: str | None  # "won", "lost" or "refunded" once the pool is settled


@dataclass(frozen=True)
class MineView:
    """A captain's coins, today's stakes and the newest stakes."""

    coins: int
    staked_today: int
    left_today: int
    stakes: tuple[StakeLine, ...]


@dataclass(frozen=True)
class StakeOrder:
    """What a captain asked for. The route builds it from the checked request."""

    question_id: str
    side: str
    amount: int
    stake_id: str  # made by the browser once per confirmed click; the same again on a retry


@dataclass(frozen=True)
class StakeReceipt:
    """What a finished stake did."""

    question: Question
    side: str
    amount: int
    coins: int  # the wallet balance after the stake
    staked_today: int
    left_today: int
    sides: tuple[SideView, ...]
    total_coins: int


@dataclass(frozen=True)
class SettleOrder:
    """What a host asked for."""

    question_id: str
    outcome: str  # "yes", "no" or "void"


@dataclass(frozen=True)
class SettleReceipt:
    """What a finished settlement did."""

    question: Question
    outcome: str
    settlement: str
    settled_at: datetime
    paid_players: int
    paid_coins: int
    cut_coins: int


def build_side_views(totals: dict[str, SideTotals]) -> tuple[SideView, ...]:
    """Both sides of a pool, with zeros for a side nobody picked, and the payout per coin."""
    coins = {side: totals[side].coins for side in totals}
    views = []
    for side in SIDES:
        known = totals.get(side)
        views.append(
            SideView(
                side=side,
                label=SIDE_LABELS[side],
                coins=known.coins if known else 0,
                players=known.players if known else 0,
                payout_per_coin=payout_per_coin(coins, side, POOL_CUT_PERCENT),
            )
        )
    return tuple(views)


def stake_result(stake: StakeRow, pool: PoolRow | None) -> str | None:
    """won, lost or refunded once the pool is settled; None before."""
    if pool is None or pool.status != SETTLED:
        return None
    if pool.settlement == "winners":
        return "won" if (stake.payout or 0) > 0 else "lost"
    return "refunded"
