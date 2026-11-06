"""Tests for market/replay.py: the recorded day that plays in demo mode, and its file.

These tests were part of the feed tests in v1 and moved with the code. Nothing here uses the
network or the real clock.
"""

import json
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from server.market.replay import (
    REPLAY_FILE,
    Replay,
    ReplayError,
    check_has_symbols,
    load_replay,
    ping_pong_index,
    replay_minute,
)

D = Decimal

SYMBOLS = ("BTCUSDT", "ETHUSDT", "EURUSDT")

# A small replay of 4 minutes, so the tests can follow it by eye.
SMALL_REPLAY = Replay(
    closes={
        "BTCUSDT": (D("100"), D("101"), D("102"), D("103")),
        "ETHUSDT": (D("10"), D("11"), D("12"), D("13")),
        "EURUSDT": (D("1.1"), D("1.2"), D("1.3"), D("1.4")),
    },
    candles=4,
    candle_seconds=60,
    credit="Binance Vision",
    licence="CC BY-NC-SA 4.0",
)


def at_minute(minute: int) -> datetime:
    """A time `minute` whole minutes after the start of the Unix epoch, plus 17 seconds."""
    return datetime.fromtimestamp(minute * 60 + 17, UTC)


# --- playing the recording ---


def test_the_replay_plays_forward_then_backward_forever():
    steps = [ping_pong_index(step, 4) for step in range(10)]

    assert steps == [0, 1, 2, 3, 2, 1, 0, 1, 2, 3]


def test_a_replay_of_two_minutes_goes_back_and_forth():
    assert [ping_pong_index(step, 2) for step in range(5)] == [0, 1, 0, 1, 0]


def test_the_replay_plays_the_recorded_minute_that_belongs_to_the_clock():
    # 4 recorded minutes make a turn of 6 steps, and 8 % 6 = 2, so recorded minute 2 plays.
    minute = replay_minute(SMALL_REPLAY, SYMBOLS, at_minute(8))

    assert minute.prices["BTCUSDT"] == D("102")
    assert minute.prices["EURUSDT"] == D("1.3")


def test_the_same_time_always_gives_the_same_replay_prices():
    first = replay_minute(SMALL_REPLAY, SYMBOLS, at_minute(1234))
    second = replay_minute(SMALL_REPLAY, SYMBOLS, at_minute(1234))

    assert first == second


def test_the_replay_time_is_shifted_to_now_it_says_the_start_of_the_current_minute():
    now = at_minute(1234)

    assert replay_minute(SMALL_REPLAY, SYMBOLS, now).as_of == now.replace(second=0)


def test_the_replay_moves_on_by_one_recorded_minute_per_real_minute():
    first = replay_minute(SMALL_REPLAY, SYMBOLS, at_minute(1000))
    second = replay_minute(SMALL_REPLAY, SYMBOLS, at_minute(1001))

    assert first.prices != second.prices


def test_a_replay_lacking_a_symbol_the_island_companies_need_is_refused():
    with pytest.raises(ReplayError, match="SOLUSDT"):
        check_has_symbols(SMALL_REPLAY, ("BTCUSDT", "SOLUSDT"))


def test_a_replay_that_has_all_the_symbols_is_accepted():
    check_has_symbols(SMALL_REPLAY, SYMBOLS)  # raises nothing


# --- the replay file in the repository ---

REAL_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "EURUSDT", "PAXGUSDT")


def test_the_real_replay_has_90_minutes_for_all_seven_symbols():
    replay = load_replay()

    assert replay.candles == 90
    assert replay.candle_seconds == 60
    assert tuple(replay.closes) == REAL_SYMBOLS
    assert all(len(prices) == 90 for prices in replay.closes.values())


def test_the_real_replay_credits_binance_vision_and_names_its_licence():
    replay = load_replay()
    text = REPLAY_FILE.read_text()

    assert replay.credit == "Binance Vision"
    assert replay.licence == "CC BY-NC-SA 4.0"
    assert replay.licence_url == "https://creativecommons.org/licenses/by-nc-sa/4.0/"
    assert "https://creativecommons.org/licenses/by-nc-sa/4.0/" in text
    assert "Binance_Vision-Terms_of_Use.pdf" in text
    assert "changes" in json.loads(text)  # CC BY says: say what you changed


