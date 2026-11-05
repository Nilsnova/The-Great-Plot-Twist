"""Tests for market/rules.py: the price rules of the Island Exchange, with fixed numbers.

No network, no database, no real clock. The "now" of every test is written out.
"""

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfoNotFoundError

import pytest

from server.market import rules
from server.market.rules import (
    LIVE,
    REPLAY,
    Base,
    evaluate,
    has_hit_breaker,
    limit_to_breaker_band,
    market_day_start,
    move_percent,
    price_from_real,
    price_limits,
)

D = Decimal

# Thursday 5 Nov 2026, 12:00 UTC. Lisbon is on winter time (UTC+0), so it is 12:00 there too and
# the market day began at 08:00 today.
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
TODAY_08 = datetime(2026, 11, 5, 8, 0, tzinfo=UTC)
START_PRICE = D("100.00")
BASE_REAL = D("50000")

needs_timezone_data = pytest.mark.skipif(
    rules.MARKET_TIMEZONE is UTC, reason="this computer has no timezone database"
)


def make_base(**changes) -> Base:
    """A base set one hour ago (after 08:00 today): game price 100, real price 50000, live."""
    values = {
        "game_price": D("100.00"),
        "real_price": BASE_REAL,
        "set_at": NOW - timedelta(hours=1),
        "source": LIVE,
    }
    values.update(changes)
    return Base(**values)


def real_after(percent: str) -> Decimal:
    """The real price after a real move of `percent` from BASE_REAL, for example "0.12"."""
    return BASE_REAL * (1 + D(percent) / 100)


def look(base, real_price, now=NOW, source=LIVE, multiplier=100, start_price=START_PRICE):
    return evaluate(base, start_price, real_price, source, now, multiplier)


# --- rule 1: the amplified price ---


def test_a_real_price_that_did_not_move_leaves_the_game_price_where_it_is():
    assert price_from_real(D("100"), BASE_REAL, BASE_REAL, 100, START_PRICE) == D("100.00")


def test_a_real_rise_of_0_12_percent_is_a_game_rise_of_12_percent_at_multiplier_100():
    assert price_from_real(D("100"), BASE_REAL, D("50060"), 100, START_PRICE) == D("112.00")


def test_a_real_fall_of_0_1_percent_is_a_game_fall_of_10_percent_at_multiplier_100():
    assert price_from_real(D("100"), BASE_REAL, D("49950"), 100, START_PRICE) == D("90.00")


def test_a_real_rise_of_0_5_percent_is_a_game_rise_of_10_percent_at_multiplier_20():
    assert price_from_real(D("100"), BASE_REAL, D("50250"), 20, START_PRICE) == D("110.00")


def test_the_move_is_measured_from_the_base_game_price_not_from_100():
    assert price_from_real(D("40.00"), BASE_REAL, D("50060"), 100, START_PRICE) == D("44.80")


def test_prices_are_rounded_to_whole_cents_with_halves_going_up():
    # 10 x (1 + 100 x 0.000005) = 10.005 exactly, so the half goes up to 10.01.
    assert price_from_real(D("10.00"), BASE_REAL, D("50000.25"), 100, D("10.00")) == D("10.01")


# --- rule 2: the floor and the ceiling are measured from the START price ---


def test_the_floor_is_25_percent_and_the_ceiling_is_400_percent_of_the_start_price():
    assert price_limits(D("40.00")) == (D("10.00"), D("160.00"))


def test_the_price_never_falls_below_25_percent_of_the_start_price():
    # A real fall of 1 % at multiplier 100 would give 100 x (1 - 1.00) = 0.
    assert price_from_real(D("100"), BASE_REAL, D("49500"), 100, START_PRICE) == D("25.00")


def test_a_fall_that_would_make_the_price_negative_still_gives_the_floor():
    assert price_from_real(D("100"), BASE_REAL, D("49000"), 100, START_PRICE) == D("25.00")


def test_the_floor_comes_from_the_start_price_of_the_company_not_from_the_base():
    # The base game price is 60 but the start price is 40: the floor is 10.00, not 15.00.
    assert price_from_real(D("60.00"), BASE_REAL, D("49000"), 100, D("40.00")) == D("10.00")


def test_the_price_never_rises_above_four_times_the_start_price():
    # A real rise of 4 % at multiplier 100 would give 100 x (1 + 4.00) = 500.
    assert price_from_real(D("100"), BASE_REAL, D("52000"), 100, START_PRICE) == D("400.00")


def test_the_ceiling_comes_from_the_start_price_of_the_company_not_from_the_base():
    # The base game price is 60 but the start price is 40: the ceiling is 160.00.
    assert price_from_real(D("60.00"), BASE_REAL, D("52000"), 100, D("40.00")) == D("160.00")


