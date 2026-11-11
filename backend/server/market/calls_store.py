"""Market call database access: the reads of market_calls and its two functions.

Everything here runs on the server with the secret key, which skips row-level security, so the
filter on the verified player id in each read is the only thing that keeps another player's calls
out. The functions are in supabase/migrations/20261111010000_market_calls.sql:

    market_call_open(player, actionUid, asset, direction, stake, openPrice)
    market_call_settle(callId, settlePrice or null)

Used by: calls.py and the tests.
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, StrictBool, StrictInt, StrictStr, ValidationError

from server.market.store import plain
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

COLUMNS = (
    "id,asset,direction,stake,open_price,opened_at,settle_at,settled_at,settle_price,outcome,payout"
)
# At most 3 calls are open; the list shows them and the 10 newest decided ones.
MAX_OPEN_READ = 10
RECENT_SETTLED = 10


class CallRow(BaseModel):
    """One row of market_calls, as a read or a function sends it."""

    id: StrictStr
    asset: StrictStr
    direction: Literal["up", "down"]
    stake: StrictInt
    open_price: Decimal
    opened_at: AwareDatetime
    settle_at: AwareDatetime
    settled_at: AwareDatetime | None
    settle_price: Decimal | None
    outcome: Literal["won", "lost", "refunded"] | None
    payout: StrictInt | None


class CallReply(BaseModel):
    """What market_call_open and market_call_settle answer when they did it."""

    status: Literal["opened", "settled"]
    call: CallRow
    balance: StrictInt
    repeat: StrictBool


class RefusedReply(BaseModel):
    status: Literal["refused"]
    reason: StrictStr


def read_model(model: type[BaseModel], value: object) -> Any:
    try:
        return model.model_validate(value)
    except ValidationError as error:
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise SupabaseRejected("The database sent an answer we could not read.") from error


def reply_of(value: object) -> CallReply | RefusedReply:
    if isinstance(value, dict) and value.get("status") == "refused":
        return read_model(RefusedReply, value)
    return read_model(CallReply, value)


async def read_calls(admin: SupabaseAdmin, player_id: str) -> list[CallRow]:
    """The player's open calls (oldest first) and their newest decided ones (newest first)."""
    open_rows = await admin.select_rows(
        "market_calls",
        {
            "select": COLUMNS,
            "player_id": f"eq.{player_id}",
            "settled_at": "is.null",
            "order": "opened_at.asc",
            "limit": str(MAX_OPEN_READ),
        },
    )
    settled_rows = await admin.select_rows(
        "market_calls",
        {
            "select": COLUMNS,
            "player_id": f"eq.{player_id}",
            "settled_at": "not.is.null",
            "order": "settled_at.desc",
            "limit": str(RECENT_SETTLED),
        },
    )
    return [read_model(CallRow, row) for row in [*open_rows, *settled_rows]]


async def find_by_action(admin: SupabaseAdmin, player_id: str, action_uid: str) -> CallRow | None:
    """The call this click made already, if any."""
    rows = await admin.select_rows(
        "market_calls",
        {
            "select": COLUMNS,
            "player_id": f"eq.{player_id}",
            "action_uid": f"eq.{action_uid}",
            "limit": "1",
        },
    )
    return read_model(CallRow, rows[0]) if rows else None


async def run_open(
    admin: SupabaseAdmin,
    player_id: str,
    action_uid: str,
    asset: str,
    direction: str,
    stake: int,
    open_price: Decimal,
) -> CallReply | RefusedReply:
    """Run market_call_open. InsufficientFunds (409) comes from the wallet and changes nothing."""
    reply = await admin.call_function(
        "market_call_open",
        {
            "p_player_id": player_id,
            "p_action_uid": action_uid,
            "p_asset": asset,
            "p_direction": direction,
            "p_stake": stake,
            "p_open_price": plain(open_price),
        },
    )
    return reply_of(reply)


async def run_settle(
    admin: SupabaseAdmin, call_id: str, settle_price: Decimal | None
) -> CallReply | RefusedReply:
    """Run market_call_settle with the price the server read (None: it has none)."""
    price = None if settle_price is None else plain(settle_price)
    reply = await admin.call_function(
        "market_call_settle", {"p_call_id": call_id, "p_settle_price": price}
    )
    return reply_of(reply)


def is_due(row: CallRow, now: datetime) -> bool:
    return row.settled_at is None and now >= row.settle_at
