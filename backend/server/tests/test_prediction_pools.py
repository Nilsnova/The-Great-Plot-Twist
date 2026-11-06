"""Tests for predictions/pools.py: how a prediction pool is shared out. Pure numbers, no network.

The rules under test (spec section 5.1): the winners share the whole pool in proportion to their
stakes. 5 % of the LOSING side (rounded down) leaves the game. Leftover coins go to the stakes with
the largest remainders, and on a tie to the earliest stake. Everybody gets a full refund when the
question is void, when nobody picked the winning side, or when everybody picked the same side.

The worked examples A to H of the spec are the first test cases. 200 random pools (a fixed seed)
check the promises that must hold for every pool: nothing is created, nothing is lost, every
winner gets at least the stake back, and no payout is a whole coin away from the exact share.
"""

import random
from decimal import Decimal
from fractions import Fraction

import pytest

from server.predictions.pools import (
    VOID,
    Payout,
    Stake,
    coins_by_side,
    cut_for,
    payout_per_coin,
    plan_settlement,
    refund_everyone,
    share_among_winners,
)

CUT = 5  # POOL_CUT_PERCENT in stake_rules.py; these tests pass it in, as the desk does


def make_stakes(*rows: tuple[int, str, int]) -> list[Stake]:
    """Stakes from (row id, side, coins) triples. Player ids are made up from the row id."""
    return [Stake(row_id, f"player-{row_id}", side, coins) for row_id, side, coins in rows]


def coins_by_row(plan) -> dict[int, int]:
    """The payouts of a plan as {row id: coins}."""
    return {payout.row_id: payout.coins for payout in plan.payouts}


def total_coins(stakes: list[Stake]) -> int:
    return sum(stake.amount for stake in stakes)


# --- the worked examples of the spec ---

CASE_A = make_stakes((1, "yes", 30), (2, "yes", 20), (3, "no", 50))
CASE_B = make_stakes((1, "yes", 1), (2, "yes", 1), (3, "yes", 1), (4, "no", 1))
CASE_C = make_stakes((1, "yes", 10), (2, "no", 190))
CASE_D = make_stakes((1, "yes", 40), (2, "yes", 10))
CASE_E = make_stakes((1, "yes", 40), (2, "no", 10))
CASE_F = make_stakes((1, "no", 25))
CASE_G = make_stakes((1, "yes", 30), (2, "no", 20), (3, "no", 5))


def test_case_a_the_winners_share_the_pool_in_proportion_to_their_stakes():
    plan = plan_settlement(CASE_A, "yes", CUT)

    assert plan.settlement == "winners"
    assert coins_by_row(plan) == {1: 59, 2: 39}


def test_case_a_the_cut_is_5_percent_of_the_losing_side_rounded_down():
    plan = plan_settlement(CASE_A, "yes", CUT)

    assert plan.cut == 2  # 5 % of the 50 coins that lost is 2.5, rounded down


def test_case_b_equal_remainders_give_the_leftover_coin_to_the_earliest_stake():
    plan = plan_settlement(CASE_B, "yes", CUT)

    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 2, 2: 1, 3: 1}


def test_case_c_a_cut_of_9_and_a_payout_of_191():
    plan = plan_settlement(CASE_C, "yes", CUT)

    assert plan.cut == 9  # 9.5 rounded down
    assert coins_by_row(plan) == {1: 191}


def test_case_d_everybody_on_the_same_side_gets_their_coins_back():
    plan = plan_settlement(CASE_D, "yes", CUT)

    assert plan.settlement == "refund_one_sided"
    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 40, 2: 10}


def test_case_e_the_no_side_can_win_too():
    plan = plan_settlement(CASE_E, "no", CUT)

    assert plan.settlement == "winners"
    assert plan.cut == 2
    assert coins_by_row(plan) == {2: 48}


def test_case_f_nobody_on_the_winning_side_refunds_everyone():
    plan = plan_settlement(CASE_F, "yes", CUT)

    assert plan.settlement == "refund_no_winners"
    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 25}


def test_case_g_a_void_question_refunds_every_stake_in_full():
    plan = plan_settlement(CASE_G, VOID, CUT)

    assert plan.settlement == "refund_void"
    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 30, 2: 20, 3: 5}


