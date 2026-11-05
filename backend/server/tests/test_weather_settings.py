"""Tests for the three weather settings in settings.py and their line in .env.example."""

import pytest

from server.settings import Settings, SettingsError, load_settings
from server.tests.weather_helpers import BACKEND_ROOT

ENV_EXAMPLE = BACKEND_ROOT.parent / ".env.example"


# --- the defaults: the Faroe Islands, the team's proposal ---


def test_empty_environment_gives_the_faroe_islands_as_the_weather_place():
    settings = load_settings({})

    assert settings.weather_place_name == "Torshavn, Faroe Islands"
    assert settings.weather_latitude == 62.01
    assert settings.weather_longitude == -6.77


def test_a_plain_settings_object_has_the_same_defaults():
    settings = Settings()

    assert settings.weather_place_name == "Torshavn, Faroe Islands"
    assert settings.weather_latitude == 62.01
    assert settings.weather_longitude == -6.77


def test_empty_values_from_a_copied_env_example_mean_the_default():
    empty = {"WEATHER_PLACE_NAME": "", "WEATHER_LATITUDE": "", "WEATHER_LONGITUDE": ""}

    assert load_settings(empty).weather_place_name == "Torshavn, Faroe Islands"
    assert load_settings(empty).weather_latitude == 62.01
    assert load_settings(empty).weather_longitude == -6.77


# --- reading real values ---


def test_all_three_weather_variables_are_read():
    settings = load_settings(
        {
            "WEATHER_PLACE_NAME": "Lisbon, Portugal",
            "WEATHER_LATITUDE": "38.72",
            "WEATHER_LONGITUDE": "-9.14",
        }
    )

    assert settings.weather_place_name == "Lisbon, Portugal"
    assert settings.weather_latitude == 38.72
    assert settings.weather_longitude == -9.14


def test_spaces_around_the_weather_values_are_removed():
    settings = load_settings(
        {
            "WEATHER_PLACE_NAME": "  Lisbon  ",
            "WEATHER_LATITUDE": " 38.72 ",
            "WEATHER_LONGITUDE": " -9.14 ",
        }
    )

    assert settings.weather_place_name == "Lisbon"
    assert settings.weather_latitude == 38.72
    assert settings.weather_longitude == -9.14


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [("-90", "-180"), ("90", "180"), ("0", "0"), ("0.0", "-0.0")],
)
def test_coordinates_on_the_edge_of_the_allowed_range_are_accepted(latitude, longitude):
    settings = load_settings({"WEATHER_LATITUDE": latitude, "WEATHER_LONGITUDE": longitude})

    assert settings.weather_latitude == float(latitude)
    assert settings.weather_longitude == float(longitude)


# --- refusing bad values, with a message that names the setting ---


@pytest.mark.parametrize("text", ["north", "62,01", "62.01N", "nan", "inf", "-inf", "90.01", "-91"])
def test_a_bad_latitude_stops_the_server_from_starting(text):
    with pytest.raises(SettingsError, match="WEATHER_LATITUDE"):
        load_settings({"WEATHER_LATITUDE": text})


@pytest.mark.parametrize("text", ["west", "-6,77", "6.77W", "nan", "inf", "-inf", "180.5", "-181"])
def test_a_bad_longitude_stops_the_server_from_starting(text):
    with pytest.raises(SettingsError, match="WEATHER_LONGITUDE"):
        load_settings({"WEATHER_LONGITUDE": text})


def test_the_latitude_message_says_what_is_allowed_and_what_was_given():
    with pytest.raises(SettingsError, match=r"from -90 to 90 \(got '95'\)"):
        load_settings({"WEATHER_LATITUDE": "95"})


def test_the_longitude_message_says_what_is_allowed_and_what_was_given():
    with pytest.raises(SettingsError, match=r"from -180 to 180 \(got '200'\)"):
        load_settings({"WEATHER_LONGITUDE": "200"})


def test_a_place_name_that_is_too_long_is_refused():
    with pytest.raises(SettingsError, match="WEATHER_PLACE_NAME"):
        load_settings({"WEATHER_PLACE_NAME": "x" * 61})


def test_a_place_name_of_exactly_the_longest_allowed_length_is_accepted():
    settings = load_settings({"WEATHER_PLACE_NAME": "x" * 60})

    assert settings.weather_place_name == "x" * 60


@pytest.mark.parametrize("text", ["Lis\nbon", "Lis\tbon", "Lis\x00bon", "Lis\x1bbon"])
def test_a_place_name_with_control_characters_is_refused(text):
    with pytest.raises(SettingsError, match="WEATHER_PLACE_NAME"):
        load_settings({"WEATHER_PLACE_NAME": text})


def test_a_place_name_with_letters_from_other_alphabets_is_fine():
    settings = load_settings({"WEATHER_PLACE_NAME": "Tórshavn, Føroyar"})

    assert settings.weather_place_name == "Tórshavn, Føroyar"


def test_the_place_name_error_does_not_repeat_the_bad_text():
    # The text could hold control characters that mess up a terminal.
    with pytest.raises(SettingsError) as error:
        load_settings({"WEATHER_PLACE_NAME": "Lis\x1b[31mbon"})

    assert "\x1b" not in str(error.value)


# --- the settings file template ---


@pytest.mark.parametrize("name", ["WEATHER_PLACE_NAME", "WEATHER_LATITUDE", "WEATHER_LONGITUDE"])
def test_env_example_lists_every_weather_setting_with_an_empty_value(name):
    lines = ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()

    assert f"{name}=" in lines


def test_env_example_explains_the_weather_settings_in_a_comment():
    text = ENV_EXAMPLE.read_text(encoding="utf-8")

    assert "Open-Meteo" in text
    assert "Torshavn" in text
