"""Tests for market/trade_rules.py: whole coins, rounding against the player, the fee and limits.

Fixed numbers only. No network, no database, no real clock.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from server.market.trade_rules import (
    DAILY_BUY_CAP_COINS,
    FEE_BASIS_POINTS,
    MAX_TRADE_COINS,
    MIN_HOLD_MINUTES,
    MIN_HOLD_SECONDS,
    TradeAmounts,
    TradeRefused,
    buy_amounts,
    can_sell_now,
    check_trade_size,
    fee_for,
    sell_amounts,
    sellable_from,
)
from server.tests.helpers import assert_error

D = Decimal
BOUGHT_AT = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


# --- the agreed numbers ---


def test_the_fee_is_2_percent():
    assert FEE_BASIS_POINTS == 200


def test_shares_can_be_sold_10_minutes_after_the_latest_purchase():
    assert MIN_HOLD_MINUTES == 10
    assert MIN_HOLD_SECONDS == 600


def test_one_trade_can_be_worth_at_most_500_coins():
    assert MAX_TRADE_COINS == 500


def test_a_player_can_spend_at_most_2000_coins_on_shares_per_market_day():
    assert DAILY_BUY_CAP_COINS == 2000


# --- the fee ---


@pytest.mark.parametrize(
    ("gross", "fee"),
    [(1, 1), (25, 1), (50, 1), (51, 2), (100, 2), (101, 3), (500, 10)],
)
def test_the_fee_is_2_percent_of_the_shares_rounded_up(gross, fee):
    assert fee_for(gross) == fee


# --- buying: the player pays more, never less ---


def test_buying_5_units_at_12_coins_costs_60_coins_and_a_fee_of_2():
    amounts = buy_amounts(5, D("12.00"))

    assert amounts == TradeAmounts(gross=60, fee=2)
    assert amounts.paid_by_player == 62


def test_buying_rounds_the_shares_up_to_the_next_whole_coin():
    # 3 x 10.01 = 30.03, so the shares cost 31 coins. The fee is 2 % of 31 = 0.62, rounded up to 1.
    amounts = buy_amounts(3, D("10.01"))

    assert amounts == TradeAmounts(gross=31, fee=1)
    assert amounts.paid_by_player == 32


def test_buying_a_price_that_is_an_exact_number_of_coins_is_not_rounded_up():
    assert buy_amounts(4, D("12.50")).gross == 50


def test_buying_one_unit_of_a_cheap_share_still_costs_at_least_one_coin():
    assert buy_amounts(1, D("0.40")).gross == 1


# --- selling: the player gets less, never more ---


def test_selling_5_units_at_12_coins_brings_60_coins_minus_a_fee_of_2():
    amounts = sell_amounts(5, D("12.00"))

    assert amounts == TradeAmounts(gross=60, fee=2)
    assert amounts.received_by_player == 58


def test_selling_rounds_the_shares_down_to_the_whole_coin():
    # 3 x 10.01 = 30.03, so the shares bring 30 coins. The fee is 2 % of 30 = 0.6, rounded up to 1.
    amounts = sell_amounts(3, D("10.01"))

    assert amounts == TradeAmounts(gross=30, fee=1)
    assert amounts.received_by_player == 29


def test_selling_one_unit_of_a_share_worth_less_than_one_coin_brings_nothing():
    assert sell_amounts(1, D("0.40")).gross == 0


def test_selling_for_exactly_one_coin_leaves_nothing_after_the_fee():
    amounts = sell_amounts(1, D("1.00"))

    assert amounts == TradeAmounts(gross=1, fee=1)
    assert amounts.received_by_player == 0


def test_a_round_trip_at_an_unchanged_price_always_costs_the_player_coins():
    bought = buy_amounts(7, D("3.33"))  # 23.31 -> 24, fee 1
    sold = sell_amounts(7, D("3.33"))  # 23.31 -> 23, fee 1

    assert bought.paid_by_player == 25
    assert sold.received_by_player == 22


@pytest.mark.parametrize("units", range(1, 40))
@pytest.mark.parametrize("price", [D("0.37"), D("1.00"), D("7.77"), D("33.33"), D("99.99")])
def test_whatever_the_numbers_a_round_trip_never_makes_coins(units, price):
    paid = buy_amounts(units, price).paid_by_player
    received = sell_amounts(units, price).received_by_player

    assert received < paid


# --- the size of one trade ---


@pytest.mark.parametrize("side", ["buy", "sell"])
@pytest.mark.parametrize("gross", [1, 2, 250, 499, 500])
def test_a_trade_worth_1_to_500_coins_is_allowed(side, gross):
    check_trade_size(side, gross)  # raises nothing


@pytest.mark.parametrize("side", ["buy", "sell"])
@pytest.mark.parametrize("gross", [0, -5])
def test_a_trade_worth_less_than_1_coin_is_refused_with_422(side, gross):
    with pytest.raises(TradeRefused) as refused:
        check_trade_size(side, gross)

    assert refused.value.status_code == 422
    assert refused.value.code == "trade_too_small"


def test_a_purchase_worth_more_than_500_coins_is_refused_with_422():
    with pytest.raises(TradeRefused) as refused:
        check_trade_size("buy", 501)

    assert refused.value.status_code == 422
    assert refused.value.code == "trade_too_big"
    assert "500" in refused.value.message


@pytest.mark.parametrize("gross", [501, 2_000, 1_000_000])
def test_a_sale_is_never_refused_for_being_too_big_so_a_holder_can_always_sell(gross):
    # A price can rise until a few units are worth more than one purchase may be.
    check_trade_size("sell", gross)  # raises nothing


def test_a_refused_trade_has_the_standard_error_shape():
    from fastapi.testclient import TestClient

    from server.app import create_app
    from server.tests.helpers import CONFIGURED_SETTINGS

    app = create_app(CONFIGURED_SETTINGS)

    @app.get("/api/test/too-big")
    async def too_big() -> None:
        check_trade_size("buy", 501)

    assert_error(TestClient(app).get("/api/test/too-big"), 422, "trade_too_big")


# --- the minimum holding time ---


def test_shares_can_be_sold_from_10_minutes_after_the_purchase():
    assert sellable_from(BOUGHT_AT) == BOUGHT_AT + timedelta(minutes=10)


def test_shares_cannot_be_sold_one_second_before_the_10_minutes_are_over():
    now = BOUGHT_AT + timedelta(minutes=10) - timedelta(seconds=1)

    assert can_sell_now(BOUGHT_AT, now) is False


def test_shares_can_be_sold_exactly_when_the_10_minutes_are_over():
    assert can_sell_now(BOUGHT_AT, BOUGHT_AT + timedelta(minutes=10)) is True
