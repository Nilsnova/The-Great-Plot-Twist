"""Tests for weather/state_rules.py and weather/states.py: storm, fog, rain or calm.

The numbers are the start values of the design (OPEN-WORLD.md 5.4): a storm from a wind of 0.8, fog
from a fog of 0.5, rain from a rain of 0.4. The tests that are not about the file use the copy
DESIGN_RULES, so changing a number in backend/content/weather_states.json breaks only the one test
that reads the real file. No network.
"""

import json
import logging
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from server.tests.weather_helpers import (
    DESIGN_RULES,
    load_recorded_file,
    load_sample_answer,
    sample_names,
)
from server.weather.mapping import GameWeather
from server.weather.open_meteo import parse_open_meteo_answer
from server.weather.state_rules import (
    RULES_FILE,
    StateRulesError,
    load_state_rules,
    read_state_rules,
)
from server.weather.states import CALM, FOG, RAIN, STORM, hour_state, period_state, state_of

RULES = DESIGN_RULES


def game(cloud: float = 0.0, rain: float = 0.0, fog: float = 0.0, wind: float = 0.0) -> GameWeather:
    """The game's four values (each from 0 to 1) for a test."""
    return GameWeather(cloud, rain, fog, wind, is_day=True, summary="test")


# --- the real file ---


def test_the_real_state_rules_load_with_the_design_start_values():
    assert read_state_rules() == DESIGN_RULES


def test_the_rules_file_is_inside_backend_so_it_ships_with_the_api():
    assert RULES_FILE.name == "weather_states.json"
    assert RULES_FILE.parent.name == "content"
    assert RULES_FILE.is_file()


# --- one hour: storm, then fog, then rain, otherwise calm ---


def test_a_gale_is_a_storm_even_in_fog_and_rain():
    assert state_of(game(wind=0.8, fog=1.0, rain=1.0), RULES) == STORM


def test_fog_beats_rain():
    assert state_of(game(wind=0.79, fog=0.5, rain=1.0), RULES) == FOG


def test_rain_starts_at_0_4():
    assert state_of(game(rain=0.4), RULES) == RAIN
    assert state_of(game(rain=0.39), RULES) == CALM


def test_fog_starts_at_0_5():
    assert state_of(game(fog=0.5), RULES) == FOG
    assert state_of(game(fog=0.49), RULES) == CALM


def test_a_storm_starts_at_a_wind_of_0_8():
    assert state_of(game(wind=0.8), RULES) == STORM
    assert state_of(game(wind=0.79), RULES) == CALM


def test_just_below_every_threshold_is_calm():
    assert state_of(game(wind=0.79, fog=0.49, rain=0.39), RULES) == CALM


@pytest.mark.parametrize("cloud", [0.0, 0.5, 1.0])
@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({"wind": 0.9}, STORM),
        ({"fog": 0.7}, FOG),
        ({"rain": 0.6}, RAIN),
        ({"rain": 0.1}, CALM),
    ],
)
def test_cloud_cover_never_changes_the_state(cloud, values, expected):
    assert state_of(game(cloud=cloud, **values), RULES) == expected


def test_the_thresholds_come_from_the_rules():
    stricter = replace(RULES, storm_from_wind=0.95, fog_from_fog=0.9, rain_from_rain=0.8)

    assert state_of(game(wind=0.9, fog=0.7, rain=0.6), stricter) == CALM


# The states of the saved samples, worked out with the real mapping (weather/mapping.py).
EXPECTED_SAMPLE_STATES = {
    "clear-sky": CALM,
    "drizzle": CALM,
    "overcast": CALM,
    "partly-cloudy": CALM,
    "snow-showers": CALM,
    "fog": FOG,
    "snow": FOG,
    "rain": RAIN,
    "rain-showers": RAIN,
    "thunderstorm": STORM,
}


