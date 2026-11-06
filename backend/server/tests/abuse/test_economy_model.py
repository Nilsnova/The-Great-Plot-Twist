"""Economic properties of the offline model, not substitutes for missing feature tests."""

from decimal import Decimal

import pytest

from server.market.positions import FALLING, FEE_BASIS_POINTS, RISING, fee_for
from tools.economy.planned import scenario, split_pool
from tools.economy.simulate import (
    affordable_stake,
    exchange_simulation,
    flat_round_trip_probe,
    leveraged_payout,
    path_close,
)


@pytest.mark.parametrize(
    "direction,prices", [(1, [Decimal(90), Decimal(110)]), (-1, [Decimal(110), Decimal(90)])]
)
def test_liquidated_10x_collateral_never_recovers_on_a_later_tick(direction, prices):
    assert leveraged_payout(500, Decimal(100), prices, direction) == 0


@pytest.mark.parametrize("stake", [10, 100, 500])
def test_flat_leveraged_position_does_not_mint_before_fees(stake):
    assert leveraged_payout(stake, Decimal(100), [Decimal(100)]) == stake


@pytest.mark.parametrize(
    "stakes,winners",
    [
        ([50, 50, 50], {0}),
        ([1, 1, 1], {1, 2}),
        ([0, 0], set()),
        ([50, 50], set()),
        ([50, 50], {0, 1}),
        ([1, 200, 17], {0, 2}),
    ],
)
def test_designed_pool_is_conservative_including_refunds_and_rounding(stakes, winners):
    payouts = split_pool(stakes, winners)
    assert sum(payouts) <= sum(stakes)
    assert all(payout >= 0 for payout in payouts)
    if not winners or len(winners) == len(stakes):
        assert payouts == stakes


def test_exchange_workload_is_repeatable_and_accounts_for_every_coin():
    first = exchange_simulation(players=12, days=1, seed=12)
    assert exchange_simulation(players=12, days=1, seed=12) == first
    assert first["final_wallet_total"] == (
        first["initial_wallet_total"] - first["stakes"] + first["payouts"] - first["fees"]
    )
    for row in first["days"]:
        assert row["wallet"]["median"] >= 0


@pytest.mark.parametrize("side", [RISING, FALLING])
@pytest.mark.parametrize("price", [Decimal("0.00000001"), Decimal("76159.21")])
def test_path_close_uses_production_rounding_and_stake_fees(side, price):
    result = path_close(25, price, [price], side)
    assert (result.value, result.fee, result.coins_change, result.used_up) == (25, 1, 24, False)
    assert result.coins_change - 25 - fee_for(25, FEE_BASIS_POINTS) == -2


def test_affordable_stake_covers_the_fee_and_never_exceeds_remaining_daily_budget():
    assert affordable_stake(10, 500) == 0
    assert affordable_stake(11, 500) == 10
    assert affordable_stake(500, 500) == 490
    assert affordable_stake(1000, 10) == 10
    assert affordable_stake(1000, 9) == 0


def test_flat_exchange_probe_covers_both_fee_regimes_without_minting():
    result = flat_round_trip_probe()
    assert result["valid_pairs"] == 491 * 2 * 2 * 3
    assert result["largest_coin_change"] == -2


def test_prediction_model_uses_cut_on_losing_stakes_and_distributes_remainders():
    assert split_pool([50, 50, 50], {0}) == [145, 0, 0]
    assert split_pool([1, 1, 1], {1, 2}) == [0, 2, 1]


def test_design_simulation_accounts_for_every_coin_and_exposes_assumptions():
    report = scenario(players=12, days=14, seed=12)
    flows = report["coin_flows"]
    assert report["final_wallet_total"] == sum(flows.values())
    assert flows["prediction_stakes"] + flows["prediction_payouts"] <= 0
    assert flows["duel_stakes"] + flows["duel_payouts"] <= 0
    assert flows["case_cards"] > 0 and flows["case_deductions"] > 0
    assert flows["building_levels"] < 0 and flows["market_stake"] < 0
    assert flows["market_fee"] < 0
