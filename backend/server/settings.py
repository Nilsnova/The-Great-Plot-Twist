"""Settings: every configuration value the server reads, in one place.

The values come from environment variables. Nothing else in the server reads os.environ,
so this file is the full list of what can be configured:

    APP_ENV                   local, preview or production (default: local)
    SUPABASE_URL              address of the Supabase project
    SUPABASE_PUBLISHABLE_KEY  key the browser may also use (row-level security protects data)
    SUPABASE_SECRET_KEY       server-only key. NEVER put it in the browser, a log or the repo.
    DEMO_MODE                 true or false (default: false)
    FEATURE_FLAGS             comma-separated feature names to switch on (see flags.py)

Used by: app.py (reads the environment once at start-up), auth.py and supabase_admin.py (the
Supabase address and keys), the routes (env, demo mode, flags) and the tests (they pass in a
plain dictionary, so no real environment is needed).
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from pydantic import SecretStr

from server.flags import default_flags, parse_flags

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
    # purpose, call .get_secret_value() (only supabase_admin.py does that).
    supabase_secret_key: SecretStr = SecretStr("")
    demo_mode: bool = False
    flags: dict[str, bool] = field(default_factory=default_flags)


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


def load_settings(env: Mapping[str, str]) -> Settings:
    """Build the settings from a dictionary of variables. A pure function, so tests are easy."""
    return Settings(
        app_env=read_app_env(env),
        # No slash at the end, so we can write f"{supabase_url}/auth/v1/user" later.
        supabase_url=read_text(env, "SUPABASE_URL").rstrip("/"),
        supabase_publishable_key=read_text(env, "SUPABASE_PUBLISHABLE_KEY"),
        supabase_secret_key=SecretStr(read_text(env, "SUPABASE_SECRET_KEY")),
        demo_mode=read_demo_mode(env),
        flags=parse_flags(env.get("FEATURE_FLAGS", "")),
    )


def settings_from_environment() -> Settings:
    """Read the real environment variables. The app calls this once when it starts."""
    return load_settings(os.environ)


def get_settings(request: Request) -> Settings:
    """FastAPI dependency: the settings that create_app() stored on the app."""
    return request.app.state.settings


# Write `settings: SettingsDep` in a route and FastAPI fills it in for you.
SettingsDep = Annotated[Settings, Depends(get_settings)]
