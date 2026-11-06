"""Tests for predictions/stake_rules.py: the numbers of the prediction desk and its small checks.

Every number is a named constant with a test, as the Exchange does it. The Lisbon day is checked
around the clock change of 28 Mar 2027, when Lisbon moves from UTC+0 to UTC+1 at 01:00 UTC.
"""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from server.errors import ApiError
from server.predictions.stake_rules import (
    DAILY_STAKE_CAP,
    DESK_TIMEZONE_NAME,
    MAX_STAKE,
    MIN_MINUTES_BEFORE_EVENT,
    MIN_STAKE,
    POOL_CUT_PERCENT,
    SETTLE_GRACE_MINUTES,
    STALE_LIMIT_FOR_STAKE,
    check_stake_amount,
    coins_left_today,
    desk_day_start,
    effective_closes_at,
    is_staking_open,
    load_desk_timezone,
)

NOON = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)


def utc(*parts: int) -> datetime:
    return datetime(*parts, tzinfo=UTC)


# --- the agreed numbers ---


def test_a_stake_is_between_1_and_50_coins():
    assert (MIN_STAKE, MAX_STAKE) == (1, 50)


def test_a_captain_can_stake_at_most_200_coins_a_day():
    assert DAILY_STAKE_CAP == 200


def test_the_cut_is_5_percent():
    assert POOL_CUT_PERCENT == 5


def test_a_question_closes_at_least_60_minutes_before_it_is_decided():
    assert MIN_MINUTES_BEFORE_EVENT == 60


def test_automatic_settlement_would_wait_60_minutes_after_manifold_decided():
    assert SETTLE_GRACE_MINUTES == 60


def test_nobody_may_stake_on_a_stale_reading_older_than_15_minutes():
    assert STALE_LIMIT_FOR_STAKE == timedelta(minutes=15)


def test_the_desk_day_follows_lisbon_time():
    assert DESK_TIMEZONE_NAME == "Europe/Lisbon"


def test_the_daily_cap_is_no_smaller_than_the_biggest_stake():
    assert DAILY_STAKE_CAP >= MAX_STAKE


# --- the size of one stake ---


@pytest.mark.parametrize("amount", [MIN_STAKE, 2, 49, MAX_STAKE])
def test_stakes_from_1_to_50_coins_are_accepted(amount):
    check_stake_amount(amount)  # raises nothing


@pytest.mark.parametrize("amount", [0, -3, -1000])
def test_a_stake_below_one_coin_is_stake_too_small(amount):
    with pytest.raises(ApiError) as refusal:
        check_stake_amount(amount)

    assert refusal.value.status_code == 422
    assert refusal.value.code == "stake_too_small"
    assert refusal.value.message == "A stake must be at least 1 coin."


@pytest.mark.parametrize("amount", [51, 500, 10**9])
def test_a_stake_above_fifty_coins_is_stake_too_big(amount):
    with pytest.raises(ApiError) as refusal:
        check_stake_amount(amount)

    assert refusal.value.status_code == 422
    assert refusal.value.code == "stake_too_big"
    assert refusal.value.message == "You can stake at most 50 coins on one question."


# --- the Lisbon day ---


def test_the_day_starts_at_midnight_lisbon_time_in_winter():
    # Lisbon is on UTC+0 in November, so midnight in Lisbon is midnight UTC.
    assert desk_day_start(utc(2026, 11, 20, 15, 30)) == utc(2026, 11, 20, 0, 0)


def test_the_day_start_is_in_utc_so_the_database_can_compare_it():
    assert desk_day_start(NOON).tzinfo is UTC


def test_just_after_midnight_lisbon_time_the_new_day_has_started():
    assert desk_day_start(utc(2026, 11, 20, 0, 0)) == utc(2026, 11, 20, 0, 0)


def test_one_second_before_midnight_the_old_day_is_still_running():
    assert desk_day_start(utc(2026, 11, 19, 23, 59, 59)) == utc(2026, 11, 19, 0, 0)


def test_after_the_clock_change_of_28_march_2027_midnight_in_lisbon_is_23_00_utc():
    # At 23:30 UTC it is already 00:30 on 29 March in Lisbon (UTC+1). That day began at 23:00 UTC.
    assert desk_day_start(utc(2027, 3, 28, 23, 30)) == utc(2027, 3, 28, 23, 0)


def test_before_the_clock_change_the_day_of_28_march_began_at_midnight_utc():
    # At 22:59 UTC it is 23:59 on 28 March in Lisbon (UTC+1). That day began at 00:00 UTC+0.
    assert desk_day_start(utc(2027, 3, 28, 22, 59)) == utc(2027, 3, 28, 0, 0)


def test_in_summer_midnight_in_lisbon_is_23_00_utc_the_evening_before():
    assert desk_day_start(utc(2027, 7, 1, 12, 0)) == utc(2027, 6, 30, 23, 0)


def test_a_time_with_another_offset_is_converted_first():
    paris = timezone(timedelta(hours=1))

    assert desk_day_start(datetime(2026, 11, 20, 0, 30, tzinfo=paris)) == utc(2026, 11, 19, 0, 0)


def test_a_missing_time_zone_falls_back_to_utc():
    assert load_desk_timezone("Nowhere/Not_A_Zone") is UTC


def test_the_real_time_zone_is_found():
    assert str(load_desk_timezone(DESK_TIMEZONE_NAME)) == "Europe/Lisbon"


def test_without_time_zone_data_the_day_starts_at_midnight_utc():
    assert desk_day_start(utc(2027, 7, 1, 12, 0), UTC) == utc(2027, 7, 1, 0, 0)


# --- the closing time ---


def test_the_effective_closing_time_is_the_earliest_one_given():
    early, middle, late = utc(2026, 12, 1), utc(2026, 12, 15), utc(2026, 12, 31)

    assert effective_closes_at(late, early, middle) == early


def test_a_time_that_is_not_known_is_left_out_of_the_comparison():
    assert effective_closes_at(None, utc(2026, 12, 15), None) == utc(2026, 12, 15)


def test_one_time_alone_is_the_effective_closing_time():
    assert effective_closes_at(utc(2026, 12, 15)) == utc(2026, 12, 15)


def test_with_no_time_at_all_there_is_no_closing_time_to_give():
    with pytest.raises(ValueError, match="at least one"):
        effective_closes_at(None, None)


def test_staking_is_open_before_the_closing_time():
    assert is_staking_open(utc(2026, 11, 20, 12, 0, 1), NOON) is True


def test_closing_at_exactly_now_counts_as_closed():
    assert is_staking_open(NOON, NOON) is False


def test_staking_is_closed_after_the_closing_time():
    assert is_staking_open(utc(2026, 11, 20, 11, 59, 59), NOON) is False


# --- the coins a captain may still stake today ---


@pytest.mark.parametrize(
    ("staked_today", "left"), [(0, 200), (70, 130), (199, 1), (200, 0), (250, 0)]
)
def test_coins_left_today_never_go_below_zero(staked_today, left):
    assert coins_left_today(staked_today) == left
