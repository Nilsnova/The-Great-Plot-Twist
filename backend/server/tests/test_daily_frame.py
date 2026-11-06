"""Tests for daily/frame.py: the game day, the bulletin day and the harbor week around one moment.

The frame says when each of the three began and when the next one begins. All times are worked out
on the clock of Lisbon (see test_lisbon_time.py for the clock changes). The "now" of every test is
written out, and no test uses the network. The summer tests need the timezone database.
"""

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone

import pytest

from server.daily.bulletin_content import ResetLine
from server.daily.frame import DayFrame, day_frame
from server.tests.bulletin_helpers import DAY_ONE_AT_9, World, utc
from server.tests.helpers import needs_lisbon_timezone


def test_the_frame_on_day_1_at_09_00():
    frame = day_frame(DAY_ONE_AT_9)

    assert frame == DayFrame(
        day=date(2026, 11, 16),
        started_at=utc(2026, 11, 16, 0, 0),
        next_day_at=utc(2026, 11, 17, 0, 0),
        bulletin_day=date(2026, 11, 16),
        published_at=utc(2026, 11, 16, 8, 0),
        next_bulletin_at=utc(2026, 11, 17, 8, 0),
        harbor_week=date(2026, 11, 16),
        next_harbor_week_at=utc(2026, 11, 23, 0, 0),
    )


def test_before_08_00_the_bulletin_is_still_yesterdays():
    frame = day_frame(utc(2026, 11, 17, 7, 30))

    assert frame.day == date(2026, 11, 17)
    assert frame.bulletin_day == date(2026, 11, 16)
    assert frame.published_at == utc(2026, 11, 16, 8, 0)
    assert frame.next_bulletin_at == utc(2026, 11, 17, 8, 0)


def test_at_08_00_exactly_the_new_bulletin_has_been_published():
    frame = day_frame(utc(2026, 11, 17, 8, 0))

    assert frame.bulletin_day == date(2026, 11, 17)
    assert frame.published_at == utc(2026, 11, 17, 8, 0)


def test_at_midnight_exactly_the_new_day_has_begun():
    frame = day_frame(utc(2026, 11, 17, 0, 0))

    assert frame.day == date(2026, 11, 17)
    assert frame.started_at == utc(2026, 11, 17, 0, 0)
    assert frame.next_day_at == utc(2026, 11, 18, 0, 0)


@pytest.mark.parametrize(
    ("moment", "week", "next_week"),
    [
        (utc(2026, 11, 22, 23, 59, 59), date(2026, 11, 16), utc(2026, 11, 23, 0, 0)),
        (utc(2026, 11, 23, 0, 0, 0), date(2026, 11, 23), utc(2026, 11, 30, 0, 0)),
    ],
)
def test_the_harbor_week_turns_over_on_monday_at_midnight(moment, week, next_week):
    frame = day_frame(moment)

    assert frame.harbor_week == week
    assert frame.next_harbor_week_at == next_week


def test_the_moment_itself_lies_inside_the_day_and_before_the_next_bulletin():
    frame = day_frame(DAY_ONE_AT_9)

    assert frame.started_at <= DAY_ONE_AT_9 < frame.next_day_at
    assert frame.published_at <= DAY_ONE_AT_9 < frame.next_bulletin_at
    assert frame.harbor_week <= DAY_ONE_AT_9.date() < frame.next_harbor_week_at.date()


@needs_lisbon_timezone
def test_the_frame_on_the_march_clock_change_day():
    # The clocks go forward at 01:00 UTC on Sunday 28 March 2027: that day has 23 hours.
    frame = day_frame(utc(2027, 3, 28, 12, 0))

    assert frame.day == date(2027, 3, 28)
    assert frame.started_at == utc(2027, 3, 28, 0, 0)
    assert frame.next_day_at == utc(2027, 3, 28, 23, 0)
    assert frame.published_at == utc(2027, 3, 28, 7, 0)
    assert frame.next_bulletin_at == utc(2027, 3, 29, 7, 0)
    assert frame.harbor_week == date(2027, 3, 22)
    assert frame.next_harbor_week_at == utc(2027, 3, 28, 23, 0)


@needs_lisbon_timezone
def test_the_frame_on_the_october_clock_change_day():
    # The clocks go back at 01:00 UTC on Sunday 31 October 2027: that day has 25 hours.
    frame = day_frame(utc(2027, 10, 31, 12, 0))

    assert frame.started_at == utc(2027, 10, 30, 23, 0)
    assert frame.next_day_at == utc(2027, 11, 1, 0, 0)
    assert frame.published_at == utc(2027, 10, 31, 8, 0)


def test_a_time_without_a_timezone_is_refused():
    with pytest.raises(ValueError, match="timezone"):
        day_frame(datetime(2026, 11, 16, 9, 0))


def test_a_moment_in_another_timezone_gives_the_same_frame():
    elsewhere = DAY_ONE_AT_9.astimezone(timezone(timedelta(hours=-5)))

    assert day_frame(elsewhere) == day_frame(DAY_ONE_AT_9)


def test_a_frame_cannot_be_changed():
    with pytest.raises(AttributeError):
        day_frame(DAY_ONE_AT_9).day = date(2026, 1, 1)


# --- what resets comes from the content file ---


def test_what_resets_comes_from_the_content_file():
    world = World()
    content = world.app.state.daily_content
    only_one = (ResetLine(when="Every test at noon", what="Something resets."),)
    world.app.state.daily_content = replace(
        content, bulletin=replace(content.bulletin, resets=only_one)
    )

    assert world.body()["day"]["resets"] == [
        {"when": "Every test at noon", "what": "Something resets."}
    ]


def test_the_day_object_carries_the_frame_and_the_four_reset_lines():
    day = World().body()["day"]

    assert day["id"] == "2026-11-16"
    assert day["nextDayAt"] == "2026-11-17T00:00:00Z"
    assert [line["when"] for line in day["resets"]] == [
        "Every day at 00:00",
        "Every day at 08:00",
        "Every Monday at 00:00",
        "Never",
    ]
