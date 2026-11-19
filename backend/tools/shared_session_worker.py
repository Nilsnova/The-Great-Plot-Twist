"""Run canonical shared-session deadlines and enabled auto-next outside browsers.

Run from backend: uv run python -m tools.shared_session_worker --once
Without --once, this foreground process runs a bounded cycle each second. It
uses the normal server settings and secret client; it prints counts only.
Starting this process against a deployed database is an explicit activation.
"""

import argparse
import asyncio
import json
import logging

from server.adapters.base import CachedSource
from server.errors import ApiError
from server.island import shared_session_worker
from server.island.catalogue import IslandCatalogue, Weather, load_island
from server.island.rules import weather_for
from server.island.wave_weather import default_reading
from server.settings import settings_from_environment
from server.supabase_admin import admin_from_settings
from server.weather.mapping import map_reading
from server.weather.source import make_weather_source
from server.weather.state_rules import StateRules, load_state_rules
from server.weather.states import state_of

logger = logging.getLogger(__name__)


async def worker_weather(
    catalogue: IslandCatalogue,
    source: CachedSource,
    rules: StateRules | None,
) -> Weather:
    """Same default-place weather/fallback policy as a bell without geo headers."""
    reading = await default_reading(source)
    state = (
        state_of(map_reading(reading), rules) if reading is not None and rules is not None else None
    )
    return weather_for(catalogue, state)


async def run(*, once: bool, interval: float, limit: int) -> None:
    settings = settings_from_environment()
    admin = admin_from_settings(settings)
    admin.check_configured()
    catalogue = load_island()
    source, rules = make_weather_source(settings), load_state_rules()
    while True:
        try:
            weather = await worker_weather(catalogue, source, rules)
            counts = await shared_session_worker.run_once(
                admin,
                catalogue,
                settings,
                weather,
                limit=limit,
            )
            print(json.dumps(counts), flush=True)
        except ApiError as error:
            # Never print provider responses, secret configuration or player IDs.
            logger.warning("Canonical worker cycle deferred (%s).", type(error).__name__)
            if once:
                raise SystemExit(1) from None
        if once:
            return
        await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Run one bounded cycle.")
    parser.add_argument("--interval", type=float, default=1, help="Cycle seconds (0.25 to 30).")
    parser.add_argument(
        "--limit", type=int, default=20, help="Maximum islands per stage (1 to 100)."
    )
    arguments = parser.parse_args()
    if not 0.25 <= arguments.interval <= 30 or not 1 <= arguments.limit <= 100:
        parser.error("Use interval 0.25 to 30 seconds and limit 1 to 100.")
    asyncio.run(run(once=arguments.once, interval=arguments.interval, limit=arguments.limit))


if __name__ == "__main__":
    main()
