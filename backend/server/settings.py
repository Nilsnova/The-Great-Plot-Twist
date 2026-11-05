"""Settings: every configuration value the server reads, in one place.

The values come from environment variables. Nothing else in the server reads os.environ,
so this file is the full list of what can be configured:

    APP_ENV                   local, preview or production (default: local)
    SUPABASE_URL              address of the Supabase project
    SUPABASE_PUBLISHABLE_KEY  key the browser may also use (row-level security protects data)
    SUPABASE_SECRET_KEY       server-only key. NEVER put it in the browser, a log or the repo.
    CRON_SECRET               server-only password for the daily keep-alive. Vercel sends it to
                              /api/keepalive. Optional on your laptop. NEVER in the repo.
    DEMO_MODE                 true or false (default: false)
    FEATURE_FLAGS             comma-separated feature names to switch on (see flags.py)
    MARKET_MULTIPLIER         how strongly the Island Exchange amplifies real price moves, a whole
                              number from 20 to 100 (default: 100). Not a secret.

Used by: app.py (reads the environment once at start-up), auth.py and supabase_admin.py (the
Supabase address and keys), the routes (env, demo mode, flags, the cron secret) and the tests
(they pass in a plain dictionary, so no real environment is needed).
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from pydantic import SecretStr

from server.flags import default_flags, parse_flags
from server.market.rules import DEFAULT_MULTIPLIER, MAX_MULTIPLIER, MIN_MULTIPLIER

APP_ENVS = ("local", "preview", "production")


class SettingsError(ValueError):
    """An environment variable has a value we cannot use. The message says which one."""


@dataclass(frozen=True)
class Settings:
    """All settings as one read-only object. The defaults are the values for local work."""

    app_env: str = "local"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    # SecretStr prints as ********** in logs and error messages. To get the real value on
    # purpose, call .get_secret_value() (only supabase_admin.py and routes/keepalive.py do that).
    supabase_secret_key: SecretStr = SecretStr("")
    # The password Vercel's cron sends to /api/keepalive. Empty on a laptop: only Vercel calls it.
    cron_secret: SecretStr = SecretStr("")
    demo_mode: bool = False
    flags: dict[str, bool] = field(default_factory=default_flags)
    # How many times a real price move is multiplied in the Island Exchange (market/rules.py).
    market_multiplier: int = DEFAULT_MULTIPLIER


def read_text(env: Mapping[str, str], name: str) -> str:
    """The value of one variable without surrounding spaces. Empty text if it is not set."""
    return env.get(name, "").strip()


def read_app_env(env: Mapping[str, str]) -> str:
    value = read_text(env, "APP_ENV").lower() or "local"
    if value not in APP_ENVS:
        raise SettingsError(f"APP_ENV must be one of {', '.join(APP_ENVS)} (got '{value}').")
    return value


def read_demo_mode(env: Mapping[str, str]) -> bool:
    value = read_text(env, "DEMO_MODE").lower()
    if value in ("", "false"):
        return False
    if value == "true":
        return True
    raise SettingsError(f"DEMO_MODE must be 'true' or 'false' (got '{value}').")


def read_market_multiplier(env: Mapping[str, str]) -> int:
    """MARKET_MULTIPLIER: a whole number from 20 to 100. Empty or missing means the default."""
    value = read_text(env, "MARKET_MULTIPLIER")
    if not value:
        return DEFAULT_MULTIPLIER
    if not value.isascii() or not value.isdecimal():
        raise SettingsError(f"MARKET_MULTIPLIER must be a whole number (got '{value}').")
    multiplier = int(value)
    if not MIN_MULTIPLIER <= multiplier <= MAX_MULTIPLIER:
        raise SettingsError(
            f"MARKET_MULTIPLIER must be from {MIN_MULTIPLIER} to {MAX_MULTIPLIER} (got {value})."
        )
    return multiplier


def load_settings(env: Mapping[str, str]) -> Settings:
    """Build the settings from a dictionary of variables. A pure function, so tests are easy."""
    return Settings(
        app_env=read_app_env(env),
        # No slash at the end, so we can write f"{supabase_url}/auth/v1/user" later.
        supabase_url=read_text(env, "SUPABASE_URL").rstrip("/"),
        supabase_publishable_key=read_text(env, "SUPABASE_PUBLISHABLE_KEY"),
        supabase_secret_key=SecretStr(read_text(env, "SUPABASE_SECRET_KEY")),
        cron_secret=SecretStr(read_text(env, "CRON_SECRET")),
        demo_mode=read_demo_mode(env),
        flags=parse_flags(env.get("FEATURE_FLAGS", "")),
        market_multiplier=read_market_multiplier(env),
    )


def settings_from_environment() -> Settings:
    """Read the real environment variables. The app calls this once when it starts."""
    return load_settings(os.environ)


def get_settings(request: Request) -> Settings:
    """FastAPI dependency: the settings that create_app() stored on the app."""
    return request.app.state.settings


# Write `settings: SettingsDep` in a route and FastAPI fills it in for you.
SettingsDep = Annotated[Settings, Depends(get_settings)]
