"""The case is off by default and the irreversible world switch refuses nonproduction startup."""

import pytest

from server.flags import FLAG_NAMES, default_flags, parse_flags
from server.settings import SettingsError, load_settings


def test_case_is_a_known_flag_and_stays_off_by_default():
    assert "case" in FLAG_NAMES
    assert default_flags()["case"] is False
    assert parse_flags("case")["case"] is True
    assert load_settings({}).relight_open is False


@pytest.mark.parametrize("value", ["", "false", "FALSE"])
def test_the_relight_switch_stays_closed(value):
    assert load_settings({"RELIGHT_OPEN": value}).relight_open is False


@pytest.mark.parametrize("value", ["1", "yes", "enabled"])
def test_the_relight_switch_rejects_unknown_values(value):
    with pytest.raises(SettingsError, match="RELIGHT_OPEN"):
        load_settings({"RELIGHT_OPEN": value})


@pytest.mark.parametrize("environment", ["local", "preview"])
def test_relight_open_is_refused_outside_production(environment):
    with pytest.raises(SettingsError, match="RELIGHT_OPEN may be true only"):
        load_settings({"APP_ENV": environment, "RELIGHT_OPEN": "true"})


def test_relight_open_accepts_only_explicit_production():
    assert load_settings({"APP_ENV": "production", "RELIGHT_OPEN": "true"}).relight_open
