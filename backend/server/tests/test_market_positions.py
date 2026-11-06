"""Tests for market/positions.py: the money rules of an Exchange position, with fixed numbers.

No network, no database, no clock. Every number is written out so a reader can check it by hand.

The rules under test (docs/INTERFACES.md and specs/L4-exchange-v2.md, section 5): every position is
10x, rising or falling. The zero point is 90 % (rising) or 110 % (falling) of the entry price. The
value is counted in whole coins, rounded down, and never below 0. Fees are rounded up.
"""

from decimal import Decimal

import pytest

from server.errors import ApiError
from server.market import positions
from server.market.positions import (
    FALLING,
    RISING,
    check_price,
    check_stake,
    closing_amounts,
    fee_basis_points,
    fee_for,
    is_used_up,
    opening_costs,
    position_value,
    profit,
    profit_percent,
    result_of,
    round_price,
    stake_choices,
    zero_price,
)

D = Decimal


# --- the agreed numbers ---


def test_the_agreed_numbers_are_the_numbers_of_the_spec():
    assert positions.LEVERAGE == 10
    assert positions.FEE_BASIS_POINTS == 200
    assert positions.RELIT_FEE_BASIS_POINTS == 100
    assert positions.MIN_STAKE_COINS == 10
    assert positions.MAX_STAKE_COINS == 500
    assert positions.DAILY_STAKE_CAP_COINS == 2000
    assert positions.MAX_OPEN_POSITIONS == 20
    assert positions.MAX_VALUE_COINS == 1_000_000
    assert positions.STAKE_CHOICES == (10, 25, 50, 100, 250, 500)
    assert positions.MAX_PRICE_DECIMALS == 8
    assert (RISING, FALLING) == ("rising", "falling")


def test_leverage_divides_a_power_of_ten_so_the_zero_point_is_an_exact_decimal():
    assert any(10**digits % positions.LEVERAGE == 0 for digits in range(1, 9))


@pytest.mark.parametrize("stake", positions.STAKE_CHOICES)
def test_every_stake_choice_is_inside_the_stake_limits(stake):
    assert positions.MIN_STAKE_COINS <= stake <= positions.MAX_STAKE_COINS


# --- the zero point ---


def test_the_zero_point_of_a_rising_position_is_90_percent_of_the_entry_price():
    assert zero_price(RISING, D("76000.00")) == D("68400.00")


def test_the_zero_point_of_a_falling_position_is_110_percent_of_the_entry_price():
    assert zero_price(FALLING, D("200.00")) == D("220.00")


@pytest.mark.parametrize(
    ("side", "entry", "expected"),
    [
        (RISING, D("76159.21"), D("68543.289")),
        (FALLING, D("76159.21"), D("83775.131")),
        (RISING, D("214.35"), D("192.915")),
        (FALLING, D("214.35"), D("235.785")),
    ],
)
def test_the_zero_points_of_the_spec_are_exact_decimals(side, entry, expected):
    assert zero_price(side, entry) == expected


def test_the_zero_point_of_an_entry_with_8_decimals_has_at_most_9_decimals():
    # The database column has 10 decimals, so the zero point always fits.
    point = zero_price(RISING, D("0.12345678"))

    assert point == D("0.111111102")
    assert -point.as_tuple().exponent <= 9


@pytest.mark.parametrize(
    ("side", "entry", "expected", "tenths"),
    [
        (RISING, D("123456789.12345671"), D("111111110.211111039"), 9),
        (FALLING, D("123456789.12345671"), D("135802468.035802381"), 11),
        (RISING, D("999999999999.99999999"), D("899999999999.999999991"), 9),
        (FALLING, D("999999999999.99999999"), D("1099999999999.999999989"), 11),
    ],
)
def test_the_zero_point_of_a_very_large_price_keeps_all_9_decimals(side, entry, expected, tenths):
    # A price with 9 digits before the point. The database once cut this division to 8 decimals
    # and refused the row (the migration now rounds the entry first), so check all the decimals.
    # The check rule of the table says: zero point x 10 = entry x 9 (rising) or x 11 (falling).
    point = zero_price(side, entry)

    assert point == expected
    assert point * positions.LEVERAGE == entry * tenths


