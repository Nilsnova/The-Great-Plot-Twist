"""Clock: the one place the server asks "what time is it?".

Code that needs the time takes a clock as an argument. Tests pass in a fake clock, so they
never have to wait for real time to pass.

A route asks for the clock of the app by writing `now: ClockDep`. create_app() stores the real
clock (or a test's fake one) on the app, so a route can say what day it is without ever calling
datetime.now() itself.

Used by: adapters/base.py (how old cached data is), auth.py (how long a login check is
remembered), routes/weather.py and routes/bulletin.py (what tonight is, through ClockDep).
"""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

# A clock is any function that takes nothing and returns the current time in UTC.
Clock = Callable[[], datetime]


def utc_now() -> datetime:
    """The real clock: the current time in UTC."""
    return datetime.now(UTC)


def get_clock(request: Request) -> Clock:
    """FastAPI dependency: the clock that create_app() stored on the app."""
    return request.app.state.clock


# Write `now: ClockDep` in a route and FastAPI hands you the clock. Call it: `now()`.
ClockDep = Annotated[Clock, Depends(get_clock)]
