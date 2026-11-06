"""The fog-night rule: there is a fog night at least every third night.

The rule, word for word from the design (OPEN-WORLD.md 5.4): "A night is a fog night if the night is
in the fog state, or if neither of the last two nights was a fog night." So the false-light teaser
never stalls in a sunny week. A fog night is one of two kinds:

    real      the weather made it: the night is in the fog state. This wins when both apply.
    almanac   only the rule made it. The bulletin says "by the harbor's almanac".

The rule needs the verdicts of the last two nights, and those need the two before them, and so on
without end. We cut that chain on purpose, so nothing has to be stored:

  * We look back LOOK_BACK_NIGHTS (30) nights from tonight, and run the rule over those nights and
    then tonight.
  * For the two nights before that window we assume the harbor's almanac: one fog night in every
    three, counted from `almanac_starts_on` (Day 1, 16 Nov 2026). The count also works backwards
    from that date.
  * Two histories agree from the first real fog night on, because that night is a fog night
    whatever came before. So tonight's verdict is exact whenever there was real fog in the window.
    If there was none, the almanac pattern is what the rule gives anyway. The only visible effect
    of the cut is that when real fog drops out of the window, the next fog night can come one
    night earlier than the rule without a limit would give.
  * The length of the window matters. With a multiple of 3 the verdicts shown from one evening to
    the next never have three nights without a fog night in a row (a test tries one lonely
    real-fog night in each of the three almanac positions). With 3k+1 the gap can reach 3 nights,
    and with 3k+2 it can reach 4. So LOOK_BACK_NIGHTS must stay a multiple of 3, and
    open_meteo.PAST_DAYS must stay one more than it (a test checks both).

Tonight's real fog follows the latest forecast and then the hours that were seen, so it can
appear or go during the day or the night. Past nights use the hours that were seen.

Pure functions: no network, no clock of their own.

Used by: weather/outlook.py (tonight's verdict for the weather route and the bulletin) and the
tests.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from server.weather.nights import night_for
from server.weather.state_rules import StateRules
from server.weather.states import FOG

LOOK_BACK_NIGHTS = 30  # a multiple of 3: then the teaser can never stall (a test checks it)
REAL = "real"
ALMANAC = "almanac"

ONE_DAY = timedelta(days=1)
NIGHTS_PER_ALMANAC_CYCLE = 3


@dataclass(frozen=True)
class FogNight:
    """The verdict for one night."""

    night: date  # the date the night starts on
    is_fog_night: bool
    kind: str | None  # REAL (the weather made it), ALMANAC (only the rule did), or None


def is_almanac_night(night: date, almanac_starts_on: date) -> bool:
    """True for every third night, counted from the almanac's first night, also backwards."""
    return (night - almanac_starts_on).days % NIGHTS_PER_ALMANAC_CYCLE == 0


def apply_fog_night_rule(
    nights: Sequence[date], real_fog: Mapping[date, bool], almanac_starts_on: date
) -> list[FogNight]:
    """Run the rule over consecutive nights, oldest first. Returns one verdict per night.

    real_fog       which nights are in the fog state. A night that is not in the mapping counts
                   as having no real fog.
    The two nights before the first one are taken from the almanac pattern.
    """
    if not nights:
        return []
    one_night_ago = is_almanac_night(nights[0] - ONE_DAY, almanac_starts_on)
    two_nights_ago = is_almanac_night(nights[0] - 2 * ONE_DAY, almanac_starts_on)
    verdicts = []
    for night in nights:
        if real_fog.get(night, False):
            verdict = FogNight(night, True, REAL)
        elif not one_night_ago and not two_nights_ago:
            verdict = FogNight(night, True, ALMANAC)
        else:
            verdict = FogNight(night, False, None)
        verdicts.append(verdict)
        two_nights_ago, one_night_ago = one_night_ago, verdict.is_fog_night
    return verdicts


def tonight_fog_night(
    now: datetime, states_by_night: Mapping[date, str], rules: StateRules
) -> FogNight:
    """The verdict for tonight: the night in progress, or the coming one.

    states_by_night is the state of each night that has hours (nights.states_by_night). Only the
    nights in the fog state count as real fog.
    """
    tonight = night_for(now, rules).date
    window = [tonight - ONE_DAY * back for back in range(LOOK_BACK_NIGHTS, -1, -1)]
    real_fog = {night: states_by_night.get(night) == FOG for night in window}
    return apply_fog_night_rule(window, real_fog, rules.almanac_starts_on)[-1]
