"""The player's place for the Keeper's Lock. Worked out per request and never stored.

In this order, the first that works:

    1. chosen    the place the player picked with "Change place" (the browser keeps it and sends
                 it with the request: name, latitude, longitude)
    2. ip        Vercel's geo headers for the visitor's IP address, city level:
                     x-vercel-ip-city        the city name, URL-encoded ("S%C3%A3o%20Paulo")
                     x-vercel-ip-latitude    degrees, for example 38.7167
                     x-vercel-ip-longitude   degrees, for example -9.1333
                 Vercel adds them on its own network; a request that did not pass Vercel has none.
                 The coordinates must both be readable; a missing or odd city name becomes
                 "your area". (Checked on 9 Nov 2026 in Vercel's request-headers documentation,
                 https://vercel.com/docs/headers/request-headers: the city's non-ASCII characters
                 are encoded according to RFC 3986.) A visitor can send these headers by hand;
                 that only changes their own question, never another player's.
    3. default   the weather place of the settings (WEATHER_PLACE_NAME, WEATHER_LATITUDE,
                 WEATHER_LONGITUDE)

Nothing here is written to the database or a log. The routes send the place back to the same player
only, with "Cache-Control: private, no-store".

Used by: routes/lock.py and the tests.
"""

import math
from dataclasses import dataclass
from typing import Literal
from urllib.parse import unquote

from starlette.datastructures import Headers

from server.settings import Settings

PlaceSource = Literal["ip", "chosen", "default"]

MAX_NAME_LENGTH = 60
UNKNOWN_CITY = "your area"

CITY_HEADER = "x-vercel-ip-city"
LATITUDE_HEADER = "x-vercel-ip-latitude"
LONGITUDE_HEADER = "x-vercel-ip-longitude"


@dataclass(frozen=True)
class Place:
    name: str
    latitude: float
    longitude: float
    source: PlaceSource


def clean_name(text: str | None) -> str | None:
    """A place name fit for the screen, or None. No control characters, at most 60 characters."""
    if text is None or not text.isprintable():  # line breaks, tabs and other control characters
        return None
    name = " ".join(text.split())
    if not name or len(name) > MAX_NAME_LENGTH:
        return None
    return name


def read_degrees(text: str | None, limit: float) -> float | None:
    """A coordinate from -limit to +limit, or None."""
    if text is None:
        return None
    try:
        value = float(text.strip())
    except ValueError:
        return None
    if not math.isfinite(value) or abs(value) > limit:
        return None
    return value


def place_from_headers(headers: Headers) -> Place | None:
    """The place from Vercel's geo headers, or None when the coordinates are missing or odd."""
    latitude = read_degrees(headers.get(LATITUDE_HEADER), 90)
    longitude = read_degrees(headers.get(LONGITUDE_HEADER), 180)
    if latitude is None or longitude is None:
        return None
    city = headers.get(CITY_HEADER)
    try:
        name = clean_name(unquote(city, errors="strict")) if city is not None else None
    except UnicodeDecodeError:
        name = None
    return Place(name or UNKNOWN_CITY, latitude, longitude, "ip")


def default_place(settings: Settings) -> Place:
    return Place(
        settings.weather_place_name,
        settings.weather_latitude,
        settings.weather_longitude,
        "default",
    )


def find_place(chosen: Place | None, headers: Headers, settings: Settings) -> Place:
    """The player's place: chosen, else the IP headers, else the default."""
    if chosen is not None:
        return chosen
    return place_from_headers(headers) or default_place(settings)
