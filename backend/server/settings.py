"""Settings: every configuration value the server reads, in one place.

The values come from environment variables. Nothing else in the server reads os.environ,
so this file is the full list of what can be configured:

    APP_ENV                   local, preview or production (default: local)
    SUPABASE_URL              address of the Supabase project
    SUPABASE_PUBLISHABLE_KEY  key the browser may also use (row-level security protects data)
    SUPABASE_SECRET_KEY       server-only key. NEVER put it in the browser, a log or the repo.
    CRON_SECRET               server-only password for the daily keep-alive. Whatever calls
                              /api/keepalive once a day sends it. Optional on your laptop.
                              NEVER in the repo.
    DEMO_MODE                 true or false (default: false)
    FEATURE_FLAGS             comma-separated feature names to switch on (see flags.py)
    WEATHER_PLACE_NAME        name of the place whose real weather the game shows (default:
                              Torshavn, Faroe Islands). Shown on screen. Not secret.
    WEATHER_LATITUDE          that place's latitude in degrees, -90 to 90 (default: 62.01)
    WEATHER_LONGITUDE         that place's longitude in degrees, -180 to 180 (default: -6.77)
    MARKET_MULTIPLIER         how strongly the Island Exchange amplifies real price moves, a whole
                              number from 20 to 100 (default: 100). Not a secret.

Used by: app.py (reads the environment once at start-up), auth.py and supabase_admin.py (the
Supabase address and keys), the routes (env, demo mode, flags, the keep-alive secret),
weather/source.py (the weather place) and the tests (they pass in a plain dictionary, so no real
environment is needed).
"""

import math
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request
from pydantic import SecretStr

from server.flags import default_flags, parse_flags
from server.market.rules import DEFAULT_MULTIPLIER, MAX_MULTIPLIER, MIN_MULTIPLIER

APP_ENVS = ("local", "preview", "production")

# The place whose real weather the game shows. The Faroe Islands are the team's proposal, because
# their real fog and storms suit the story. The team may change it (Lisbon is the other option,
# 38.72 and -9.14), so keep every value that depends on the place in these three settings.
DEFAULT_WEATHER_PLACE_NAME = "Torshavn, Faroe Islands"
DEFAULT_WEATHER_LATITUDE = 62.01
DEFAULT_WEATHER_LONGITUDE = -6.77
MAX_PLACE_NAME_LENGTH = 60
MAX_LATITUDE = 90
MAX_LONGITUDE = 180


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
    # The password that the daily caller of /api/keepalive sends. The name dates from the time we
    # planned to use Vercel Cron, which we cannot use. Empty on a laptop: no daily caller runs
    # there, and the route then answers 503.
    cron_secret: SecretStr = SecretStr("")
    demo_mode: bool = False
    flags: dict[str, bool] = field(default_factory=default_flags)
    # The place whose real weather the game shows. None of these three is secret: the name is
    # shown on screen and the coordinates go to Open-Meteo.
    weather_place_name: str = DEFAULT_WEATHER_PLACE_NAME
    weather_latitude: float = DEFAULT_WEATHER_LATITUDE
    weather_longitude: float = DEFAULT_WEATHER_LONGITUDE
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


def read_weather_place_name(env: Mapping[str, str]) -> str:
    """The place name for the screen. Empty means the default. It may use any letters."""
    value = read_text(env, "WEATHER_PLACE_NAME")
    if not value:
        return DEFAULT_WEATHER_PLACE_NAME
    if len(value) > MAX_PLACE_NAME_LENGTH:
        raise SettingsError(
            f"WEATHER_PLACE_NAME must be at most {MAX_PLACE_NAME_LENGTH} characters "
            f"(got {len(value)})."
        )
    # isprintable() is False for line breaks, tabs and other control characters. The error does
    # not repeat the text, because control characters could mess up the terminal.
    if not value.isprintable():
        raise SettingsError(
            "WEATHER_PLACE_NAME must not contain line breaks or control characters."
        )
    return value


def read_degrees(env: Mapping[str, str], name: str, limit: int, default: float) -> float:
    """A coordinate in degrees, from -limit to +limit. Empty means the default."""
    text = read_text(env, name)
    if not text:
        return default
    message = f"{name} must be a number from -{limit} to {limit} (got '{text}')."
    try:
        value = float(text)
    except ValueError as error:
        raise SettingsError(message) from error
    # float() also accepts the words nan and inf, so check for a real number on purpose.
    if not math.isfinite(value) or abs(value) > limit:
        raise SettingsError(message)
    return value


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
        weather_place_name=read_weather_place_name(env),
        weather_latitude=read_degrees(
            env, "WEATHER_LATITUDE", MAX_LATITUDE, DEFAULT_WEATHER_LATITUDE
        ),
        weather_longitude=read_degrees(
            env, "WEATHER_LONGITUDE", MAX_LONGITUDE, DEFAULT_WEATHER_LONGITUDE
        ),
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
