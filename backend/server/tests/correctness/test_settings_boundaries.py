"""G21: generated valid ranges and adjacent invalid settings, using no real environment."""

import math
import random

import pytest

from server.settings import SettingsError, load_settings


@pytest.mark.parametrize("value", range(20, 101))
def test_every_supported_market_multiplier_is_accepted(value):
    assert load_settings({"MARKET_MULTIPLIER": f" {value:03d} "}).market_multiplier == value


@pytest.mark.parametrize("value", [-1, 0, 1, 19, 101, 1000, 2**63])
def test_out_of_range_multipliers_name_the_setting(value):
    with pytest.raises(SettingsError, match="MARKET_MULTIPLIER"):
        load_settings({"MARKET_MULTIPLIER": str(value)})


@pytest.mark.parametrize("value", ["+30", "30.0", "3e1", "0x20", "３０", "3_0", "30\x00"])
def test_ambiguous_integer_spellings_are_rejected(value):
    with pytest.raises(SettingsError, match="MARKET_MULTIPLIER"):
        load_settings({"MARKET_MULTIPLIER": value})


@pytest.mark.parametrize("name,limit", [("WEATHER_LATITUDE", 90), ("WEATHER_LONGITUDE", 180)])
def test_coordinate_limits_use_finite_numbers_and_inclusive_endpoints(name, limit):
    attribute = name.lower()
    rng = random.Random(210603 + limit)
    values = [-limit, limit, -0.0, 0.0]
    values += [rng.uniform(-limit, limit) for _ in range(256)]
    for value in values:
        parsed = load_settings({name: repr(value)})
        assert getattr(parsed, attribute) == value
    invalid = [math.nextafter(limit, math.inf), math.nextafter(-limit, -math.inf)]
    invalid += [math.inf, -math.inf, math.nan]
    for value in invalid:
        with pytest.raises(SettingsError, match=name):
            load_settings({name: repr(value)})


@pytest.mark.parametrize("size", [1, 2, 59, 60])
def test_place_length_counts_unicode_characters_after_trimming(size):
    assert load_settings({"WEATHER_PLACE_NAME": "  " + "ø" * size + "  "}).weather_place_name == (
        "ø" * size
    )


@pytest.mark.parametrize("value", ["ø" * 61, "a\u2028b", "a\u2029b", "a\x7fb", "a\x85b"])
def test_nonprintable_or_too_long_places_fail_without_echoing_control_text(value):
    with pytest.raises(SettingsError, match="WEATHER_PLACE_NAME") as problem:
        load_settings({"WEATHER_PLACE_NAME": value})
    assert value not in str(problem.value)


@pytest.mark.parametrize("name", ["APP_ENV", "DEMO_MODE"])
@pytest.mark.parametrize("value", ["1", "0", "yes", "null", "preview true", "true,false"])
def test_unrecognized_enum_text_cannot_silently_select_a_default(name, value):
    with pytest.raises(SettingsError, match=name):
        load_settings({name: value})


@pytest.mark.parametrize("environment", ["local", "preview", "production"])
@pytest.mark.parametrize("demo", ["true", "false"])
def test_enum_parsing_normalizes_mixed_case_and_whitespace_independently(environment, demo):
    settings = load_settings({"APP_ENV": f" {environment.upper()} ", "DEMO_MODE": demo.title()})
    assert settings.app_env == environment
    assert settings.demo_mode is (demo == "true")


@pytest.mark.parametrize("position", [0, 1, 2])
def test_invalid_host_in_any_list_position_refuses_the_whole_setting(position):
    values = ["00000000-0000-4000-8000-000000000021"] * 3
    values[position] = "g21-invalid-host"
    with pytest.raises(SettingsError, match=f"HOST_PLAYER_IDS item {position + 1}") as problem:
        load_settings({"HOST_PLAYER_IDS": ",".join(values)})
    assert "g21-invalid-host" not in str(problem.value)