def test_a_position_at_a_very_large_price_is_used_up_exactly_at_its_zero_point():
    entry = D("123456789.12345671")

    assert is_used_up(RISING, entry, D("111111110.211111039")) is True
    assert is_used_up(RISING, entry, D("111111110.211111040")) is False
    assert position_value(RISING, 100, entry, D("111111110.21111104")) == 0  # worth under 1 coin


def test_a_side_that_is_neither_rising_nor_falling_is_refused():
    with pytest.raises(ValueError, match="side"):
        zero_price("sideways", D("100"))


# --- used up ---


@pytest.mark.parametrize(
    ("side", "entry", "price", "used_up"),
    [
        (RISING, D("76000.00"), D("68400.00"), True),  # exactly the zero point (R19)
        (RISING, D("76000.00"), D("68400.01"), False),  # one tick inside
        (RISING, D("76000.00"), D("60000.00"), True),  # a gap past the point
        (RISING, D("76000.00"), D("76000.00"), False),
        (FALLING, D("200.00"), D("220.00"), True),  # exactly the zero point
        (FALLING, D("200.00"), D("219.99"), False),  # one tick inside
        (FALLING, D("200.00"), D("260.00"), True),  # a gap past the point
        (FALLING, D("200.00"), D("200.00"), False),
    ],
)
def test_a_position_is_used_up_exactly_at_the_zero_point_or_beyond(side, entry, price, used_up):
    assert is_used_up(side, entry, price) is used_up


# --- the value ---


def test_a_rising_position_gains_10_percent_of_the_stake_for_every_1_percent_the_price_rises():
    assert position_value(RISING, 100, D("76000.00"), D("76760.00")) == 110  # +1 %


def test_a_rising_position_loses_10_percent_of_the_stake_for_every_1_percent_the_price_falls():
    assert position_value(RISING, 100, D("76000.00"), D("75240.00")) == 90  # -1 %


def test_a_falling_position_gains_10_percent_of_the_stake_for_every_1_percent_the_price_falls():
    assert position_value(FALLING, 100, D("200.00"), D("198.00")) == 110  # -1 %


def test_a_falling_position_loses_10_percent_of_the_stake_for_every_1_percent_the_price_rises():
    assert position_value(FALLING, 100, D("200.00"), D("202.00")) == 90  # +1 %


def test_the_value_is_rounded_down_to_whole_coins():
    # 100 x (1 + 10 x 0.0155...) = 115.45..., which is 115 whole coins
    assert position_value(RISING, 100, D("75000.00"), D("76159.21")) == 115


def test_a_gap_past_the_zero_point_is_worth_zero_and_never_below():
    assert position_value(RISING, 100, D("76000.00"), D("1.00")) == 0
    assert position_value(FALLING, 100, D("200.00"), D("9999.00")) == 0


def test_a_falling_position_is_worth_at_most_11_times_its_stake():
    # The price cannot go below 0, so the most a falling position can reach is stake x (1 + 10).
    # The smallest price is 0.00000001, which gives 549 whole coins: just under 11 x 50 = 550.
    value = position_value(FALLING, 50, D("200.00"), D("0.00000001"))

    assert value == 549
    assert value <= 11 * 50


def test_no_value_passes_one_million_coins():
    assert position_value(RISING, 500, D("1.00"), D("100000.00")) == 1_000_000


@pytest.mark.parametrize(
    ("side", "stake", "entry", "price", "value"),
    [
        (RISING, 100, D("76000.00"), D("77520.00"), 120),
        (RISING, 100, D("76000.00"), D("74480.00"), 80),
        (RISING, 100, D("76000.00"), D("68400.00"), 0),
        (RISING, 100, D("76000.00"), D("68400.01"), 0),
        (RISING, 100, D("76000.00"), D("60000.00"), 0),
        (FALLING, 50, D("200.00"), D("190.00"), 75),
        (FALLING, 50, D("200.00"), D("210.00"), 25),
        (FALLING, 50, D("200.00"), D("220.00"), 0),
        (FALLING, 50, D("200.00"), D("219.99"), 0),
        (FALLING, 50, D("200.00"), D("260.00"), 0),
        (FALLING, 50, D("200.00"), D("0.01"), 549),
        (RISING, 10, D("3.0000"), D("3.0001"), 10),
        (RISING, 100, D("75000.00"), D("76159.21"), 115),
        (RISING, 500, D("50.00"), D("45.03"), 3),
    ],
)
def test_every_row_of_the_worked_examples_in_the_spec(side, stake, entry, price, value):
    assert position_value(side, stake, entry, price) == value


