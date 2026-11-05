"""Tests for market/store.py: reading numbers and times from the database, the two base stores,
and the arguments of the two database functions. No network: the database is a fake transport.
"""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from server.market.rules import Base
from server.market.store import (
    DatabaseBaseStore,
    MemoryBaseStore,
    database_is_configured,
    plain,
    read_trade_reply,
    row_to_base,
    save_arguments,
    to_decimal,
    to_time,
    to_whole_number,
    trade_arguments,
    trade_exists,
)
from server.market.trade_rules import (
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MIN_HOLD_SECONDS,
    TradeAmounts,
)
from server.supabase_admin import SupabaseAdmin, SupabaseRejected
from server.tests.helpers import make_admin

D = Decimal
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)

BASE_ROW = {
    "company_id": "harbor-trust",
    "base_game_price": 60.0,
    "base_real_price": 76159.21,
    "base_at": "2026-11-05T12:00:00+00:00",
    "base_source": "live",
    "halted_until": None,
    "frozen_price": None,
    "version": 3,
}


def run(coroutine):
    return asyncio.run(coroutine)


# --- numbers and times from the database ---


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (60, D("60")),
        (60.0, D("60.0")),
        (76159.21, D("76159.21")),
        (0.1, D("0.1")),
        ("12.3400", D("12.3400")),
    ],
)
def test_a_number_from_the_database_becomes_the_exact_decimal_it_was_written_as(value, expected):
    assert to_decimal(value) == expected


def test_a_float_is_not_turned_into_its_long_binary_expansion():
    assert str(to_decimal(0.1)) == "0.1"


@pytest.mark.parametrize("value", [None, True, [1], {"a": 1}, "abc", "NaN-ish"])
def test_something_that_is_not_a_number_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_decimal(value)


@pytest.mark.parametrize("value", [5, 5.0, 0, 1_000_000])
def test_a_whole_number_is_accepted(value):
    assert to_whole_number(value) == int(value)


@pytest.mark.parametrize("value", [5.5, True, "5", None, [5]])
def test_something_that_is_not_a_whole_number_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_whole_number(value)


def test_a_time_with_a_timezone_is_read():
    assert to_time("2026-11-05T12:00:00+00:00") == NOW
    assert to_time("2026-11-05T12:00:00.250000+00:00") == NOW.replace(microsecond=250000)


@pytest.mark.parametrize("value", ["2026-11-05T12:00:00", "yesterday", 5, None])
def test_a_time_without_a_timezone_or_that_is_not_text_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_time(value)


@pytest.mark.parametrize(
    ("value", "text"), [(D("60.00"), "60.00"), (D("1E+3"), "1000"), (D("0.00001234"), "0.00001234")]
)
def test_a_decimal_is_written_for_the_database_without_an_exponent(value, text):
    assert plain(value) == text


# --- a row of market_bases ---


def test_a_row_of_market_bases_becomes_a_base():
    assert row_to_base(BASE_ROW) == Base(
        game_price=D("60.0"),
        real_price=D("76159.21"),
        set_at=NOW,
        source="live",
        halted_until=None,
        frozen_price=None,
        version=3,
    )


def test_a_paused_row_keeps_its_pause_time_and_frozen_price():
    row = {**BASE_ROW, "halted_until": "2026-11-05T12:15:00+00:00", "frozen_price": 78.0}

    base = row_to_base(row)

    assert base.halted_until == NOW.replace(minute=15)
    assert base.frozen_price == D("78.0")


@pytest.mark.parametrize("missing", [name for name in BASE_ROW if name != "company_id"])
def test_a_row_with_a_missing_column_is_refused(missing):
    row = {name: value for name, value in BASE_ROW.items() if name != missing}

    with pytest.raises(SupabaseRejected):
        row_to_base(row)


def test_the_database_store_refuses_a_row_without_a_company_id():
    row = {name: value for name, value in BASE_ROW.items() if name != "company_id"}
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[row]))

    with pytest.raises(SupabaseRejected):
        run(DatabaseBaseStore(admin).read_all())


def test_the_arguments_of_market_set_base_use_the_names_of_the_sql_parameters():
    base = Base(D("60.00"), D("76159.21"), NOW, "live", version=2)

    assert save_arguments("harbor-trust", base) == {
        "p_company_id": "harbor-trust",
        "p_base_game_price": "60.00",
        "p_base_real_price": "76159.21",
        "p_base_at": "2026-11-05T12:00:00+00:00",
        "p_base_source": "live",
        "p_halted_until": None,
        "p_frozen_price": None,
        "p_expected_version": 2,
    }


def test_a_pause_is_sent_with_its_end_and_frozen_price():
    base = Base(
        D("60.00"),
        D("76159.21"),
        NOW,
        "live",
        halted_until=NOW.replace(minute=15),
        frozen_price=D("78.00"),
        version=1,
    )

    sent = save_arguments("harbor-trust", base)

    assert sent["p_halted_until"] == "2026-11-05T12:15:00+00:00"
    assert sent["p_frozen_price"] == "78.00"


# --- the two base stores keep the same rules ---


def test_the_memory_store_creates_a_base_at_version_0_and_counts_up():
    store = MemoryBaseStore()
    base = Base(D("60.00"), D("100"), NOW, "live")

    assert run(store.save("harbor-trust", base)) is True
    assert run(store.read_all())["harbor-trust"].version == 1
    assert run(store.save("harbor-trust", run(store.read_all())["harbor-trust"])) is True
    assert run(store.read_all())["harbor-trust"].version == 2


