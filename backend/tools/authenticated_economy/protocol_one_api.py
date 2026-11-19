"""Run an isolated legacy-compatibility API with recovery admission disabled."""

import os
from pathlib import Path

import uvicorn

from server.app import create_app
from server.settings import load_settings
from tools.authenticated_economy.config import load


def main() -> None:
    runtime = load(Path("/tmp/mp505-provider/runtime.json"))
    os.environ["SSL_CERT_FILE"] = runtime["caFile"]
    settings = load_settings(
        {
            "APP_ENV": "local",
            "SUPABASE_URL": runtime["providerUrl"],
            "SUPABASE_PUBLISHABLE_KEY": runtime["anonKey"],
            "SUPABASE_SECRET_KEY": runtime["serviceKey"],
            "AUTH_PROVIDERS": "email",
            "FEATURE_FLAGS": "islands,live_presence,sign_in,arsenal,market,sports,arena",
            "DEMO_MODE": "false",
        }
    )
    uvicorn.run(create_app(settings=settings), host="127.0.0.1", port=58007, access_log=False)


if __name__ == "__main__":
    main()
