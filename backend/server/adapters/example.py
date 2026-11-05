"""Example data source: a worked example to copy when you build a real one.

It follows the pattern in base.py but uses no network, so it runs anywhere, also in tests.
The "outside service" is a function that returns made-up prices.

To build a real source (weather, stocks, sports, prediction markets):
  1. Copy this file, for example to adapters/weather.py.
  2. Replace fetch_example_prices with a function that calls the real service. Use httpx with
     a timeout, and read any API key from the settings, never from the code. For example:

         async def fetch_weather() -> dict:
             async with httpx.AsyncClient(timeout=3.0) as client:
                 response = await client.get("https://api.example.com/weather")
                 response.raise_for_status()
                 return response.json()

  3. Save one real answer as the recorded fallback (RECORDED_PRICES below). The game then
     still works when the service is down, or in a demo without internet.
  4. Choose ttl_seconds to fit the service's rate limit. A service that allows 60 calls per
     hour needs a TTL of at least 60 seconds. That holds per running server instance only:
     Vercel may run several at once and a cold start begins with an empty cache. So leave
     headroom (for example twice the minimum) and do not rely on it for a hard daily quota.
  5. In a route, call `result = await source.get()` and send back result.data together with
     result.source and result.fetched_at, so the browser can show how fresh the data is.
  6. Test it like server/tests/test_adapters_example.py: pass a fake fetch function and a fake
     clock, so the tests never use the network.

Used by: teammates, as a template. No route uses it yet.
"""

from datetime import UTC, datetime

from server.adapters.base import CachedSource, Fetch, RecordedData
from server.clock import Clock, utc_now

EXAMPLE_TTL_SECONDS = 30

# A snapshot "recorded" earlier. A real fallback is copied once from the real service.
RECORDED_PRICES = RecordedData(
    data={"BREW": 12.0, "TWST": 98.0},
    recorded_at=datetime(2026, 11, 1, 12, 0, tzinfo=UTC),
)


async def fetch_example_prices() -> dict[str, float]:
    """Pretend to call an outside service. It returns made-up prices and uses no network."""
    return {"BREW": 12.5, "TWST": 99.0}


def make_example_source(
    fetch: Fetch = fetch_example_prices,
    clock: Clock = utc_now,
) -> CachedSource:
    """Build the source. Tests pass their own fetch function and clock."""
    return CachedSource(
        "example",
        fetch,
        ttl_seconds=EXAMPLE_TTL_SECONDS,
        timeout_seconds=2.0,
        fallback=RECORDED_PRICES,
        clock=clock,
    )


# One shared source for the whole server, so every request uses the same cache.
example_source = make_example_source()
