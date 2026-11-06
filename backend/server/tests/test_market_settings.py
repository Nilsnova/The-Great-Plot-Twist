"""Tests for the market settings in settings.py: STOCK_API_PROVIDER and STOCK_API_KEY.

The Island Exchange follows real prices one to one, so the old MARKET_MULTIPLIER setting is gone.
The stock source is off until a provider is named and its key is set.
"""

import dataclasses

import pytest

from server.market.stocks import PROVIDER_NAMES
from server.settings import (
    STOCK_PROVIDER_NAMES,
    Settings,
    SettingsError,
    load_settings,
)
from server.tests.helpers import REPO_ROOT

SECRET = "a-test-key-that-must-stay-hidden"


def test_the_stock_source_is_off_by_default():
    settings = Settings()

    assert settings.stock_api_provider == ""
    assert settings.stock_api_key.get_secret_value() == ""


def test_an_empty_environment_leaves_the_stock_source_off():
    settings = load_settings({})

    assert settings.stock_api_provider == ""
    assert settings.stock_api_key.get_secret_value() == ""


def test_an_empty_provider_value_is_fine():
    assert load_settings({"STOCK_API_PROVIDER": ""}).stock_api_provider == ""
    assert load_settings({"STOCK_API_PROVIDER": "   "}).stock_api_provider == ""


def test_a_known_provider_name_is_accepted():
    assert load_settings({"STOCK_API_PROVIDER": "finnhub"}).stock_api_provider == "finnhub"


def test_the_provider_name_ignores_spaces_and_capitals():
    assert load_settings({"STOCK_API_PROVIDER": "  Finnhub "}).stock_api_provider == "finnhub"


@pytest.mark.parametrize("name", ["nasdaq", "alpaca", "finnhub.io", "fin hub"])
def test_an_unknown_provider_name_stops_the_server_with_a_clear_message(name):
    with pytest.raises(SettingsError, match=r"STOCK_API_PROVIDER must be empty or one of finnhub"):
        load_settings({"STOCK_API_PROVIDER": name})


def test_the_known_provider_names_of_the_settings_are_those_of_the_stock_source():
    assert tuple(STOCK_PROVIDER_NAMES) == tuple(PROVIDER_NAMES)


def test_the_key_is_read_without_surrounding_spaces():
    settings = load_settings({"STOCK_API_KEY": f"  {SECRET} "})

    assert settings.stock_api_key.get_secret_value() == SECRET


def test_the_key_prints_as_stars_and_never_shows_in_the_settings_text():
    settings = load_settings({"STOCK_API_PROVIDER": "finnhub", "STOCK_API_KEY": SECRET})

    assert SECRET not in repr(settings)
    assert SECRET not in str(settings)
    assert "**********" in repr(settings.stock_api_key)
    assert "**********" in str(settings.stock_api_key)


def test_the_key_does_not_leak_through_a_dict_of_the_settings_fields():
    settings = load_settings({"STOCK_API_KEY": SECRET})

    assert SECRET not in str(dataclasses.asdict(settings))


def test_the_old_multiplier_setting_is_no_longer_read():
    settings = load_settings(
        {"MARKET_MULTIPLIER": "banana"}
    )  # would have stopped the server before

    assert not hasattr(settings, "market_multiplier")


# --- the lines in .env.example ---

ENV_EXAMPLE = REPO_ROOT / ".env.example"


def env_example_lines() -> list[str]:
    return ENV_EXAMPLE.read_text().splitlines()


@pytest.mark.parametrize("name", ["STOCK_API_PROVIDER", "STOCK_API_KEY"])
def test_env_example_lists_each_stock_setting_with_an_empty_value(name):
    assert f"{name}=" in env_example_lines()


def test_env_example_marks_the_stock_key_as_server_only_and_the_provider_as_not_secret():
    lines = env_example_lines()
    key_comment = lines[lines.index("STOCK_API_KEY=") - 1]
    provider_comment = lines[lines.index("STOCK_API_PROVIDER=") - 1]

    assert key_comment.startswith("# [SERVER ONLY]")
    assert provider_comment.startswith("# [safe for browser]")


def test_env_example_names_the_one_known_provider_and_the_written_approval():
    lines = env_example_lines()
    comment = lines[lines.index("STOCK_API_PROVIDER=") - 1]

    assert "finnhub" in comment
    assert "in writing" in comment


def test_env_example_no_longer_has_the_multiplier():
    assert "MARKET_MULTIPLIER" not in ENV_EXAMPLE.read_text()


def test_the_demo_mode_line_says_the_stocks_are_not_part_of_the_recording():
    lines = env_example_lines()
    comment = lines[lines.index("DEMO_MODE=") - 1]

    assert "stocks are not part of it" in comment
