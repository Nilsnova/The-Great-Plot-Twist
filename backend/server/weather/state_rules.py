"""The weather state rules: the numbers behind storm, fog, rain and calm, read from a content file.

The numbers are start values of the design (OPEN-WORLD.md 5.4) and live in
backend/content/weather_states.json, not in code, so the team can tune them without touching
Python. This file reads the file, checks every field and hands out one frozen StateRules.

    stateFrom    the weather values (each from 0 to 1) at which an hour counts as a storm, as fog
                 or as rain. The ORDER (storm, then fog, then rain, otherwise calm) is fixed in
                 states.py, because it is a rule of the design, not a number.
    night        a night runs from `startsHour` to `endsHour` Lisbon time (18 and 6), and takes a
                 state when `hoursForState` of its hours have that state (3)
    fogNightRule the date the harbor's almanac starts to count, one fog night in every three

A mistake in the file is found by the checks below, and the message names the file and the field.
The server does not stop because of it: load_state_rules() logs the problem and returns None, and
then the weather route leaves out `state` and `tonight` and the bulletin answers 503.

Used by: app.py (loads the rules once at start-up), weather/states.py, nights.py, fog_nights.py,
daily/chapter_two_hook.py, routes/weather.py, routes/bulletin.py and the tests.
"""

import logging
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from server.content_fields import (
    ContentError,
    get_date,
    get_number_above_zero,
    get_object,
    get_whole_number,
    read_json_object,
)

logger = logging.getLogger(__name__)

# backend/server/weather/state_rules.py -> parents[2] is backend/
RULES_FILE = Path(__file__).resolve().parents[2] / "content" / "weather_states.json"

# A night must span midnight and must never touch 01:00, the hour in which the Lisbon clocks
# change: it starts between 12:00 and 23:00 and ends between 02:00 and 11:00.
LOWEST_STARTS_HOUR, HIGHEST_STARTS_HOUR = 12, 23
LOWEST_ENDS_HOUR, HIGHEST_ENDS_HOUR = 2, 11
LOWEST_HOURS_FOR_STATE, HIGHEST_HOURS_FOR_STATE = 1, 12


class StateRulesError(ValueError):
    """The rules file has a problem. The message names the file and the field."""


@dataclass(frozen=True)
class StateRules:
    """All the numbers behind the weather states. Frozen, so no code can change them."""

    storm_from_wind: float  # an hour is a storm from this wind (0 to 1)
    fog_from_fog: float  # an hour is fog from this fog (0 to 1)
    rain_from_rain: float  # an hour is rain from this rain (0 to 1)
    night_starts_hour: int  # a night starts at this hour of the day in Lisbon (18)
    night_ends_hour: int  # ... and ends at this hour of the next day (6)
    hours_for_state: int  # a night or daytime takes a state when this many hours have it (3)
    almanac_starts_on: date  # the almanac counts one fog night in three from this date


def rules_from_data(data: dict) -> StateRules:
    """Check the parts of the file and build the rules. Raises ContentError."""
    state_from = get_object(data, "stateFrom")
    night = get_object(data, "night")
    fog_night_rule = get_object(data, "fogNightRule")
    storm = get_object(state_from, "storm", "stateFrom")
    fog = get_object(state_from, "fog", "stateFrom")
    rain = get_object(state_from, "rain", "stateFrom")
    return StateRules(
        storm_from_wind=get_number_above_zero(storm, "wind", "stateFrom.storm", up_to=1),
        fog_from_fog=get_number_above_zero(fog, "fog", "stateFrom.fog", up_to=1),
        rain_from_rain=get_number_above_zero(rain, "rain", "stateFrom.rain", up_to=1),
        night_starts_hour=get_whole_number(
            night, "startsHour", "night", LOWEST_STARTS_HOUR, HIGHEST_STARTS_HOUR
        ),
        night_ends_hour=get_whole_number(
            night, "endsHour", "night", LOWEST_ENDS_HOUR, HIGHEST_ENDS_HOUR
        ),
        hours_for_state=get_whole_number(
            night, "hoursForState", "night", LOWEST_HOURS_FOR_STATE, HIGHEST_HOURS_FOR_STATE
        ),
        almanac_starts_on=get_date(fog_night_rule, "almanacStartsOn", "fogNightRule"),
    )


def read_state_rules(path: Path = RULES_FILE) -> StateRules:
    """Read and check the rules file. Raises StateRulesError if anything is wrong."""
    try:
        return rules_from_data(read_json_object(path))
    except ContentError as error:
        raise StateRulesError(f"{path.name}: {error}") from error


def load_state_rules(path: Path = RULES_FILE) -> StateRules | None:
    """The rules, or None if the file cannot be used (the problem is logged).

    A broken file must not stop the whole API from starting. A test checks that the real file
    loads, so a broken file is caught before it is merged.
    """
    try:
        return read_state_rules(path)
    except StateRulesError as error:
        logger.error("The weather state rules cannot be used: %s", error)
        return None
