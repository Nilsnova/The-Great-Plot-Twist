"""Opt-in, loopback-only test API backed by a disposable PostgreSQL database.

Run from backend/: LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver
--with 'psycopg[binary]' python -m tools.local_server
"""

import os
from collections.abc import Mapping
from contextlib import asynccontextmanager

from pydantic import BaseModel, ConfigDict

from server.app import create_app
from server.auth import unauthorized
from server.flags import parse_flags
from server.settings import Settings
from tools.local_admin import LocalAdmin
from tools.local_database import ScratchDatabase
from tools.local_players import HOST_ID, PLAYERS, LocalVerifier


class LocalServerRefused(RuntimeError):
    """The explicit local-only startup requirements have not been met."""


def require_local(env: Mapping[str, str]) -> None:
    # Do not normalize APP_ENV: missing, empty, mixed case or padded values are refused.
    # A VERCEL key, even with an empty value, always refuses this tool.
    if env.get("LOCAL_TEST_SERVER") != "1" or env.get("APP_ENV") != "local" or "VERCEL" in env:
        raise LocalServerRefused(
            "Requires LOCAL_TEST_SERVER=1, APP_ENV=local and no VERCEL variable."
        )


class SignInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    player: str


def create_local_app(env: Mapping[str, str] | None = None):
    """Separate factory; the production app never registers the local sign-in route."""
    require_local(os.environ if env is None else env)
    database = ScratchDatabase()
    # Never load settings from the environment, including injected Supabase credentials.
    settings = Settings(
        app_env="local",
        demo_mode=True,
        relight_open=False,
        flags=parse_flags("case"),
        host_player_ids=frozenset((HOST_ID,)),
    )
    app = create_app(settings, verifier=LocalVerifier(database), admin=LocalAdmin(database))
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        try:
            database.start()
            async with original_lifespan(application):
                yield
        finally:
            database.close()

    app.router.lifespan_context = lifespan
    app.state.local_database = database

    @app.post("/api/local/sign-in")
    async def sign_in(body: SignInRequest):
        for player in PLAYERS:
            if body.player == player.name and database.player_exists(player.id):
                return {
                    "accessToken": player.token,
                    "playerId": player.id,
                    "isHost": player.id == HOST_ID,
                }
        raise unauthorized("Choose an existing local test player.")

    return app


def main():
    # Validate before importing uvicorn or starting PostgreSQL. One process; no reloader.
    require_local(os.environ)
    import uvicorn

    uvicorn.run(create_local_app(), host="127.0.0.1", port=8000, access_log=False)


if __name__ == "__main__":
    main()
