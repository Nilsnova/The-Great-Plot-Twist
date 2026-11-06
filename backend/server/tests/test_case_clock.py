"""Boundary and minimum-wait tests for the shared case clock and all real route windows."""

from datetime import timedelta

import pytest

from server.game.case_clock import case_second, minute_of, minutes_until_open, window_open
from server.game.case_data import load_case
from server.tests.case_rule_helpers import START


@pytest.mark.parametrize(
    ("seconds", "expected"), [(0, 0), (0.9, 0), (59.99, 59), (60, 60), (2125.8, 2125)]
)
def test_case_second_counts_whole_seconds_since_the_muster(seconds, expected):
    assert case_second(START, START + timedelta(seconds=seconds)) == expected


def test_a_clock_before_the_muster_does_not_make_negative_case_time():
    assert case_second(START, START - timedelta(seconds=1)) == 0
    assert minute_of(119) == 1


def test_window_routes_open_only_inside_their_window():
    data = load_case()
    assert len(data.windows) == 4
    for window in data.windows:
        for cycle in range(3):
            start = window.from_minute + cycle * window.every_minutes
            assert not window_open(window, start - 1)
            assert window_open(window, start)
            assert window_open(window, start + window.open_minutes - 1)
            assert not window_open(window, start + window.open_minutes)


@pytest.mark.parametrize("arrive_after", [0, 4])
def test_minutes_until_open_is_the_smallest_wait(arrive_after):
    for window in load_case().windows:
        for minute in range(120):
            wait = minutes_until_open(window, minute, arrive_after)
            assert window_open(window, minute + wait + arrive_after)
            assert all(
                not window_open(window, minute + earlier + arrive_after) for earlier in range(wait)
            )


def test_an_always_open_route_never_needs_a_wait():
    assert window_open(None, 137)
    assert minutes_until_open(None, 137, arrive_after=4) == 0
