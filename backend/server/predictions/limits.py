"""A speed limit for stakes: each player may make only a few stakes in a short time.

Every stake makes the server look at the question (and ask Manifold again if the cache is older
than 2 minutes) and talk to the database several times. A script that presses Stake in a loop
would load the free Supabase and Vercel plans for everybody. So a player may make at most
MAX_STAKES stakes in any WINDOW_SECONDS seconds. A person playing the game never gets near this
limit: they stake once per question. Anybody over it is answered with 429 too_many_requests and a
hint how long to wait.

The count is kept in memory, once per running server instance (the same limit as the cache, see
adapters/base.py). It is a brake against loops and accidents, not a security guarantee: it cannot
see a second server instance. The real protection of the money is elsewhere (the stake id, the
one stake per question, the daily cap).

This is a copy of the Island Exchange limiter (market/limits.py) with the words of staking,
because that one says "trading" in its message and market/ is being reworked, so nothing is
imported from it.

Used by: desk.py (PredictionDesk.stake) and the tests.
"""

import math
from datetime import datetime, timedelta

from server.clock import Clock, utc_now
from server.errors import ApiError

MAX_STAKES = 10  # stakes a player may make ...
WINDOW_SECONDS = 30  # ... within this many seconds

# The memory holds one entry per recent player. Past this many entries, players who have been
# quiet for a whole window are forgotten, so the memory cannot grow without end.
MAX_PLAYERS_REMEMBERED = 5000


class StakeLimiter:
    """Counts the stakes of each player in the last WINDOW_SECONDS seconds."""

    def __init__(
        self,
        max_stakes: int = MAX_STAKES,
        window_seconds: float = WINDOW_SECONDS,
        clock: Clock = utc_now,
    ) -> None:
        self.max_stakes = max_stakes
        self.window = timedelta(seconds=window_seconds)
        self.clock = clock
        self.recent_stakes: dict[str, list[datetime]] = {}

    def check(self, player_id: str) -> None:
        """Count one stake for this player, or raise 429 if they made too many just now."""
        now = self.clock()
        recent = []
        for moment in self.recent_stakes.get(player_id, []):
            if self.is_recent(moment, now):
                recent.append(moment)
        if len(recent) >= self.max_stakes:
            self.recent_stakes[player_id] = recent
            raise ApiError(
                429,
                "too_many_requests",
                "You are staking very fast. Wait a few seconds, then try again.",
                headers={"Retry-After": str(self.seconds_to_wait(recent[0], now))},
            )
        recent.append(now)
        self.recent_stakes[player_id] = recent
        self.forget_quiet_players(now)

    def is_recent(self, moment: datetime, now: datetime) -> bool:
        return now - moment < self.window

    def seconds_to_wait(self, oldest_stake: datetime, now: datetime) -> int:
        """Whole seconds until the oldest counted stake leaves the window (at least 1)."""
        wait = (oldest_stake + self.window - now).total_seconds()
        return max(1, math.ceil(wait))

    def forget_quiet_players(self, now: datetime) -> None:
        """Keep the memory small: drop players who made no stake for a whole window."""
        if len(self.recent_stakes) <= MAX_PLAYERS_REMEMBERED:
            return
        self.recent_stakes = {
            player_id: moments
            for player_id, moments in self.recent_stakes.items()
            if moments and self.is_recent(moments[-1], now)
        }
