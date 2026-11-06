"""Economic properties of the offline model, not substitutes for missing feature tests."""

from decimal import Decimal

import pytest

from tools.economy.planned import scenario, split_pool
from tools.economy.simulate import leveraged_payout, spot_simulation


@pytest.mark.parametrize(
    "direction,prices", [(1, [Decimal(90), Decimal(110)]), (-1, [Decimal(110), Decimal(90)])]
)
def test_liquidated_10x_collateral_never_recovers_on_a_later_tick(direction, prices):
    assert leveraged_payout(500, Decimal(100), prices, direction) == 0


@pytest.mark.parametrize("stake", [1, 100, 500])
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


def test_spot_model_seed_is_repeatable_and_cash_is_not_marked_wealth():
    first = spot_simulation(players=12, days=1, seed=12)
    assert spot_simulation(players=12, days=1, seed=12) == first
    for row in first["days"]:
        assert row["wallet"]["median"] >= 0
        assert row["marked_net_worth"]["median"] >= row["wallet"]["median"]


def test_design_simulation_accounts_for_every_coin_and_exposes_assumptions():
    report = scenario(players=12, days=14, seed=12)
    flows = report["coin_flows"]
    assert report["final_wallet_total"] == sum(flows.values())
    assert flows["prediction_stakes"] + flows["prediction_payouts"] <= 0
    assert flows["duel_stakes"] + flows["duel_payouts"] <= 0
    assert flows["case_cards"] > 0 and flows["case_deductions"] > 0
    assert flows["building_levels"] < 0 and flows["10x_stakes"] < 0