@pytest.mark.parametrize("name", sorted(EXPECTED_SAMPLE_STATES))
def test_every_saved_sample_has_its_expected_state(name):
    reading = parse_open_meteo_answer(load_sample_answer(name))

    assert hour_state(reading, RULES) == EXPECTED_SAMPLE_STATES[name]


def test_no_saved_sample_is_forgotten_in_the_table_above():
    assert sorted(EXPECTED_SAMPLE_STATES) == sample_names()


def test_the_recorded_fallback_is_calm():
    reading = parse_open_meteo_answer(load_recorded_file()["answer"])

    assert hour_state(reading, RULES) == CALM


# --- a whole night or daytime: the first state that lasts three hours ---


@pytest.mark.parametrize(
    ("hour_states", "expected"),
    [
        ([RAIN, RAIN, RAIN, CALM, CALM], RAIN),
        ([CALM, CALM, CALM, CALM], CALM),
        ([RAIN, RAIN, CALM, CALM], CALM),  # two hours are not enough
        ([FOG, FOG, CALM, CALM], CALM),
        ([STORM, STORM, CALM, CALM], CALM),
        ([STORM] * 3 + [FOG] * 5 + [RAIN] * 4, STORM),  # the first of storm, fog, rain
        ([FOG] * 3 + [RAIN] * 9, FOG),
        ([STORM] * 2 + [FOG] * 3, FOG),
        ([FOG] * 2 + [RAIN] * 3, RAIN),
        ([RAIN, FOG, RAIN, FOG, RAIN, FOG], FOG),  # three each: fog comes before rain
    ],
)
def test_a_period_takes_the_first_state_that_lasts_three_hours(hour_states, expected):
    assert period_state(hour_states, RULES) == expected


def test_a_period_with_no_known_hour_has_no_state():
    assert period_state([], RULES) is None


def test_the_hours_a_state_needs_come_from_the_rules():
    five_hours = replace(RULES, hours_for_state=5)

    assert period_state([FOG] * 4, five_hours) == CALM
    assert period_state([FOG] * 5, five_hours) == FOG


# --- the loader ---

GOOD_DOCUMENT = {
    "stateFrom": {"storm": {"wind": 0.8}, "fog": {"fog": 0.5}, "rain": {"rain": 0.4}},
    "night": {"startsHour": 18, "endsHour": 6, "hoursForState": 3},
    "fogNightRule": {"almanacStartsOn": "2026-11-16"},
}


def with_value(path: tuple[str, ...], value) -> dict:
    """A copy of the good document with the value at `path` replaced. None removes the field."""
    document = json.loads(json.dumps(GOOD_DOCUMENT))
    parent = document
    for name in path[:-1]:
        parent = parent[name]
    if value is MISSING:
        del parent[path[-1]]
    else:
        parent[path[-1]] = value
    return document


MISSING = object()  # stands for "this field is not in the file"


def write_rules(folder: Path, document) -> Path:
    path = folder / "weather_states.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def test_a_good_file_is_read_into_the_rules(tmp_path):
    rules = read_state_rules(write_rules(tmp_path, GOOD_DOCUMENT))

    assert rules == DESIGN_RULES


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("stateFrom", "storm", "wind"), 1),
        (("stateFrom", "fog", "fog"), 0.01),
        (("night", "startsHour"), 12),
        (("night", "startsHour"), 23),
        (("night", "endsHour"), 2),
        (("night", "endsHour"), 11),
        (("night", "hoursForState"), 1),
        (("night", "hoursForState"), 12),
    ],
)
def test_the_edges_of_every_allowed_range_are_accepted(tmp_path, path, value):
    read_state_rules(write_rules(tmp_path, with_value(path, value)))


