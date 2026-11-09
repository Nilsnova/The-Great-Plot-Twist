"""Open-Meteo adapter: asks the free Open-Meteo service what the weather is now, and hour by hour.

This is the only file that knows Open-Meteo's address and field names. The rest of the server
sees a Forecast (see below) in our own words and units: a WeatherReading for right now and a
HourReading for each hour (both in mapping.py).

One request does both jobs. "current" gives the weather now, for the four sliders of the game. The
hourly block gives 31 past days and 3 forecast days of hours, in UTC, for the weather states and
the fog nights (weather/states.py, nights.py and fog_nights.py).

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
  * The hourly block (checked on 5 Nov 2026 in the Forecast API docs and on the pricing page,
    https://open-meteo.com/en/pricing):
        past_days       0 to 92 days before today are added to the answer
        forecast_days   0 to 16 days, counting today; the default is 7
        timezone        the default is GMT, and we ask for GMT on purpose, so every hourly time is
                        UTC and the answer says "utc_offset_seconds": 0
        precipitation   in the hourly block this is the SUM OF THE PRECEDING HOUR, which is already
                        millimetres per hour (the "current" value covers 15 minutes instead)
    The block has "time" (for example "2026-11-05T17:00") and one list per variable, all the
    same length.
  * How a request is counted against the limits above (pricing page): a request with more than 10
    variables, or over more than 14 days, counts as more than one call. We ask for 6 current and 4
    hourly variables over 34 days (31 past, 3 forecast), which counts as about 2.4 calls. At one
    request per 10 minutes per server instance that is at most about 350 calls a day per instance,
    far below 10,000.
  * A failed request answers with HTTP 400 and JSON like {"error": true, "reason": "..."}.
  * The data is under the CC BY 4.0 licence. Its licence page names three conditions: give
    appropriate credit (with a link to https://open-meteo.com/ next to every place where the data
    is shown), provide a link to the licence, and indicate if changes were made. The credit link
    alone is not enough. ATTRIBUTION in source.py says how we meet all three.

fetch_current() asks for the "current" block only (the same six variables, no hours). The Keeper's
Lock of the class demo (server/lock/) uses it for the player's own place: one light request per
place and 10 minutes, cached by rounded coordinates in lock/weather.py.

Used by: weather/source.py (the cached source), lock/weather.py and the tests.
"""

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from server.weather.mapping import HourReading, WeatherReading

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

# The hourly variables we ask for. parse_hours reads exactly these. Cloud cover is not among them:
# a weather state never depends on it (weather/states.py).
HOURLY_VARIABLES = ("weather_code", "precipitation", "visibility", "wind_speed_10m")

# How many days of hours we ask for. PAST_DAYS is one more than LOOK_BACK_NIGHTS in
# weather/fog_nights.py: the fog-night rule looks back that many nights, and the night that is
# still going on needs the day before it (a test checks the two numbers together).
PAST_DAYS = 31
# Today, tomorrow and the day after: tonight, tomorrow's daytime and the night after are covered.
FORECAST_DAYS = 3

HOURS_PER_DAY = 24
# An hourly block with more entries than the days we asked for (and two spare days) is odd, so
# parse_hours ignores it. This keeps a strange answer from filling the cache with junk.
MAX_HOURLY_ENTRIES = (PAST_DAYS + FORECAST_DAYS) * HOURS_PER_DAY + 48

# An hourly time outside this range is a broken or hostile answer, not a forecast hour, so
# parse_hours leaves it out. Without the limits an hour in the year 1 would get through, and then
# the date arithmetic in weather/nights.py would run out of calendar (Lisbon's old local-mean-time
# offset even pushes it below the year 1) and the weather route would fail with a 500.
EARLIEST_HOUR = datetime(2000, 1, 1, tzinfo=UTC)
LATEST_HOUR = datetime(9000, 1, 1, tzinfo=UTC)

# A short timeout: the game waits for the answer, and the recorded fallback is always there.
TIMEOUT_SECONDS = 3.0

SECONDS_PER_HOUR = 3600.0


@dataclass(frozen=True)
class Forecast:
    """What one request to Open-Meteo gives us: the weather now and the weather hour by hour."""

    now: WeatherReading
    hours: tuple[HourReading, ...]  # empty when the answer has no usable hourly block


