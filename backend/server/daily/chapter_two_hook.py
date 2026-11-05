"""The Chapter 2 hook: when "A light where no light was" shows up after the first solve.

When the first crew relights the coast (the moment S), the Board gets a notice about a strange new
light far beyond the old fog line (OPEN-WORLD.md 10.2). The rule:

  * Night 1 is the first night that starts at or after S. If S is at 17:00 UTC on 20 Nov, night 1 is
    the night of 20 Nov (it starts at 18:00). If S is at 21:30 UTC, night 1 is the night of 21 Nov.
  * The hook fires at the END of a night, at 06:00 Lisbon time: at the end of the first of nights 1
    to `fires_by_night` (3) that was calm, or at the end of the last of them if none was. A night
    without data is not calm.
  * It only looks at nights that are over. So it never shows on a forecast and then goes away
    again, and it fits the past tense of "A light where no light was."

"Fires once" is structural: the firing moment is one deterministic moment, worked out from S and
from the states of the nights. Once that moment is in the past the hook stays visible for good. If
the data of those nights is gone later (Open-Meteo keeps 31 days), the rule falls back to the end
of the last night, which is still in the past, so the hook is still there.

The bulletin line appears only in the bulletin of the morning after (daily/bulletin.py). The Board
notice shows from 06:00 on.

Pure functions: no network, no clock of their own. The caller passes `now` and the nights.

Used by: routes/bulletin.py and the tests.
"""

from collections.abc import Mapping
from datetime import date, datetime, timedelta

from server.lisbon_time import at_lisbon_hour, game_day
from server.weather.nights import night_window
from server.weather.state_rules import StateRules
from server.weather.states import CALM
from server.world_stage import RELIT, WorldStage

ONE_DAY = timedelta(days=1)


def first_night_after(relit_at: datetime, rules: StateRules) -> date:
    """Night 1: the date of the first night that starts at or after the first solve."""
    day = game_day(relit_at)
    if at_lisbon_hour(day, rules.night_starts_hour) >= relit_at:
        return day
    return day + ONE_DAY


def hook_fired_at(
    now: datetime,
    stage: WorldStage,
    states_by_night: Mapping[date, str],
    rules: StateRules,
    fires_by_night: int,
) -> datetime | None:
    """The moment the hook fired, or None while it has not (or while the coast is still dark).

    states_by_night is the state of each night that has hours (weather/nights.py).
    """
    if stage.stage != RELIT or stage.relit_at is None:
        return None
    first = first_night_after(stage.relit_at, rules)
    for number in range(fires_by_night):
        night = night_window(first + ONE_DAY * number, rules)
        if night.ends_at > now:
            return None  # this night is not over, so nothing can have fired yet
        is_last = number == fires_by_night - 1
        if is_last or states_by_night.get(night.date) == CALM:
            return night.ends_at
    return None
