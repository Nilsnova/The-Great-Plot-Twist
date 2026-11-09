"""The demo window in the database: read it, and switch it (open for 1 to 6 hours, or close).

Both are one database function (supabase/migrations/20261109010000_demo_window.sql):

    demo_window_read()                        {"open": bool, "openUntil": time or null}
    demo_window_set(host, actionUid, hours)   {"status": "set", "openUntil": ..., "repeat": bool}

The database compares the end time with its own clock, so every server instance agrees on "open".
The window holds no secret and no player data: only an end time.

Used by: demo/gate.py (the read, for every guest) and routes/demo.py (the host's switch).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, StrictBool, ValidationError

from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

# The longest window a host may open. The database repeats it (demo_window_actions_hours_range).
MAX_HOURS = 6


@dataclass(frozen=True)
class Window:
    """The demo window now. open_until is None while it is closed."""

    open: bool
    open_until: datetime | None


CLOSED = Window(open=False, open_until=None)


class WindowRow(BaseModel):
    open: StrictBool
    openUntil: datetime | None


class SetRow(BaseModel):
    status: Literal["set"]
    openUntil: datetime | None
    repeat: StrictBool


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def read_window_reply(reply: object) -> Window:
    """Understand demo_window_read's answer. No row at all (null) counts as closed."""
    if reply is None:
        return CLOSED
    try:
        row = WindowRow.model_validate(reply)
    except ValidationError as error:
        raise unreadable() from error
    if row.open != (row.openUntil is not None):
        raise unreadable()
    return Window(open=row.open, open_until=row.openUntil)


async def read_window(admin: SupabaseAdmin) -> Window:
    """The demo window as the database sees it now."""
    return read_window_reply(await admin.call_function("demo_window_read", {}))


async def set_window(
    admin: SupabaseAdmin, host_id: str, action_uid: UUID, hours: int, now: datetime
) -> tuple[Window, bool]:
    """Open the window for `hours` (1 to 6) or close it (0). Returns the window and "repeat".

    A repeat of the same actionUid changes nothing and returns the window as it is now (which may
    have ended since: `now` decides, so an old end time never reads as open).
    """
    if not 0 <= hours <= MAX_HOURS:
        raise ValueError("hours must be from 0 to 6.")
    arguments = {"p_host_id": host_id, "p_action_uid": str(action_uid), "p_hours": hours}
    try:
        reply = await admin.call_function("demo_window_set", arguments)
    except AlreadyApplied as error:
        # The function looks the actionUid up first, so a unique violation is a bug, not a repeat.
        raise SupabaseRejected() from error
    try:
        row = SetRow.model_validate(reply)
    except ValidationError as error:
        raise unreadable() from error
    if row.openUntil is None or row.openUntil <= now:
        return CLOSED, row.repeat
    return Window(open=True, open_until=row.openUntil), row.repeat
