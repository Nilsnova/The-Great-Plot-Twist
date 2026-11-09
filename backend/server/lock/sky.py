"""The rules of the Keeper's Lock, as pure functions: no network, no database, no clock.

The five skies a player may pick, and which WMO weather code (Open-Meteo's "weather_code", see
weather/mapping.py) belongs to which:

    clear    0 clear sky, 1 mostly clear
    cloudy   2 partly cloudy, 3 overcast
    fog      45 fog, 48 freezing fog
    rain     51 to 57 drizzle, 61 to 67 rain, 80 to 82 showers, 95 to 99 thunderstorms
    snow     71 to 77 snow, 85 and 86 snow showers

Without a weather code the other numbers decide: 0.2 mm of rain an hour or more is rain, less than
1 km of visibility is fog, under 30 % cloud cover is clear, and more is cloudy. A reading with none
of these has no sky, and the lock asks its riddle instead.

"Close enough" (decision D029): an answer one step from the reading opens the lock too, with a
gentle line. The steps: clear and cloudy; cloudy and fog; cloudy and rain; fog and rain; rain and
snow. So "cloudy" for a light drizzle counts, "clear" for a downpour does not.

The hint path ("That's not what I see outside"): after at least one wrong answer, the answer
"hint" shows a second, simple prompt (outcome hint_offered), and the answer "hint_confirm" after
that opens the lock (outcome hint). Before a wrong answer, both are refused as hint_too_early. The
hint path works for the riddle too.

Used by: routes/lock.py and the tests.
"""

from dataclasses import dataclass
from typing import Literal

from server.weather.mapping import WeatherReading

SKIES = ("clear", "cloudy", "rain", "fog", "snow")

NEIGHBOURS = {
    "clear": frozenset({"cloudy"}),
    "cloudy": frozenset({"clear", "fog", "rain"}),
    "fog": frozenset({"cloudy", "rain"}),
    "rain": frozenset({"cloudy", "fog", "snow"}),
    "snow": frozenset({"rain"}),
}

HINT = "hint"
HINT_CONFIRM = "hint_confirm"

RAIN_MM_PER_HOUR = 0.2
FOG_VISIBILITY_M = 1000.0
CLEAR_CLOUD_PERCENT = 30.0

# The outcomes the database stores (check demo_lock_attempts_outcome_allowed).
ACCEPTED_OUTCOMES = ("exact", "close", "hint", "clue")
REFUSED_OUTCOMES = ("wrong", "hint_too_early", "hint_offered", "question_changed")

Mode = Literal["weather", "clue"]


def sky_of_code(code: int) -> str | None:
    if code in (0, 1):
        return "clear"
    if code in (2, 3):
        return "cloudy"
    if code in (45, 48):
        return "fog"
    if 51 <= code <= 67 or 80 <= code <= 82 or 95 <= code <= 99:
        return "rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    return None


def sky_of(reading: WeatherReading) -> str | None:
    """The sky of a reading, or None when the reading says nothing about the sky."""
    if reading.weather_code is not None:
        sky = sky_of_code(reading.weather_code)
        if sky is not None:
            return sky
    if (reading.precipitation_mm_per_hour or 0.0) >= RAIN_MM_PER_HOUR:
        return "rain"
    if reading.visibility_m is not None and 0 <= reading.visibility_m < FOG_VISIBILITY_M:
        return "fog"
    if reading.cloud_cover_percent is not None:
        return "clear" if reading.cloud_cover_percent < CLEAR_CLOUD_PERCENT else "cloudy"
    return None


@dataclass(frozen=True)
class History:
    """What the player's stored answers say: opened, how many wrong ones, hint shown."""

    opened: bool = False
    wrong: int = 0
    hint_offered: bool = False


def judge(
    answer: str,
    mode: Mode,
    sky: str | None,
    clue_choices: tuple[str, ...],
    clue_answer: str,
    history: History,
) -> str:
    """The outcome of one answer. `sky` is the reading's sky (only used in weather mode)."""
    if answer == HINT:
        return "hint_offered" if history.wrong >= 1 else "hint_too_early"
    if answer == HINT_CONFIRM:
        return "hint" if history.hint_offered else "hint_too_early"
    if mode == "weather" and sky is not None:
        if answer not in SKIES:
            return "question_changed"
        if answer == sky:
            return "exact"
        return "close" if answer in NEIGHBOURS[sky] else "wrong"
    if answer not in clue_choices:
        return "question_changed"
    return "clue" if answer == clue_answer else "wrong"


def history_of(rows: list[tuple[str, bool]]) -> History:
    """The history from the stored (outcome, accepted) pairs, oldest first."""
    return History(
        opened=any(accepted for _, accepted in rows),
        wrong=sum(1 for outcome, _ in rows if outcome == "wrong"),
        hint_offered=any(outcome == "hint_offered" for outcome, _ in rows),
    )
