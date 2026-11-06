"""Tests for daily/chapter_two_hook.py and the Chapter 2 hook in GET /api/bulletin.

The hook is the Board notice "A light where no light was".

After the first crew relights the coast (S), the Board gets a notice about a strange new light. The
hook fires at 06:00 Lisbon time, at the end of the first calm night among the first three nights
that start after S, or at the end of the third night if none of them was calm. It is one
deterministic moment, so it fires once, and it only looks at nights that are over. The "now" of
every test is written out, and nothing here uses the network.

The example used in many tests: S is on Friday 20 Nov 2026 at 21:30 UTC, so night 1 is the night of
21 Nov (it ends at 06:00 on 22 Nov), night 2 ends on 23 Nov and night 3 ends on 24 Nov.
"""

import json
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from server.daily.chapter_two_hook import first_night_after, hook_fired_at
from server.daily.content import HOOK_FILE
from server.daily.hook_content import HARBOR_ALARM
from server.tests.bulletin_helpers import RELIT_AT, World, relit_at, utc
from server.tests.weather_helpers import CLEAR_HOUR, DESIGN_RULES, RAINY_HOUR, hours_of
from server.weather.states import CALM, FOG, RAIN, STORM
from server.world_stage import DARK, RELIT, WorldStage

RULES = DESIGN_RULES
STAGE = WorldStage(RELIT, RELIT_AT)
LONG_AFTER = utc(2027, 1, 1, 12, 0)  # far enough that every night of the example is over

NIGHT_1 = date(2026, 11, 21)
NIGHT_2 = date(2026, 11, 22)
NIGHT_3 = date(2026, 11, 23)
END_OF_NIGHT_1 = utc(2026, 11, 22, 6, 0)
END_OF_NIGHT_2 = utc(2026, 11, 23, 6, 0)
END_OF_NIGHT_3 = utc(2026, 11, 24, 6, 0)

REAL_HOOK = json.loads(HOOK_FILE.read_text(encoding="utf-8"))


def fired_at(
    states, now: datetime = LONG_AFTER, stage: WorldStage = STAGE, fires_by_night: int = 3
):
    return hook_fired_at(now, stage, states, RULES, fires_by_night)


# --- which night is night 1 ---


@pytest.mark.parametrize(
    ("relit", "expected"),
    [
        (utc(2026, 11, 20, 17, 0), date(2026, 11, 20)),  # before 18:00: tonight is night 1
        (utc(2026, 11, 20, 18, 0), date(2026, 11, 20)),  # exactly at 18:00: the night has begun
        (utc(2026, 11, 20, 18, 0, 1), date(2026, 11, 21)),
        (utc(2026, 11, 20, 21, 30), date(2026, 11, 21)),
        (utc(2026, 11, 21, 3, 0), date(2026, 11, 21)),  # the night of 20 Nov began before S
        (utc(2026, 11, 21, 0, 0), date(2026, 11, 21)),
    ],
)
def test_the_first_night_after_the_relighting_is_the_first_that_starts_after_it(relit, expected):
    assert first_night_after(relit, RULES) == expected


# --- when it fires ---


@pytest.mark.parametrize(
    ("states", "expected"),
    [
        ({NIGHT_1: CALM}, END_OF_NIGHT_1),
        ({NIGHT_1: RAIN, NIGHT_2: CALM}, END_OF_NIGHT_2),
        ({NIGHT_1: RAIN, NIGHT_2: FOG, NIGHT_3: STORM}, END_OF_NIGHT_3),
        ({NIGHT_1: RAIN, NIGHT_2: FOG, NIGHT_3: CALM}, END_OF_NIGHT_3),
        ({NIGHT_1: CALM, NIGHT_2: CALM, NIGHT_3: CALM}, END_OF_NIGHT_1),
    ],
)
def test_hook_fires_on_first_clear_night_or_the_third_night(states, expected):
    assert fired_at(states) == expected


