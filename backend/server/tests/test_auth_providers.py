"""Tests for AUTH_PROVIDERS (settings.py): which sign-in providers the browser offers."""

import pytest

from server.settings import AUTH_PROVIDER_NAMES, SettingsError, load_settings


def test_github_alone_is_the_default():
    assert load_settings({}).auth_providers == ("github",)
    assert load_settings({"AUTH_PROVIDERS": " , "}).auth_providers == ("github",)


def test_both_providers_keep_their_order_and_repeats_are_ignored():
    settings = load_settings({"AUTH_PROVIDERS": "email, GitHub ,EMAIL,"})

    assert settings.auth_providers == ("email", "github")


def test_github_and_email_is_the_value_for_vercel():
    assert load_settings({"AUTH_PROVIDERS": "github,email"}).auth_providers == ("github", "email")
    assert load_settings({"AUTH_PROVIDERS": "email"}).auth_providers == ("email",)


def test_the_allowed_names_are_exactly_github_and_email():
    assert AUTH_PROVIDER_NAMES == ("github", "email")


def test_the_dropped_google_name_stops_the_server_with_a_clear_message():
    message = r"AUTH_PROVIDERS must name only github, email \(unknown: google\)"
    with pytest.raises(SettingsError, match=message):
        load_settings({"AUTH_PROVIDERS": "github,google"})


@pytest.mark.parametrize(
    "value", ["gogle", "google", "github,google", "emial", "anonymous", "github;email", "magiclink"]
)
def test_an_unknown_provider_stops_the_server(value):
    with pytest.raises(SettingsError, match="AUTH_PROVIDERS"):
        load_settings({"AUTH_PROVIDERS": value})
