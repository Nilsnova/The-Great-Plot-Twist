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
    RELIGHT_OPEN              irreversible world switch, false by default, production only
    FEATURE_FLAGS             comma-separated feature names to switch on (see flags.py)
    WEATHER_PLACE_NAME        name of the place whose real weather the game shows (default:
                              Torshavn, Faroe Islands). Shown on screen. Not secret.
    WEATHER_LATITUDE          that place's latitude in degrees, -90 to 90 (default: 62.01)
    WEATHER_LONGITUDE         that place's longitude in degrees, -180 to 180 (default: -6.77)
    HOST_PLAYER_IDS           player ids (Supabase User UIDs, comma separated) of the hosts who
                              may use presenter routes (hosts.py). Empty means nobody is a host.
                              Not a password, but the browser never needs it.
    STOCK_API_PROVIDER        which stock-price provider the Island Exchange uses for its real
                              stock companies: empty (off, the default) or a known name (today
                              only "finnhub"). Not a secret. Set it only when the adapter is
                              merged, a teammate has created the key and the provider has agreed
                              that the prices may be shown (docs/DECISIONS.md, D017).
    STOCK_API_KEY             the key of that provider. SERVER ONLY, like the Supabase secret key:
                              never in the browser, a log or the repo. Empty keeps the stocks off.
    SPORTS_API_PROVIDER       empty, football-data.org or balldontlie. Empty means recorded only.
    SPORTS_API_KEY            server-only provider key; empty also means recorded only.

