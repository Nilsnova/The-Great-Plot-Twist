"""Per-player read and write budgets for case requests, using the injected clock.

Used by: CaseService. Limits are per server instance and do not replace database guards.
"""

import math
from datetime import datetime, timedelta

from server.clock import Clock, utc_now
from server.errors import ApiError


class ActionLimiter:
    def __init__(self, *, clock: Clock = utc_now) -> None:
        self.clock = clock
        self.recent: dict[tuple[str, bool], list[datetime]] = {}

    def check(self, player_id: str, *, write: bool) -> None:
        now = self.clock()
        cutoff = now - timedelta(seconds=10)
        key = (player_id, write)
        recent = [moment for moment in self.recent.get(key, []) if moment > cutoff]
        if len(recent) >= (10 if write else 30):
            self.recent[key] = recent
            wait = max(1, math.ceil((recent[0] + timedelta(seconds=10) - now).total_seconds()))
            raise ApiError(
                429,
                "too_many_requests",
                "Wait a few seconds before another case request.",
                headers={"Retry-After": str(wait)},
            )
        self.recent[key] = [*recent, now]
        if len(self.recent) > 10000:
            self.recent = {
                key: moments
                for key, moments in self.recent.items()
                if moments and moments[-1] > cutoff
            }
