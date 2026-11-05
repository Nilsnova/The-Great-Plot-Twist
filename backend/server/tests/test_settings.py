"""Tests for settings.py: reading the environment variables and hiding the secret key."""

from dataclasses import FrozenInstanceError

import pytest

from server.flags import UnknownFlagError
from server.settings import SettingsError, load_settings, settings_from_environment
from server.tests.helpers import FAKE_PUBLISHABLE_KEY, FAKE_SECRET_KEY, FAKE_URL

ALL_VARIABLES = {
    "APP_ENV": "preview",
    "SUPABASE_URL": FAKE_URL,
    "SUPABASE_PUBLISHABLE_KEY": FAKE_PUBLISHABLE_KEY,
    "SUPABASE_SECRET_KEY": FAKE_SECRET_KEY,
    "DEMO_MODE": "true",
    "FEATURE_FLAGS": "raid,sports",
}


def test_empty_environment_gives_safe_defaults_for_local_work():
    settings = load_settings({})

    assert settings.app_env == "local"
    assert settings.supabase_url == ""
    assert settings.supabase_publishable_key == ""
    assert settings.supabase_secret_key.get_secret_value() == ""
    assert settings.demo_mode is False
    assert not any(settings.flags.values())


def test_every_variable_is_read():
    settings = load_settings(ALL_VARIABLES)

    assert settings.app_env == "preview"
    assert settings.supabase_url == FAKE_URL
    assert settings.supabase_publishable_key == FAKE_PUBLISHABLE_KEY
    assert settings.supabase_secret_key.get_secret_value() == FAKE_SECRET_KEY
    assert settings.demo_mode is True
    assert settings.flags["raid"] is True
    assert settings.flags["sports"] is True
    assert settings.flags["market"] is False


def test_spaces_are_removed_and_the_address_loses_its_trailing_slash():
    settings = load_settings({"SUPABASE_URL": f"  {FAKE_URL}/  ", "APP_ENV": " production "})

    assert settings.supabase_url == FAKE_URL
    assert settings.app_env == "production"


def test_app_env_ignores_capital_letters():
    assert load_settings({"APP_ENV": "Production"}).app_env == "production"


def test_unknown_app_env_is_rejected_with_a_clear_message():
    with pytest.raises(SettingsError, match="APP_ENV must be one of local, preview, production"):
        load_settings({"APP_ENV": "prod"})


@pytest.mark.parametrize(
    ("text", "expected"),
    [("true", True), ("TRUE", True), ("false", False), ("False", False), ("", False)],
)
def test_demo_mode_accepts_true_and_false(text, expected):
    assert load_settings({"DEMO_MODE": text}).demo_mode is expected


@pytest.mark.parametrize("text", ["1", "yes", "on", "maybe"])
def test_demo_mode_rejects_anything_else(text):
    with pytest.raises(SettingsError, match="DEMO_MODE"):
        load_settings({"DEMO_MODE": text})


def test_a_typo_in_feature_flags_stops_the_server_from_starting():
    with pytest.raises(UnknownFlagError, match="markt"):
        load_settings({"FEATURE_FLAGS": "markt"})


def test_secret_key_is_hidden_in_repr_and_str_but_available_on_purpose():
    settings = load_settings(ALL_VARIABLES)

    assert FAKE_SECRET_KEY not in repr(settings)
    assert FAKE_SECRET_KEY not in str(settings)
    assert "not_a_real_key" not in f"{settings.supabase_secret_key}"
    assert settings.supabase_secret_key.get_secret_value() == FAKE_SECRET_KEY


def test_settings_cannot_be_changed_after_they_are_built():
    settings = load_settings({})

    with pytest.raises(FrozenInstanceError):
        settings.app_env = "production"


def test_settings_from_environment_reads_the_real_environment(monkeypatch):
    monkeypatch.setenv("APP_ENV", "preview")
    monkeypatch.setenv("SUPABASE_URL", FAKE_URL)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", FAKE_PUBLISHABLE_KEY)
    monkeypatch.setenv("SUPABASE_SECRET_KEY", FAKE_SECRET_KEY)
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("FEATURE_FLAGS", "raid,sports")

    settings = settings_from_environment()

    assert settings.app_env == "preview"
    assert settings.demo_mode is True
    assert settings.supabase_url == FAKE_URL