def test_case_h_an_empty_pool_settles_with_no_payouts():
    plan = plan_settlement([], "yes", CUT)

    assert plan.settlement == "refund_no_winners"
    assert plan.cut == 0
    assert plan.payouts == ()


def test_an_empty_pool_that_is_void_is_still_a_void_settlement():
    plan = plan_settlement([], VOID, CUT)

    assert plan.settlement == "refund_void"
    assert plan.payouts == ()


# --- who gets what ---


def test_a_losing_stake_gets_no_payout_at_all():
    plan = plan_settlement(CASE_A, "yes", CUT)

    assert 3 not in coins_by_row(plan)
    assert len(plan.payouts) == 2


def test_payouts_carry_the_row_id_and_the_player_of_the_stake():
    plan = plan_settlement(CASE_C, "yes", CUT)

    assert plan.payouts == (Payout(row_id=1, player_id="player-1", coins=191),)


def test_the_largest_remainder_gets_the_leftover_coin_before_an_earlier_stake():
    # Winners 1 and 2 coins against 10: the pool is 13. Exact shares 4.33 and 8.67.
    stakes = make_stakes((1, "yes", 1), (2, "yes", 2), (3, "no", 10))

    plan = plan_settlement(stakes, "yes", CUT)

    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 4, 2: 9}


def test_two_leftover_coins_go_to_the_two_earliest_of_equal_remainders():
    # Four winners of 1 coin share a pool of 7 (cut 0): 1.75 each, so 3 coins are left over.
    # The remainders are equal, so rows 1, 2 and 3 get the extra coin and row 4 does not.
    stakes = make_stakes((1, "yes", 1), (2, "yes", 1), (3, "yes", 1), (4, "yes", 1), (5, "no", 3))

    plan = plan_settlement(stakes, "yes", CUT)

    assert coins_by_row(plan) == {1: 2, 2: 2, 3: 2, 4: 1}


def test_the_order_in_which_winners_are_given_does_not_change_who_gets_the_extra_coin():
    winners = make_stakes((4, "yes", 1), (2, "yes", 1), (3, "yes", 1), (1, "yes", 1))

    payouts = share_among_winners(winners, 5)

    assert {payout.row_id: payout.coins for payout in payouts} == {1: 2, 2: 1, 3: 1, 4: 1}


def test_payouts_come_in_the_order_of_the_stakes():
    winners = make_stakes((4, "yes", 1), (2, "yes", 1), (3, "yes", 1), (1, "yes", 1))

    payouts = share_among_winners(winners, 5)

    assert [payout.row_id for payout in payouts] == [1, 2, 3, 4]


def test_a_win_with_no_losers_is_a_refund_even_if_the_outcome_names_that_side():
    plan = plan_settlement(CASE_D, "no", CUT)  # nobody picked no: no winners

    assert plan.settlement == "refund_no_winners"


# --- the promises that hold for every pool ---


def random_pools(count: int = 200, seed: int = 42):
    """200 made-up pools: (stakes, outcome). The seed is fixed, so every run is the same."""
    generator = random.Random(seed)
    pools = []
    for _ in range(count):
        size = generator.randint(0, 12)
        rows = [
            (row_id, generator.choice(["yes", "no"]), generator.randint(1, 50))
            for row_id in range(1, size + 1)
        ]
        pools.append((make_stakes(*rows), generator.choice(["yes", "no", VOID])))
    return pools


EVERY_POOL = [*random_pools(), (CASE_A, "yes"), (CASE_B, "yes"), (CASE_C, "yes"), (CASE_D, "yes")]
EVERY_POOL += [(CASE_E, "no"), (CASE_F, "yes"), (CASE_G, VOID), ([], "yes")]

# The same pools, split by what happens to them. A win shares the pool, a refund gives it back.
WIN_POOLS = [
    (stakes, outcome)
    for stakes, outcome in EVERY_POOL
    if plan_settlement(stakes, outcome, CUT).settlement == "winners"
]
REFUND_POOLS = [
    (stakes, outcome)
    for stakes, outcome in EVERY_POOL
    if plan_settlement(stakes, outcome, CUT).settlement != "winners"
]


def test_the_random_pools_cover_both_wins_and_refunds():
    assert len(WIN_POOLS) > 50
    assert len(REFUND_POOLS) > 20


