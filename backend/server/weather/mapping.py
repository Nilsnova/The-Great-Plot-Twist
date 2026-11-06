"""Weather mapping: turns real weather numbers into the four values the game draws.

The game (setWeather in frontend/src/world/weather.js) draws the sky from four sliders, each
from 0 to 1:

    cloudCover   0 = clear sky      1 = solid grey sky
    rain         0 = dry            1 = pouring
    fog          0 = clear air      1 = thick fog
    wind         0 = calm           1 = a gale

This file is the translator. It takes a WeatherReading (plain numbers about the weather right
now) and returns a GameWeather. It is pure arithmetic: no network, no clock, no random numbers.
So a test can give it any numbers and know exactly what comes out.

The rules, in plain words:
  * cloudCover  The measured cloud cover in percent, divided by 100. If it was not measured, the
                typical cloud cover for the weather code (see WEATHER_CODES).
  * rain        The HIGHER of two guesses: what the weather code says (drizzle is a little,
                a thunderstorm is a lot) and the measured precipitation (8 mm an hour counts as
                full rain). We trust whichever says more, because a measurement can miss a
                shower that the code knows about, and a code can miss a short downpour.
  * fog         The HIGHER of two guesses again: the weather code (fog is full fog) and the
                visibility (10 km or more is clear air, and the less you can see, the more fog).
  * wind        The wind speed divided by 60 km/h. A near gale counts as full wind.
  * A number that is missing, or not a real number, counts as "not measured": it adds nothing.
  * Every answer is kept inside 0 to 1 and rounded to 2 decimals.

The game has no snow yet, so falling snow shows as falling rain (a little lighter). Change that
when snow art exists.

The numbers in the table and the three constants below (8 mm, 10 km, 60 km/h) are OUR choices
for how the game should look. They are not measurements. Change them freely, and change the
matching tests in backend/server/tests/test_weather_mapping.py in the same pull request.

Used by: routes/weather.py (builds the API answer), weather/open_meteo.py (the WeatherReading
and HourReading types), weather/states.py (the state of an hour is worked out from the same four
values) and the tests.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime

FULL_CLOUD_PERCENT = 100.0  # cloud cover is already a percent: 100 % is a solid sky
FULL_RAIN_MM_PER_HOUR = 8.0  # 8 mm in an hour is heavy rain: the game's full rain
CLEAR_VISIBILITY_M = 10_000.0  # from 10 km you see far enough that there is no fog
FULL_WIND_KMH = 60.0  # 60 km/h is a near gale (Beaufort 7): the game's full wind

# From this wind value on, the summary says "windy" or "very windy" (30 and 51 km/h).
WINDY = 0.5
VERY_WINDY = 0.85

DECIMALS = 2  # answers are rounded to this many decimals, so 13.7 km/h gives 0.23, not 0.2283333

UNKNOWN_SUMMARY = "Conditions unknown"


@dataclass(frozen=True)
class WeatherReading:
    """The weather right now, as plain numbers. None means "not measured".

    The units are in the names, so nobody has to guess. weather_code is the WMO code that
    weather services use (0 clear sky, 63 rain, 95 thunderstorm, ...). The reading is made by
    weather/open_meteo.py and never changes after that.
    """

    weather_code: int | None = None
    cloud_cover_percent: float | None = None
    precipitation_mm_per_hour: float | None = None
    visibility_m: float | None = None
    wind_speed_kmh: float | None = None
    is_day: bool | None = None


@dataclass(frozen=True)
class HourReading:
    """The weather during one hour of the forecast: the start of the hour and its numbers.

    `at` is the start of the hour, in UTC. The reading holds the same kind of numbers as the
    weather right now, but an hourly forecast has no cloud cover and no day or night flag, so
    those two stay None.
    """

    at: datetime
    reading: WeatherReading


@dataclass(frozen=True)
class GameWeather:
    """What the game needs: four sliders from 0 to 1, day or night, and a summary in words."""

    cloud_cover: float
    rain: float
    fog: float
    wind: float
    is_day: bool
    summary: str


@dataclass(frozen=True)
class CodeLook:
    """What one weather code looks like in the game: its words and its typical values."""

    summary: str
    cloud_cover: float  # used only when the cloud cover was not measured
    rain: float
    fog: float


# Open-Meteo's weather codes, checked in its docs on 5 Nov 2026 (https://open-meteo.com/en/docs).
# They are the standard WMO codes. Each family below is a group of codes that belong together,
# from light to heavy. Codes 96 and 99 come only from models with a hail forecast, and the other
# models report 95 and 97, so all four are here.
WEATHER_CODES = {
    # The sky, with nothing falling.
    0: CodeLook("Clear sky", cloud_cover=0.0, rain=0.0, fog=0.0),
    1: CodeLook("Mostly clear", cloud_cover=0.15, rain=0.0, fog=0.0),
    2: CodeLook("Partly cloudy", cloud_cover=0.5, rain=0.0, fog=0.0),
    3: CodeLook("Overcast", cloud_cover=0.9, rain=0.0, fog=0.0),
    # Fog. In the game any fog is full fog.
    45: CodeLook("Fog", cloud_cover=0.9, rain=0.0, fog=1.0),
    48: CodeLook("Freezing fog", cloud_cover=0.9, rain=0.0, fog=1.0),
    # Drizzle: very fine rain.
    51: CodeLook("Light drizzle", cloud_cover=0.9, rain=0.15, fog=0.0),
    53: CodeLook("Drizzle", cloud_cover=0.95, rain=0.25, fog=0.0),
    55: CodeLook("Heavy drizzle", cloud_cover=1.0, rain=0.35, fog=0.0),
    56: CodeLook("Light freezing drizzle", cloud_cover=0.9, rain=0.2, fog=0.0),
    57: CodeLook("Heavy freezing drizzle", cloud_cover=1.0, rain=0.35, fog=0.0),
    # Rain.
    61: CodeLook("Light rain", cloud_cover=0.9, rain=0.35, fog=0.0),
    63: CodeLook("Rain", cloud_cover=0.95, rain=0.6, fog=0.0),
    65: CodeLook("Heavy rain", cloud_cover=1.0, rain=0.85, fog=0.0),
    66: CodeLook("Light freezing rain", cloud_cover=0.9, rain=0.4, fog=0.0),
    67: CodeLook("Heavy freezing rain", cloud_cover=1.0, rain=0.85, fog=0.0),
    # Snow. The game shows it as falling rain, a little lighter.
    71: CodeLook("Light snow", cloud_cover=0.9, rain=0.25, fog=0.0),
    73: CodeLook("Snow", cloud_cover=0.95, rain=0.45, fog=0.0),
    75: CodeLook("Heavy snow", cloud_cover=1.0, rain=0.7, fog=0.0),
    77: CodeLook("Snow grains", cloud_cover=0.9, rain=0.25, fog=0.0),
    # Rain showers: short downpours between brighter spells.
    80: CodeLook("Light rain showers", cloud_cover=0.7, rain=0.4, fog=0.0),
    81: CodeLook("Rain showers", cloud_cover=0.8, rain=0.65, fog=0.0),
    82: CodeLook("Violent rain showers", cloud_cover=0.9, rain=1.0, fog=0.0),
    # Snow showers.
    85: CodeLook("Light snow showers", cloud_cover=0.7, rain=0.35, fog=0.0),
    86: CodeLook("Heavy snow showers", cloud_cover=0.85, rain=0.65, fog=0.0),
    # Thunderstorms.
    95: CodeLook("Thunderstorm", cloud_cover=1.0, rain=0.85, fog=0.0),
    96: CodeLook("Thunderstorm with hail", cloud_cover=1.0, rain=0.9, fog=0.0),
    97: CodeLook("Heavy thunderstorm", cloud_cover=1.0, rain=0.95, fog=0.0),
    99: CodeLook("Thunderstorm with heavy hail", cloud_cover=1.0, rain=1.0, fog=0.0),
}

# What we use for a weather code that is missing or that we do not know: it adds nothing.
UNKNOWN_LOOK = CodeLook(UNKNOWN_SUMMARY, cloud_cover=0.0, rain=0.0, fog=0.0)


def clamp_unit(value: float) -> float:
    """Squeeze a number into the range 0 to 1."""
    return min(1.0, max(0.0, value))


def is_usable_number(value: float | None) -> bool:
    """True for a real number. False for None, NaN ("not a number") and infinity."""
    return value is not None and math.isfinite(value)


def fraction(value: float | None, full: float) -> float:
    """How far `value` is towards `full`, from 0 to 1. A missing number gives 0."""
    if not is_usable_number(value):
        return 0.0
    return clamp_unit(value / full)


def fog_from_visibility(visibility_m: float | None) -> float:
    """From 0 (you can see 10 km or more) to 1 (you can see nothing). Missing gives 0."""
    # A visibility below 0 is nonsense. Ignore it instead of turning it into thick fog.
    if not is_usable_number(visibility_m) or visibility_m < 0:
        return 0.0
    return 1.0 - fraction(visibility_m, CLEAR_VISIBILITY_M)


def look_up_code(weather_code: int | None) -> CodeLook:
    """The table row for a weather code, or UNKNOWN_LOOK if it is missing or not in the table."""
    if weather_code is None:
        return UNKNOWN_LOOK
    return WEATHER_CODES.get(weather_code, UNKNOWN_LOOK)


def choose_cloud_cover(reading: WeatherReading, look: CodeLook) -> float:
    """The measured cloud cover, or the typical one for the weather code if it is missing."""
    if is_usable_number(reading.cloud_cover_percent):
        return fraction(reading.cloud_cover_percent, FULL_CLOUD_PERCENT)
    return look.cloud_cover


def write_summary(look: CodeLook, wind: float) -> str:
    """The weather in plain words, plus a word about the wind when it is strong."""
    if wind >= VERY_WINDY:
        return f"{look.summary}, very windy"
    if wind >= WINDY:
        return f"{look.summary}, windy"
    return look.summary


def map_reading(reading: WeatherReading) -> GameWeather:
    """Turn the weather right now into the game's weather. Every slider is from 0 to 1."""
    look = look_up_code(reading.weather_code)
    cloud_cover = choose_cloud_cover(reading, look)
    rain = max(look.rain, fraction(reading.precipitation_mm_per_hour, FULL_RAIN_MM_PER_HOUR))
    fog = max(look.fog, fog_from_visibility(reading.visibility_m))
    wind = round(fraction(reading.wind_speed_kmh, FULL_WIND_KMH), DECIMALS)
    return GameWeather(
        cloud_cover=round(cloud_cover, DECIMALS),
        rain=round(rain, DECIMALS),
        fog=round(fog, DECIMALS),
        wind=wind,
        is_day=True if reading.is_day is None else reading.is_day,
        summary=write_summary(look, wind),
    )


def format_utc_time(moment: datetime) -> str:
    """A time as the API writes it: UTC, whole seconds, a Z at the end (2026-11-05T12:05:00Z)."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
