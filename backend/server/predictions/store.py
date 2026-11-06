"""Prediction desk database access: pools, stakes, the wallet balance and the two functions.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on the
server only. Reads use select_rows. The two writes are database functions, run with call_function:
  * prediction_place_stake   takes the coins and writes one stake, in a single step
  * prediction_settle_pool   pays everybody and closes one pool, in a single step
(supabase/migrations/20261106100000_prediction_desk.sql explains both.)

The numbers that the database must check against (the biggest stake, the daily cap, the cut) are
passed to the functions as arguments, from stake_rules.py, so the numbers live in one place and the
database only compares against them.

Numbers: the database sends whole numbers as JSON numbers and times as text such as
2026-11-20T10:02:11.5+00:00. Every reader below checks the type, and an odd value becomes a 502
database_error ("an answer we could not read") instead of a crash.

Used by: desk.py.
"""

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from server.predictions.pools import Payout, Stake
from server.predictions.stake_rules import DAILY_STAKE_CAP, MAX_STAKE, POOL_CUT_PERCENT
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

POOL_COLUMNS = (
    "question_id,closes_at,status,outcome,settlement,settled_by,settled_at,cut_coins,paid_coins"
)
SIDE_COLUMNS = "question_id,side,players,coins"
POOL_STAKE_COLUMNS = "id,player_id,side,amount"
PLAYER_STAKE_COLUMNS = "id,question_id,side,amount,payout,created_at"

# One row per question, and there are at most 40 questions (questions.py).
MAX_POOLS_READ = 100
# At most two sides per question (yes, no) and 40 questions, with room to spare.
MAX_SIDE_ROWS_READ = 200
# The most stakes read when a pool is settled. A class is a few dozen captains.
MAX_STAKES_IN_POOL = 10_000
# "My stakes" shows the newest 50.
MAX_STAKES_OF_PLAYER = 50
# The most stakes read to add up what a player staked today. The daily cap (200 coins) allows at
# most 200 stakes of one coin.
MAX_STAKES_FOR_DAY = 1000

# The characters allowed in the ids that go into a query. The database allows the same ones.
QUESTION_ID = re.compile(r"[a-z0-9-]{2,40}")
STAKE_ID = re.compile(r"[A-Za-z0-9_-]{8,64}")

# The person who settles. The automatic settlement of a later package would use "auto".
SETTLED_BY_HOST = "host"


@dataclass(frozen=True)
class PoolRow:
    """One row of prediction_pools: when staking closes, and how the pool ended."""

    question_id: str
    closes_at: datetime
    status: str  # "open" or "settled"
    outcome: str | None  # "yes", "no" or "void" once settled
    settlement: str | None  # "winners" or one of the three refunds once settled
    settled_by: str | None
    settled_at: datetime | None
    cut_coins: int | None
    paid_coins: int | None


@dataclass(frozen=True)
class SideTotals:
    """The coins and the players on one side of one pool."""

    side: str
    players: int
    coins: int


@dataclass(frozen=True)
class StakeRow:
    """One stake of one player, as "My stakes" shows it."""

    id: int
    question_id: str
    side: str
    amount: int
    payout: int | None  # None until the pool is settled
    created_at: datetime


@dataclass(frozen=True)
class StakeOutcome:
    """The answer of prediction_place_stake. Either done, or refused with a reason."""

    done: bool
    balance: int = 0  # done: the wallet balance after the stake
    staked_today: int = 0  # done: what the player has staked today, with this stake
    sides: dict[str, SideTotals] = field(default_factory=dict)  # done: the sides with stakes
    reason: str = ""  # refused: pool_closed, already_staked or daily_cap
    coins_left: int = 0  # refused (daily_cap): what the player may still stake today
    side: str = ""  # refused (already_staked): the side of the stake the player has
    amount: int = 0  # refused (already_staked): the amount of that stake


