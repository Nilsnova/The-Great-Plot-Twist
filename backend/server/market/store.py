"""Island Exchange database access: company bases, positions, wallet balance and the trade function.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on the
server only. Reads use select_rows. The two writes are database functions, run with call_function:
  * market_set_base   saves the base of one company, safely when two server instances race
  * market_trade      the one atomic trade: coins, position and trade row in a single step
(supabase/migrations/20261106010000_island_exchange.sql explains both.)

Two kinds of base store, with the same two methods (read_all and save):
  * DatabaseBaseStore   keeps the bases in the table market_bases. Every server instance shares it.
  * MemoryBaseStore     keeps them in this instance only. Used when the database is not set up
                        (a demo or a laptop without Supabase), so the price board still works.
Both use the version number the same way: a save only works if the base still has the version the
caller read. A save that does not work returns False, and the caller reads again.

Numbers: the database sends numeric columns as JSON numbers, which Python reads as floats. They are
turned into exact Decimals through their text form (str), the shortest text that gives the float.

Used by: exchange.py.
"""

import logging
from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol

from server.market.rules import Base
from server.market.trade_rules import (
    BUY,
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MIN_HOLD_SECONDS,
    TradeAmounts,
)
from server.supabase_admin import SupabaseAdmin, SupabaseNotConfigured, SupabaseRejected

logger = logging.getLogger(__name__)

BASE_COLUMNS = (
    "company_id,base_game_price,base_real_price,base_at,base_source,"
    "halted_until,frozen_price,version"
)
POSITION_COLUMNS = "company_id,units,avg_price,opened_at,last_buy_at"

# A player holds at most one position per company, and there are few companies.
MAX_POSITIONS = 50
# The most trades read to add up what a player has bought today.
MAX_TRADES_READ = 1000


class BaseStore(Protocol):
    """Where company bases are kept. DatabaseBaseStore and MemoryBaseStore both do this."""

    async def read_all(self) -> dict[str, Base]: ...

    async def save(self, company_id: str, base: Base) -> bool: ...


@dataclass(frozen=True)
class PositionRow:
    """What a player holds of one company."""

    company_id: str
    units: int
    avg_price: Decimal
    opened_at: datetime
    last_buy_at: datetime  # the minimum holding time counts from here


@dataclass(frozen=True)
class TradeOutcome:
    """The answer of the database function market_trade. Either done, or refused with a reason."""

    done: bool
    balance: int = 0  # done: the wallet balance after the trade
    units_after: int = 0  # done: units held after the trade
    avg_price: Decimal | None = None  # done: average price of the units held (None if none left)
    reason: str = ""  # refused: halted, daily_cap, not_enough_units or holding_time
    coins_left: int = 0  # refused (daily_cap): what the player may still buy today
    units_held: int = 0  # refused (not_enough_units): what the player holds
    wait_seconds: int = 0  # refused (holding_time): how long until the units can be sold


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def to_decimal(value: object) -> Decimal:
    """A number from the database as an exact Decimal."""
    if isinstance(value, bool) or not isinstance(value, int | float | str):
        raise unreadable()
    try:
        return Decimal(str(value))
    except InvalidOperation as error:
        raise unreadable() from error


def to_whole_number(value: object) -> int:
    """A whole number from the database (a count, or whole coins)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise unreadable()
    if int(value) != value:
        raise unreadable()
    return int(value)


def to_time(value: object) -> datetime:
    """A time from the database, text such as 2026-11-05T12:00:00+00:00. It needs a timezone."""
    if not isinstance(value, str):
        raise unreadable()
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise unreadable() from error
    if moment.tzinfo is None:
        raise unreadable()
    return moment


def plain(value: Decimal) -> str:
    """A Decimal as plain text without an exponent, for the database: 1E+3 becomes 1000."""
    return format(value, "f")


def row_to_base(row: dict[str, Any]) -> Base:
    """One row of market_bases as a Base. Raises SupabaseRejected if the row is odd."""
    try:
        halted_until = row["halted_until"]
        frozen_price = row["frozen_price"]
        return Base(
            game_price=to_decimal(row["base_game_price"]),
            real_price=to_decimal(row["base_real_price"]),
            set_at=to_time(row["base_at"]),
            source=str(row["base_source"]),
            halted_until=None if halted_until is None else to_time(halted_until),
            frozen_price=None if frozen_price is None else to_decimal(frozen_price),
            version=to_whole_number(row["version"]),
        )
    except KeyError as error:
        raise unreadable() from error


def save_arguments(company_id: str, base: Base) -> dict[str, Any]:
    """The arguments of market_set_base. The names are the parameter names in the SQL."""
    halted_until = None if base.halted_until is None else base.halted_until.isoformat()
    frozen_price = None if base.frozen_price is None else plain(base.frozen_price)
    return {
        "p_company_id": company_id,
        "p_base_game_price": plain(base.game_price),
        "p_base_real_price": plain(base.real_price),
        "p_base_at": base.set_at.isoformat(),
        "p_base_source": base.source,
        "p_halted_until": halted_until,
        "p_frozen_price": frozen_price,
        "p_expected_version": base.version,
    }


class DatabaseBaseStore:
    """The bases in the table market_bases, shared by every server instance."""

    def __init__(self, admin: SupabaseAdmin) -> None:
        self.admin = admin

    async def read_all(self) -> dict[str, Base]:
        rows = await self.admin.select_rows("market_bases", {"select": BASE_COLUMNS})
        try:
            return {str(row["company_id"]): row_to_base(row) for row in rows}
        except KeyError as error:
            raise unreadable() from error

    async def save(self, company_id: str, base: Base) -> bool:
        """True if saved. False if somebody else saved first (the database answers null)."""
        reply = await self.admin.call_function("market_set_base", save_arguments(company_id, base))
        return reply is not None


class MemoryBaseStore:
    """The bases in this server instance only. Same rules as the database, no database needed."""

    def __init__(self) -> None:
        self.bases: dict[str, Base] = {}

    async def read_all(self) -> dict[str, Base]:
        return dict(self.bases)

    async def save(self, company_id: str, base: Base) -> bool:
        current = self.bases.get(company_id)
        current_version = 0 if current is None else current.version
        if current_version != base.version:
            return False
        self.bases[company_id] = replace(base, version=base.version + 1)
        return True


def database_is_configured(admin: SupabaseAdmin) -> bool:
    """True if the server has the Supabase address and secret key."""
    try:
        admin.check_configured()
    except SupabaseNotConfigured:
        return False
    return True


async def read_balance(admin: SupabaseAdmin, player_id: str) -> int:
    """The player's coins. The wallet row exists for every player (the sign-up trigger)."""
    rows = await admin.select_rows(
        "wallets", {"select": "balance", "player_id": f"eq.{player_id}", "limit": "1"}
    )
    if not rows:
        raise SupabaseRejected("This player has no wallet.")
    return to_whole_number(rows[0]["balance"])


