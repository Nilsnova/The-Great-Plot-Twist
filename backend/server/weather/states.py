"""Weather states: one word for the weather of an hour, and one word for a whole night or day.

The four states and their order come from the design (OPEN-WORLD.md 5.4). If several apply to an
hour, the first of these wins:

    storm   the wind is at least `storm_from_wind` (0.8, which is 48 km/h)
    fog     the fog is at least `fog_from_fog` (0.5, which is a visibility of 5 km or less, or a
            fog weather code)
    rain    the rain is at least `rain_from_rain` (0.4, which is 3.2 mm an hour, or a rain code of
            0.4 or more)
    calm    anything else, also an overcast dry hour: cloud cover never changes the state

The order is a rule and is fixed here. The numbers are content (state_rules.py). The values come
from the same translation the game uses for its sky (mapping.map_reading), so what the player
sees and what the state says always agree.

A whole night, or a daytime, takes the first of storm, fog and rain that covers at least
`hours_for_state` (3) of its known hours; otherwise it is calm. The design names states per hour
only, so this whole-night rule was chosen when it was built (docs/DECISIONS.md, the open-world
entry). With no known hour at all the state is None, which means "no forecast".

Pure functions: no network, no clock, no random numbers.

Used by: weather/nights.py (the state of each night), weather/fog_nights.py, routes/weather.py
(the state now) and the tests.
"""

from collections.abc import Sequence

from server.weather.mapping import GameWeather, WeatherReading, map_reading
from server.weather.state_rules import StateRules

STORM = "storm"
FOG = "fog"
RAIN = "rain"
CALM = "calm"

# Checked in this order for a whole night or daytime. Calm is what is left over.
STRONGEST_FIRST = (STORM, FOG, RAIN)


def state_of(weather: GameWeather, rules: StateRules) -> str:
    """The state of the four game values: storm, fog, rain or calm (in that order)."""
    if weather.wind >= rules.storm_from_wind:
        return STORM
    if weather.fog >= rules.fog_from_fog:
        return FOG
    if weather.rain >= rules.rain_from_rain:
        return RAIN
    return CALM


def hour_state(reading: WeatherReading, rules: StateRules) -> str:
    """The state of one hour of weather, from the numbers Open-Meteo gave for it."""
    return state_of(map_reading(reading), rules)


def period_state(hour_states: Sequence[str], rules: StateRules) -> str | None:
    """The state of a whole night or daytime from the states of its known hours.

    None if no hour is known. Otherwise the first of storm, fog and rain that covers at least
    `rules.hours_for_state` of the hours, and calm if none does.
    """
    if not hour_states:
        return None
    for state in STRONGEST_FIRST:
        if hour_states.count(state) >= rules.hours_for_state:
            return state
    return CALM
