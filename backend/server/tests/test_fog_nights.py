"""Tests for weather/fog_nights.py: the fog-night rule.

The rule, word for word from the design (OPEN-WORLD.md 5.4): "A night is a fog night if the night is
in the fog state, or if neither of the last two nights was a fog night." So there is a fog night at
least every third night, and the false-light teaser never stalls in a sunny week. A fog night is
"real" when the weather made it and "almanac" when only the rule did.

Before Day 1 (16 Nov 2026) and for the two nights before the look-back window, the rule assumes the
almanac's pattern: one fog night in every three, counted from Day 1. No network and no real clock.
"""

import random
from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from itertools import groupby

import pytest

from server.tests.weather_helpers import CLEAR_HOUR, DESIGN_RULES, FOGGY_HOUR, hour_readings
from server.weather.fog_nights import (
    ALMANAC,
    LOOK_BACK_NIGHTS,
    REAL,
    FogNight,
    apply_fog_night_rule,
    is_almanac_night,
    tonight_fog_night,
)
from server.weather.nights import states_by_night
from server.weather.open_meteo import PAST_DAYS
from server.weather.states import FOG

RULES = DESIGN_RULES
DAY_ONE = date(2026, 11, 16)  # the almanac starts here, and 16 Nov 2026 is a Monday
ONE_DAY = timedelta(days=1)

# Eight nights in a row that start before Day 1, so the almanac pattern before Day 1 is part of the
# test. There are three possible first nights. They differ in the two nights before them, which are
# the seeds of the rule: before 10 Nov neither was an almanac night, before 11 Nov the night just
# before was, and before 12 Nov the night two before was. A rule that mixes up its two seeds can
# only be caught by the last two.
FIRST_NIGHTS = [date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12)]
NIGHTS_IN_A_PATTERN = 8


def pattern_nights(first_night: date) -> list[date]:
    """The eight nights in a row, starting with `first_night`."""
    return [first_night + ONE_DAY * step for step in range(NIGHTS_IN_A_PATTERN)]


def real_fog_from_pattern(first_night: date, pattern: int) -> dict[date, bool]:
    """Which of the eight nights have real fog. Bit 0 of `pattern` is the first night."""
    nights = pattern_nights(first_night)
    return {night: bool((pattern >> step) & 1) for step, night in enumerate(nights)}


def longest_run_without_fog(verdicts: list[bool]) -> int:
    """The most nights in a row that were not fog nights."""
    runs = [len(list(group)) for is_fog, group in groupby(verdicts) if not is_fog]
    return max(runs, default=0)


def wrong_kinds(results: list[FogNight], real_fog: Mapping[date, bool]) -> list[date]:
    """The nights whose kind is wrong: REAL for real fog, ALMANAC for the rule alone, else None."""
    wrong = []
    for result in results:
        if real_fog.get(result.night, False):
            expected = REAL
        elif result.is_fog_night:
            expected = ALMANAC
        else:
            expected = None
        if result.kind != expected:
            wrong.append(result.night)
    return wrong


def rule_breaks(
    results: list[FogNight], real_fog: Mapping[date, bool], first_night: date
) -> list[date]:
    """The nights whose verdict is not what the rule says, given the almanac nights before them."""
    verdicts = [is_almanac_night(first_night - ONE_DAY * back, DAY_ONE) for back in (2, 1)]
    breaks = []
    for result in results:
        by_the_rule = real_fog.get(result.night, False) or not any(verdicts[-2:])
        if result.is_fog_night != by_the_rule:
            breaks.append(result.night)
        verdicts.append(result.is_fog_night)
    return breaks


# --- the rule over eight nights: every pattern of real fog ---


@pytest.mark.parametrize("first_night", FIRST_NIGHTS, ids=str)
@pytest.mark.parametrize("pattern", range(256))
def test_fog_night_at_least_every_third_night(first_night, pattern):
    real_fog = real_fog_from_pattern(first_night, pattern)

    results = apply_fog_night_rule(pattern_nights(first_night), real_fog, DAY_ONE)

    assert longest_run_without_fog([result.is_fog_night for result in results]) <= 2


