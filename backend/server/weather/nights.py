"""Nights and daytimes: when they start and end in Lisbon, and which hours belong to which.

Night N runs from 18:00 Lisbon time on date N to 06:00 on date N+1. The daytime of date N runs from
06:00 to 18:00. Both hours come from the rules file (a start value of the design, OPEN-WORLD.md
5.4). Everything is worked out on the clock of Lisbon, so a night is 11 hours long across the
March clock change and 13 hours across the October one. The three-hours-of-fog rule works the same
either way.

    night_window(date, rules)     the window of the night that starts on that date
    daytime_window(date, rules)   the window of the daytime of that date
    night_for(now, rules)         the night in progress, or the next one: before 06:00 it is the
                                  night that began on the day before, from 06:00 it is today's
    period_states(hours, rules)   the state of each night and of each daytime that has hours, both
                                  from one pass over the hours: ({date: state}, {date: state})
    states_by_night(hours, rules) only the nights of period_states: {date: state}
    states_by_daytime(hours, rules)  only the daytimes of period_states

A window is half open: it has begun at its start and is over at its end.

Pure functions (they use lisbon_time.py for the zone): no network, no clock of their own.

Used by: weather/fog_nights.py, weather/outlook.py, daily/chapter_two_hook.py and the tests.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from server.lisbon_time import at_lisbon_hour, game_day, to_lisbon
from server.weather.mapping import HourReading
from server.weather.state_rules import StateRules
from server.weather.states import hour_state, period_state

ONE_DAY = timedelta(days=1)


@dataclass(frozen=True)
class Window:
    """A named stretch of time: a night or a daytime. The times are in UTC."""

    date: date  # the date it starts on
    starts_at: datetime
    ends_at: datetime

    def contains(self, moment: datetime) -> bool:
        """True from the start of the window until, but not including, its end."""
        return self.starts_at <= moment < self.ends_at


def night_window(night: date, rules: StateRules) -> Window:
    """The night that starts on this date (18:00 Lisbon time) and ends at 06:00 the next day."""
    return Window(
        date=night,
        starts_at=at_lisbon_hour(night, rules.night_starts_hour),
        ends_at=at_lisbon_hour(night + ONE_DAY, rules.night_ends_hour),
    )


def daytime_window(day: date, rules: StateRules) -> Window:
    """The daytime of this date: from 06:00 to 18:00 Lisbon time."""
    return Window(
        date=day,
        starts_at=at_lisbon_hour(day, rules.night_ends_hour),
        ends_at=at_lisbon_hour(day, rules.night_starts_hour),
    )


def night_for(now: datetime, rules: StateRules) -> Window:
    """The night in progress, or the next one if it is daytime.

    Before 06:00 the night that began on the day before is still going on. From 06:00 on, tonight
    is the night that starts today at 18:00.
    """
    day = game_day(now)
    if now < at_lisbon_hour(day, rules.night_ends_hour):
        day -= ONE_DAY
    return night_window(day, rules)


def sort_hours(
    hours: Sequence[HourReading], rules: StateRules
) -> tuple[dict[date, list[str]], dict[date, list[str]]]:
    """Sort the state of every hour into its night or its daytime, in one pass.

    Returns (nights, daytimes). Each is {date: [state of each hour]}, where the date is the date
    the night starts on, or the date of the daytime.
    """
    nights: dict[date, list[str]] = {}
    daytimes: dict[date, list[str]] = {}
    for hour in hours:
        local = to_lisbon(hour.at)
        state = hour_state(hour.reading, rules)
        if local.hour >= rules.night_starts_hour:
            nights.setdefault(local.date(), []).append(state)
        elif local.hour < rules.night_ends_hour:
            nights.setdefault(local.date() - ONE_DAY, []).append(state)
        else:
            daytimes.setdefault(local.date(), []).append(state)
    return nights, daytimes


def period_states(
    hours: Sequence[HourReading], rules: StateRules
) -> tuple[dict[date, str], dict[date, str]]:
    """The state of every night and of every daytime that has hours, from one pass over the hours.

    Returns (night_states, daytime_states). Each is {date: state}: for a night the date it starts
    on, for a daytime its own date. Sorting the hours is the costly part (about 800 of them), so
    a caller that needs both asks here once instead of calling the two functions below.
    """
    nights, daytimes = sort_hours(hours, rules)
    return (
        {night: period_state(states, rules) for night, states in nights.items()},
        {day: period_state(states, rules) for day, states in daytimes.items()},
    )


def states_by_night(hours: Sequence[HourReading], rules: StateRules) -> dict[date, str]:
    """The state of each night that has at least one hour: {date the night starts: state}."""
    night_states, _ = period_states(hours, rules)
    return night_states


def states_by_daytime(hours: Sequence[HourReading], rules: StateRules) -> dict[date, str]:
    """The state of each daytime that has at least one hour: {date: state}."""
    _, daytime_states = period_states(hours, rules)
    return daytime_states
