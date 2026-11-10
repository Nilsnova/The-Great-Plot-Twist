"""The weather of a new pirate wave: the real weather where the bell was rung, if we can tell.

In this order, the first that works:

    1. the bell-ringer's area   Vercel's geo headers of the request (city level, rounded to 0.1
                                degree by the Keeper's Lock weather, lock/weather.py), only while
                                a reading at most 6 hours old exists. Never stored or logged.
    2. the default place        the place of GET /api/weather (WEATHER_PLACE_NAME in the settings)
    3. calm                     when neither can be read, or the state rules file is missing

The weather never stops a wave: every failure falls through to the next step. Only the resulting
state (storm, fog, rain or calm) and its two numbers are stored with the wave.

Used by: routes/waves.py and the tests.
"""

import logging

from server.adapters.base import CachedSource
from server.island.catalogue import IslandCatalogue, Weather
from server.island.rules import weather_for
from server.lock.place import Place
from server.lock.weather import PlaceWeather
from server.weather.mapping import WeatherReading, map_reading
from server.weather.state_rules import StateRules
from server.weather.states import state_of

logger = logging.getLogger(__name__)


async def local_reading(place_weather: PlaceWeather, place: Place | None) -> WeatherReading | None:
    if place is None:
        return None
    try:
        local = await place_weather.reading(place.latitude, place.longitude)
    except Exception as error:  # the weather must never stop a wave
        logger.warning("Local wave weather unavailable (%s).", type(error).__name__)
        return None
    return None if local is None else local.reading


async def default_reading(source: CachedSource) -> WeatherReading | None:
    try:
        return (await source.get()).data.reading
    except Exception as error:  # the weather must never stop a wave
        logger.warning("Wave weather unavailable (%s); the sea is calm.", type(error).__name__)
        return None


async def wave_weather(
    catalogue: IslandCatalogue,
    source: CachedSource,
    state_rules: StateRules | None,
    place_weather: PlaceWeather,
    place: Place | None,
) -> Weather:
    """What the real weather does to the pirates now. Never raises: calm when it cannot tell."""
    reading = await local_reading(place_weather, place)
    if reading is None:
        reading = await default_reading(source)
    state = None
    if reading is not None and state_rules is not None:
        state = state_of(map_reading(reading), state_rules)
    return weather_for(catalogue, state)