@dataclass(frozen=True)
class SettleOutcome:
    """The answer of prediction_settle_pool. Either done, or refused with a reason."""

    done: bool
    settlement: str = ""  # done: winners, refund_void, refund_no_winners or refund_one_sided
    paid_players: int = 0  # done
    paid_coins: int = 0  # done
    cut_coins: int = 0  # done: the coins that left the game
    settled_at: datetime | None = None  # done
    reason: str = ""  # refused: pool_open or stakes_changed
    closes_at: datetime | None = None  # refused (pool_open): when staking closes


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def to_whole_number(value: object) -> int:
    """A whole number from the database (a count, or whole coins)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise unreadable()
    return value


def to_text(value: object) -> str:
    if not isinstance(value, str):
        raise unreadable()
    return value


def to_time(value: object) -> datetime:
    """A time from the database, text such as 2026-11-20T10:02:11+00:00. It needs a timezone."""
    if not isinstance(value, str):
        raise unreadable()
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise unreadable() from error
    if moment.tzinfo is None:
        raise unreadable()
    return moment.astimezone(UTC)


def to_optional(value: object, convert: Any) -> Any:
    """A column that may be empty: None stays None, anything else goes through `convert`."""
    return None if value is None else convert(value)


def check_question_ids(question_ids: Sequence[str]) -> None:
    """Refuse an id that could add pieces to a query, before any request is sent."""
    for question_id in question_ids:
        if not QUESTION_ID.fullmatch(question_id):
            raise ValueError(f"Not a valid question id: {question_id!r}")


def question_filter(question_ids: Sequence[str]) -> str:
    """The query value for "any of these questions": in.(a,b,c). The ids are checked first."""
    check_question_ids(question_ids)
    return f"in.({','.join(question_ids)})"


def row_to_pool(row: dict[str, Any]) -> PoolRow:
    """One row of prediction_pools as a PoolRow. Raises SupabaseRejected if the row is odd."""
    try:
        return PoolRow(
            question_id=to_text(row["question_id"]),
            closes_at=to_time(row["closes_at"]),
            status=to_text(row["status"]),
            outcome=to_optional(row["outcome"], to_text),
            settlement=to_optional(row["settlement"], to_text),
            settled_by=to_optional(row["settled_by"], to_text),
            settled_at=to_optional(row["settled_at"], to_time),
            cut_coins=to_optional(row["cut_coins"], to_whole_number),
            paid_coins=to_optional(row["paid_coins"], to_whole_number),
        )
    except KeyError as error:
        raise unreadable() from error


def read_side(row: Any) -> SideTotals:
    """One side as the database sends it: {"side": "yes", "coins": 20, "players": 1}."""
    if not isinstance(row, dict):
        raise unreadable()
    try:
        return SideTotals(
            side=to_text(row["side"]),
            players=to_whole_number(row["players"]),
            coins=to_whole_number(row["coins"]),
        )
    except KeyError as error:
        raise unreadable() from error


async def read_pools(admin: SupabaseAdmin, question_ids: Sequence[str]) -> dict[str, PoolRow]:
    """The pool rows of these questions, by question id. A question without a pool has no row."""
    if not question_ids:
        return {}
    rows = await admin.select_rows(
        "prediction_pools",
        {
            "select": POOL_COLUMNS,
            "question_id": question_filter(question_ids),
            "limit": str(MAX_POOLS_READ),
        },
    )
    pools = [row_to_pool(row) for row in rows]
    return {pool.question_id: pool for pool in pools}


async def read_pool(admin: SupabaseAdmin, question_id: str) -> PoolRow | None:
    """The pool row of one question, or None if nobody has staked on it yet."""
    check_question_ids([question_id])
    rows = await admin.select_rows(
        "prediction_pools",
        {"select": POOL_COLUMNS, "question_id": f"eq.{question_id}", "limit": "1"},
    )
    return row_to_pool(rows[0]) if rows else None


async def read_side_totals(
    admin: SupabaseAdmin, question_ids: Sequence[str]
) -> dict[str, dict[str, SideTotals]]:
    """The coins and players on each side, for each question: {question id: {side: totals}}.

    They come from the view prediction_pool_sides, which adds up the stakes. A side that nobody
    picked, and a question that nobody staked on, are not in the answer.
    """
    if not question_ids:
        return {}
    rows = await admin.select_rows(
        "prediction_pool_sides",
        {
            "select": SIDE_COLUMNS,
            "question_id": question_filter(question_ids),
            "limit": str(MAX_SIDE_ROWS_READ),
        },
    )
    totals: dict[str, dict[str, SideTotals]] = {}
    for row in rows:
        side = read_side(row)
        totals.setdefault(to_text(row["question_id"]), {})[side.side] = side
    return totals


async def read_pool_stakes(admin: SupabaseAdmin, question_id: str) -> list[Stake]:
    """Every stake in one pool, the oldest first (the order decides a tie, see pools.py)."""
    check_question_ids([question_id])
    rows = await admin.select_rows(
        "prediction_stakes",
        {
            "select": POOL_STAKE_COLUMNS,
            "question_id": f"eq.{question_id}",
            "order": "id.asc",
            "limit": str(MAX_STAKES_IN_POOL),
        },
    )
    try:
        return [
            Stake(
                row_id=to_whole_number(row["id"]),
                player_id=to_text(row["player_id"]),
                side=to_text(row["side"]),
                amount=to_whole_number(row["amount"]),
            )
            for row in rows
        ]
    except (KeyError, ValueError) as error:  # ValueError: a stake of less than 1 coin
        raise unreadable() from error


async def read_player_stakes(admin: SupabaseAdmin, player_id: str) -> list[StakeRow]:
    """The newest stakes of a player first, at most 50."""
    rows = await admin.select_rows(
        "prediction_stakes",
        {
            "select": PLAYER_STAKE_COLUMNS,
            "player_id": f"eq.{player_id}",
            "order": "id.desc",
            "limit": str(MAX_STAKES_OF_PLAYER),
        },
    )
    try:
        return [
            StakeRow(
                id=to_whole_number(row["id"]),
                question_id=to_text(row["question_id"]),
                side=to_text(row["side"]),
                amount=to_whole_number(row["amount"]),
                payout=to_optional(row["payout"], to_whole_number),
                created_at=to_time(row["created_at"]),
            )
            for row in rows
        ]
    except KeyError as error:
        raise unreadable() from error


async def read_staked_today(admin: SupabaseAdmin, player_id: str, day_start: datetime) -> int:
    """The coins the player has staked since `day_start` (the start of the Lisbon day)."""
    rows = await admin.select_rows(
        "prediction_stakes",
        {
            "select": "amount",
            "player_id": f"eq.{player_id}",
            "created_at": f"gte.{day_start.isoformat()}",
            "limit": str(MAX_STAKES_FOR_DAY),
        },
    )
    try:
        return sum(to_whole_number(row["amount"]) for row in rows)
    except KeyError as error:
        raise unreadable() from error


async def stake_exists(admin: SupabaseAdmin, player_id: str, stake_id: str) -> bool:
    """True if this player has already staked with this stake id (the same click, sent again).

    prediction_place_stake() refuses a repeated stake id too, and that is the lock that cannot be
    passed. This read comes first, so that a repeat is always answered "already applied",
    whatever else has changed since (a closed pool, a new Manifold state).
    """
    if not STAKE_ID.fullmatch(stake_id):
        raise ValueError(f"Not a valid stake id: {stake_id!r}")
    rows = await admin.select_rows(
        "prediction_stakes",
        {
            "select": "id",
            "player_id": f"eq.{player_id}",
            "stake_id": f"eq.{stake_id}",
            "limit": "1",
        },
    )
    return len(rows) > 0


async def read_balance(admin: SupabaseAdmin, player_id: str) -> int:
    """The player's coins. The wallet row exists for every player (the sign-up trigger)."""
    rows = await admin.select_rows(
        "wallets", {"select": "balance", "player_id": f"eq.{player_id}", "limit": "1"}
    )
    if not rows:
        raise SupabaseRejected("This player has no wallet.")
    return to_whole_number(rows[0]["balance"])


