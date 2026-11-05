"""Clock: the one place the server asks "what time is it?".

Code that needs the time takes a clock as an argument. Tests pass in a fake clock, so they
never have to wait for real time to pass.

Used by: adapters/base.py (how old cached data is) and auth.py (how long a login check is
remembered).
"""

from collections.abc import Callable
from datetime import UTC, datetime

# A clock is any function that takes nothing and returns the current time in UTC.
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    """The real clock: the current time in UTC."""
    return datetime.now(UTC)
