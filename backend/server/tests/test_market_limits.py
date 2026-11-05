"""Tests for market/limits.py: the speed limit for trades. A fake clock, no network."""

import pytest

from server.errors import ApiError
from server.market.limits import (
    MAX_PLAYERS_REMEMBERED,
    MAX_TRADES,
    WINDOW_SECONDS,
    TradeLimiter,
)
from server.tests.helpers import FakeClock

PLAYER = "11111111-2222-4333-8444-555555555555"
OTHER_PLAYER = "99999999-2222-4333-8444-555555555555"


def make_limiter(clock: FakeClock, max_trades: int = 3, window_seconds: float = 30):
    return TradeLimiter(max_trades=max_trades, window_seconds=window_seconds, clock=clock)


def trade_n_times(limiter: TradeLimiter, times: int, player: str = PLAYER) -> None:
    for _ in range(times):
        limiter.check(player)


def test_the_agreed_limit_is_10_trades_in_30_seconds():
    assert (MAX_TRADES, WINDOW_SECONDS) == (10, 30)


def test_a_player_may_trade_up_to_the_limit():
    limiter = make_limiter(FakeClock(), max_trades=3)

    trade_n_times(limiter, 3)  # raises nothing


def test_one_trade_more_than_the_limit_is_a_429_with_the_standard_code():
    limiter = make_limiter(FakeClock(), max_trades=3)
    trade_n_times(limiter, 3)

    with pytest.raises(ApiError) as refused:
        limiter.check(PLAYER)

    assert refused.value.status_code == 429
    assert refused.value.code == "too_many_requests"


def test_the_answer_says_how_many_seconds_to_wait():
    clock = FakeClock()
    limiter = make_limiter(clock, max_trades=3, window_seconds=30)
    trade_n_times(limiter, 3)
    clock.advance(10)  # the oldest trade is 10 seconds old: it leaves the window in 20 seconds

    with pytest.raises(ApiError) as refused:
        limiter.check(PLAYER)

    assert refused.value.headers == {"Retry-After": "20"}


def test_after_the_window_the_player_may_trade_again():
    clock = FakeClock()
    limiter = make_limiter(clock, max_trades=3, window_seconds=30)
    trade_n_times(limiter, 3)

    clock.advance(30)

    limiter.check(PLAYER)  # raises nothing


def test_a_refused_attempt_is_not_counted_so_waiting_always_helps():
    clock = FakeClock()
    limiter = make_limiter(clock, max_trades=2, window_seconds=30)
    trade_n_times(limiter, 2)
    for _ in range(5):
        with pytest.raises(ApiError, match="trading very fast"):
            limiter.check(PLAYER)

    clock.advance(30)

    trade_n_times(limiter, 2)  # the five refusals left no mark


def test_the_limit_is_per_player():
    limiter = make_limiter(FakeClock(), max_trades=3)
    trade_n_times(limiter, 3)

    limiter.check(OTHER_PLAYER)  # raises nothing


def test_the_window_slides_so_old_trades_stop_counting_one_by_one():
    clock = FakeClock()
    limiter = make_limiter(clock, max_trades=2, window_seconds=30)
    limiter.check(PLAYER)  # at 0 s
    clock.advance(20)
    limiter.check(PLAYER)  # at 20 s

    clock.advance(11)  # at 31 s: the first trade has left the window, the second has not

    limiter.check(PLAYER)  # raises nothing
    with pytest.raises(ApiError, match="trading very fast"):
        limiter.check(PLAYER)


def test_the_memory_forgets_quiet_players_when_it_gets_big():
    clock = FakeClock()
    limiter = make_limiter(clock)
    for number in range(MAX_PLAYERS_REMEMBERED + 1):
        limiter.check(f"player-{number}")

    clock.advance(60)
    limiter.check("one-more-player")

    assert list(limiter.recent_trades) == ["one-more-player"]
