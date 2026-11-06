"""G21: all supported WMO codes and seeded measurement combinations stay faithful to the spec."""

import math
import random
from dataclasses import astuple

import pytest

from server.weather.mapping import GameWeather, WeatherReading, map_reading

# These expectations are authored from the mapping contract, not read from WEATHER_CODES.
CODE_EXPECTATIONS = {
    0: ("Clear sky", 0.0, 0.0, 0.0),
    1: ("Mostly clear", 0.15, 0.0, 0.0),
    2: ("Partly cloudy", 0.5, 0.0, 0.0),
    3: ("Overcast", 0.9, 0.0, 0.0),
    45: ("Fog", 0.9, 0.0, 1.0),
    48: ("Freezing fog", 0.9, 0.0, 1.0),
    51: ("Light drizzle", 0.9, 0.15, 0.0),
    53: ("Drizzle", 0.95, 0.25, 0.0),
    55: ("Heavy drizzle", 1.0, 0.35, 0.0),
    56: ("Light freezing drizzle", 0.9, 0.2, 0.0),
    57: ("Heavy freezing drizzle", 1.0, 0.35, 0.0),
    61: ("Light rain", 0.9, 0.35, 0.0),
    63: ("Rain", 0.95, 0.6, 0.0),
    65: ("Heavy rain", 1.0, 0.85, 0.0),
    66: ("Light freezing rain", 0.9, 0.4, 0.0),
    67: ("Heavy freezing rain", 1.0, 0.85, 0.0),
    71: ("Light snow", 0.9, 0.25, 0.0),
    73: ("Snow", 0.95, 0.45, 0.0),
    75: ("Heavy snow", 1.0, 0.7, 0.0),
    77: ("Snow grains", 0.9, 0.25, 0.0),
    80: ("Light rain showers", 0.7, 0.4, 0.0),
    81: ("Rain showers", 0.8, 0.65, 0.0),
    82: ("Violent rain showers", 0.9, 1.0, 0.0),
    85: ("Light snow showers", 0.7, 0.35, 0.0),
    86: ("Heavy snow showers", 0.85, 0.65, 0.0),
    95: ("Thunderstorm", 1.0, 0.85, 0.0),
    96: ("Thunderstorm with hail", 1.0, 0.9, 0.0),
    97: ("Heavy thunderstorm", 1.0, 0.95, 0.0),
    99: ("Thunderstorm with heavy hail", 1.0, 1.0, 0.0),
}


@pytest.mark.parametrize("code", CODE_EXPECTATIONS)
def test_every_supported_code_has_the_exact_documented_dry_measurement_baseline(code):
    summary, clouds, rain, fog = CODE_EXPECTATIONS[code]
    assert map_reading(WeatherReading(weather_code=code)) == GameWeather(
        clouds, rain, fog, 0.0, True, summary
    )


@pytest.mark.parametrize(
    "code", [None, -100, -1, *sorted(set(range(100)) - CODE_EXPECTATIONS.keys())]
)
def test_unknown_codes_preserve_real_measurements_without_inventing_code_effects(code):
    result = map_reading(WeatherReading(code, 75.0, 4.0, 2500.0, 30.0, False))
    assert result == GameWeather(0.75, 0.5, 0.75, 0.5, False, "Conditions unknown, windy")


@pytest.mark.parametrize("code", CODE_EXPECTATIONS)
def test_missing_and_nonfinite_measurements_fall_back_for_every_code(code):
    baseline = map_reading(WeatherReading(weather_code=code))
    for missing in [None, math.nan, math.inf, -math.inf]:
        reading = WeatherReading(code, missing, missing, missing, missing)
        assert map_reading(reading) == baseline


def unit(value: float) -> float:
    """The documented slider range; used only with finite generated measurements."""
    return max(0.0, min(1.0, value))


@pytest.mark.parametrize("code", CODE_EXPECTATIONS)
def test_seeded_measurement_combinations_obey_code_floors_and_measurement_overrides(code):
    rng = random.Random(210604 + code)
    summary, _, rain_floor, fog_floor = CODE_EXPECTATIONS[code]
    for _ in range(64):
        cloud = rng.uniform(-100.0, 200.0)
        rain = rng.uniform(-8.0, 16.0)
        visibility = rng.uniform(-10_000.0, 20_000.0)
        wind = rng.uniform(-60.0, 120.0)
        day = bool(rng.getrandbits(1))
        reading = WeatherReading(code, cloud, rain, visibility, wind, day)
        original = astuple(reading)
        result = map_reading(reading)
        expected_fog = 0.0 if visibility < 0 else unit(1 - visibility / 10_000)
        expected_wind = round(unit(wind / 60), 2)
        suffix = ", very windy" if expected_wind >= 0.85 else ""
        if 0.5 <= expected_wind < 0.85:
            suffix = ", windy"
        assert result == GameWeather(
            round(unit(cloud / 100), 2),
            round(max(rain_floor, unit(rain / 8)), 2),
            round(max(fog_floor, expected_fog), 2),
            expected_wind,
            day,
            summary + suffix,
        )
        assert astuple(reading) == original


@pytest.mark.parametrize("code", CODE_EXPECTATIONS)
def test_measurement_increases_cannot_reduce_rain_fog_or_wind(code):
    rng = random.Random(210605 + code)
    samples = sorted(rng.uniform(0.0, 1.0) for _ in range(64))
    previous = (0.0, 0.0, 0.0)
    for fraction in samples:
        reading = WeatherReading(
            weather_code=code,
            precipitation_mm_per_hour=fraction * 8,
            visibility_m=(1 - fraction) * 10_000,
            wind_speed_kmh=fraction * 60,
        )
        result = map_reading(reading)
        current = (result.rain, result.fog, result.wind)
        assert all(after >= before for before, after in zip(previous, current, strict=True))
        assert all(0 <= value <= 1 and round(value, 2) == value for value in current)
        previous = current
