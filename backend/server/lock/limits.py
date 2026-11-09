"""Small per-player request budgets for the lock routes, per server instance.

    lock reads and answers     30 requests per minute per player
    place searches             10 searches per minute per player

Over budget: 429 too_many_requests with a Retry-After header. The budgets protect Open-Meteo's
free limits (a chosen place or a search can cause an outside call); the database still guards the
answers themselves. Vercel may run several instances, so the budgets hold per instance only.

Used by: app.py (one limiter per budget) and routes/lock.py.
"""

import math
from datetime import datetime, timedelta

from server.clock import Clock, utc_now
from server.errors import ApiError

MAX_KEYS = 10000


class PlayerBudget:
    def __init__(self, limit: int, seconds: int, *, clock: Clock = utc_now) -> None:
        self.limit = limit
        self.window = timedelta(seconds=seconds)
        self.clock = clock
        self.recent: dict[str, list[datetime]] = {}

    def spend(self, player_id: str) -> None:
        """Count one request, or raise 429 when the player has used up the budget."""
        now = self.clock()
        cutoff = now - self.window
        recent = [moment for moment in self.recent.get(player_id, []) if moment > cutoff]
        if len(recent) >= self.limit:
            self.recent[player_id] = recent
            wait = max(1, math.ceil((recent[0] + self.window - now).total_seconds()))
            raise ApiError(
                429,
                "too_many_requests",
                "Wait a moment before you try that again.",
                headers={"Retry-After": str(wait)},
            )
        self.recent[player_id] = [*recent, now]
        if len(self.recent) > MAX_KEYS:
            self.recent = {
                key: moments
                for key, moments in self.recent.items()
                if moments and moments[-1] > cutoff
            }
