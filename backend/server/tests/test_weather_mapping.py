"""Tests for weather/mapping.py: real weather numbers become the game's four values.

The mapping is pure arithmetic, so these tests need no network and no fake clock. The saved
answers in backend/content/weather/ prove that every weather-code group is mapped.
"""

import math
from datetime import UTC, datetime, timedelta, timezone

import pytest

from server.tests.weather_helpers import (
    load_recorded_file,
    load_sample_answer,
    sample_names,
)
from server.weather.mapping import (
    UNKNOWN_SUMMARY,
    WEATHER_CODES,
    GameWeather,
    WeatherReading,
    clamp_unit,
    format_utc_time,
    map_reading,
)
from server.weather.open_meteo import parse_open_meteo_answer

# The weather codes Open-Meteo documents (checked on 5 Nov 2026), grouped the way the table groups
# them. The saved answers must reach every group.
FAMILIES = {
    "sky": (0, 1, 2, 3),
    "fog": (45, 48),
    "drizzle": (51, 53, 55, 56, 57),
    "rain": (61, 63, 65, 66, 67),
    "snow": (71, 73, 75, 77),
    "rain showers": (80, 81, 82),
    "snow showers": (85, 86),
    "thunderstorm": (95, 96, 97, 99),
}
ALL_CODES = sorted(code for codes in FAMILIES.values() for code in codes)

# Every code where something falls out of the sky.
FALLING_CODES = (
    FAMILIES["drizzle"]
    + FAMILIES["rain"]
    + FAMILIES["snow"]
    + FAMILIES["rain showers"]
    + FAMILIES["snow showers"]
)


def family_of(code: int) -> str:
    """The name of the group a weather code belongs to."""
    for name, codes in FAMILIES.items():
        if code in codes:
            return name
    raise ValueError(f"Weather code {code} is in no group.")


def mapped(**numbers) -> GameWeather:
    """Map a reading that has only the given numbers. Every other number is missing."""
    return map_reading(WeatherReading(**numbers))


def mapped_sample(name: str) -> GameWeather:
    """Read a saved Open-Meteo answer and map it, the way the live source does."""
    return map_reading(parse_open_meteo_answer(load_sample_answer(name)))


def groups_of_the_saved_answers() -> set[str]:
    """The names of the weather-code groups that the saved sample answers belong to."""
    codes = [load_sample_answer(name)["current"]["weather_code"] for name in sample_names()]
    return {family_of(code) for code in codes}


def rains_for(codes: tuple[int, ...]) -> list[float]:
    """The rain value of each weather code, in the same order as the codes."""
    return [mapped(weather_code=code).rain for code in codes]


# --- the saved answers: one for every weather-code group ---

# What each saved answer must turn into. The numbers were worked out by hand from the rules at
# the top of mapping.py (see the comments next to each case).
EXPECTED_BY_SAMPLE = {
    # cloud 4 %, wind 9.4 km/h = 0.157, visibility 50 km is clear air
    "clear-sky": GameWeather(0.04, 0.0, 0.0, 0.16, True, "Clear sky"),
    "partly-cloudy": GameWeather(0.58, 0.0, 0.0, 0.37, True, "Partly cloudy"),
    "overcast": GameWeather(1.0, 0.0, 0.0, 0.29, True, "Overcast"),
    # visibility 180 m, and the code says fog: full fog
    "fog": GameWeather(0.92, 0.0, 1.0, 0.1, True, "Fog"),
    # 0.1 mm in 15 minutes is 0.4 mm/h = 0.05, less than the code's 0.25; visibility 6.2 km
    "drizzle": GameWeather(1.0, 0.25, 0.38, 0.33, True, "Drizzle"),
    # 0.9 mm in 15 minutes is 3.6 mm/h = 0.45, less than the code's 0.6; wind 31.2 km/h = 0.52
    "rain": GameWeather(1.0, 0.6, 0.22, 0.52, True, "Rain, windy"),
    "snow": GameWeather(1.0, 0.45, 0.71, 0.23, False, "Snow"),
    # 1.6 mm in 15 minutes is 6.4 mm/h = 0.8, more than the code's 0.65; wind 0.69
    "rain-showers": GameWeather(0.76, 0.8, 0.0, 0.69, True, "Rain showers, windy"),
    "snow-showers": GameWeather(0.7, 0.35, 0.1, 0.45, True, "Light snow showers"),
    # 3 mm in 15 minutes is 12 mm/h, more than full rain; wind 56 km/h = 0.93
    "thunderstorm": GameWeather(1.0, 1.0, 0.69, 0.93, False, "Thunderstorm, very windy"),
}


