"""A speed limit for trades: each player may make only a few trades in a short time.

Every trade (opening or closing a position) makes the server look at the prices (and, if they are
older than 5 seconds, ask Binance or the stock provider again) and talk to the database several
times. A script that clicks Open in a loop would load the free Supabase and Vercel plans for
everybody. So a player may make at most MAX_TRADES trades in any WINDOW_SECONDS seconds. A person
playing the game never gets near this limit. Anybody over it is answered with 429
too_many_requests and a hint how long to wait.

The count is kept in memory, once per running server instance (the same limit as the price cache,
see adapters/base.py). It is a brake against loops and accidents, not a security guarantee: it
cannot see a second server instance. The real protection of the money is elsewhere (the ledger
ref, the daily stake cap, the limit of open positions).

Used by: exchange.py (MarketService.open_position and close_position) and the tests.
"""

import math
from datetime import datetime, timedelta

from server.clock import Clock, utc_now
from server.errors import ApiError

MAX_TRADES = 10  # trades a player may make ...
WINDOW_SECONDS = 30  # ... within this many seconds

# The memory holds one entry per recent player. Past this many entries, players who have been
# quiet for a whole window are forgotten, so the memory cannot grow without end.
MAX_PLAYERS_REMEMBERED = 5000


class TradeLimiter:
    """Counts the trades of each player in the last WINDOW_SECONDS seconds."""

    def __init__(
        self,
        max_trades: int = MAX_TRADES,
        window_seconds: float = WINDOW_SECONDS,
        clock: Clock = utc_now,
    ) -> None:
        self.max_trades = max_trades
        self.window = timedelta(seconds=window_seconds)
        self.clock = clock
        self.recent_trades: dict[str, list[datetime]] = {}

    def check(self, player_id: str) -> None:
        """Count one trade for this player, or raise 429 if they made too many just now."""
        now = self.clock()
        recent = []
        for moment in self.recent_trades.get(player_id, []):
            if self.is_recent(moment, now):
                recent.append(moment)
        if len(recent) >= self.max_trades:
            self.recent_trades[player_id] = recent
            raise ApiError(
                429,
                "too_many_requests",
                "You are trading very fast. Wait a few seconds, then try again.",
                headers={"Retry-After": str(self.seconds_to_wait(recent[0], now))},
            )
        recent.append(now)
        self.recent_trades[player_id] = recent
        self.forget_quiet_players(now)

    def is_recent(self, moment: datetime, now: datetime) -> bool:
        return now - moment < self.window

    def seconds_to_wait(self, oldest_trade: datetime, now: datetime) -> int:
        """Whole seconds until the oldest counted trade leaves the window (at least 1)."""
        wait = (oldest_trade + self.window - now).total_seconds()
        return max(1, math.ceil(wait))

    def forget_quiet_players(self, now: datetime) -> None:
        """Keep the memory small: drop players who made no trade for a whole window."""
        if len(self.recent_trades) <= MAX_PLAYERS_REMEMBERED:
            return
        self.recent_trades = {
            player_id: moments
            for player_id, moments in self.recent_trades.items()
            if moments and self.is_recent(moments[-1], now)
        }