def read_number(value: Any) -> float | None:
    """The value as a number, or None if it is missing or not a usable number."""
    # True and False are numbers in Python (1 and 0), but they are never weather.
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    # Python's JSON reader also accepts a whole number of hundreds of digits, which does not fit a
    # float: float() raises an OverflowError for it, and so would math.isfinite on the number.
    try:
        number = float(value)
    except OverflowError:
        return None
    # Python's JSON reader accepts NaN and Infinity, so check for them here.
    return number if math.isfinite(number) else None


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


def read_hour_time(value: Any) -> datetime | None:
    """An hourly time such as "2026-11-05T17:00" as a UTC time, or None if it cannot be read.

    A time before EARLIEST_HOUR or after LATEST_HOUR is not read either: no forecast has such hours.
    """
    if not isinstance(value, str):
        return None
    try:
        moment = datetime.fromisoformat(value)
        # We asked for GMT, so a time without an offset is UTC already.
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        else:
            moment = moment.astimezone(UTC)
    except (ValueError, OverflowError):  # an odd text, or a time too close to the year 1 or 9999
        return None
    if not EARLIEST_HOUR <= moment <= LATEST_HOUR:
        return None
    return moment


def read_hourly_columns(body: Any) -> dict[str, list[Any]] | None:
    """The hourly block as one list per variable, or None if anything about it is odd.

    Odd means: no block, a variable missing, lists of different lengths, more entries than we
    asked for, or times that are not UTC.
    """
    if not isinstance(body, dict) or read_number(body.get("utc_offset_seconds")) != 0:
        return None
    hourly = body.get("hourly")
    if not isinstance(hourly, dict):
        return None
    names = ("time", *HOURLY_VARIABLES)
    columns = {name: hourly.get(name) for name in names}
    if not all(isinstance(column, list) for column in columns.values()):
        return None
    lengths = {len(column) for column in columns.values()}
    if len(lengths) != 1 or lengths.pop() > MAX_HOURLY_ENTRIES:
        return None
    return columns


def parse_hours(body: Any) -> tuple[HourReading, ...]:
    """Pick the hours out of Open-Meteo's answer. It never raises an error.

    An answer with no hourly block, or an odd one, gives no hours. An hour whose time cannot be
    read (or lies outside EARLIEST_HOUR to LATEST_HOUR), or that has no weather number at all, is
    left out. Hourly precipitation is already millimetres per hour, so it is used as it is.
    """
    columns = read_hourly_columns(body)
    if columns is None:
        return ()
    hours = []
    for position, text in enumerate(columns["time"]):
        reading = WeatherReading(
            weather_code=read_weather_code(columns["weather_code"][position]),
            precipitation_mm_per_hour=read_number(columns["precipitation"][position]),
            visibility_m=read_number(columns["visibility"][position]),
            wind_speed_kmh=read_number(columns["wind_speed_10m"][position]),
        )
        at = read_hour_time(text)
        if at is not None and has_weather(reading):
            hours.append(HourReading(at, reading))
    return tuple(hours)


def parse_forecast(body: Any) -> Forecast:
    """The weather now and the hours. Raises ValueError if the weather now is no use."""
    return Forecast(now=parse_open_meteo_answer(body), hours=parse_hours(body))


async def fetch_forecast(
    latitude: float,
    longitude: float,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Forecast:
    """Ask Open-Meteo for the weather now and the hours. Raises an error if anything fails.

    The source (source.py) catches the error and falls back to older data. Tests pass a fake
    `transport`, so no real network call is made.
    """
    params = {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "current": ",".join(CURRENT_VARIABLES),
        "hourly": ",".join(HOURLY_VARIABLES),
        "past_days": str(PAST_DAYS),
        "forecast_days": str(FORECAST_DAYS),
        "timezone": "GMT",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    async with httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
    response.raise_for_status()
    return parse_forecast(response.json())


async def fetch_current(
    latitude: float,
    longitude: float,
    transport: httpx.AsyncBaseTransport | None = None,
) -> WeatherReading:
    """Ask Open-Meteo for the weather now only, without hours. Raises an error if anything fails.

    Counts as one call against Open-Meteo's limits (6 variables, 1 day).
    """
    params = {
        "latitude": str(latitude),
        "longitude": str(longitude),
        "current": ",".join(CURRENT_VARIABLES),
        "forecast_days": "1",
        "timezone": "GMT",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    async with httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
    response.raise_for_status()
    return parse_open_meteo_answer(response.json())