def test_there_is_one_saved_answer_for_each_expected_case():
    assert sample_names() == sorted(EXPECTED_BY_SAMPLE)


@pytest.mark.parametrize("name", sorted(EXPECTED_BY_SAMPLE))
def test_each_saved_answer_maps_to_the_expected_game_weather(name):
    assert mapped_sample(name) == EXPECTED_BY_SAMPLE[name]


def test_the_saved_answers_reach_every_weather_code_group():
    assert groups_of_the_saved_answers() == set(FAMILIES)


def test_the_recorded_real_answer_maps_to_an_overcast_night():
    reading = parse_open_meteo_answer(load_recorded_file()["answer"])

    assert map_reading(reading) == GameWeather(1.0, 0.0, 0.0, 0.23, False, "Overcast")


# --- every weather code in the table ---


def test_the_table_has_exactly_the_codes_open_meteo_documents():
    assert sorted(WEATHER_CODES) == ALL_CODES


@pytest.mark.parametrize("code", ALL_CODES)
def test_every_code_gives_values_from_zero_to_one_and_a_summary(code):
    result = mapped(weather_code=code)

    assert 0.0 <= result.cloud_cover <= 1.0
    assert 0.0 <= result.rain <= 1.0
    assert 0.0 <= result.fog <= 1.0
    assert result.summary
    assert result.summary != UNKNOWN_SUMMARY


@pytest.mark.parametrize("code", [0, 1, 2, 3])
def test_sky_codes_are_dry_and_have_no_fog(code):
    result = mapped(weather_code=code)

    assert result.rain == 0.0
    assert result.fog == 0.0


@pytest.mark.parametrize("code", [45, 48])
def test_fog_codes_give_full_fog_and_no_rain(code):
    result = mapped(weather_code=code)

    assert result.fog == 1.0
    assert result.rain == 0.0


@pytest.mark.parametrize("code", FALLING_CODES)
def test_every_code_with_something_falling_gives_some_rain(code):
    assert mapped(weather_code=code).rain > 0.0


@pytest.mark.parametrize("code", FAMILIES["thunderstorm"])
def test_thunderstorm_codes_give_heavy_rain_and_full_cloud(code):
    result = mapped(weather_code=code)

    assert result.rain >= 0.8
    assert result.cloud_cover == 1.0


@pytest.mark.parametrize(
    "codes",
    [
        (51, 53, 55),  # light, moderate, dense drizzle
        (56, 57),  # light, dense freezing drizzle
        (61, 63, 65),  # slight, moderate, heavy rain
        (66, 67),  # light, heavy freezing rain
        (71, 73, 75),  # slight, moderate, heavy snowfall
        (80, 81, 82),  # slight, moderate, violent rain showers
        (85, 86),  # slight, heavy snow showers
        (95, 96, 97, 99),  # thunderstorm, with hail, heavy, with heavy hail
    ],
)
def test_heavier_weather_never_gives_less_rain_than_lighter_weather(codes):
    rains = rains_for(codes)

    assert rains == sorted(rains)


def test_snow_shows_as_falling_rain_because_the_game_has_no_snow_yet():
    assert mapped(weather_code=73).rain == 0.45


# --- each measurement on its own ---


