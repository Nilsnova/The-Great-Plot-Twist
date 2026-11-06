"""Tests for the two open routes: GET /api/health and GET /api/config (anyone may call them)."""

from dataclasses import replace

from fastapi.testclient import TestClient

from server import __version__
from server.app import create_app
from server.flags import FLAG_NAMES, parse_flags
from server.settings import Settings
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_CRON_SECRET,
    FAKE_PUBLISHABLE_KEY,
    FAKE_SECRET_KEY,
    FAKE_URL,
)


def make_client(settings: Settings) -> TestClient:
    return TestClient(create_app(settings))


def test_health_says_ok_with_version_and_environment():
    response = make_client(CONFIGURED_SETTINGS).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "env": "local"}


def test_health_reports_the_environment_from_the_settings():
    settings = replace(CONFIGURED_SETTINGS, app_env="production")

    assert make_client(settings).get("/api/health").json()["env"] == "production"


def test_health_contains_no_keys_or_addresses():
    text = make_client(CONFIGURED_SETTINGS).get("/api/health").text

    assert FAKE_SECRET_KEY not in text
    assert FAKE_PUBLISHABLE_KEY not in text
    assert FAKE_URL not in text


def test_config_defaults_have_every_flag_switched_off():
    body = make_client(Settings()).get("/api/config").json()

    assert body == {
        "env": "local",
        "demoMode": False,
        "flags": {name: False for name in FLAG_NAMES},
        "auth": {"provider": "github", "supabaseUrl": ""},
    }


def test_config_lists_all_flags_in_the_agreed_order():
    flags = make_client(Settings()).get("/api/config").json()["flags"]

    assert list(flags) == [
        "market",
        "predictions",
        "sports",
        "arena",
        "raid",
        "live_presence",
        "companion_llm",
        "festival",
    ]


def test_config_shows_demo_mode_and_the_flags_that_are_on():
    settings = replace(
        Settings(), app_env="preview", demo_mode=True, flags=parse_flags("market,arena")
    )

    body = make_client(settings).get("/api/config").json()

    assert body["env"] == "preview"
    assert body["demoMode"] is True
    assert body["flags"]["market"] is True
    assert body["flags"]["arena"] is True
    assert body["flags"]["sports"] is False


def test_config_tells_the_browser_how_to_sign_in():
    body = make_client(CONFIGURED_SETTINGS).get("/api/config").json()

    assert body["auth"] == {"provider": "github", "supabaseUrl": FAKE_URL}


def test_config_has_an_empty_sign_in_address_while_supabase_is_not_set_up():
    body = make_client(Settings()).get("/api/config").json()

    assert body["auth"]["supabaseUrl"] == ""


def test_config_auth_has_exactly_two_public_fields():
    # A third field would be a new thing to share with every visitor. Decide that on purpose.
    auth = make_client(CONFIGURED_SETTINGS).get("/api/config").json()["auth"]

    assert list(auth) == ["provider", "supabaseUrl"]


def test_config_shares_the_supabase_address_only_inside_auth():
    body = make_client(CONFIGURED_SETTINGS).get("/api/config").json()
    everything_but_auth = [value for key, value in body.items() if key != "auth"]

    assert FAKE_URL not in str(everything_but_auth)


def test_config_never_contains_a_key_or_a_secret():
    # The Supabase address is public, so it is allowed (see above). No key or secret ever is.
    text = make_client(CONFIGURED_SETTINGS).get("/api/config").text

    assert FAKE_SECRET_KEY not in text
    assert FAKE_PUBLISHABLE_KEY not in text
    assert FAKE_CRON_SECRET not in text
