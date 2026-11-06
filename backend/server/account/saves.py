"""Cloud saves: the size rule for a save, and the database calls that read and write it.

A save is the browser's own progress (the local Act 1 state, settings). It is a JSON object that
the browser sends to PUT /api/save and reads back from GET /api/save, so a player can go on at a
second device. The server never trusts a save for coins, kits, names or crews: those come from
the server's own records.

Two checks guard the size, one after the other:
  1. Python (check_save_size): at most MAX_SAVE_BYTES of compact JSON text, counted in UTF-8 bytes.
  2. The database (save_progress): at most 200000 bytes as jsonb text, the limit of the table rule
     saves_data_max_size. The database text is bigger than the compact JSON: jsonb adds spaces
     (for ordinary data at most half as many bytes again) and writes a number such as 1e300 out in
     full, so odd data can grow a lot. Python's limit leaves room for the spaces, so an ordinary
     save never reaches the second check. Only odd data, such as huge numbers, does.

Two devices of one player cannot overwrite each other. Every save has a version. The browser sends
the version it last read, and save_progress() writes only if that is still the current version
(see supabase/migrations/20261106020000_accounts.sql). Otherwise the answer is `stale`.

Used by: routes/save.py.
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from server.errors import ApiError
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

# The most a save may weigh, as compact JSON in UTF-8 bytes. A test checks that it stays well below
# the 200000 bytes that the database allows.
# PENDING team decision (N12): the 100,000-byte limit.
MAX_SAVE_BYTES = 100_000

# The largest version the browser may send. saves.version and the version parameter of
# save_progress() are database integers of 4 bytes (saves.version is an integer, int4). A bigger
# number would reach the database and come back as a data error (a 502), not as a clean 422. A test
# compares this number with the column type.
MAX_SAVE_VERSION = 2_147_483_647


@dataclass(frozen=True)
class SaveRow:
    """A player's save as stored."""

    version: int
    data: dict[str, Any]
    updated_at: datetime


@dataclass(frozen=True)
class SaveReply:
    """What save_progress answered."""

    status: str  # saved, stale, too_big or missing
    version: int = 0  # saved: the new version. stale: the current version.
    updated_at: datetime | None = None  # saved: when the save was written


def save_size(data: dict[str, Any]) -> int:
    """The size of a save in bytes: compact JSON, written as UTF-8 text.

    Raises 422 save_not_json for a value that JSON cannot hold, such as NaN or Infinity (Python's
    JSON reader accepts those words, but the database does not).
    """
    try:
        text = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, RecursionError) as error:
        raise ApiError(
            422, "save_not_json", "The save holds a value that JSON cannot store, such as NaN."
        ) from error
    return len(text.encode("utf-8"))


def check_save_size(data: dict[str, Any]) -> None:
    """Raises 422 save_too_big when the save is over MAX_SAVE_BYTES."""
    if save_size(data) > MAX_SAVE_BYTES:
        raise save_too_big()


def save_too_big() -> ApiError:
    """The 422 for a save over the size limit. Used for Python's check and for the database's."""
    return ApiError(
        422,
        "save_too_big",
        f"The save is too big. The most we keep is {MAX_SAVE_BYTES // 1000} KB.",
    )


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def read_whole_number(value: object) -> int:
    """A whole number from the database. A bool is not a number here."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise unreadable()
    return value


def read_moment(value: object) -> datetime:
    """A time from the database, as UTC and whole seconds, for example 2026-11-06T10:15:02Z.

    The database writes the time in its own timezone (+01:00 on the scratch server), so it is
    converted. A time without a timezone is refused.
    """
    if not isinstance(value, str):
        raise unreadable()
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise unreadable() from error
    if moment.tzinfo is None:
        raise unreadable()
    return moment.astimezone(UTC).replace(microsecond=0)


def read_save_row(row: object) -> SaveRow:
    """One row of the table saves, checked."""
    if not isinstance(row, dict) or not isinstance(row.get("data"), dict):
        raise unreadable()
    return SaveRow(
        version=read_whole_number(row.get("version")),
        data=row["data"],
        updated_at=read_moment(row.get("updated_at")),
    )


def write_arguments(player_id: str, expected_version: int, data: dict[str, Any]) -> dict[str, Any]:
    """The arguments of save_progress. The names are the parameter names in the SQL."""
    return {"p_player_id": player_id, "p_expected_version": expected_version, "p_data": data}


def read_save_reply(reply: object) -> SaveReply:
    """Understand the JSON that save_progress returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    status = reply.get("status")
    if status in ("too_big", "missing"):
        return SaveReply(status=status)
    if status == "stale":
        return SaveReply(status="stale", version=read_whole_number(reply.get("version")))
    if status == "saved":
        return SaveReply(
            status="saved",
            version=read_whole_number(reply.get("version")),
            updated_at=read_moment(reply.get("updatedAt")),
        )
    raise unreadable()


async def read_save(admin: SupabaseAdmin, player_id: str) -> SaveRow | None:
    """The player's save, or None if the player has no save row."""
    query = {
        "select": "version,data,updated_at",
        "player_id": f"eq.{player_id}",
        "limit": "1",
    }
    rows = await admin.select_rows("saves", query)
    if not rows:
        return None
    return read_save_row(rows[0])


async def write_save(
    admin: SupabaseAdmin, player_id: str, expected_version: int, data: dict[str, Any]
) -> SaveReply:
    """Write the save if it still has `expected_version`.

    Answers saved, stale (somebody saved first), too_big or missing (the player has no save).
    """
    arguments = write_arguments(player_id, expected_version, data)
    try:
        reply = await admin.call_function("save_progress", arguments)
    except AlreadyApplied as error:
        # supabase_admin turns EVERY unique violation (code 23505) into AlreadyApplied. A save
        # has no unique rule that a request could break, so here it can only be a bug on our
        # side. It must not look like "this was already done" to the browser.
        raise SupabaseRejected() from error
    return read_save_reply(reply)