def test_a_price_just_inside_the_limits_is_not_changed():
    assert price_from_real(D("100"), BASE_REAL, D("49800"), 100, START_PRICE) == D("60.00")
    assert price_from_real(D("100"), BASE_REAL, D("51500"), 100, START_PRICE) == D("400.00")


def test_a_price_is_never_below_one_cent_even_when_the_floor_is_less():
    # A start price of 0.02 has a floor of 0.005, which is less than one cent.
    assert price_from_real(D("0.02"), BASE_REAL, D("49000"), 100, D("0.02")) == D("0.01")


def test_ten_falls_in_a_row_cannot_take_a_company_below_its_floor_and_it_can_move_again():
    # The old rule (5 % of the base) let the price sink to one cent, where nothing could move it.
    base = make_base()
    now = NOW
    for _ in range(10):
        fall = look(base, base.real_price * D("0.95"), now=now)  # a deep fall: the breaker trips
        now = fall.halted_until if fall.halted_until else now
        base = look(fall.base, base.real_price * D("0.95"), now=now).base  # the pause is over

    assert base.game_price >= D("25.00")
    rise = look(base, base.real_price * D("1.0012"), now=now + timedelta(minutes=1))
    assert rise.price == (base.game_price * D("1.12")).quantize(D("0.01"))


def test_ten_rises_in_a_row_cannot_take_a_company_above_its_ceiling():
    base = make_base()
    now = NOW
    for _ in range(10):
        rise = look(base, base.real_price * D("1.05"), now=now)
        now = rise.halted_until if rise.halted_until else now
        base = look(rise.base, base.real_price * D("1.05"), now=now).base

    assert base.game_price <= D("400.00")


# --- rule 3: the circuit breaker ---


@pytest.mark.parametrize(
    ("price", "tripped"),
    [("129.99", False), ("130.00", True), ("200.00", True), ("70.01", False), ("70.00", True)],
)
def test_the_breaker_trips_at_exactly_30_percent_away_from_a_base_of_100(price, tripped):
    assert has_hit_breaker(D(price), D("100.00")) is tripped


@pytest.mark.parametrize(("price", "tripped"), [("32.49", False), ("32.50", True)])
def test_the_breaker_counts_30_percent_of_the_base_game_price_not_of_100(price, tripped):
    assert has_hit_breaker(D(price), D("25.00")) is tripped


def test_a_price_beyond_the_limit_is_held_at_130_percent_of_the_base():
    assert limit_to_breaker_band(D("250.00"), D("100.00")) == D("130.00")


def test_a_price_below_the_limit_is_held_at_70_percent_of_the_base():
    assert limit_to_breaker_band(D("3.00"), D("100.00")) == D("70.00")


def test_a_price_inside_the_band_is_not_changed_by_the_limit():
    assert limit_to_breaker_band(D("111.11"), D("100.00")) == D("111.11")


def test_the_limit_is_rounded_to_whole_cents():
    # 33.33 x 1.30 = 43.329
    assert limit_to_breaker_band(D("99.00"), D("33.33")) == D("43.33")


def test_the_move_in_percent_is_measured_from_the_base_game_price():
    assert move_percent(D("112.00"), D("100.00")) == D("12.00")
    assert move_percent(D("87.50"), D("100.00")) == D("-12.50")


# --- rule 4: the market day starts at 08:00 Lisbon time ---


def test_the_market_day_of_noon_began_at_08_00_the_same_day():
    assert market_day_start(NOW) == TODAY_08


def test_the_market_day_of_07_59_began_at_08_00_the_day_before():
    now = datetime(2026, 11, 5, 7, 59, tzinfo=UTC)

    assert market_day_start(now) == datetime(2026, 11, 4, 8, 0, tzinfo=UTC)


def test_the_market_day_that_starts_exactly_now_is_the_new_day():
    assert market_day_start(TODAY_08) == TODAY_08


@needs_timezone_data
def test_a_time_given_in_another_timezone_gives_the_same_answer():
    same_moment = NOW.astimezone(rules.ZoneInfo("America/New_York"))

    assert market_day_start(same_moment) == TODAY_08


@needs_timezone_data
def test_in_summer_lisbon_is_one_hour_ahead_of_utc_so_08_00_there_is_07_00_utc():
    now = datetime(2027, 7, 1, 12, 0, tzinfo=UTC)

    assert market_day_start(now) == datetime(2027, 7, 1, 7, 0, tzinfo=UTC)


