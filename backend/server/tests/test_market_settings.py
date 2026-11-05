"""Tests for the market setting in settings.py: MARKET_MULTIPLIER, a whole number from 20 to 100."""

import pytest

from server.settings import Settings, SettingsError, load_settings


def test_the_default_multiplier_is_100():
    assert Settings().market_multiplier == 100


def test_an_empty_environment_gives_the_default_multiplier():
    assert load_settings({}).market_multiplier == 100


def test_an_empty_value_gives_the_default_multiplier():
    assert load_settings({"MARKET_MULTIPLIER": ""}).market_multiplier == 100


@pytest.mark.parametrize("text", ["20", "21", "50", "99", "100"])
def test_a_whole_number_from_20_to_100_is_accepted(text):
    assert load_settings({"MARKET_MULTIPLIER": text}).market_multiplier == int(text)


def test_spaces_around_the_number_are_ignored():
    assert load_settings({"MARKET_MULTIPLIER": "  30 "}).market_multiplier == 30


@pytest.mark.parametrize("text", ["19", "101", "0", "1000"])
def test_a_number_outside_20_to_100_is_refused_with_a_clear_message(text):
    with pytest.raises(SettingsError, match="MARKET_MULTIPLIER must be from 20 to 100"):
        load_settings({"MARKET_MULTIPLIER": text})


@pytest.mark.parametrize("text", ["abc", "-30", "30.5", "1e2", "thirty", "٣٠"])
def test_anything_that_is_not_a_whole_number_is_refused(text):
    with pytest.raises(SettingsError, match="MARKET_MULTIPLIER must be a whole number"):
        load_settings({"MARKET_MULTIPLIER": text})