@pytest.mark.parametrize(
    ("percent", "expected"),
    [(0, 0.0), (25, 0.25), (50, 0.5), (100, 1.0), (150, 1.0), (-10, 0.0)],
)
def test_cloud_cover_is_the_percent_divided_by_100_and_kept_inside_zero_to_one(percent, expected):
    assert mapped(cloud_cover_percent=percent).cloud_cover == expected


def test_a_measured_cloud_cover_beats_the_typical_one_for_the_weather_code():
    # Code 3 (overcast) is typically 0.9, but the measurement says 30 %. The measurement wins.
    assert mapped(weather_code=3, cloud_cover_percent=30).cloud_cover == 0.3


def test_a_missing_cloud_cover_uses_the_typical_one_for_the_weather_code():
    assert mapped(weather_code=3).cloud_cover == 0.9


def test_without_cloud_cover_and_weather_code_the_sky_counts_as_clear():
    assert mapped().cloud_cover == 0.0


@pytest.mark.parametrize(
    ("mm_per_hour", "expected"),
    [(0.0, 0.0), (2.0, 0.25), (4.0, 0.5), (8.0, 1.0), (80.0, 1.0), (-3.0, 0.0)],
)
def test_rain_grows_with_the_amount_and_is_full_at_8_mm_an_hour(mm_per_hour, expected):
    assert mapped(precipitation_mm_per_hour=mm_per_hour).rain == expected


def test_rain_is_the_higher_of_what_the_code_says_and_what_was_measured():
    heavy_rain_code_but_dry_gauge = mapped(weather_code=65, precipitation_mm_per_hour=0.0)
    clear_code_but_wet_gauge = mapped(weather_code=0, precipitation_mm_per_hour=6.4)

    assert heavy_rain_code_but_dry_gauge.rain == 0.85
    assert clear_code_but_wet_gauge.rain == 0.8


@pytest.mark.parametrize(
    ("metres", "expected"),
    [
        (None, 0.0),
        (50_000, 0.0),
        (10_000, 0.0),
        (5_000, 0.5),
        (1_000, 0.9),
        (180, 0.98),
        (0, 1.0),
    ],
)
def test_fog_grows_as_visibility_drops_and_is_gone_at_10_km(metres, expected):
    assert mapped(visibility_m=metres).fog == expected


def test_a_negative_visibility_is_nonsense_and_gives_no_fog():
    assert mapped(visibility_m=-5.0).fog == 0.0


def test_fog_is_the_higher_of_what_the_code_says_and_what_was_measured():
    fog_code_but_clear_air = mapped(weather_code=45, visibility_m=50_000)
    clear_code_but_thick_air = mapped(weather_code=0, visibility_m=400)

    assert fog_code_but_clear_air.fog == 1.0
    assert clear_code_but_thick_air.fog == 0.96


@pytest.mark.parametrize(
    ("kmh", "expected"),
    [(0, 0.0), (15, 0.25), (30, 0.5), (60, 1.0), (150, 1.0), (-8, 0.0)],
)
def test_wind_is_the_speed_divided_by_60_and_kept_inside_zero_to_one(kmh, expected):
    assert mapped(wind_speed_kmh=kmh).wind == expected


@pytest.mark.parametrize(("flag", "expected"), [(True, True), (False, False), (None, True)])
def test_is_day_is_passed_on_and_a_missing_value_counts_as_day(flag, expected):
    assert mapped(is_day=flag).is_day is expected


# --- the summary in plain words ---


@pytest.mark.parametrize(
    ("code", "words"),
    [
        (0, "Clear sky"),
        (3, "Overcast"),
        (45, "Fog"),
        (63, "Rain"),
        (73, "Snow"),
        (95, "Thunderstorm"),
    ],
)
def test_the_summary_is_the_plain_name_of_the_weather_code(code, words):
    assert mapped(weather_code=code).summary == words


@pytest.mark.parametrize("code", [None, 4, 42, 100, -1])
def test_a_missing_or_unknown_weather_code_gives_the_unknown_summary(code):
    assert mapped(weather_code=code).summary == UNKNOWN_SUMMARY