def place_stake_arguments(
    player_id: str,
    question_id: str,
    side: str,
    amount: int,
    stake_id: str,
    closes_at: datetime,
    day_start: datetime,
) -> dict[str, Any]:
    """The arguments of prediction_place_stake. The names are the parameter names in the SQL.

    The limits (the biggest stake, the daily cap) come from stake_rules.py, so the numbers live in
    one place and the database only compares against them.
    """
    return {
        "p_player_id": player_id,
        "p_question_id": question_id,
        "p_side": side,
        "p_amount": amount,
        "p_stake_id": stake_id,
        "p_closes_at": closes_at.isoformat(),
        "p_max_stake": MAX_STAKE,
        "p_daily_cap": DAILY_STAKE_CAP,
        "p_day_start": day_start.isoformat(),
    }


def settle_arguments(
    question_id: str,
    outcome: str,
    closes_at: datetime,
    payouts: Sequence[Payout],
    settled_by: str,
) -> dict[str, Any]:
    """The arguments of prediction_settle_pool. The names are the parameter names in the SQL."""
    return {
        "p_question_id": question_id,
        "p_outcome": outcome,
        "p_closes_at": closes_at.isoformat(),
        "p_cut_percent": POOL_CUT_PERCENT,
        "p_payouts": [{"stakeRowId": payout.row_id, "coins": payout.coins} for payout in payouts],
        "p_settled_by": settled_by,
    }


