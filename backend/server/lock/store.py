"""The Keeper's Lock in the database: a player's stored answers, and storing one more, once.

    read_history(admin, player)          the player's stored (outcome, accepted) pairs, oldest first
    find_attempt(admin, player, uid)     the stored answer with this actionUid, or None
    record(admin, player, uid, answer, outcome)
                                         demo_lock_record(): stores it once per player and uid

demo_lock_record (supabase/migrations/20261109010000_demo_window.sql) answers:
    recorded   this call stored the answer
    repeat     the uid was used already: the STORED answer and outcome come back
    full       the player has 40 answers stored already: nothing was stored
    missing    the player has no profile row

Used by: routes/lock.py.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, StrictBool, StrictStr, ValidationError

from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

MAX_ROWS = 40  # the database stores at most 40 answers per player (demo_lock_record)


@dataclass(frozen=True)
class Stored:
    status: Literal["recorded", "repeat", "full", "missing"]
    answer: str = ""
    outcome: str = ""
    accepted: bool = False


class AttemptRow(BaseModel):
    answer: StrictStr
    outcome: StrictStr
    accepted: StrictBool


class RecordReply(BaseModel):
    status: Literal["recorded", "repeat", "full", "missing"]
    answer: StrictStr | None = None
    outcome: StrictStr | None = None
    accepted: StrictBool | None = None


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def read_rows(rows: list) -> list[AttemptRow]:
    try:
        return [AttemptRow.model_validate(row) for row in rows]
    except ValidationError as error:
        raise unreadable() from error


async def read_history(admin: SupabaseAdmin, player_id: str) -> list[tuple[str, bool]]:
    rows = await admin.select_rows(
        "demo_lock_attempts",
        {
            "select": "answer,outcome,accepted",
            "player_id": f"eq.{player_id}",
            "order": "created_at.asc",
            "limit": str(MAX_ROWS),
        },
    )
    return [(row.outcome, row.accepted) for row in read_rows(rows)]


async def find_attempt(admin: SupabaseAdmin, player_id: str, action_uid: str) -> Stored | None:
    rows = await admin.select_rows(
        "demo_lock_attempts",
        {
            "select": "answer,outcome,accepted",
            "player_id": f"eq.{player_id}",
            "action_uid": f"eq.{action_uid}",
            "limit": "1",
        },
    )
    if not rows:
        return None
    row = read_rows(rows)[0]
    return Stored("repeat", row.answer, row.outcome, row.accepted)


async def record(
    admin: SupabaseAdmin, player_id: str, action_uid: str, answer: str, outcome: str
) -> Stored:
    arguments = {
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_answer": answer,
        "p_outcome": outcome,
    }
    try:
        reply = await admin.call_function("demo_lock_record", arguments)
    except AlreadyApplied as error:
        # The function locks the player and looks the uid up first: a unique violation is a bug.
        raise SupabaseRejected() from error
    try:
        row = RecordReply.model_validate(reply)
    except ValidationError as error:
        raise unreadable() from error
    if row.status in ("full", "missing"):
        return Stored(row.status)
    if row.answer is None or row.outcome is None or row.accepted is None:
        raise unreadable()
    return Stored(row.status, row.answer, row.outcome, row.accepted)