@pytest.mark.parametrize("first_night", FIRST_NIGHTS, ids=str)
@pytest.mark.parametrize("pattern", range(256))
def test_every_night_follows_the_rule_exactly(first_night, pattern):
    real_fog = real_fog_from_pattern(first_night, pattern)

    results = apply_fog_night_rule(pattern_nights(first_night), real_fog, DAY_ONE)

    assert [result.night for result in results] == pattern_nights(first_night)
    assert rule_breaks(results, real_fog, first_night) == []


@pytest.mark.parametrize("first_night", FIRST_NIGHTS, ids=str)
@pytest.mark.parametrize("pattern", range(256))
def test_the_kind_says_real_for_real_fog_and_almanac_for_the_rest(first_night, pattern):
    real_fog = real_fog_from_pattern(first_night, pattern)

    results = apply_fog_night_rule(pattern_nights(first_night), real_fog, DAY_ONE)

    assert wrong_kinds(results, real_fog) == []


# --- the pieces of the rule ---


def test_the_two_kinds_are_called_real_and_almanac():
    assert (REAL, ALMANAC) == ("real", "almanac")


def test_a_real_fog_night_says_real_even_when_the_almanac_also_calls_it():
    results = apply_fog_night_rule([DAY_ONE], {DAY_ONE: True}, DAY_ONE)

    assert results == [FogNight(DAY_ONE, True, REAL)]


def test_a_night_the_rule_calls_without_real_fog_says_almanac():
    results = apply_fog_night_rule([DAY_ONE], {}, DAY_ONE)

    assert results == [FogNight(DAY_ONE, True, ALMANAC)]


def test_a_night_that_is_neither_has_no_kind():
    # 17 Nov has no real fog, and 16 Nov (an almanac night) was a fog night a night ago.
    results = apply_fog_night_rule([DAY_ONE, DAY_ONE + ONE_DAY], {}, DAY_ONE)

    assert results[1] == FogNight(DAY_ONE + ONE_DAY, False, None)


def test_with_no_real_fog_the_fog_nights_are_the_almanac_nights():
    nights = [DAY_ONE + ONE_DAY * step for step in range(15)]  # 16 to 30 Nov

    results = apply_fog_night_rule(nights, {}, DAY_ONE)

    fog_nights = [result.night for result in results if result.is_fog_night]
    assert fog_nights == [date(2026, 11, day) for day in (16, 19, 22, 25, 28)]
    assert {result.kind for result in results if result.is_fog_night} == {ALMANAC}


@pytest.mark.parametrize(
    ("night", "expected"),
    [
        (date(2026, 11, 16), True),
        (date(2026, 11, 19), True),
        (date(2026, 11, 17), False),
        (date(2026, 11, 18), False),
        (date(2026, 11, 13), True),  # before Day 1 the pattern holds too
        (date(2026, 11, 7), True),
        (date(2026, 11, 4), True),
        (date(2026, 11, 1), True),
        (date(2026, 11, 5), False),
        (date(2026, 11, 6), False),
    ],
)
def test_the_almanac_counts_backwards_too(night, expected):
    assert is_almanac_night(night, DAY_ONE) is expected


def test_two_clear_nights_after_real_fog_are_not_fog_nights_and_the_third_is():
    nights = [date(2026, 11, day) for day in range(17, 21)]  # 17 to 20 Nov
    real_fog = {date(2026, 11, 17): True}

    results = apply_fog_night_rule(nights, real_fog, DAY_ONE)

    assert [(r.is_fog_night, r.kind) for r in results] == [
        (True, REAL),
        (False, None),
        (False, None),
        (True, ALMANAC),
    ]


