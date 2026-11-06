"""Island Exchange database writes: the three functions that open, close and sweep positions.

Every change to a position goes through ONE of these database functions. Each does its whole job
in a single step (the coins, the position and the history), so a crash or a double click cannot
leave a half-done change (supabase/migrations/20261106090000_exchange_leverage.sql explains them).

  exchange_open_position()  opens a position: takes the stake and the fee from the wallet.
  exchange_close_position() closes one position for a player: pays the value, takes the closing fee.
  exchange_close_used_up()  closes every position whose zero point a price has reached, at zero.
                            No coins move, so it needs no wallet.

Each function returns a JSON object. A RULE that says no (too many positions, the daily cap, a
position that is already closed) is returned as {"status": "refused", "reason": ...} with
nothing changed. A real failure (not enough coins, a repeated ref, numbers that do not add up)
raises an error that supabase_admin.py turns into the standard error answer:
  InsufficientFunds (409)    not enough coins
  AlreadyApplied (409)       this ref was used before; nothing changed
  SupabaseRejected (502)     the database refused the numbers, or refused for a reason we do not
                             know; either way nothing changed
  SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; look the ref up before you retry. It is raised
                             when the database did not answer in time AND when an opening or a
                             closing got an answer that is not a refusal and cannot be read: the
                             coins may have moved, so the player must check the positions first.

The refs. All the ledger rows and the history row of one action share one ref: "market:open:" or
"market:close:" plus the actionUid the browser made for the click, and "market:zero:" plus the
position id for a close at zero. The prefixes keep an open and a close apart, even if a browser
reused one actionUid. The longest ref is 13 + 64 = 77 characters, under the limit of 120.

Used by: exchange.py (trading and the sweeps) and the tests.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from server.market.positions import (
    DAILY_STAKE_CAP_COINS,
    LEVERAGE,
    MAX_OPEN_POSITIONS,
    MAX_STAKE_COINS,
    MIN_STAKE_COINS,
    Closing,
)
from server.market.states import SweepPrice
from server.market.store import (
    plain,
    to_decimal,
    to_text,
    to_time,
    to_whole_number,
    to_word,
    unreadable,
)
from server.supabase_admin import SupabaseAdmin, SupabaseRejected, SupabaseUnavailable

OPEN_REF_PREFIX = "market:open:"
CLOSE_REF_PREFIX = "market:close:"
ZERO_REF_PREFIX = "market:zero:"

OPEN_REFUSALS = ("too_many_positions", "daily_cap")
CLOSE_REFUSALS = ("no_such_position", "position_closed", "wrong_price_mode")
CLOSED_AS = ("closed", "zeroed")


@dataclass(frozen=True)
class OpenOutcome:
    """The answer of exchange_open_position(): done, or refused with a reason."""

    done: bool
    position_id: str = ""  # done
    zero_price: Decimal | None = None  # done: worked out by the database from the entry price
    balance: int = 0  # done: the wallet balance after the stake and the fee
    opened_at: datetime | None = None  # done
    reason: str = ""  # refused: "too_many_positions" or "daily_cap"
    open_count: int = 0  # refused (too_many_positions): the positions the player has open
    coins_left: int = 0  # refused (daily_cap): the stake the player may still put in today


@dataclass(frozen=True)
class CloseOutcome:
    """The answer of exchange_close_position(): done, or refused with a reason."""

    done: bool
    closed_as: str = ""  # done, or refused (position_closed): "closed" or "zeroed"
    value: int = 0  # done
    fee: int = 0  # done: the closing fee
    coins_change: int = 0  # done: value - fee
    balance: int = 0  # done: the wallet balance after the close
    closed_at: datetime | None = None  # done, or refused (position_closed)
    reason: str = ""  # refused: "no_such_position", "position_closed" or "wrong_price_mode"


@dataclass(frozen=True)
class SweepOutcome:
    """The answer of exchange_close_used_up(): which positions were closed at zero."""

    closed: int
    position_ids: tuple[str, ...]


# --- the arguments. The names are the parameter names in the SQL, in the same order. ---


def open_arguments(
    player_id: str,
    company_id: str,
    side: str,
    price_mode: str,
    entry_price: Decimal,
    stake: int,
    fee: int,
    fee_basis_points: int,
    ref: str,
    day_start: datetime,
) -> dict[str, Any]:
    """The arguments of exchange_open_position().

    The limits (leverage, the stake range, the daily cap, the open positions) come from
    positions.py, so the numbers live in one place and the database only compares against them.
    """
    return {
        "p_player_id": player_id,
        "p_company_id": company_id,
        "p_side": side,
        "p_price_mode": price_mode,
        "p_entry_price": plain(entry_price),
        "p_leverage": LEVERAGE,
        "p_stake": stake,
        "p_fee": fee,
        "p_fee_basis_points": fee_basis_points,
        "p_ref": ref,
        "p_min_stake": MIN_STAKE_COINS,
        "p_max_stake": MAX_STAKE_COINS,
        "p_daily_stake_cap": DAILY_STAKE_CAP_COINS,
        "p_day_start": day_start.isoformat(),
        "p_max_open_positions": MAX_OPEN_POSITIONS,
    }


def close_arguments(
    player_id: str,
    position_id: str,
    price_mode: str,
    close_price: Decimal,
    closing: Closing,
    fee_basis_points: int,
    ref: str,
) -> dict[str, Any]:
    """The arguments of exchange_close_position(). The database recomputes value and fee.

    price_mode is the kind of prices of close_price (live or replay). The database compares it
    with the mode the position was opened on, so pass the mode of the price that was used.
    """
    return {
        "p_player_id": player_id,
        "p_position_id": position_id,
        "p_price_mode": price_mode,
        "p_close_price": plain(close_price),
        "p_value": closing.value,
        "p_fee": closing.fee,
        "p_fee_basis_points": fee_basis_points,
        "p_ref": ref,
    }


def sweep_arguments(prices: list[SweepPrice], player_id: str | None) -> dict[str, Any]:
    """The arguments of exchange_close_used_up(). player_id None means all players.

    The keys inside p_prices are snake_case because they are a contract of the database. The
    prices are text, so they stay exact.
    """
    return {
        "p_prices": [
            {
                "company_id": price.company_id,
                "price": plain(price.price),
                "quoted_at": price.quoted_at.isoformat(),
                "mode": price.mode,
            }
            for price in prices
        ],
        "p_player_id": player_id,
    }


# --- the answers ---


def read_open_reply(reply: object) -> OpenOutcome:
    """Understand the JSON that exchange_open_position() returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return OpenOutcome(
            done=True,
            position_id=to_text(reply.get("positionId")),
            zero_price=to_decimal(reply.get("zeroPrice")),
            balance=to_whole_number(reply.get("balance")),
            opened_at=to_time(reply.get("openedAt")),
        )
    if reply.get("status") != "refused":
        raise unreadable()
    reason = to_word(reply.get("reason"), OPEN_REFUSALS)
    if reason == "too_many_positions":
        return OpenOutcome(
            done=False, reason=reason, open_count=to_whole_number(reply.get("openCount"))
        )
    return OpenOutcome(
        done=False, reason=reason, coins_left=to_whole_number(reply.get("coinsLeft"))
    )


