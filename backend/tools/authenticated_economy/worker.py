"""Run the actual canonical worker against only the generated local provider."""

import argparse
import asyncio
import json
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from server.island.catalogue import load_island
from server.island.shared_session_worker import run_once
from server.supabase_admin import admin_from_settings
from server.weather.source import make_weather_source
from server.weather.state_rules import load_state_rules
from tools.authenticated_economy.application import local_settings
from tools.authenticated_economy.config import load
from tools.shared_session_worker import worker_weather


async def run(runtime_path: Path, interval: float) -> None:
    runtime = load(runtime_path)
    root = Path(__file__).resolve().parents[3]
    subprocess.run(
        [
            "node",
            str(root / "frontend/scripts/authenticated-economy/record-source.mjs"),
            str(runtime_path),
            "worker",
            str(os.getpid()),
        ],
        check=True,
        capture_output=True,
    )
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    settings = local_settings(runtime)
    admin = admin_from_settings(settings)
    catalogue = load_island()
    source, rules = make_weather_source(settings), load_state_rules()
    cycle = 0
    while True:
        weather = await worker_weather(catalogue, source, rules)
        counts = await run_once(admin, catalogue, settings, weather)
        if cycle == 0 or any(counts.values()):
            print(
                json.dumps({"observedAt": datetime.now(UTC).isoformat(), **counts}),
                flush=True,
            )
        cycle += 1
        await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    parser.add_argument("--interval", type=float, default=1)
    args = parser.parse_args()
    if not 0.25 <= args.interval <= 30:
        parser.error("Use an interval between 0.25 and 30 seconds")
    asyncio.run(run(args.runtime, args.interval))


if __name__ == "__main__":
    main()