@needs_timezone_data
def test_the_day_the_clocks_go_forward_still_starts_at_08_00_local_time():
    # In 2027 Portugal changes to summer time on Sunday 28 March, at 01:00 UTC.
    before_change = datetime(2027, 3, 27, 12, 0, tzinfo=UTC)
    after_change = datetime(2027, 3, 28, 12, 0, tzinfo=UTC)

    assert market_day_start(before_change) == datetime(2027, 3, 27, 8, 0, tzinfo=UTC)
    assert market_day_start(after_change) == datetime(2027, 3, 28, 7, 0, tzinfo=UTC)


def test_a_server_without_timezone_data_uses_utc_and_says_so(monkeypatch, caplog):
    def no_such_zone(name):
        raise ZoneInfoNotFoundError(name)

    monkeypatch.setattr(rules, "ZoneInfo", no_such_zone)

    with caplog.at_level(logging.WARNING):
        zone = rules.load_market_timezone()

    assert zone is UTC
    assert "timezone database" in caplog.text


# --- evaluate: a company that was never looked at ---


def test_a_new_company_starts_at_its_start_price_with_a_base_to_save():
    result = look(None, D("50000"))

    assert result.price == D("100.00")
    assert result.move_percent == D("0.00")
    assert result.halted_until is None
    assert result.must_save is True
    assert result.base == Base(D("100.00"), D("50000"), NOW, LIVE)


# --- evaluate: an open company ---


def test_a_small_real_move_gives_the_amplified_price_and_saves_nothing():
    result = look(make_base(), real_after("0.12"))

    assert result.price == D("112.00")
    assert result.move_percent == D("12.00")
    assert result.must_save is False
    assert result.halted_until is None


def test_a_real_move_of_0_29_percent_is_a_game_move_of_29_percent_and_does_not_trip():
    result = look(make_base(), real_after("0.29"))

    assert result.price == D("129.00")
    assert result.halted_until is None


def test_a_real_rise_of_0_3_percent_trips_the_breaker_and_pauses_for_15_minutes():
    result = look(make_base(), real_after("0.30"))

    assert result.price == D("130.00")
    assert result.halted_until == NOW + timedelta(minutes=15)
    assert result.base.frozen_price == D("130.00")
    assert result.must_save is True


def test_a_real_fall_of_0_3_percent_trips_the_breaker_downwards():
    result = look(make_base(), real_after("-0.30"))

    assert result.price == D("70.00")
    assert result.move_percent == D("-30.00")
    assert result.halted_until == NOW + timedelta(minutes=15)


def test_a_huge_jump_freezes_the_price_at_the_limit_not_at_the_jump():
    result = look(make_base(), real_after("3"))  # the raw game price would be 400

    assert result.price == D("130.00")


def test_a_huge_fall_freezes_the_price_at_70_percent_not_at_the_floor():
    result = look(make_base(), real_after("-3"))  # the raw game price would be the floor, 25.00

    assert result.price == D("70.00")


def test_a_tripped_company_keeps_its_old_base_so_the_move_stays_visible():
    result = look(make_base(), real_after("0.30"))

    assert result.base.game_price == D("100.00")
    assert result.base.real_price == BASE_REAL
    assert result.base.set_at == NOW - timedelta(hours=1)


def test_the_breaker_uses_the_multiplier_so_at_20_it_takes_a_real_move_of_1_5_percent():
    just_below = look(make_base(), real_after("1.49"), multiplier=20)
    at_limit = look(make_base(), real_after("1.50"), multiplier=20)

    assert just_below.halted_until is None
    assert at_limit.halted_until is not None


# --- evaluate: a paused company ---


def make_paused_base(minutes_ago: float = 0) -> Base:
    """A base of a company that was paused `minutes_ago` minutes before NOW, frozen at 130."""
    paused_at = NOW - timedelta(minutes=minutes_ago)
    return make_base(halted_until=paused_at + timedelta(minutes=15), frozen_price=D("130.00"))


def test_a_paused_company_stays_frozen_whatever_the_real_price_does():
    result = look(make_paused_base(minutes_ago=5), real_after("-2"))

    assert result.price == D("130.00")
    assert result.halted_until == NOW + timedelta(minutes=10)
    assert result.must_save is False


def test_a_paused_company_shows_the_move_that_paused_it():
    result = look(make_paused_base(minutes_ago=5), real_after("0"))

    assert result.move_percent == D("30.00")


def test_a_company_is_still_paused_one_second_before_the_15_minutes_are_over():
    paused = make_paused_base(minutes_ago=15)
    result = look(paused, BASE_REAL, now=paused.halted_until - timedelta(seconds=1))

    assert result.halted_until == paused.halted_until


