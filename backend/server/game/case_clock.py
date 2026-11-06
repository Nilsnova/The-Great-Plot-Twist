"""The case clock and recurring route windows, without a server or wall-clock reads.

Used by: case decisions, views and parity tests against the database window function.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from server.game.case_data import Window


def case_second(started_at: datetime, now: datetime) -> int:
    """Whole seconds since the muster; a clock before the muster still reads zero."""
    return max(0, math.floor((now - started_at).total_seconds()))


def minute_of(second: int) -> int:
    return max(0, second) // 60


def window_open(window: Window | None, minute: int) -> bool:
    if window is None:
        return True
    offset = minute % window.every_minutes
    return window.from_minute <= offset < window.from_minute + window.open_minutes


def minutes_until_open(window: Window | None, minute: int, arrive_after: int = 0) -> int:
    """Smallest wait that makes the arrival minute fall inside the window."""
    if window_open(window, minute + arrive_after):
        return 0
    assert window is not None
    for wait in range(1, window.every_minutes + 1):
        if window_open(window, minute + wait + arrive_after):
            return wait
    raise ValueError("A route window must contain at least one open minute.")