def test_extra_fields_are_allowed_so_later_loops_can_add_their_own(tmp_path):
    document = {**GOOD_DOCUMENT, "stormBonus": {"piles": 15}}

    assert read_state_rules(write_rules(tmp_path, document)) == DESIGN_RULES


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("stateFrom", "storm", "wind"), 0),
        (("stateFrom", "storm", "wind"), -0.5),
        (("stateFrom", "storm", "wind"), 1.01),
        (("stateFrom", "storm", "wind"), "0.8"),
        (("stateFrom", "storm", "wind"), True),
        (("stateFrom", "storm", "wind"), MISSING),
        (("stateFrom", "fog", "fog"), 0),
        (("stateFrom", "fog", "fog"), 2),
        (("stateFrom", "rain", "rain"), 0),
        (("stateFrom", "rain", "rain"), None),
        (("stateFrom", "rain"), MISSING),
        (("stateFrom",), MISSING),
        (("night", "startsHour"), 11),
        (("night", "startsHour"), 24),
        (("night", "startsHour"), 18.5),
        (("night", "startsHour"), "18"),
        (("night", "startsHour"), True),
        (("night", "startsHour"), MISSING),
        (("night", "endsHour"), 1),
        (("night", "endsHour"), 12),
        (("night", "endsHour"), MISSING),
        (("night", "hoursForState"), 0),
        (("night", "hoursForState"), 13),
        (("night", "hoursForState"), MISSING),
        (("night",), MISSING),
        (("fogNightRule", "almanacStartsOn"), "2026-02-30"),
        (("fogNightRule", "almanacStartsOn"), "16 Nov 2026"),
        (("fogNightRule", "almanacStartsOn"), "2026-1-5"),
        (("fogNightRule", "almanacStartsOn"), "2026-11-16T00:00"),
        (("fogNightRule", "almanacStartsOn"), 20261116),
        (("fogNightRule", "almanacStartsOn"), None),
        (("fogNightRule", "almanacStartsOn"), MISSING),
        (("fogNightRule",), MISSING),
    ],
)
def test_a_bad_value_is_refused_and_the_message_names_the_file_and_the_field(tmp_path, path, value):
    file = write_rules(tmp_path, with_value(path, value))

    with pytest.raises(StateRulesError) as problem:
        read_state_rules(file)

    assert "weather_states.json" in str(problem.value)
    assert path[-1] in str(problem.value)


def test_a_file_that_is_not_json_is_refused(tmp_path):
    file = tmp_path / "weather_states.json"
    file.write_text("{ not json", encoding="utf-8")

    with pytest.raises(StateRulesError, match="weather_states.json"):
        read_state_rules(file)


def test_a_file_that_holds_a_list_is_refused(tmp_path):
    with pytest.raises(StateRulesError, match="object"):
        read_state_rules(write_rules(tmp_path, [1, 2, 3]))


def test_a_missing_file_is_refused(tmp_path):
    with pytest.raises(StateRulesError, match="weather_states.json"):
        read_state_rules(tmp_path / "weather_states.json")


def test_a_broken_or_missing_rules_file_gives_none_and_a_log_line(tmp_path, caplog):
    broken = write_rules(tmp_path, with_value(("night", "startsHour"), 99))

    with caplog.at_level(logging.ERROR):
        from_broken = load_state_rules(broken)
        from_missing = load_state_rules(tmp_path / "no-such-file" / "weather_states.json")

    assert from_broken is None
    assert from_missing is None
    assert caplog.text.count("weather_states.json") >= 2


def test_a_number_of_hundreds_of_digits_gives_none_and_a_log_line_not_a_crash(tmp_path, caplog):
    # Python's JSON reader accepts such a number. It must not crash create_app() at start-up.
    file = write_rules(tmp_path, with_value(("stateFrom", "storm", "wind"), 10**400))

    with caplog.at_level(logging.ERROR):
        rules = load_state_rules(file)

    assert rules is None
    assert "weather_states.json" in caplog.text
    assert "wind" in caplog.text


def test_the_real_rules_file_loads_without_a_log_line(caplog):
    with caplog.at_level(logging.WARNING):
        rules = load_state_rules()

    assert rules == DESIGN_RULES
    assert caplog.text == ""


def test_the_almanac_start_is_day_1_of_the_game():
    assert RULES.almanac_starts_on == date(2026, 11, 16)
