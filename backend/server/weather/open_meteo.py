"""Open-Meteo adapter: asks the free Open-Meteo service what the weather is right now.

This is the only file that knows Open-Meteo's address and field names. The rest of the server
sees a WeatherReading (see mapping.py) in our own words and units.

What was checked in Open-Meteo's official documentation on 5 Nov 2026. Look the pages up again
(and change the date here) before you change what this file asks for:
  * Forecast API:  https://open-meteo.com/en/docs
  * Terms, limits: https://open-meteo.com/en/terms
  * Licence:       https://open-meteo.com/en/licence
The facts we rely on:
  * The address is https://api.open-meteo.com/v1/forecast. The free service needs no key and no
    login. It is for non-commercial use, and their terms name "use in educational content" as an
    example, so a student project qualifies. The limits are 600 calls a minute, 5,000 an hour and
    10,000 a day, counted per IP address and application. We call it at most once per 10 minutes
    per server instance. The terms also warn that hosts such as Vercel share IP addresses, so
    we may be limited earlier than expected. Then Open-Meteo answers HTTP 429, the call counts
    as failed, and the source uses older or recorded data (it says so in `source`).
  * "current" asks for the weather now. It is built from 15-minute model data, and every
    hourly variable can be asked for as "current".
  * The "current" block of the answer has "time" and "interval" (the seconds that sums such as
    precipitation cover: 900 for 15 minutes) and one number per variable we ask for:
        weather_code    the WMO weather code (0 clear sky ... 99 thunderstorm with heavy hail)
        cloud_cover     percent, 0 to 100
        precipitation   millimetres that fell during the last `interval` seconds
        visibility      metres
        wind_speed_10m  km/h (we also ask for kmh explicitly)
        is_day          1 by day, 0 by night
  * A failed request answers with HTTP 400 and JSON like {"error": true, "reason": "..."}.
  * The data is under the CC BY 4.0 licence. Its licence page names three conditions: give
    appropriate credit (with a link to https://open-meteo.com/ next to every place where the data
    is shown), provide a link to the licence, and indicate if changes were made. The credit link
    alone is not enough. ATTRIBUTION in source.py says how we meet all three.

Used by: weather/source.py (the cached source) and the tests.
"""

import math
from typing import Any

import httpx

from server.weather.mapping import WeatherReading

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# The variables we ask for. parse_open_meteo_answer reads exactly these.
CURRENT_VARIABLES = (
    "weather_code",
    "cloud_cover",
    "precipitation",
    "visibility",
    "wind_speed_10m",
    "is_day",
)

# A short timeout: the game waits for the answer, and the recorded fallback is always there.
TIMEOUT_SECONDS = 3.0

SECONDS_PER_HOUR = 3600.0


def read_number(value: Any) -> float | None:
    """The value as a number, or None if it is missing or not a usable number."""
    # True and False are numbers in Python (1 and 0), but they are never weather.
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    # Python's JSON reader accepts NaN and Infinity, so check for them here.
    if not math.isfinite(value):
        return None
    return float(value)


def read_weather_code(value: Any) -> int | None:
    """The weather code as a whole number, or None."""
    number = read_number(value)
    if number is None or not number.is_integer():
        return None
    return int(number)


def read_is_day(value: Any) -> bool | None:
    """True for 1, False for 0, None for anything else."""
    number = read_number(value)
    if number == 1:
        return True
    if number == 0:
        return False
    return None


def read_precipitation_per_hour(current: dict[str, Any]) -> float | None:
    """The precipitation in millimetres per hour, or None.

    Open-Meteo reports the millimetres that fell during the last `interval` seconds (900 for
    "current"), so 0.5 mm in 900 seconds is 2 mm per hour. Without a usable interval we assume
    the number already covers one hour.
    """
    millimetres = read_number(current.get("precipitation"))
    if millimetres is None:
        return None
    seconds = read_number(current.get("interval"))
    if seconds is None or seconds <= 0:
        seconds = SECONDS_PER_HOUR
    return millimetres * SECONDS_PER_HOUR / seconds


def has_weather(reading: WeatherReading) -> bool:
    """True if at least one real weather number was found. is_day alone is not weather."""
    numbers = (
        reading.weather_code,
        reading.cloud_cover_percent,
        reading.precipitation_mm_per_hour,
        reading.visibility_m,
        reading.wind_speed_kmh,
    )
    return any(number is not None for number in numbers)


def parse_open_meteo_answer(body: Any) -> WeatherReading:
    """Pick the numbers we need out of Open-Meteo's JSON answer.

    A missing or odd number becomes None. An answer with no "current" block, or with no usable
    weather number in it, raises ValueError: it is no use, so the source treats it as a failed
    call and uses older data instead.
    """
    current = body.get("current") if isinstance(body, dict) else None
    if not isinstance(current, dict):
        raise ValueError("The Open-Meteo answer has no 'current' weather block.")
    reading = WeatherReading(
        weather_code=read_weather_code(current.get("weather_code")),
        cloud_cover_percent=read_number(current.get("cloud_cover")),
        precipitation_mm_per_hour=read_precipitation_per_hour(current),
        visibility_m=read_number(current.get("visibility")),
        wind_speed_kmh=read_number(current.get("wind_speed_10m")),
        is_day=read_is_day(current.get("is_day")),
    )
    if not has_weather(reading):
        raise ValueError("The Open-Meteo answer has no usable weather numbers in it.")
    return reading


async def fetch_reading(
    latitude: float,
    longitude: float,
    transport: httpx.AsyncBaseTransport | None = None,
) -> WeatherReading:
    """Ask Open-Meteo for the weather now at this place. Raises an error if anything fails.

    The source (source.py) catches the error and falls back to older data. Tests pass a fake
    `transport`, so no real network call is made.
    """
    params = {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "current": ",".join(CURRENT_VARIABLES),
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    async with httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
    response.raise_for_status()
    return parse_open_meteo_answer(response.json())