def test_the_value_of_a_position_that_is_not_used_up_can_still_be_zero_coins():
    # 68,400.01 is above the zero point, so the position is open, but it is worth less than 1 coin.
    assert is_used_up(RISING, D("76000.00"), D("68400.01")) is False
    assert position_value(RISING, 100, D("76000.00"), D("68400.01")) == 0


@pytest.mark.parametrize("side", [RISING, FALLING])
@pytest.mark.parametrize("move_percent", range(-95, 400, 5))
def test_a_position_that_is_used_up_is_worth_zero(side, move_percent):
    entry = D("200.00")
    price = entry * (100 + move_percent) / 100

    used_up = is_used_up(side, entry, price)
    value = position_value(side, 40, entry, price)

    assert not used_up or value == 0


# --- fees ---


def test_the_fee_is_2_percent_of_the_stake_rounded_up_before_the_relighting():
    assert fee_basis_points(is_relit=False) == 200


def test_the_fee_is_1_percent_after_the_relighting():
    assert fee_basis_points(is_relit=True) == 100


@pytest.mark.parametrize(
    ("stake", "fee_at_2_percent", "fee_at_1_percent"),
    [(10, 1, 1), (25, 1, 1), (50, 1, 1), (51, 2, 1), (100, 2, 1), (250, 5, 3), (500, 10, 5)],
)
def test_fees_by_stake_as_in_the_table_of_the_spec(stake, fee_at_2_percent, fee_at_1_percent):
    assert fee_for(stake, 200) == fee_at_2_percent
    assert fee_for(stake, 100) == fee_at_1_percent


def test_a_fee_is_never_less_than_one_coin():
    assert fee_for(1, 100) == 1


@pytest.mark.parametrize(
    ("stake", "total_at_2_percent"),
    [(10, 11), (25, 26), (50, 51), (51, 53), (100, 102), (250, 255), (500, 510)],
)
def test_opening_costs_are_the_stake_plus_the_fee(stake, total_at_2_percent):
    assert opening_costs(stake, 200) == total_at_2_percent


# --- closing ---


def test_closing_pays_the_value_minus_the_closing_fee():
    closing = closing_amounts(RISING, 100, D("75000.00"), D("76159.21"), 200)

    assert (closing.value, closing.fee, closing.coins_change) == (115, 2, 113)
    assert closing.used_up is False


def test_the_closing_fee_is_never_more_than_the_value():
    # A stake of 500 pays a fee of 10, but this position is only worth 3 coins.
    closing = closing_amounts(RISING, 500, D("50.00"), D("45.03"), 200)

    assert (closing.value, closing.fee, closing.coins_change) == (3, 3, 0)


def test_a_position_used_up_at_the_moment_of_closing_pays_nothing_and_charges_no_fee():
    closing = closing_amounts(FALLING, 50, D("200.00"), D("260.00"), 200)

    assert (closing.value, closing.fee, closing.coins_change) == (0, 0, 0)
    assert closing.used_up is True


def test_a_position_worth_zero_coins_that_is_not_used_up_closes_with_no_fee():
    closing = closing_amounts(RISING, 100, D("76000.00"), D("68400.01"), 200)

    assert (closing.value, closing.fee, closing.coins_change) == (0, 0, 0)
    assert closing.used_up is False


def test_the_closing_fee_follows_the_rate_after_the_relighting():
    closing = closing_amounts(RISING, 500, D("100.00"), D("101.00"), 100)

    assert closing.value == 550
    assert closing.fee == 5


@pytest.mark.parametrize("stake", positions.STAKE_CHOICES)
@pytest.mark.parametrize("basis_points", [200, 100])
def test_a_round_trip_at_an_unchanged_price_always_costs_both_fees(stake, basis_points):
    entry = D("76159.21")

    spent = opening_costs(stake, basis_points)
    received = closing_amounts(RISING, stake, entry, entry, basis_points).coins_change

    assert received - spent == -2 * fee_for(stake, basis_points)
    assert received < spent