def test_the_real_replay_knows_the_day_it_was_recorded():
    assert load_replay().recorded_on == date(2026, 11, 4)


def test_the_real_replay_has_only_prices_above_zero():
    replay = load_replay()

    assert all(price > 0 for prices in replay.closes.values() for price in prices)


def test_the_real_replay_has_no_jump_of_more_than_half_a_percent_between_two_minutes():
    replay = load_replay()
    biggest = {}
    for symbol, prices in replay.closes.items():
        steps = [abs(prices[i + 1] / prices[i] - 1) for i in range(len(prices) - 1)]
        biggest[symbol] = max(steps)

    assert all(step < D("0.005") for step in biggest.values()), biggest


def test_the_real_replay_prices_are_in_the_range_of_the_instruments():
    closes = load_replay().closes

    assert D("50000") < closes["BTCUSDT"][0] < D("150000")
    assert D("1.0") < closes["EURUSDT"][0] < D("1.3")
    assert D("3000") < closes["PAXGUSDT"][0] < D("6000")


def test_the_real_replay_works_with_the_island_companies():
    from server.market.companies import load_companies

    symbols = [company.symbol for company in load_companies() if company.symbol]

    check_has_symbols(load_replay(), symbols)  # raises ReplayError if a symbol were missing


# --- a damaged replay file is refused with a clear message ---


def write_replay(tmp_path, **changes):
    data = {
        "credit": "Binance Vision",
        "licence": "CC BY-NC-SA 4.0",
        "candleSeconds": 60,
        "candles": 3,
        "closes": {"BTCUSDT": [1.5, 2, 3.25]},
    }
    data.update(changes)
    path = tmp_path / "replay.json"
    path.write_text(json.dumps(data))
    return path


def test_a_small_good_replay_loads_with_exact_numbers(tmp_path):
    replay = load_replay(write_replay(tmp_path))

    assert replay.closes["BTCUSDT"] == (D("1.5"), D("2"), D("3.25"))


def test_a_replay_without_a_licence_link_loads_and_has_none(tmp_path):
    assert load_replay(write_replay(tmp_path)).licence_url is None


def test_a_replay_with_a_licence_link_keeps_it(tmp_path):
    replay = load_replay(write_replay(tmp_path, licenceUrl="https://example.org/licence"))

    assert replay.licence_url == "https://example.org/licence"


def test_a_replay_without_a_recording_day_loads_and_has_none(tmp_path):
    assert load_replay(write_replay(tmp_path)).recorded_on is None


def test_a_replay_with_a_first_candle_time_knows_its_day(tmp_path):
    replay = load_replay(write_replay(tmp_path, firstCandleUtc="2026-11-04T11:00:00Z"))

    assert replay.recorded_on == date(2026, 11, 4)


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"credit": ""}, "credit"),
        ({"credit": None}, "credit"),
        ({"licence": ""}, "licence"),
        ({"candles": 1, "closes": {"BTCUSDT": [1]}}, "candles"),
        ({"candles": "3"}, "candles"),
        ({"candleSeconds": 0}, "candleSeconds"),
        ({"closes": {}}, "no prices"),
        ({"closes": {"BTCUSDT": [1, 2]}}, "does not have 3 prices"),
        ({"closes": {"BTCUSDT": [1, 2, 0]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, -3]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, "3"]}}, "not above 0"),
        ({"closes": {"BTCUSDT": [1, 2, True]}}, "not above 0"),
        ({"licenceUrl": "javascript:alert(1)"}, "licenceUrl"),
        ({"licenceUrl": "http://example.org/licence"}, "licenceUrl"),
        ({"licenceUrl": 5}, "licenceUrl"),
        ({"firstCandleUtc": "someday"}, "firstCandleUtc"),
    ],
)
def test_a_damaged_replay_is_refused(tmp_path, changes, message):
    with pytest.raises(ReplayError, match=message):
        load_replay(write_replay(tmp_path, **changes))


def test_a_replay_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "replay.json"
    path.write_text("nope")

    with pytest.raises(ReplayError, match="Cannot read"):
        load_replay(path)
