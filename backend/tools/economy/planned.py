"""Counterfactual wider economy workload, separate from the implemented Exchange model.

Amounts come from OPEN-WORLD sections 5, 6, 8 and 9. Activity, completion,
building priorities and proposed recurring grants are assumptions. Market fees
and prediction settlements use production arithmetic, not older design drafts.
"""

import random
from collections import Counter
from datetime import timedelta

from server.market.positions import FALLING, FEE_BASIS_POINTS, RISING, fee_for
from server.market.replay import load_replay, replay_minute
from server.predictions.pools import Stake, plan_settlement
from server.predictions.stake_rules import POOL_CUT_PERCENT
from tools.economy.simulate import (
    START,
    STYLES,
    affordable_stake,
    case_numbers,
    describe,
    kit_amounts,
    path_close,
)


def split_pool(stakes, winners):
    """Use the live pool formula: cut 5% of losing stakes and allocate remainders."""
    rows = [
        Stake(i, str(i), "win" if i in winners else "lose", amount)
        for i, amount in enumerate(stakes)
        if amount > 0
    ]
    plan = plan_settlement(rows, "win", POOL_CUT_PERCENT)
    payouts = {payout.row_id: payout.coins for payout in plan.payouts}
    return [payouts.get(i, 0) for i in range(len(stakes))]


def scenario(players, days, seed):
    """A wider activity schedule; its assumed grants are not promises of server income."""
    rng, replay, case = random.Random(seed), load_replay(), case_numbers()
    symbols = list(replay.closes)
    kits = kit_amounts()
    balances = [rng.choice(kits) for _ in range(players)]
    totals = Counter({"kit_grant": sum(balances)})
    built, rows = [set() for _ in range(players)], []
    costs = [
        (line, level, cost) for line in range(4) for level, cost in enumerate((300, 900, 2000))
    ]

    def change(i, amount, reason):
        assert balances[i] + amount >= 0
        balances[i] += amount
        totals[reason] += amount

    for day in range(days):
        for i in range(players):
            style = STYLES[i % 3]
            active = style != "casual" or day % 2 == 0
            if not active:
                continue
            if balances[i] < 100:
                change(i, 100 - balances[i], "broke_topup")
            # Full daily allowances on active days, not guaranteed measured earnings.
            change(i, 150, "salvage")
            change(i, 150, "orders_three")
            if day % 7 == 6:
                change(i, 300, "weekly_coop")
            if style == "case-focused":
                if day == 2:
                    change(i, case["cards"], "case_cards")
                if day == 4:
                    change(i, case["deductions"], "case_deductions")
                if day == 6:
                    change(i, case["solve"], "case_solve")
                if day == 5:
                    for cost in case["shortcuts"]:
                        if balances[i] >= cost:
                            change(i, -cost, "case_shortcuts")
                if day == 6 and (3, 0) not in built[i] and balances[i] >= case["finale_build"]:
                    change(i, -case["finale_build"], "finale_build")
                    built[i].add((3, 0))  # station level 1 is one of the four building lines
            if style == "trader":
                new_stakes = 0
                for slot in range(4):
                    stake = affordable_stake(balances[i], 2000 - new_stakes)
                    if not stake:
                        break
                    new_stakes += stake
                    minute = day * 1440 + slot * 360 + rng.randrange(350)
                    symbol, direction = rng.choice(symbols), rng.choice((-1, 1))
                    prices = [
                        replay_minute(replay, [symbol], START + timedelta(minutes=m)).prices[symbol]
                        for m in range(minute, minute + 11)
                    ]
                    closing = path_close(
                        stake, prices[0], prices[1:], RISING if direction == 1 else FALLING
                    )
                    change(i, -stake, "market_stake")
                    change(i, -fee_for(stake, FEE_BASIS_POINTS), "market_fee")
                    change(i, closing.value, "market_payout")
                    change(i, -closing.fee, "market_fee")
                assert new_stakes <= 2000  # sequential positions, at most one open
            pending = [
                (line, level, cost) for line, level, cost in costs if (line, level) not in built[i]
            ]
            if style != "trader" and pending:
                line, level, cost = pending[0]
                if balances[i] >= cost:
                    change(i, -cost, "building_levels")
                    built[i].add((line, level))

        # Four fair binary questions daily. Each player may stake 50 on each (200/day).
        # Market accuracy is NOT modelled; this only tests transfers and the house cut.
        for _ in range(4):
            stakes = [50 if balance >= 50 else 0 for balance in balances]
            winners = {i for i in range(players) if rng.randrange(2)}
            payouts = split_pool(stakes, winners)
            assert sum(payouts) <= sum(stakes)
            for i in range(players):
                change(i, -stakes[i], "prediction_stakes")
                change(i, payouts[i], "prediction_payouts")

        # Three duels against the same neighbour, within the proposed 3/day/opponent cap.
        for _ in range(3):
            for i in range(0, players - 1, 2):
                j = i + 1
                if min(balances[i], balances[j]) < 100:
                    continue
                change(i, -100, "duel_stakes")
                change(j, -100, "duel_stakes")
                change(rng.choice((i, j)), 190, "duel_payouts")

        for style in STYLES:
            cohort = [balances[i] for i in range(players) if STYLES[i % 3] == style]
            rows.append({"day": day + 1, "style": style, "wallet": describe(cohort)})
        assert sum(balances) == sum(totals.values())
    return {
        "status": "COUNTERFACTUAL WORKLOAD: assumed income, resources ignored; no balance claim",
        "assumptions": [
            "Uniform random kits; casual earns on alternate days; others active daily.",
            "Active days grant full salvage/order caps; weekly co-op on active seventh days.",
            "Case caps paid days 3/5/7; shortcuts day 6 and solo light day 7.",
            "Non-traders buy one affordable building level/day, across four lines; timber ignored.",
            "Trader: four sequential <=500 stakes/day, <=2000/day, 10-minute random long/short.",
            "Market fees use the production 2% of stake on opening and closing, capped by value.",
            "Prediction settlement uses the production 5% cut of losing stakes and remainders.",
            "Everyone may enter four fair pools and three paid duels/day if affordable.",
            "No skill advantage/draws/timeouts; refunds are probed separately, not assumed income.",
        ],
        "days": rows,
        "coin_flows": dict(sorted(totals.items())),
        "final_wallet_total": sum(balances),
        "building_levels_bought": sum(len(levels) for levels in built),
    }