@pytest.mark.parametrize("side", [RISING, FALLING])
@pytest.mark.parametrize("move_percent", range(-60, 61, 3))
def test_a_close_never_pays_a_negative_amount(side, move_percent):
    entry = D("500.00")
    price = entry * (100 + move_percent) / 100

    closing = closing_amounts(side, 77, entry, price, 200)

    assert closing.value >= 0
    assert 0 <= closing.fee <= closing.value
    assert closing.coins_change >= 0


# --- profit and result ---


def test_profit_is_the_value_minus_the_stake():
    assert profit(115, 100) == 15
    assert profit(0, 50) == -50


@pytest.mark.parametrize(
    ("value", "stake", "percent"),
    [(115, 100, D("15.00")), (80, 100, D("-20.00")), (0, 50, D("-100.00")), (301, 300, D("0.33"))],
)
def test_profit_percent_has_two_decimals(value, stake, percent):
    assert profit_percent(value, stake) == percent
    assert profit_percent(value, stake).as_tuple().exponent == -2


def test_the_result_counts_both_fees():
    # value 115, closing fee 2, stake 100, opening fee 2: 115 - 2 - 100 - 2 = 11
    assert result_of(value=115, close_fee=2, stake=100, open_fee=2) == 11


def test_a_position_closed_at_zero_has_lost_the_stake_and_the_opening_fee():
    assert result_of(value=0, close_fee=0, stake=50, open_fee=1) == -51


# --- the size of a position ---


@pytest.mark.parametrize("stake", [10, 11, 250, 499, 500])
def test_stakes_from_10_to_500_are_accepted(stake):
    check_stake(stake)  # raises nothing


def test_a_stake_of_9_is_refused_with_its_own_code():
    with pytest.raises(ApiError) as refused:
        check_stake(9)

    assert (refused.value.status_code, refused.value.code) == (422, "stake_too_small")
    assert "at least 10 coins" in refused.value.message


def test_a_stake_of_501_is_refused_with_its_own_code():
    with pytest.raises(ApiError) as refused:
        check_stake(501)

    assert (refused.value.status_code, refused.value.code) == (422, "stake_too_big")
    assert "at most 500 coins" in refused.value.message


# --- the stake choices of the screen ---


def test_the_stake_choices_carry_fee_and_total_at_the_current_rate():
    choices = stake_choices(200)

    assert [(c.stake, c.fee, c.total) for c in choices] == [
        (10, 1, 11),
        (25, 1, 26),
        (50, 1, 51),
        (100, 2, 102),
        (250, 5, 255),
        (500, 10, 510),
    ]


def test_the_stake_choices_after_the_relighting_use_the_lower_fee():
    choices = stake_choices(100)

    assert [(c.stake, c.fee, c.total) for c in choices][-2:] == [(250, 3, 253), (500, 5, 505)]


# --- prices ---


@pytest.mark.parametrize("text", ["0.00000001", "1", "76159.21", "99999999.12345678"])
def test_a_price_above_zero_with_at_most_8_decimals_is_accepted(text):
    check_price(D(text))  # raises nothing


@pytest.mark.parametrize("text", ["1.123456789", "0.000000001", "0", "-5", "NaN", "Infinity"])
def test_a_price_with_9_decimals_or_not_above_zero_is_refused(text):
    with pytest.raises(ValueError, match="price"):
        check_price(D(text))


def test_a_price_with_more_than_8_decimals_is_rounded_half_to_even():
    assert round_price(D("1.123456785")) == D("1.12345678")
    assert round_price(D("1.123456795")) == D("1.12345680")


def test_a_price_that_already_fits_is_returned_as_it_is_without_added_zeros():
    assert str(round_price(D("0.1"))) == "0.1"
    assert str(round_price(D("76159.21000000"))) == "76159.21000000"


@pytest.mark.parametrize("text", ["1000000000000", "1000000000000.5", "5000000000000"])
def test_a_price_of_one_trillion_or_more_is_refused(text):
    with pytest.raises(ValueError, match="price"):
        check_price(D(text))