def test_a_night_without_data_counts_as_no_real_fog():
    nights = [DAY_ONE + ONE_DAY * step for step in range(10)]
    no_fog_at_all = {night: False for night in nights}

    without_data = apply_fog_night_rule(nights, {}, DAY_ONE)
    with_clear_nights = apply_fog_night_rule(nights, no_fog_at_all, DAY_ONE)

    assert without_data == with_clear_nights


def test_no_nights_give_no_results():
    assert apply_fog_night_rule([], {}, DAY_ONE) == []


# --- tonight: the rule over the look-back window ---


def noon(day: date) -> datetime:
    """Noon UTC on that date: in winter it is noon in Lisbon too, so "tonight" is that date."""
    return datetime(day.year, day.month, day.day, 12, 0, tzinfo=UTC)


def verdict(day: date, states: Mapping[date, str]) -> FogNight:
    return tonight_fog_night(noon(day), states, RULES)


def test_the_look_back_is_a_multiple_of_three():
    # With a multiple of three the nights shown one after another can never have three non-fog
    # nights in a row (test_one_lonely_real_fog_night_never_makes_the_shown_nights_stall tries it).
    # With 3k+1 the gap can reach 3, with 3k+2 it is 4.
    assert LOOK_BACK_NIGHTS % 3 == 0
    assert LOOK_BACK_NIGHTS == 30


def test_open_meteo_is_asked_for_one_more_day_than_the_look_back():
    assert PAST_DAYS == LOOK_BACK_NIGHTS + 1


def test_with_no_real_fog_tonight_is_an_almanac_night_or_not():
    assert verdict(date(2026, 11, 16), {}) == FogNight(date(2026, 11, 16), True, ALMANAC)
    assert verdict(date(2026, 11, 17), {}) == FogNight(date(2026, 11, 17), False, None)
    assert verdict(date(2026, 11, 19), {}) == FogNight(date(2026, 11, 19), True, ALMANAC)


def test_real_fog_tonight_is_a_real_fog_night():
    states = {date(2026, 11, 17): FOG}

    assert verdict(date(2026, 11, 17), states) == FogNight(date(2026, 11, 17), True, REAL)


def test_real_fog_last_night_makes_two_clear_nights_before_the_next_fog_night():
    states = {date(2026, 11, 17): FOG}

    nights = [verdict(date(2026, 11, day), states) for day in (18, 19, 20)]

    assert [night.is_fog_night for night in nights] == [False, False, True]


@pytest.mark.parametrize(
    ("night", "state"),
    [
        (date(2026, 11, 17), "rain"),
        (date(2026, 11, 17), "calm"),
        (date(2026, 11, 18), "storm"),
    ],
)
def test_the_state_of_a_night_that_is_not_fog_does_not_count_as_real_fog(night, state):
    # 17 and 18 Nov are not almanac nights, so only real fog could make them fog nights.
    assert verdict(night, {night: state}).kind is None


# The example of the spec: real fog only on 17 Nov, every other night is clear.
THE_17_NOV_EXAMPLE = {date(2026, 11, 17): FOG}


@pytest.mark.parametrize(
    ("evening", "is_fog_night"),
    [
        (date(2026, 11, 16), True),  # the almanac (Day 1)
        (date(2026, 11, 17), True),  # the real fog
        (date(2026, 11, 18), False),
        (date(2026, 11, 19), False),
        (date(2026, 11, 20), True),  # two clear nights, then a fog night, and so on every third
        (date(2026, 11, 23), True),
        (date(2026, 12, 14), True),
        (date(2026, 12, 15), False),
        (date(2026, 12, 16), False),
        (date(2026, 12, 17), True),  # the last night that sees the real fog of 17 Nov
        (date(2026, 12, 18), False),
        (date(2026, 12, 19), True),  # one night earlier than the rule without a limit (20 Dec)
        (date(2026, 12, 20), False),
        (date(2026, 12, 21), False),
        (date(2026, 12, 22), True),
    ],
)
def test_a_month_after_the_last_real_fog_the_almanac_pattern_takes_over(evening, is_fog_night):
    assert verdict(evening, THE_17_NOV_EXAMPLE).is_fog_night is is_fog_night