def read_close_reply(reply: object) -> CloseOutcome:
    """Understand the JSON that exchange_close_position() returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return CloseOutcome(
            done=True,
            closed_as=to_word(reply.get("closedAs"), CLOSED_AS),
            value=to_whole_number(reply.get("value")),
            fee=to_whole_number(reply.get("fee")),
            coins_change=to_whole_number(reply.get("coinsChange")),
            balance=to_whole_number(reply.get("balance")),
            closed_at=to_time(reply.get("closedAt")),
        )
    if reply.get("status") != "refused":
        raise unreadable()
    reason = to_word(reply.get("reason"), CLOSE_REFUSALS)
    if reason == "position_closed":
        return CloseOutcome(
            done=False,
            reason=reason,
            closed_as=to_word(reply.get("closedAs"), CLOSED_AS),
            closed_at=to_time(reply.get("closedAt")),
        )
    return CloseOutcome(done=False, reason=reason)


def read_sweep_reply(reply: object) -> SweepOutcome:
    """Understand the JSON that exchange_close_used_up() returns."""
    if not isinstance(reply, dict) or not isinstance(reply.get("positionIds"), list):
        raise unreadable()
    return SweepOutcome(
        closed=to_whole_number(reply.get("closed")),
        position_ids=tuple(to_text(position_id) for position_id in reply["positionIds"]),
    )


# --- running the functions ---


def is_refusal(reply: object) -> bool:
    """True for a reply that says "refused". By the contract of the functions nothing changed."""
    return isinstance(reply, dict) and reply.get("status") == "refused"


async def run_open(admin: SupabaseAdmin, arguments: dict[str, Any]) -> OpenOutcome:
    """Run exchange_open_position(). May raise InsufficientFunds, AlreadyApplied, ...

    The database answered, so the transaction has finished. If the answer is not a refusal and we
    cannot read it, the position may have been opened: that is an unknown outcome (a 503), not a
    plain failure. A refusal that we cannot read changed nothing, so it stays a 502.
    """
    reply = await admin.call_function("exchange_open_position", arguments)
    try:
        return read_open_reply(reply)
    except SupabaseRejected as error:
        if is_refusal(reply):
            raise
        raise SupabaseUnavailable() from error


async def run_close(admin: SupabaseAdmin, arguments: dict[str, Any]) -> CloseOutcome:
    """Run exchange_close_position(). May raise AlreadyApplied, SupabaseUnavailable, ...

    Like run_open: an answer that is not a refusal and cannot be read is an unknown outcome,
    because the coins may have moved.
    """
    reply = await admin.call_function("exchange_close_position", arguments)
    try:
        return read_close_reply(reply)
    except SupabaseRejected as error:
        if is_refusal(reply):
            raise
        raise SupabaseUnavailable() from error


async def run_sweep(admin: SupabaseAdmin, arguments: dict[str, Any]) -> SweepOutcome:
    """Run exchange_close_used_up()."""
    return read_sweep_reply(await admin.call_function("exchange_close_used_up", arguments))
