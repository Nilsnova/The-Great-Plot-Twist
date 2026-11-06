"""G21: generated valid ranges and adjacent invalid settings, using no real environment."""

import math
import random

import pytest

from server.settings import SettingsError, load_settings


@pytest.mark.parametrize("value", ["", "finnhub", "FINNHUB", " FiNnHuB "])
def test_stock_provider_normalizes_supported_spelling_without_loading_a_key(value):
    assert load_settings({"STOCK_API_PROVIDER": value}).stock_api_provider == value.strip().lower()


@pytest.mark.parametrize("name", ["STOCK_API_PROVIDER", "SPORTS_API_PROVIDER"])
@pytest.mark.parametrize("value", ["unknown", "1", "http://example.org", "finnhub,balldontlie"])
def test_unrecognized_provider_is_refused(name, value):
    with pytest.raises(SettingsError, match=name):
        load_settings({name: value})


@pytest.mark.parametrize("provider", ["", "football-data.org", "balldontlie"])
def test_sports_provider_allows_only_the_fixed_adapters(provider):
    assert load_settings({"SPORTS_API_PROVIDER": provider}).sports_api_provider == provider


@pytest.mark.parametrize("environment", ["local", "preview", "production"])
@pytest.mark.parametrize("value", ["true", " TrUe ", "false", " FaLsE ", ""])
def test_relight_switch_is_fail_closed_and_production_only(environment, value):
    variables = {
        "APP_ENV": environment,
        "SUPABASE_URL": "https://g21-fixture.supabase.co",
        "RELIGHT_OPEN": value,
    }
    if value.strip().lower() == "true" and environment != "production":
        with pytest.raises(SettingsError, match="RELIGHT_OPEN"):
            load_settings(variables)
    else:
        assert load_settings(variables).relight_open is (value.strip().lower() == "true")


@pytest.mark.parametrize("value", ["yes", "1", "0", "true,false", "on"])
def test_ambiguous_relight_switch_values_cannot_open_the_world(value):
    with pytest.raises(SettingsError, match="RELIGHT_OPEN"):
        load_settings(
            {
                "APP_ENV": "production",
                "SUPABASE_URL": "https://g21-fixture.supabase.co",
                "RELIGHT_OPEN": value,
            }
        )


@pytest.mark.parametrize("environment", ["preview", "production"])
@pytest.mark.parametrize(
    "address",
    [
        "",
        "http://g21-fixture.supabase.co",
        "https://example.org",
        "https://g21-fixture.supabase.co:444",
        "https://g21-fixture.supabase.co/path",
        "https://g21-fixture.supabase.co?query=value",
        "https://g21-fixture.supabase.co#fragment",
    ],
)
def test_deployed_supabase_address_rejects_ambiguous_or_unapproved_origins(environment, address):
    with pytest.raises(SettingsError, match="SUPABASE_URL"):
        load_settings({"APP_ENV": environment, "SUPABASE_URL": address})


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
    settings = load_settings(
        {
            "APP_ENV": f" {environment.upper()} ",
            "DEMO_MODE": demo.title(),
            "SUPABASE_URL": "https://g21-fixture.supabase.co",
        }
    )
    assert settings.app_env == environment
    assert settings.demo_mode is (demo == "true")


@pytest.mark.parametrize("position", [0, 1, 2])
def test_invalid_host_in_any_list_position_refuses_the_whole_setting(position):
    values = ["00000000-0000-4000-8000-000000000021"] * 3
    values[position] = "g21-invalid-host"
    with pytest.raises(SettingsError, match=f"HOST_PLAYER_IDS item {position + 1}") as problem:
        load_settings({"HOST_PLAYER_IDS": ",".join(values)})
    assert "g21-invalid-host" not in str(problem.value)