def test_the_fog_nights_of_the_example_are_almanac_nights_after_the_real_one():
    kinds = [verdict(date(2026, 11, day), THE_17_NOV_EXAMPLE).kind for day in (16, 17, 20, 23)]

    assert kinds == [ALMANAC, REAL, ALMANAC, ALMANAC]


def random_real_fog(chance: float) -> dict[date, str]:
    """Real fog on a fixed random choice of nights from 16 Oct 2026 on (always the same)."""
    rng = random.Random(42)
    nights = [date(2026, 10, 16) + ONE_DAY * step for step in range(160)]
    return {night: FOG for night in nights if rng.random() < chance}


def shown_verdicts(states: Mapping[date, str]) -> list[bool]:
    """What the game shows on 120 evenings in a row (16 Nov 2026 to 15 Mar 2027)."""
    return [verdict(DAY_ONE + ONE_DAY * step, states).is_fog_night for step in range(120)]


@pytest.mark.parametrize("chance", [0.0, 0.03, 0.1, 0.3, 0.7])
def test_the_shown_fog_nights_never_stall_as_the_nights_go_by(chance):
    # One verdict per evening, each from its own look-back window. Whatever the weather did, two
    # nights in a row without a fog night are always followed by a fog night. Random weather has
    # no power against a wrong look-back: this test passes for 29 or 31 nights as well. The test
    # below is the one that guards the length of the look-back.
    verdicts = shown_verdicts(random_real_fog(chance))

    assert longest_run_without_fog(verdicts) <= 2


@pytest.mark.parametrize("fog_on", [date(2026, 11, 16), date(2026, 11, 17), date(2026, 11, 18)])
def test_one_lonely_real_fog_night_never_makes_the_shown_nights_stall(fog_on):
    # The three dates are the three places of the almanac's cycle: 16 Nov is an almanac night, and
    # 17 and 18 Nov are the two nights after it. A lonely real fog night moves the pattern for as
    # long as it is inside the look-back window, and when it drops out, the almanac's own pattern
    # comes back. With a look-back that is not a multiple of three, that moment leaves a gap of
    # three nights (for 28 and 31, real fog on 18 Nov) or of four (for 29 and 32, real fog on
    # 17 Nov) without a fog night.
    assert longest_run_without_fog(shown_verdicts({fog_on: FOG})) <= 2


def test_with_no_fog_at_all_for_months_the_shown_nights_are_every_third_night():
    verdicts = shown_verdicts({})

    assert verdicts == [step % 3 == 0 for step in range(120)]


def test_tonight_counts_the_hours_seen_so_far_and_the_forecast_for_the_rest():
    # It is 01:00 UTC on 6 Nov, in the middle of the night of 5 Nov. Two foggy hours are already
    # past (22:00 and 23:00) and one is still forecast (03:00). Together they are three.
    now = datetime(2026, 11, 6, 1, 0, tzinfo=UTC)
    clear = {datetime(2026, 11, 5, 18, tzinfo=UTC): CLEAR_HOUR}
    seen_so_far = {
        datetime(2026, 11, 5, 22, tzinfo=UTC): FOGGY_HOUR,
        datetime(2026, 11, 5, 23, tzinfo=UTC): FOGGY_HOUR,
    }
    forecast = {datetime(2026, 11, 6, 3, tzinfo=UTC): FOGGY_HOUR}

    with_the_forecast = states_by_night(hour_readings({**clear, **seen_so_far, **forecast}), RULES)
    without_it = states_by_night(hour_readings({**clear, **seen_so_far}), RULES)

    tonight = date(2026, 11, 5)
    assert tonight_fog_night(now, with_the_forecast, RULES) == FogNight(tonight, True, REAL)
    assert tonight_fog_night(now, without_it, RULES) == FogNight(tonight, False, None)
