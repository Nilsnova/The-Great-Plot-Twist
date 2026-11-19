"""Autonomous worker dependency/error behavior; real queue/money tests use disposable SQL."""

import asyncio

from server.island.wager_jobs import settle_due_jobs


class EmptyQueue:
    def __init__(self):
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        return {"status": "done", "jobs": []}


def test_empty_durable_queue_needs_no_price_provider_or_browser():
    admin = EmptyQueue()
    result = asyncio.run(settle_due_jobs(admin, None, None))
    assert result == {"considered": 0, "settled": 0, "retried": 0}
    assert admin.calls == [("island_wager_jobs_due", {"p_limit": 40})]