def test_a_company_restarts_from_its_frozen_price_when_the_15_minutes_are_over():
    result = look(make_paused_base(minutes_ago=15), real_after("0.40"))

    assert result.price == D("130.00")
    assert result.move_percent == D("0.00")
    assert result.halted_until is None
    assert result.must_save is True


def test_after_a_pause_the_new_base_is_the_frozen_price_and_the_real_price_of_that_moment():
    result = look(make_paused_base(minutes_ago=15), real_after("0.40"))

    assert result.base.game_price == D("130.00")
    assert result.base.real_price == real_after("0.40")
    assert result.base.set_at == NOW
    assert result.base.halted_until is None
    assert result.base.frozen_price is None


def test_the_real_moves_during_the_pause_do_not_count():
    restarted = look(make_paused_base(minutes_ago=15), real_after("0.40")).base

    later = look(restarted, real_after("0.40"), now=NOW + timedelta(minutes=1))

    assert later.price == D("130.00")
    assert later.halted_until is None


def test_a_company_can_trip_again_after_it_has_restarted():
    restarted = look(make_paused_base(minutes_ago=15), real_after("0.40")).base

    # Real price +0.31 % from the restart point: 130 x (1 + 100 x 0.0031) = 170.30, past +30 %.
    result = look(restarted, real_after("0.40") * D("1.0031"), now=NOW + timedelta(minutes=2))

    assert result.price == D("169.00")  # held at 130 x 1.30
    assert result.halted_until == NOW + timedelta(minutes=17)


# --- evaluate: a new market day ---


def test_the_first_look_after_08_00_re_bases_and_keeps_the_game_price():
    yesterday_noon = NOW - timedelta(days=1)
    base = make_base(set_at=yesterday_noon)

    result = look(base, real_after("0.12"))

    assert result.price == D("112.00")
    assert result.must_save is True
    assert result.base.game_price == D("112.00")
    assert result.base.real_price == real_after("0.12")
    assert result.base.set_at == NOW


def test_after_the_re_base_the_move_starts_from_zero_again():
    yesterday_noon = NOW - timedelta(days=1)

    result = look(make_base(set_at=yesterday_noon), real_after("0.12"))

    assert result.move_percent == D("0.00")


def test_a_base_set_after_08_00_today_is_not_re_based_again():
    base = make_base(set_at=TODAY_08 + timedelta(minutes=1))

    assert look(base, real_after("0.12")).must_save is False


def test_a_base_set_exactly_at_08_00_is_not_re_based_again():
    assert look(make_base(set_at=TODAY_08), real_after("0.12")).must_save is False


def test_a_base_set_one_second_before_08_00_is_re_based():
    base = make_base(set_at=TODAY_08 - timedelta(seconds=1))

    assert look(base, real_after("0.12")).must_save is True


def test_the_breaker_wins_over_the_daily_re_base():
    # The price moved 40 % while nobody looked, and a new day began meanwhile.
    result = look(make_base(set_at=NOW - timedelta(days=1)), real_after("0.40"))

    assert result.halted_until is not None
    assert result.price == D("130.00")
    assert result.base.game_price == D("100.00")


# --- evaluate: the real prices come from another source ---


def test_when_the_source_changes_the_company_goes_back_to_its_base_game_price():
    # Live prices put the company at 112.00 (+12 %). The recorded prices cannot be compared with
    # the live ones, so the move since the base is dropped: the price steps back to the base, 100.
    replay_price = D("48000")  # a very different level than the live base of 50000
    assert look(make_base(), real_after("0.12")).price == D("112.00")

    result = look(make_base(), replay_price, source=REPLAY)

    assert result.price == D("100.00")
    assert result.move_percent == D("0.00")
    assert result.halted_until is None
    assert result.must_save is True
    assert result.base.real_price == replay_price
    assert result.base.source == REPLAY


def test_a_source_change_can_step_a_price_back_by_the_whole_breaker_band():
    # A company 29 % above its base (129.00) is back at the base after the switch: a fall of 22 %.
    before = look(make_base(), real_after("0.29")).price
    after = look(make_base(), D("48000"), source=REPLAY).price

    assert before == D("129.00")
    assert after == D("100.00")


def test_after_a_source_change_the_new_source_is_measured_from_the_new_start():
    switched = look(make_base(), D("48000"), source=REPLAY).base

    result = look(switched, D("48057.6"), source=REPLAY, now=NOW + timedelta(minutes=1))

    assert result.price == D("112.00")  # +0.12 % of 48000
    assert result.must_save is False


def test_a_paused_company_takes_the_new_source_when_it_restarts():
    result = look(make_paused_base(minutes_ago=15), D("48000"), source=REPLAY)

    assert result.price == D("130.00")
    assert result.base.source == REPLAY
    assert result.base.real_price == D("48000")
