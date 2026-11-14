"""Arsenal database access (T40, D042): the four arsenal_* functions and their answers.

Everything here runs on the server with the secret key. The functions are in
supabase/migrations/20261114120000_arsenal.sql; each locks the island row (and a buy the buyer's
wallet first), checks the rules again and answers the arsenal as it is after the step:

    arsenal_state(player, owner)                          the arsenal now (sweeps, converts)
    arsenal_buy(player, owner, weapon, uid, price, wave)  a new copy, paid by the player
    arsenal_take(player, owner, copy, uid)                withdraw, or swap for the carried copy
    arsenal_return(player, owner, uid)                    the carried copy back on the rack

Used by: arsenal.py and the tests.
"""

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, StrictBool, StrictInt, StrictStr

from server.island.store import read_model
from server.supabase_admin import SupabaseAdmin


class CopyRow(BaseModel):
    id: StrictStr
    no: StrictInt
    weapon: StrictStr
    holder: StrictStr | None
    holderName: StrictStr | None
    away: StrictBool


class SnapshotRow(BaseModel):
    capacity: StrictInt
    stored: StrictInt
    mine: StrictStr | None
    waveRunning: StrictBool
    copies: list[CopyRow]


class DoneRow(BaseModel):
    status: Literal["done", "ok"]
    arsenal: SnapshotRow
    repeat: StrictBool = False
    balance: StrictInt | None = None


class RefusedRow(BaseModel):
    status: Literal["refused"]
    reason: StrictStr
    price: StrictInt = 0


@dataclass(frozen=True)
class Outcome:
    """What one arsenal function answered: the arsenal after it, or the reason it said no."""

    snapshot: SnapshotRow | None
    refusal: str | None = None
    price: int = 0
    repeat: bool = False
    balance: int | None = None


def read_outcome(reply: object) -> Outcome:
    """Check a function's answer. Something we cannot read becomes a 502 (read_model)."""
    if isinstance(reply, dict) and reply.get("status") == "refused":
        refused = read_model(RefusedRow, reply)
        return Outcome(None, refused.reason, refused.price)
    done = read_model(DoneRow, reply)
    return Outcome(done.arsenal, repeat=done.repeat, balance=done.balance)


async def run(admin: SupabaseAdmin, function: str, arguments: dict[str, Any]) -> Outcome:
    """Run one arsenal_* function and read its answer."""
    return read_outcome(await admin.call_function(function, arguments))


async def state(admin: SupabaseAdmin, player_id: str, owner: str) -> Outcome:
    return await run(admin, "arsenal_state", {"p_player_id": player_id, "p_island_owner": owner})