def read_stake_reply(reply: object) -> StakeOutcome:
    """Understand the JSON that prediction_place_stake returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        sides = reply.get("sides")
        if not isinstance(sides, list):
            raise unreadable()
        totals = [read_side(side) for side in sides]
        return StakeOutcome(
            done=True,
            balance=to_whole_number(reply.get("balance")),
            staked_today=to_whole_number(reply.get("stakedToday")),
            sides={side.side: side for side in totals},
        )
    if reply.get("status") == "refused" and isinstance(reply.get("reason"), str):
        return StakeOutcome(
            done=False,
            reason=reply["reason"],
            coins_left=to_whole_number(reply.get("coinsLeft", 0)),
            side=to_text(reply.get("side", "")),
            amount=to_whole_number(reply.get("amount", 0)),
        )
    raise unreadable()


def read_settle_reply(reply: object) -> SettleOutcome:
    """Understand the JSON that prediction_settle_pool returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return SettleOutcome(
            done=True,
            settlement=to_text(reply.get("settlement")),
            paid_players=to_whole_number(reply.get("paidPlayers")),
            paid_coins=to_whole_number(reply.get("paidCoins")),
            cut_coins=to_whole_number(reply.get("cutCoins")),
            settled_at=to_time(reply.get("settledAt")),
        )
    if reply.get("status") == "refused" and isinstance(reply.get("reason"), str):
        return SettleOutcome(
            done=False,
            reason=reply["reason"],
            closes_at=to_optional(reply.get("closesAt"), to_time),
        )
    raise unreadable()


async def run_place_stake(admin: SupabaseAdmin, arguments: dict[str, Any]) -> StakeOutcome:
    """Run the atomic database function prediction_place_stake.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      InsufficientFunds (409)    not enough coins
      AlreadyApplied (409)       this stake id was used before; nothing changed
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; look the stake id up before you retry
    """
    reply = await admin.call_function("prediction_place_stake", arguments)
    return read_stake_reply(reply)


async def run_settle(admin: SupabaseAdmin, arguments: dict[str, Any]) -> SettleOutcome:
    """Run the atomic database function prediction_settle_pool.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      AlreadyApplied (409)       the pool was settled before; nothing changed
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; read the pool before you retry
    """
    reply = await admin.call_function("prediction_settle_pool", arguments)
    return read_settle_reply(reply)