async def read_positions(admin: SupabaseAdmin, player_id: str) -> list[PositionRow]:
    """What the player holds, one row per company."""
    rows = await admin.select_rows(
        "market_positions",
        {
            "select": POSITION_COLUMNS,
            "player_id": f"eq.{player_id}",
            "order": "company_id.asc",
            "limit": str(MAX_POSITIONS),
        },
    )
    try:
        return [
            PositionRow(
                company_id=str(row["company_id"]),
                units=to_whole_number(row["units"]),
                avg_price=to_decimal(row["avg_price"]),
                opened_at=to_time(row["opened_at"]),
                last_buy_at=to_time(row["last_buy_at"]),
            )
            for row in rows
        ]
    except KeyError as error:
        raise unreadable() from error


async def trade_exists(admin: SupabaseAdmin, player_id: str, ref: str) -> bool:
    """True if this player has already made a trade with this ref (the same click, sent again).

    market_trade() refuses a repeated ref too, and that is the lock that cannot be passed. This
    read comes first, so that a repeat is always answered "already applied", whatever else has
    changed since (a pause, a new price).
    """
    rows = await admin.select_rows(
        "market_trades",
        {"select": "id", "player_id": f"eq.{player_id}", "ref": f"eq.{ref}", "limit": "1"},
    )
    return len(rows) > 0


async def read_bought_today(admin: SupabaseAdmin, player_id: str, day_start: datetime) -> int:
    """The coins (shares only, no fees) the player has spent on buying since `day_start`."""
    rows = await admin.select_rows(
        "market_trades",
        {
            "select": "gross",
            "player_id": f"eq.{player_id}",
            "side": f"eq.{BUY}",
            "created_at": f"gte.{day_start.isoformat()}",
            "limit": str(MAX_TRADES_READ),
        },
    )
    return sum(to_whole_number(row["gross"]) for row in rows)


def trade_arguments(
    player_id: str,
    company_id: str,
    side: str,
    units: int,
    price: Decimal,
    amounts: TradeAmounts,
    ref: str,
    day_start: datetime,
) -> dict[str, Any]:
    """The arguments of market_trade. The names are the parameter names in the SQL.

    The limits that depend on earlier trades (holding time, daily cap) and the numbers that the
    database checks the arithmetic against (the fee rate, the size of a purchase) are passed from
    trade_rules.py, so the numbers live in one place and the database only compares against them.
    """
    return {
        "p_player_id": player_id,
        "p_company_id": company_id,
        "p_side": side,
        "p_units": units,
        "p_price": plain(price),
        "p_gross": amounts.gross,
        "p_fee": amounts.fee,
        "p_ref": ref,
        "p_min_hold_seconds": MIN_HOLD_SECONDS,
        "p_daily_buy_cap": DAILY_BUY_CAP_COINS,
        "p_day_start": day_start.isoformat(),
        "p_fee_basis_points": FEE_BASIS_POINTS,
        "p_max_buy_coins": MAX_TRADE_COINS,
    }


def read_trade_reply(reply: object) -> TradeOutcome:
    """Understand the JSON that market_trade returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        avg_price = reply.get("avgPrice")
        return TradeOutcome(
            done=True,
            balance=to_whole_number(reply.get("balance")),
            units_after=to_whole_number(reply.get("unitsAfter")),
            avg_price=None if avg_price is None else to_decimal(avg_price),
        )
    if reply.get("status") == "refused" and isinstance(reply.get("reason"), str):
        return TradeOutcome(
            done=False,
            reason=reply["reason"],
            coins_left=to_whole_number(reply.get("coinsLeft", 0)),
            units_held=to_whole_number(reply.get("unitsHeld", 0)),
            wait_seconds=to_whole_number(reply.get("waitSeconds", 0)),
        )
    raise unreadable()


async def run_trade(admin: SupabaseAdmin, arguments: dict[str, Any]) -> TradeOutcome:
    """Run the atomic database function market_trade.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      InsufficientFunds (409)    not enough coins
      AlreadyApplied (409)       this ref was used before; nothing changed
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; look the ref up before you retry
    """
    reply = await admin.call_function("market_trade", arguments)
    return read_trade_reply(reply)
