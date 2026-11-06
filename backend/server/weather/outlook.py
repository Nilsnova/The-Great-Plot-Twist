"""The outlook: tonight and tomorrow, put together from the hours of one forecast.

Both the weather route (GET /api/weather, field `tonight`) and the bulletin (GET /api/bulletin,
field `weather`) show this, so it is built in this one place and they cannot disagree.

    tonight    the night in progress, or the next one: when it starts and ends, whether it is going
               on, its state (storm, fog, rain, calm, or None if no hour of it is known) and the
               fog-night verdict (fog_nights.py)
    tomorrow   the daytime after tonight (06:00 to 18:00 Lisbon time) and its state

The outlook also keeps `night_states`, the state of every night that has hours, because the
Chapter 2 hook (daily/chapter_two_hook.py) needs it too. Sorting the hours into nights is the costly
part, so a request does it once, here, and the bulletin reuses the result.

Pure function: no network, no clock of its own. The caller passes `now`.

Used by: routes/weather.py, routes/bulletin.py, daily/bulletin.py and the tests.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from server.weather.fog_nights import FogNight, tonight_fog_night
from server.weather.mapping import HourReading
from server.weather.nights import Window, daytime_window, night_for, period_states
from server.weather.state_rules import StateRules

ONE_DAY = timedelta(days=1)


@dataclass(frozen=True)
class Tonight:
    """The night in progress, or the next one."""

    window: Window
    is_now: bool  # True while the night is going on
    state: str | None  # None when no hour of this night is known
    fog_night: FogNight


@dataclass(frozen=True)
class Tomorrow:
    """The daytime after tonight."""

    window: Window
    state: str | None  # None when no hour of this daytime is known


@dataclass(frozen=True)
class Outlook:
    tonight: Tonight
    tomorrow: Tomorrow
    night_states: Mapping[date, str]  # {date a night starts on: its state}, read-only for callers


def make_outlook(now: datetime, hours: Sequence[HourReading], rules: StateRules) -> Outlook:
    """Tonight and tomorrow, from the hours of the forecast. `hours` may be empty."""
    night_states, daytime_states = period_states(hours, rules)
    night = night_for(now, rules)
    # The night of date N ends at 06:00 on N+1, which is exactly when the daytime of N+1 begins.
    day = daytime_window(night.date + ONE_DAY, rules)
    return Outlook(
        tonight=Tonight(
            window=night,
            is_now=night.contains(now),
            state=night_states.get(night.date),
            fog_night=tonight_fog_night(now, night_states, rules),
        ),
        tomorrow=Tomorrow(window=day, state=daytime_states.get(day.date)),
        night_states=night_states,
    )
