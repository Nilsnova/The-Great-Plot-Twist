"""Short-window token buckets for the protocol-2 journal transport."""

import math
import time
from collections.abc import Callable

from server.errors import ApiError


class TokenBucket:
    def __init__(self, rate: float, capacity: int, *, clock: Callable[[], float] = time.monotonic):
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens: dict[str, tuple[float, float]] = {}

    def spend(self, key: str) -> None:
        now = self.clock()
        available, updated = self.tokens.get(key, (float(self.capacity), now))
        available = min(float(self.capacity), available + max(0.0, now - updated) * self.rate)
        if available < 1:
            wait = max(1, math.ceil((1 - available) / self.rate))
            self.tokens[key] = (available, now)
            raise ApiError(
                429,
                "too_many_requests",
                "The wave sync is busy. Wait a moment and retry.",
                headers={"Retry-After": str(wait)},
            )
        self.tokens[key] = (available - 1, now)