def test_a_calm_night_after_the_third_night_changes_nothing():
    four_nights = {NIGHT_1: RAIN, NIGHT_2: RAIN, NIGHT_3: RAIN, date(2026, 11, 24): CALM}

    assert fired_at(four_nights) == END_OF_NIGHT_3


def test_a_calm_night_before_the_relighting_changes_nothing():
    before = {date(2026, 11, 20): CALM, NIGHT_1: RAIN, NIGHT_2: RAIN, NIGHT_3: RAIN}

    assert fired_at(before) == END_OF_NIGHT_3


def test_the_number_of_nights_comes_from_the_content_file():
    nothing_calm = {NIGHT_1: RAIN, NIGHT_2: RAIN, NIGHT_3: RAIN}

    assert fired_at(nothing_calm, fires_by_night=1) == END_OF_NIGHT_1
    assert fired_at(nothing_calm, fires_by_night=2) == END_OF_NIGHT_2


def test_nights_without_data_do_not_count_as_calm():
    # No hour is known for any night: none is calm, so it fires at the end of night 3.
    assert fired_at({}) == END_OF_NIGHT_3


def test_a_night_with_data_after_nights_without_data_can_still_be_the_calm_one():
    assert fired_at({NIGHT_2: CALM}) == END_OF_NIGHT_2


def test_while_the_coast_is_dark_there_is_no_hook():
    dark = WorldStage(DARK, None)

    assert fired_at({NIGHT_1: CALM}, stage=dark) is None


# --- it only looks at nights that are over ---


def test_before_it_fires_there_is_no_hook():
    just_before = utc(2026, 11, 22, 5, 59, 59)

    assert fired_at({NIGHT_1: CALM}, now=just_before) is None


def test_at_the_end_of_the_night_it_has_fired():
    assert fired_at({NIGHT_1: CALM}, now=END_OF_NIGHT_1) == END_OF_NIGHT_1


def test_a_calm_forecast_for_a_night_that_is_not_over_does_not_fire_it():
    during_night_1 = utc(2026, 11, 22, 1, 0)

    assert fired_at({NIGHT_1: CALM, NIGHT_2: CALM}, now=during_night_1) is None


def test_a_calm_night_that_is_still_to_come_does_not_fire_the_hook_early():
    # Night 1 is over and rainy. Night 2 is forecast calm, but it is not over, so nothing fires.
    during_night_2 = utc(2026, 11, 22, 20, 0)

    assert fired_at({NIGHT_1: RAIN, NIGHT_2: CALM}, now=during_night_2) is None


def test_once_fired_the_hook_stays_for_good():
    states = {NIGHT_1: CALM}
    a_day_later = utc(2026, 11, 23, 6, 0)

    assert fired_at(states, now=a_day_later) == END_OF_NIGHT_1


def test_sixty_days_later_with_no_data_the_hook_is_still_there():
    # Open-Meteo no longer has those nights, so none is known. The hook fires at the end of night 3
    # and stays: after that moment it is visible for good, whatever data remains.
    sixty_days_on = utc(2027, 1, 19, 12, 0)

    assert fired_at({}, now=sixty_days_on) == END_OF_NIGHT_3


@pytest.mark.parametrize("hour", [6, 12, 23])
def test_the_hook_does_not_depend_on_the_time_of_day_of_the_ask(hour):
    assert fired_at({NIGHT_1: CALM}, now=utc(2026, 11, 22, hour, 0)) == END_OF_NIGHT_1


@pytest.mark.parametrize(
    "relit",
    [datetime(2026, 11, 20, 21, 30, tzinfo=UTC), datetime(2026, 11, 20, 22, 30, tzinfo=UTC)],
)
def test_the_time_of_the_relighting_can_be_given_in_any_timezone(relit):
    in_another_timezone = relit.astimezone(timezone(timedelta(hours=-5)))

    assert first_night_after(in_another_timezone, RULES) == first_night_after(relit, RULES)