@pytest.mark.parametrize(("stakes", "outcome"), EVERY_POOL)
def test_the_payouts_plus_the_cut_add_up_to_every_coin_staked(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)

    assert sum(payout.coins for payout in plan.payouts) + plan.cut == total_coins(stakes)


@pytest.mark.parametrize(("stakes", "outcome"), EVERY_POOL)
def test_every_paid_stake_gets_at_least_what_it_staked(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)
    staked = {stake.row_id: stake.amount for stake in stakes}

    assert all(payout.coins >= staked[payout.row_id] for payout in plan.payouts)


@pytest.mark.parametrize(("stakes", "outcome"), WIN_POOLS)
def test_no_payout_is_a_whole_coin_away_from_the_exact_share(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)
    winning = [stake for stake in stakes if stake.side == outcome]
    shared = total_coins(stakes) - plan.cut
    exact = {
        stake.row_id: Fraction(stake.amount * shared, total_coins(winning)) for stake in winning
    }

    assert all(abs(payout.coins - exact[payout.row_id]) < 1 for payout in plan.payouts)


@pytest.mark.parametrize(("stakes", "outcome"), WIN_POOLS)
def test_the_cut_is_5_percent_of_the_losing_side_rounded_down_in_every_win(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)
    losing = sum(stake.amount for stake in stakes if stake.side != outcome)

    assert plan.cut == losing * CUT // 100


@pytest.mark.parametrize(("stakes", "outcome"), WIN_POOLS)
def test_only_winning_stakes_are_paid_in_a_win(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)
    sides = {stake.row_id: stake.side for stake in stakes}

    assert {sides[payout.row_id] for payout in plan.payouts} == {outcome}


@pytest.mark.parametrize(("stakes", "outcome"), WIN_POOLS)
def test_every_winning_stake_is_paid_in_a_win(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)
    winning_rows = {stake.row_id for stake in stakes if stake.side == outcome}

    assert {payout.row_id for payout in plan.payouts} == winning_rows


@pytest.mark.parametrize(("stakes", "outcome"), REFUND_POOLS)
def test_a_refund_pays_every_stake_exactly_once_and_takes_no_cut(stakes, outcome):
    plan = plan_settlement(stakes, outcome, CUT)

    assert coins_by_row(plan) == {stake.row_id: stake.amount for stake in stakes}
    assert plan.cut == 0


# --- the settlement name ---


@pytest.mark.parametrize(
    ("stakes", "outcome", "settlement"),
    [
        (CASE_A, "yes", "winners"),
        (CASE_D, "yes", "refund_one_sided"),
        (CASE_F, "yes", "refund_no_winners"),
        (CASE_G, VOID, "refund_void"),
        ([], "no", "refund_no_winners"),
    ],
)
def test_the_settlement_names_the_four_cases(stakes, outcome, settlement):
    assert plan_settlement(stakes, outcome, CUT).settlement == settlement


def test_a_void_question_wins_over_everything_else_even_when_one_side_is_empty():
    plan = plan_settlement(CASE_D, VOID, CUT)

    assert plan.settlement == "refund_void"


# --- three outcomes, for the sports predictions (L6) ---


def test_three_outcomes_work_for_home_draw_and_away():
    stakes = make_stakes((1, "home", 30), (2, "draw", 20), (3, "away", 50), (4, "home", 10))

    plan = plan_settlement(stakes, "home", CUT)

    assert plan.settlement == "winners"
    assert plan.cut == 3  # 5 % of the 70 coins that lost is 3.5
    assert sum(payout.coins for payout in plan.payouts) == 107
    assert coins_by_row(plan) == {1: 80, 4: 27}


def test_a_draw_that_nobody_picked_refunds_everyone_in_a_three_way_pool():
    stakes = make_stakes((1, "home", 30), (2, "away", 50))

    assert plan_settlement(stakes, "draw", CUT).settlement == "refund_no_winners"


# --- the small pieces ---


@pytest.mark.parametrize(
    ("losing_coins", "cut"), [(0, 0), (19, 0), (20, 1), (50, 2), (190, 9), (200, 10), (99, 4)]
)
def test_cut_for_rounds_down(losing_coins, cut):
    assert cut_for(losing_coins, CUT) == cut