@pytest.mark.parametrize(
    ("kmh", "words"),
    [
        (0, "Overcast"),
        (29, "Overcast"),
        (30, "Overcast, windy"),
        (50, "Overcast, windy"),
        (51, "Overcast, very windy"),
        (120, "Overcast, very windy"),
    ],
)
def test_the_summary_adds_a_word_about_strong_wind(kmh, words):
    assert mapped(weather_code=3, wind_speed_kmh=kmh).summary == words


# --- missing and strange input ---


def test_a_reading_with_nothing_in_it_gives_calm_clear_weather_by_day():
    assert map_reading(WeatherReading()) == GameWeather(0.0, 0.0, 0.0, 0.0, True, UNKNOWN_SUMMARY)


def test_numbers_that_are_not_real_numbers_are_ignored():
    # NaN and infinity cannot come from the parser, but the mapping must not trust that.
    result = mapped(
        cloud_cover_percent=math.nan,
        precipitation_mm_per_hour=math.inf,
        visibility_m=math.nan,
        wind_speed_kmh=-math.inf,
    )

    assert result == GameWeather(0.0, 0.0, 0.0, 0.0, True, UNKNOWN_SUMMARY)


@pytest.mark.parametrize(
    "numbers",
    [
        {"cloud_cover_percent": 1e12, "precipitation_mm_per_hour": 1e12, "wind_speed_kmh": 1e12},
        {"cloud_cover_percent": -1e12, "precipitation_mm_per_hour": -1e12, "wind_speed_kmh": -1e12},
        {"visibility_m": -1e12},
        {"visibility_m": 1e12},
        {"weather_code": 99, "precipitation_mm_per_hour": 1e9, "visibility_m": 0},
        {"weather_code": 45, "cloud_cover_percent": 1000, "visibility_m": 0},
    ],
)
def test_extreme_numbers_still_give_values_from_zero_to_one(numbers):
    result = mapped(**numbers)

    assert 0.0 <= result.cloud_cover <= 1.0
    assert 0.0 <= result.rain <= 1.0
    assert 0.0 <= result.fog <= 1.0
    assert 0.0 <= result.wind <= 1.0


@pytest.mark.parametrize(
    ("numbers", "name", "expected"),
    [
        ({"cloud_cover_percent": 33.333}, "cloud_cover", 0.33),
        ({"precipitation_mm_per_hour": 2.5}, "rain", 0.31),  # 2.5 / 8 = 0.3125
        ({"visibility_m": 3333.0}, "fog", 0.67),  # 1 - 0.3333
        ({"wind_speed_kmh": 13.7}, "wind", 0.23),  # 13.7 / 60 = 0.22833...
    ],
)
def test_every_slider_is_rounded_to_two_decimals(numbers, name, expected):
    assert getattr(mapped(**numbers), name) == expected


def test_the_same_reading_always_gives_the_same_answer():
    reading = WeatherReading(63, 90.0, 1.0, 8000.0, 33.0, True)

    assert map_reading(reading) == map_reading(reading)


# --- small helpers ---


@pytest.mark.parametrize(
    ("value", "expected"), [(-5.0, 0.0), (0.0, 0.0), (0.4, 0.4), (1.0, 1.0), (7.0, 1.0)]
)
def test_clamp_unit_keeps_a_number_inside_zero_to_one(value, expected):
    assert clamp_unit(value) == expected


def test_a_time_is_written_as_utc_with_a_z_and_no_fractions_of_a_second():
    moment = datetime(2026, 11, 5, 12, 5, 0, 987654, tzinfo=UTC)

    assert format_utc_time(moment) == "2026-11-05T12:05:00Z"


def test_a_time_in_another_timezone_is_converted_to_utc():
    lisbon_summer = timezone(timedelta(hours=1))

    assert format_utc_time(datetime(2026, 11, 5, 13, 5, tzinfo=lisbon_summer)) == (
        "2026-11-05T12:05:00Z"
    )
