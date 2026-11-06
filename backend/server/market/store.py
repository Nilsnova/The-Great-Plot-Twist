"""Island Exchange database reads: positions, events, the daily stakes and the wallet balance.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on
the server only. These are READS (select_rows). The three database functions that change things
are in store_calls.py. The tables are explained in
supabase/migrations/20261106090000_exchange_leverage.sql.

Numbers: the database sends numeric columns as JSON numbers, which Python reads as floats. They
are turned into exact Decimals through their text form (str), the shortest text that gives the
float. A price has at most 8 decimals and a few digits before them, so no digit is lost.

A row that does not look as expected (a missing column, a word we do not know, a number that is
not a number) is refused with 502 database_error instead of being half understood.

Used by: store_calls.py (the number readers), exchange.py, portfolio.py and the tests. The
Greyfathom rule of card C6 (S3) calls has_open_rising_position().
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from server.market.positions import MAX_OPEN_POSITIONS, RISING, SIDES
from server.supabase_admin import SupabaseAdmin, SupabaseNotConfigured, SupabaseRejected

logger = logging.getLogger(__name__)

POSITION_COLUMNS = (
    "id,company_id,side,price_mode,stake,entry_price,zero_price,open_fee,opened_at,status,"
    "closed_at,close_price,close_value,close_fee"
)
EVENT_COLUMNS = (
    "id,position_id,kind,company_id,side,price,stake,value,fee,coins_change,ref,created_at"
)

STATUSES = ("open", "closed", "zeroed")
PRICE_MODES = ("live", "replay")
EVENT_KINDS = ("open", "close", "zero")

RECENTLY_CLOSED_LIMIT = 10  # the newest closed positions the portfolio shows
# A player stakes at most 2000 coins a game day and at least 10 per position, so a day holds at
# most 200 positions. This is more than that, only a bound on the answer.
MAX_STAKES_READ = 500


@dataclass(frozen=True)
class PositionRow:
    """One row of exchange_positions: one position of one player."""

    id: str
    company_id: str
    side: str  # "rising" or "falling"
    price_mode: str  # "live" or "replay"
    stake: int
    entry_price: Decimal
    zero_price: Decimal
    open_fee: int
    opened_at: datetime
    status: str  # "open", "closed" (by the player) or "zeroed" (the stake was used up)
    closed_at: datetime | None
    close_price: Decimal | None
    close_value: int | None
    close_fee: int | None

    @property
    def is_open(self) -> bool:
        return self.status == "open"


@dataclass(frozen=True)
class EventRow:
    """One row of exchange_events: the history of positions, never edited."""

    id: int
    position_id: str
    kind: str  # "open", "close" or "zero"
    company_id: str
    side: str
    price: Decimal
    stake: int
    value: int
    fee: int
    coins_change: int
    ref: str
    created_at: datetime


# --- reading what the database sends ---


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


def to_word(value: object, allowed: tuple[str, ...]) -> str:
    """Text that must be one of the allowed words."""
    if not isinstance(value, str) or value not in allowed:
        raise unreadable()
    return value


def to_text(value: object) -> str:
    """Text that is not empty."""
    if not isinstance(value, str) or not value:
        raise unreadable()
    return value


def plain(value: Decimal) -> str:
    """A Decimal as plain text without an exponent, for the database: 1E+3 becomes 1000."""
    return format(value, "f")


def or_none(value: object, convert: Any) -> Any:
    """The converted value, or None if the database sent null."""
    return None if value is None else convert(value)


def row_to_position(row: dict[str, Any]) -> PositionRow:
    """One row of exchange_positions as a PositionRow. Raises SupabaseRejected if it is odd."""
    try:
        return PositionRow(
            id=to_text(row["id"]),
            company_id=to_text(row["company_id"]),
            side=to_word(row["side"], SIDES),
            price_mode=to_word(row["price_mode"], PRICE_MODES),
            stake=to_whole_number(row["stake"]),
            entry_price=to_decimal(row["entry_price"]),
            zero_price=to_decimal(row["zero_price"]),
            open_fee=to_whole_number(row["open_fee"]),
            opened_at=to_time(row["opened_at"]),
            status=to_word(row["status"], STATUSES),
            closed_at=or_none(row["closed_at"], to_time),
            close_price=or_none(row["close_price"], to_decimal),
            close_value=or_none(row["close_value"], to_whole_number),
            close_fee=or_none(row["close_fee"], to_whole_number),
        )
    except KeyError as error:
        raise unreadable() from error


def row_to_event(row: dict[str, Any]) -> EventRow:
    """One row of exchange_events as an EventRow. Raises SupabaseRejected if it is odd."""
    try:
        return EventRow(
            id=to_whole_number(row["id"]),
            position_id=to_text(row["position_id"]),
            kind=to_word(row["kind"], EVENT_KINDS),
            company_id=to_text(row["company_id"]),
            side=to_word(row["side"], SIDES),
            price=to_decimal(row["price"]),
            stake=to_whole_number(row["stake"]),
            value=to_whole_number(row["value"]),
            fee=to_whole_number(row["fee"]),
            coins_change=to_whole_number(row["coins_change"]),
            ref=to_text(row["ref"]),
            created_at=to_time(row["created_at"]),
        )
    except KeyError as error:
        raise unreadable() from error


# --- reading from the tables ---


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


async def read_open_positions(admin: SupabaseAdmin, player_id: str) -> list[PositionRow]:
    """The open positions of the player, newest first. A player has at most 20."""
    rows = await admin.select_rows(
        "exchange_positions",
        {
            "select": POSITION_COLUMNS,
            "player_id": f"eq.{player_id}",
            "status": "eq.open",
            "order": "opened_at.desc",
            "limit": str(MAX_OPEN_POSITIONS),
        },
    )
    return [row_to_position(row) for row in rows]


async def read_recently_closed(admin: SupabaseAdmin, player_id: str) -> list[PositionRow]:
    """The newest closed or zeroed positions of the player."""
    rows = await admin.select_rows(
        "exchange_positions",
        {
            "select": POSITION_COLUMNS,
            "player_id": f"eq.{player_id}",
            "status": "in.(closed,zeroed)",
            "order": "closed_at.desc",
            "limit": str(RECENTLY_CLOSED_LIMIT),
        },
    )
    return [row_to_position(row) for row in rows]


async def read_position(
    admin: SupabaseAdmin, player_id: str, position_id: str
) -> PositionRow | None:
    """One position by its id AND its player (a player cannot see another player's position)."""
    rows = await admin.select_rows(
        "exchange_positions",
        {
            "select": POSITION_COLUMNS,
            "id": f"eq.{position_id}",
            "player_id": f"eq.{player_id}",
            "limit": "1",
        },
    )
    return row_to_position(rows[0]) if rows else None


async def read_staked_since(admin: SupabaseAdmin, player_id: str, day_start: datetime) -> int:
    """The coins (stakes only, no fees) the player put into positions since `day_start`."""
    rows = await admin.select_rows(
        "exchange_positions",
        {
            "select": "stake",
            "player_id": f"eq.{player_id}",
            "opened_at": f"gte.{day_start.isoformat()}",
            "limit": str(MAX_STAKES_READ),
        },
    )
    return sum(to_whole_number(row["stake"]) for row in rows)


async def event_exists(admin: SupabaseAdmin, player_id: str, ref: str) -> bool:
    """True if this player has already acted with this ref (the same click, sent again).

    The database refuses a repeated ref too, and that is the lock that cannot be passed. This read
    comes first, so that a repeat is always answered "already applied", whatever else has changed
    since (the market has closed, the price is old).
    """
    rows = await admin.select_rows(
        "exchange_events",
        {"select": "id", "player_id": f"eq.{player_id}", "ref": f"eq.{ref}", "limit": "1"},
    )
    return len(rows) > 0


async def has_open_rising_position(admin: SupabaseAdmin, player_id: str, company_id: str) -> bool:
    """True if the player has an open rising position in the company.

    This is the "Greyfathom share" of card C6 (the shareholder register): S3 calls it with
    "greyfathom-salvage" (rule R22).
    """
    rows = await admin.select_rows(
        "exchange_positions",
        {
            "select": "id",
            "player_id": f"eq.{player_id}",
            "company_id": f"eq.{company_id}",
            "side": f"eq.{RISING}",
            "status": "eq.open",
            "limit": "1",
        },
    )
    return len(rows) > 0