def test_cut_for_with_no_cut_percent_takes_nothing():
    assert cut_for(1000, 0) == 0


@pytest.mark.parametrize("percent", [-1, 101])
def test_a_cut_percent_outside_0_to_100_is_a_bug_and_is_refused(percent):
    with pytest.raises(ValueError, match="cut_percent"):
        cut_for(100, percent)
    with pytest.raises(ValueError, match="cut_percent"):
        plan_settlement(CASE_A, "yes", percent)


def test_a_stake_of_zero_coins_is_a_bug_and_is_refused():
    with pytest.raises(ValueError, match="at least 1 coin"):
        Stake(row_id=1, player_id="player-1", side="yes", amount=0)


def test_refund_everyone_gives_back_each_stake_with_the_settlement_it_is_told():
    plan = refund_everyone(CASE_A, "refund_void")

    assert plan.settlement == "refund_void"
    assert plan.cut == 0
    assert coins_by_row(plan) == {1: 30, 2: 20, 3: 50}


def test_share_among_winners_pays_out_exactly_the_shared_coins():
    winners = make_stakes((1, "yes", 30), (2, "yes", 20))

    payouts = share_among_winners(winners, 98)

    assert [payout.coins for payout in payouts] == [59, 39]


def test_coins_by_side_adds_up_the_coins_of_each_side():
    assert coins_by_side(CASE_A) == {"yes": 50, "no": 50}


def test_coins_by_side_leaves_out_a_side_nobody_picked():
    assert coins_by_side(CASE_D) == {"yes": 50}


def test_coins_by_side_of_no_stakes_is_empty():
    assert coins_by_side([]) == {}


# --- the payout per coin that the screen shows ---


def test_payout_per_coin_is_none_when_nobody_staked_on_that_side():
    assert payout_per_coin({"yes": 50}, "no", CUT) is None


def test_payout_per_coin_is_none_for_a_side_with_zero_coins():
    assert payout_per_coin({"yes": 50, "no": 0}, "no", CUT) is None


def test_payout_per_coin_is_exactly_1_00_when_the_other_side_is_empty():
    assert payout_per_coin({"yes": 50}, "yes", CUT) == Decimal("1.00")


def test_payout_per_coin_is_rounded_down_to_two_decimals():
    # yes 120, no 80: if yes wins, 80 coins lose, the cut is 4, and 196 coins go to 120 coins.
    assert payout_per_coin({"yes": 120, "no": 80}, "yes", CUT) == Decimal("1.63")


def test_payout_per_coin_never_rounds_up():
    # no wins: 120 coins lose, the cut is 6, and 194 coins go to 80 coins: 2.425, shown as 2.42.
    assert payout_per_coin({"yes": 120, "no": 80}, "no", CUT) == Decimal("2.42")


def test_payout_per_coin_rounds_down_even_when_the_next_digit_is_above_five():
    # yes 3, no 2: if yes wins, the cut is 0 (5 % of 2 coins is 0.1, rounded down) and 5 coins go to
    # 3 coins: 1.666..., shown as 1.66. Ordinary rounding would show 1.67, and 1.67 x 3 coins is
    # more than the 5 coins the pool pays.
    assert payout_per_coin({"yes": 3, "no": 2}, "yes", CUT) == Decimal("1.66")


def test_payout_per_coin_is_a_decimal_with_two_places():
    shown = payout_per_coin({"yes": 3, "no": 1}, "yes", CUT)

    assert shown == Decimal("1.33")
    assert shown.as_tuple().exponent == -2


def test_payout_per_coin_times_the_winning_coins_never_exceeds_what_the_pool_pays():
    # The screen must never promise more than the pool pays. Check it against a real settlement.
    stakes = make_stakes((1, "yes", 7), (2, "yes", 13), (3, "no", 41))
    shown = payout_per_coin(coins_by_side(stakes), "yes", CUT)

    plan = plan_settlement(stakes, "yes", CUT)

    assert shown * 20 <= sum(payout.coins for payout in plan.payouts)


def test_payout_per_coin_with_a_cut_of_zero_returns_the_whole_pool():
    assert payout_per_coin({"yes": 10, "no": 10}, "yes", 0) == Decimal("2.00")
