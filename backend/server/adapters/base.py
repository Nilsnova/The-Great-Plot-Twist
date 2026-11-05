"""The pattern every outside data source must follow (weather, stocks, sports, prediction markets).

Why a pattern? Outside services are slow, can fail and often limit how many calls we may make.
A CachedSource wraps ONE outside call and makes sure that:
  * the outside service is called at most once per TTL ("time to live") by this running server
    instance, even when many players ask at the same moment,
  * a call that takes too long is cut off after a timeout,
  * the game keeps working when the outside service is down.

Each get() tries these steps in order and stops at the first one that works:
  1. fresh cache       data younger than the TTL                  -> source "cache"
  2. live fetch        call the outside service                   -> source "live"
  3. stale value       the last good data, however old            -> source "stale"
  4. recorded fallback a snapshot saved in our code               -> source "fallback"
  5. nothing left      raise SourceUnavailable (HTTP 503)

Every result says where it came from (`source`) and when the data was fetched (`fetched_at`),
so the game can show "prices as of 12:05" instead of passing off old data as live.

After a failed live fetch the source waits one TTL before calling the outside service again.
This keeps us under the service's rate limit while it is down.

Limit to know about: the cache lives in memory, once per running server instance. Vercel may
run several instances at once, and a cold start begins with an empty cache. So "at most once per
TTL" holds for ONE instance only. Leave headroom (for example twice the minimum TTL) and do not
rely on it for a hard daily quota.

Used by: adapters/example.py (a worked example) and every real data source built from this.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from server.clock import Clock, utc_now
from server.errors import ApiError

logger = logging.getLogger(__name__)

# Where a result came from.
SourceKind = Literal["live", "cache", "stale", "fallback"]

# A fetch function takes nothing, calls the outside service and returns the data.
Fetch = Callable[[], Awaitable[Any]]


class SourceUnavailable(ApiError):
    """No live data, no old data and no recorded fallback: there is nothing to show."""

    def __init__(self, name: str) -> None:
        super().__init__(
            503,
            "source_unavailable",
            f"The '{name}' data is not available right now. Try again soon.",
        )


@dataclass(frozen=True)
class RecordedData:
    """A snapshot saved in our code, used when the service is down and we have nothing newer."""

    data: Any
    recorded_at: datetime


@dataclass(frozen=True)
class SourceResult:
    """The data plus where it came from and when it was fetched.

    Treat `data` as read-only: every caller gets the same object from the cache, so changing
    it would change it for everyone.
    """

    data: Any
    source: SourceKind
    fetched_at: datetime


class CachedSource:
    """One outside data source with a cache, a timeout and fallbacks. Call `await get()`."""

    def __init__(
        self,
        name: str,
        fetch: Fetch,
        *,
        ttl_seconds: float,
        timeout_seconds: float = 5.0,
        fallback: RecordedData | None = None,
        clock: Clock = utc_now,
    ) -> None:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be more than 0.")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be more than 0.")
        self.name = name
        self.fetch = fetch
        self.ttl = timedelta(seconds=ttl_seconds)
        self.timeout_seconds = timeout_seconds
        self.fallback = fallback
        self.clock = clock  # tests pass a fake clock here
        self.good_data: Any = None  # the newest data that worked
        self.good_fetched_at: datetime | None = None  # None until the first success
        self.last_failure_at: datetime | None = None  # None if the last live fetch worked
        self.lock = asyncio.Lock()

    async def get(self) -> SourceResult:
        """Return the data, following the steps listed at the top of this file."""
        cached = self.find_fresh_result()
        if cached is not None:
            return cached

        # Only one request at a time may call the outside service. The others wait here and
        # then find fresh data in the cache, so a rush of players causes ONE call, not 100.
        async with self.lock:
            cached = self.find_fresh_result()
            if cached is not None:
                return cached
            if self.can_call_outside():
                live = await self.try_live_fetch()
                if live is not None:
                    return live
            return self.fall_back()

    def make_result(self, source: SourceKind) -> SourceResult:
        """Wrap the newest good data. Only call this once good_fetched_at has a value."""
        return SourceResult(self.good_data, source, self.good_fetched_at)

    def find_fresh_result(self) -> SourceResult | None:
        """Step 1: the cached data if it is younger than the TTL, otherwise None."""
        if self.good_fetched_at is None:
            return None
        if self.clock() - self.good_fetched_at >= self.ttl:
            return None
        return self.make_result("cache")

    def can_call_outside(self) -> bool:
        """False while we wait out a recent failure, so we call at most once per TTL."""
        if self.last_failure_at is None:
            return True
        return self.clock() - self.last_failure_at >= self.ttl

    async def try_live_fetch(self) -> SourceResult | None:
        """Step 2: call the outside service once. Returns None if the call failed."""
        try:
            data = await asyncio.wait_for(self.fetch(), timeout=self.timeout_seconds)
        except Exception as error:  # on purpose: any failure means "use the next best thing"
            # Log only the kind of error. Its text could contain a URL with a secret key in it.
            logger.warning("Source '%s' failed: %s", self.name, type(error).__name__)
            self.last_failure_at = self.clock()
            return None
        self.good_data = data
        self.good_fetched_at = self.clock()
        self.last_failure_at = None
        return self.make_result("live")

    def fall_back(self) -> SourceResult:
        """Steps 3 to 5: the last good data, then the recorded fallback, then give up."""
        if self.good_fetched_at is not None:
            return self.make_result("stale")
        if self.fallback is not None:
            return SourceResult(self.fallback.data, "fallback", self.fallback.recorded_at)
        raise SourceUnavailable(self.name)