def test_the_memory_store_refuses_a_save_with_an_old_version():
    store = MemoryBaseStore()
    base = Base(D("60.00"), D("100"), NOW, "live")
    run(store.save("harbor-trust", base))

    assert run(store.save("harbor-trust", base)) is False  # still says version 0


def test_the_memory_store_keeps_one_base_per_company():
    store = MemoryBaseStore()
    run(store.save("harbor-trust", Base(D("60.00"), D("100"), NOW, "live")))
    run(store.save("tidewright-works", Base(D("40.00"), D("200"), NOW, "live")))

    assert sorted(run(store.read_all())) == ["harbor-trust", "tidewright-works"]


def test_reading_from_the_memory_store_gives_a_copy():
    store = MemoryBaseStore()
    run(store.save("harbor-trust", Base(D("60.00"), D("100"), NOW, "live")))

    run(store.read_all()).clear()

    assert "harbor-trust" in run(store.read_all())


def test_the_database_store_reads_every_row_of_market_bases():
    rows = [BASE_ROW, {**BASE_ROW, "company_id": "tidewright-works"}]
    admin, seen = make_admin(lambda request: httpx.Response(200, json=rows))

    bases = run(DatabaseBaseStore(admin).read_all())

    assert sorted(bases) == ["harbor-trust", "tidewright-works"]
    assert seen[0].method == "GET"
    assert seen[0].url.path == "/rest/v1/market_bases"


def test_the_database_store_says_saved_when_the_function_returns_a_version():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=2))
    base = Base(D("60.00"), D("100"), NOW, "live", version=1)

    assert run(DatabaseBaseStore(admin).save("harbor-trust", base)) is True
    assert seen[0].url.path == "/rest/v1/rpc/market_set_base"


def test_the_database_store_says_not_saved_when_the_function_returns_null():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=None))
    base = Base(D("60.00"), D("100"), NOW, "live", version=1)

    assert run(DatabaseBaseStore(admin).save("harbor-trust", base)) is False


# --- the answer of market_trade ---


def test_a_finished_trade_is_understood():
    outcome = read_trade_reply(
        {"status": "done", "balance": 694, "unitsAfter": 5, "avgPrice": 60.0, "tradeId": 1}
    )

    assert outcome.done is True
    assert (outcome.balance, outcome.units_after, outcome.avg_price) == (694, 5, D("60.0"))


def test_a_finished_trade_that_sold_everything_has_no_average_price():
    outcome = read_trade_reply(
        {"status": "done", "balance": 1, "unitsAfter": 0, "avgPrice": None, "tradeId": 2}
    )

    assert outcome.avg_price is None


def test_a_refusal_carries_its_reason_and_numbers():
    outcome = read_trade_reply({"status": "refused", "reason": "holding_time", "waitSeconds": 437})

    assert outcome.done is False
    assert (outcome.reason, outcome.wait_seconds) == ("holding_time", 437)


@pytest.mark.parametrize(
    "reply",
    [
        None,
        "done",
        [],
        {},
        {"status": "done"},
        {"status": "done", "balance": "1", "unitsAfter": 1},
        {"status": "refused"},
        {"status": "refused", "reason": 5},
        {"status": "maybe"},
    ],
)
def test_an_answer_that_is_not_understood_is_refused(reply):
    with pytest.raises(SupabaseRejected):
        read_trade_reply(reply)


def test_a_database_that_is_not_set_up_is_not_configured():
    assert database_is_configured(SupabaseAdmin("", "")) is False
    assert database_is_configured(SupabaseAdmin("https://x.supabase.co", "")) is False
    assert database_is_configured(SupabaseAdmin("https://x.supabase.co", "sb_secret_x")) is True


# --- the arguments of market_trade ---


def sent_arguments() -> dict:
    return trade_arguments(
        "player-1",
        "harbor-trust",
        "buy",
        5,
        D("60.00"),
        TradeAmounts(gross=300, fee=6),
        "market:click-0001",
        NOW,
    )


def test_the_limits_and_the_numbers_to_check_the_arithmetic_come_from_trade_rules():
    sent = sent_arguments()

    assert sent["p_min_hold_seconds"] == MIN_HOLD_SECONDS
    assert sent["p_daily_buy_cap"] == DAILY_BUY_CAP_COINS
    assert sent["p_fee_basis_points"] == FEE_BASIS_POINTS == 200
    assert sent["p_max_buy_coins"] == MAX_TRADE_COINS == 500


def test_the_price_and_the_coins_are_sent_as_exact_text_and_whole_numbers():
    sent = sent_arguments()

    assert sent["p_price"] == "60.00"
    assert (sent["p_gross"], sent["p_fee"]) == (300, 6)
    assert sent["p_day_start"] == "2026-11-05T12:00:00+00:00"


# --- has this click been traded already? ---


def test_a_ref_in_the_history_of_the_player_is_found():
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, json=[{"id": 7}])

    admin, _ = make_admin(reply)

    assert run(trade_exists(admin, "player-1", "market:click-0001")) is True
    params = seen[0].url.params
    assert params["player_id"] == "eq.player-1"
    assert params["ref"] == "eq.market:click-0001"
    assert params["limit"] == "1"


def test_a_ref_that_is_not_in_the_history_is_not_found():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[]))

    assert run(trade_exists(admin, "player-1", "market:click-0002")) is False
