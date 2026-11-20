"""Run the normal API against only the generated isolated provider settings."""

import argparse
import os
import subprocess
from pathlib import Path

import uvicorn

from server.app import create_app
from server.settings import Settings, load_settings
from tools.authenticated_economy.config import load


def local_settings(runtime: dict) -> Settings:
    """Use only explicit generated local settings, without an environment file."""
    return load_settings(
        {
            "APP_ENV": "local",
            "SUPABASE_URL": runtime["providerUrl"],
            "SUPABASE_PUBLISHABLE_KEY": runtime["anonKey"],
            "SUPABASE_SECRET_KEY": runtime["serviceKey"],
            "AUTH_PROVIDERS": "email",
            "FEATURE_FLAGS": (
                "islands,live_presence,sign_in,structure_recovery,arsenal,market,sports,arena"
            ),
            "DEMO_MODE": "false",
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=Path, default=Path("/tmp/mp505-provider/runtime.json"))
    args = parser.parse_args()
    runtime = load(args.runtime)
    root = Path(__file__).resolve().parents[3]
    subprocess.run(
        [
            "node",
            str(root / "frontend/scripts/authenticated-economy/record-source.mjs"),
            str(args.runtime),
            "api",
            str(os.getpid()),
        ],
        check=True,
        capture_output=True,
    )
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    settings = local_settings(runtime)
    app = create_app(settings=settings)
    uvicorn.run(app, host="127.0.0.1", port=runtime["ports"]["api"], access_log=False)


if __name__ == "__main__":
    main()