# --- the hook in the bulletin ---


def hook_world(now: datetime) -> World:
    """The example of the spec: night 1 rainy, night 2 clear, so the hook fires on 23 Nov 06:00."""
    rainy_night_1 = hours_of(utc(2026, 11, 21, 18), 12, RAINY_HOUR)
    clear_night_2 = hours_of(utc(2026, 11, 22, 18), 12, CLEAR_HOUR)
    return World(now=now, hours={**rainy_night_1, **clear_night_2}, stage=relit_at())


def test_the_bulletin_sends_the_hook_only_after_it_fired():
    before = hook_world(utc(2026, 11, 23, 5, 59, 59)).body()["chapterTwoHook"]
    after = hook_world(utc(2026, 11, 23, 6, 0, 0)).body()["chapterTwoHook"]

    assert before is None
    assert after == {
        "id": "chapter_two_hook",
        "notice": REAL_HOOK["notice"],
        "beam": REAL_HOOK["beam"],
    }


def test_the_hook_object_has_the_documented_fields_in_order():
    hook = hook_world(utc(2026, 11, 23, 9, 0)).body()["chapterTwoHook"]

    assert list(hook) == ["id", "notice", "beam"]
    assert list(hook["notice"]) == ["title", "text"]
    assert list(hook["beam"]) == ["chart", "pattern", "flash"]
    assert list(hook["beam"]["chart"]) == ["x", "y"]
    assert list(hook["beam"]["flash"]) == [
        "shortSeconds",
        "longSeconds",
        "gapSeconds",
        "pauseSeconds",
    ]


@pytest.mark.parametrize(
    ("now", "has_object", "has_line"),
    [
        (utc(2026, 11, 22, 9, 0), False, False),  # the day before it fires
        (utc(2026, 11, 23, 7, 30), True, False),  # the Board notice shows from 06:00 ...
        (utc(2026, 11, 23, 8, 0), True, True),  # ... and the bulletin line from 08:00
        (utc(2026, 11, 23, 23, 59), True, True),
        (utc(2026, 11, 24, 7, 59), True, True),  # still the bulletin of 23 Nov
        (utc(2026, 11, 24, 8, 0), True, False),  # the notice stays, the line does not
        (utc(2026, 12, 20, 12, 0), True, False),
    ],
)
def test_the_hook_line_is_only_in_the_bulletin_of_the_morning_after(now, has_object, has_line):
    world = hook_world(now)

    body = world.body()

    assert (body["chapterTwoHook"] is not None) is has_object
    assert ("hook" in world.kinds()) is has_line


def test_the_hook_line_says_what_the_content_file_says():
    world = hook_world(utc(2026, 11, 23, 9, 0))

    assert world.texts()["hook"] == "A light where no light was."


def test_the_bulletin_has_no_hook_while_the_coast_is_dark():
    world = World(
        now=utc(2026, 11, 23, 9, 0), hours=hours_of(utc(2026, 11, 22, 18), 12, CLEAR_HOUR)
    )

    assert world.body()["chapterTwoHook"] is None
    assert "hook" not in world.kinds()


# --- the content ---


def test_the_new_light_does_not_flash_the_harbor_alarm():
    assert tuple(REAL_HOOK["beam"]["pattern"]) != HARBOR_ALARM
    assert HARBOR_ALARM == ("long", "short", "long")


def test_the_notice_echoes_elenas_drawing():
    # Story v2, change 13: Elena's logbook drawing shows "a row of long and short flashes".
    assert "a row of long and short flashes" in REAL_HOOK["notice"]["text"]


def test_the_notice_does_not_name_an_exact_pattern_or_a_place():
    text = REAL_HOOK["notice"]["text"].lower()

    assert "short, short, long" not in text
    assert "440" not in text
    assert "gull" not in text
    assert "lens" not in text
