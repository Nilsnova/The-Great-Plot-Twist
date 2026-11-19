"""Run the normal API against only the generated isolated provider settings."""

import argparse
import os
from pathlib import Path

import uvicorn

from server.app import create_app
from server.settings import load_settings
from tools.authenticated_economy.config import load


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    args = parser.parse_args()
    runtime = load(args.runtime)
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    settings = load_settings(
        {
            "APP_ENV": "local",
            "SUPABASE_URL": runtime["providerUrl"],
            "SUPABASE_PUBLISHABLE_KEY": runtime["anonKey"],
            "SUPABASE_SECRET_KEY": runtime["serviceKey"],
            "AUTH_PROVIDERS": "email",
            "FEATURE_FLAGS": (
                "islands,live_presence,sign_in,structure_recovery,arsenal,market,sports"
            ),
            "DEMO_MODE": "false",
        }
    )
    app = create_app(settings=settings)
    uvicorn.run(app, host="127.0.0.1", port=runtime["ports"]["api"], access_log=False)


if __name__ == "__main__":
    main()