Used by: app.py (reads the environment once at start-up), auth.py, supabase_admin.py and
crew_broadcast.py (the Supabase address and keys, and for the broadcaster the flag live_presence),
the routes (env, demo mode, flags, the keep-alive secret), weather/source.py (the weather place),
hosts.py (who is a host) and the tests (they pass in a plain dictionary, so no real environment is
needed).
"""

import math
import os
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, Request
from pydantic import SecretStr

from server.flags import default_flags, parse_flags

APP_ENVS = ("local", "preview", "production")

# The stock providers STOCK_API_PROVIDER may name. Keep it the same as PROVIDER_NAMES in
# market/stocks.py (a test checks that): this file stays free of imports from the market package.
STOCK_PROVIDER_NAMES = ("finnhub",)

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
    # purpose, call .get_secret_value() (only supabase_admin.py, crew_broadcast.py and
    # routes/keepalive.py do that).
    supabase_secret_key: SecretStr = SecretStr("")
    # The password that the daily caller of /api/keepalive sends. The name dates from the time we
    # planned to use Vercel Cron, which we cannot use. Empty on a laptop: no daily caller runs
    # there, and the route then answers 503.
    cron_secret: SecretStr = SecretStr("")
    demo_mode: bool = False
    relight_open: bool = False
    flags: dict[str, bool] = field(default_factory=default_flags)
    # The place whose real weather the game shows. None of these three is secret: the name is
    # shown on screen and the coordinates go to Open-Meteo.
    weather_place_name: str = DEFAULT_WEATHER_PLACE_NAME
    weather_latitude: float = DEFAULT_WEATHER_LATITUDE
    weather_longitude: float = DEFAULT_WEATHER_LONGITUDE
    # The ids of the players who are hosts (hosts.py). Each one is written in the canonical form,
    # lowercase with hyphens, which is how Supabase sends the id of a signed-in player.
    host_player_ids: frozenset[str] = field(default_factory=frozenset)
    # The stock-price provider of the Island Exchange, and its key. Empty provider: stocks are off.
    stock_api_provider: str = ""
    # SecretStr prints as ********** in logs and error messages. Only market/exchange.py calls
    # .get_secret_value(), once, to build the stock source.
    stock_api_key: SecretStr = SecretStr("")
    sports_api_provider: str = ""
    sports_api_key: SecretStr = SecretStr("")


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


def read_relight_open(env: Mapping[str, str], app_env: str) -> bool:
    """The irreversible live switch stays closed everywhere except explicit production."""
    value = read_text(env, "RELIGHT_OPEN").lower()
    if value in ("", "false"):
        return False
    if value != "true":
        raise SettingsError("RELIGHT_OPEN must be 'true' or 'false'.")
    if app_env != "production":
        raise SettingsError("RELIGHT_OPEN may be true only when APP_ENV is production.")
    return True
def read_supabase_url(env: Mapping[str, str], app_env: str) -> str:
    """Deployed copies use a secure Supabase host. Local work may use a local service."""
    value = read_text(env, "SUPABASE_URL").rstrip("/")
    if app_env == "local":
        return value
    message = "SUPABASE_URL must be an HTTPS Supabase project URL in preview and production."
    try:
        url = urlsplit(value)
        host = url.hostname or ""
        valid = (
            url.scheme == "https"
            and host.endswith(".supabase.co")
            and all(host.split("."))
            and not any(character.isspace() for character in value)
            and url.username is None
            and url.password is None
            and url.port in (None, 443)
            and not (url.path or url.query or url.fragment)
        )
    except ValueError:
        raise SettingsError(message) from None
    if not valid:
        raise SettingsError(message)
    return value


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


def read_stock_api_provider(env: Mapping[str, str]) -> str:
    """STOCK_API_PROVIDER: empty (stocks off) or the name of a known provider."""
    value = read_text(env, "STOCK_API_PROVIDER").lower()
    if value and value not in STOCK_PROVIDER_NAMES:
        raise SettingsError(
            f"STOCK_API_PROVIDER must be empty or one of {', '.join(STOCK_PROVIDER_NAMES)} "
            f"(got '{value}')."
        )
    return value


def read_player_id(piece: str, position: int) -> str:
    """One host id in its canonical form. A piece that is not a player id stops the server.

    The error says where the bad piece is, but never repeats it: the value could be anything.
    """
    try:
        return str(uuid.UUID(piece))
    except ValueError as error:
        raise SettingsError(
            f"HOST_PLAYER_IDS item {position} is not a player id. "
            "Copy the User UID from Supabase, Authentication > Users."
        ) from error


def read_host_player_ids(env: Mapping[str, str]) -> frozenset[str]:
    """HOST_PLAYER_IDS: the ids of the hosts, comma separated. Empty means nobody is a host."""
    pieces = [piece.strip() for piece in read_text(env, "HOST_PLAYER_IDS").split(",")]
    items = [piece for piece in pieces if piece]  # ignore empty pieces such as a trailing comma
    ids = [read_player_id(item, position) for position, item in enumerate(items, start=1)]
    return frozenset(ids)


def read_sports_provider(env: Mapping[str, str]) -> str:
    value = read_text(env, "SPORTS_API_PROVIDER")
    if value not in ("", "football-data.org", "balldontlie"):
        raise SettingsError("SPORTS_API_PROVIDER must be empty, football-data.org or balldontlie.")
    return value


def load_settings(env: Mapping[str, str]) -> Settings:
    """Build the settings from a dictionary of variables. A pure function, so tests are easy."""
    app_env = read_app_env(env)
    return Settings(
        app_env=app_env,
        # No slash at the end, so we can write f"{supabase_url}/auth/v1/user" later.
        supabase_url=read_supabase_url(env, app_env),
        supabase_publishable_key=read_text(env, "SUPABASE_PUBLISHABLE_KEY"),
        supabase_secret_key=SecretStr(read_text(env, "SUPABASE_SECRET_KEY")),
        cron_secret=SecretStr(read_text(env, "CRON_SECRET")),
        demo_mode=read_demo_mode(env),
        relight_open=read_relight_open(env, app_env),
        flags=parse_flags(env.get("FEATURE_FLAGS", "")),
        weather_place_name=read_weather_place_name(env),
        weather_latitude=read_degrees(
            env, "WEATHER_LATITUDE", MAX_LATITUDE, DEFAULT_WEATHER_LATITUDE
        ),
        weather_longitude=read_degrees(
            env, "WEATHER_LONGITUDE", MAX_LONGITUDE, DEFAULT_WEATHER_LONGITUDE
        ),
        host_player_ids=read_host_player_ids(env),
        stock_api_provider=read_stock_api_provider(env),
        stock_api_key=SecretStr(read_text(env, "STOCK_API_KEY")),
        sports_api_provider=read_sports_provider(env),
        sports_api_key=SecretStr(read_text(env, "SPORTS_API_KEY")),
    )


def settings_from_environment() -> Settings:
    """Read the real environment variables. The app calls this once when it starts."""
    return load_settings(os.environ)


def get_settings(request: Request) -> Settings:
    """FastAPI dependency: the settings that create_app() stored on the app."""
    return request.app.state.settings


# Write `settings: SettingsDep` in a route and FastAPI fills it in for you.
SettingsDep = Annotated[Settings, Depends(get_settings)]
