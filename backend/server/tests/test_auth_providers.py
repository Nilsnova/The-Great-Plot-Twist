"""Tests for AUTH_PROVIDERS (settings.py): which sign-in providers the browser offers."""

import pytest

from server.settings import AUTH_PROVIDER_NAMES, SettingsError, load_settings


def test_github_alone_is_the_default():
    assert load_settings({}).auth_providers == ("github",)
    assert load_settings({"AUTH_PROVIDERS": " , "}).auth_providers == ("github",)


def test_both_providers_keep_their_order_and_repeats_are_ignored():
    settings = load_settings({"AUTH_PROVIDERS": "google, GitHub ,google,"})

    assert settings.auth_providers == ("google", "github")


def test_the_allowed_names_are_exactly_github_and_google():
    assert AUTH_PROVIDER_NAMES == ("github", "google")


@pytest.mark.parametrize("value", ["gogle", "github,email", "anonymous", "github;google"])
def test_an_unknown_provider_stops_the_server(value):
    with pytest.raises(SettingsError, match="AUTH_PROVIDERS"):
        load_settings({"AUTH_PROVIDERS": value})
