"""Separate real API; only the external quote transport is a declared fixture."""

import argparse
import hashlib
import json
import os
import secrets
import subprocess
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import httpx
import uvicorn
from pydantic import SecretStr

from server.app import create_app
from server.clock import utc_now
from server.game.world_state import relit_check
from server.market.binance import BINANCE_URL
from server.market.exchange import market_from_settings
from tools.authenticated_economy.application import local_settings
from tools.authenticated_economy.config import load


class IncreasingQuoteTransport(httpx.AsyncBaseTransport):
    """Explicit provider-boundary prices; default real product/SQL clocks are untouched."""

    def __init__(self) -> None:
        self.started = utc_now()

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if (request.url.host != httpx.URL(BINANCE_URL).host
                or not request.url.path.endswith("/ticker/price")):
            raise RuntimeError("Only the declared external Binance quote boundary is replaced")
        symbols = json.loads(request.url.params.get("symbols", "[]"))
        elapsed = Decimal(str((utc_now() - self.started).total_seconds()))
        price = (Decimal(100) + elapsed / 1000).quantize(Decimal("0.00000001"))
        return httpx.Response(200, json=[{"symbol": symbol, "price": str(price)}
                                         for symbol in symbols], request=request)


PROTECTED = ["backend/server", "backend/content", "frontend/src", "supabase/migrations",
             "backend/uv.lock", "backend/pyproject.toml", "frontend/package-lock.json",
             "frontend/package.json", ":(exclude)backend/server/tests"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    runtime = load(args.runtime)
    expected = runtime["expectedCommit"]
    root = Path(__file__).resolve().parents[3]
    subprocess.run(["git", "diff", "--exit-code", expected, "--", *PROTECTED],
                   cwd=root, capture_output=True, check=True)
    untracked = subprocess.check_output(
        ["git", "ls-files", "--others", "--exclude-standard", "--", *PROTECTED],
        cwd=root, text=True)
    if untracked.strip():
        raise RuntimeError("Untracked production source prevents the side API")
    args.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    token_file = args.directory / "cron-token"
    token_file.write_text(token)
    token_file.chmod(0o600)
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    base_settings = local_settings(runtime)
    settings = replace(base_settings, flags={**base_settings.flags, "demo": True},
                       cron_secret=SecretStr(token))
    if settings.demo_mode:
        raise RuntimeError("The quote fixture requires demo_mode false, not replay prices")
    market = market_from_settings(settings, transport=IncreasingQuoteTransport(),
                                  relit_check=relit_check)
    app = create_app(settings=settings, market_service=market)
    source = {"productionCandidate": expected, "protectedProductionDiff": "empty",
              "actualCheckoutHead": subprocess.check_output(["git", "rev-parse", "HEAD"],
                                                              cwd=root, text=True).strip(),
              "factorySha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "processId": os.getpid(), "port": 58006,
              "demoFeatureFlag": settings.flags["demo"], "demoMode": settings.demo_mode,
              "fixture": "Only external quote transport; increasing prices; actual UTC clocks"}
    (args.directory / "side-api-source.json").write_text(json.dumps(source, indent=2) + "\n")
    uvicorn.run(app, host="127.0.0.1", port=58006, access_log=False)


if __name__ == "__main__":
    main()
