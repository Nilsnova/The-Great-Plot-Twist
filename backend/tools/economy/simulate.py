"""Offline economy rehearsal. Run from backend: python -m tools.economy.simulate.

Uses real spot rules and the public Binance Vision replay (CC BY-NC-SA 4.0).
No network, .env, credentials or story text is loaded or printed. Future rules
are explicitly separated from executable-main results.
"""

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import ROUND_FLOOR, Decimal
from pathlib import Path
from statistics import median

from server.market.companies import load_companies
from server.market.feed import REPLAY_FILE, load_replay, replay_snapshot
from server.market.rules import DEFAULT_MULTIPLIER, REPLAY, evaluate
from server.market.trade_rules import (
    DAILY_BUY_CAP_COINS,
    MAX_TRADE_COINS,
    MIN_HOLD_MINUTES,
    buy_amounts,
    can_sell_now,
    sell_amounts,
)

BACKEND = Path(__file__).resolve().parents[2]
START = datetime(2026, 11, 6, 8, tzinfo=UTC)  # 08:00 Lisbon in November
STYLES = ("casual", "case-focused", "trader")


def percentile90(values):
    """Nearest-rank percentile, including small cohorts."""
    return sorted(values)[math.ceil(len(values) * 0.9) - 1]


def describe(values):
    return {"median": median(values), "p90": percentile90(values)}


def kit_amounts():
    data = json.loads((BACKEND / "content/entry_kits.json").read_text())
    return [kit["coins"] for kit in data["kits"]]


def case_numbers():
    """Read only numeric economics; never return plot text, identifiers or answers."""
    case = json.loads((BACKEND / "content/secret/case.json").read_text())
    card, deduction, solve = case["rewards"]["coins"]
    return {
        "cards": min(len(case["cards"]) * card["amount"], card["max_per_player"]),
        "deductions": min(
            len(case["deductions"]) * deduction["amount"], deduction["max_per_player"]
        ),
        "solve": min(
            solve["base"]
            + len(case["deductions"]) * solve["per_deduction_part"]
            + solve["finale_role"],
            solve["max"],
            solve["max_per_player"],
        ),
        "shortcuts": sorted(
            route["coins"]
            for card in case["cards"]
            for route in card["routes"]
            if route["coins"] > 0
        ),
        "finale_build": max(light["planning_price_coins"] for light in case["night"]["lights"]),
    }


def price_grid(days, multiplier):
    """One shared market, including every minute's breakers and daily rebase."""
    companies, replay = load_companies(), load_replay()
    symbols = [company.symbol for company in companies]
    bases, grid = {}, []
    for minute in range(days * 1440):
        now = START + timedelta(minutes=minute)
        real = replay_snapshot(replay, symbols, now)
        row = []
        for company in companies:
            quote = evaluate(
                bases.get(company.id),
                company.start_price,
                real.prices[company.symbol],
                REPLAY,
                now,
                multiplier,
            )
            bases[company.id] = quote.base
            row.append((quote.price, quote.halted_until is not None and now < quote.halted_until))
        grid.append(row)
    return grid


@dataclass
class Player:
    """Simulated wallet and holdings, never authoritative application state."""

    style: str
    coins: int
    holdings: dict = field(default_factory=dict)
    fees: int = 0
    trades: int = 0


def spot_day(player, day, grid, rng):
    """Random, non-foresight orders; each visit makes at most one buy then one sell."""
    count = {"casual": 1, "case-focused": 0, "trader": 4}[player.style]
    if player.style == "casual" and rng.random() < 0.5:
        count = 0
    events = []
    for _ in range(count):
        minute = day * 1440 + rng.randrange(1380)
        company = rng.randrange(len(grid[0]))
        events.extend([(minute, "buy", company), (minute + 60, "sell", company)])
    spent = 0
    for minute, side, company in sorted(events):
        price, halted = grid[minute][company]
        if halted:
            continue
        now = START + timedelta(minutes=minute)
        units, bought_at = player.holdings.get(company, (0, now))
        if side == "sell":
            if not units or not can_sell_now(bought_at, now):
                continue
            amounts = sell_amounts(units, price)
            player.coins += amounts.received_by_player
            del player.holdings[company]
        else:
            budget = min(MAX_TRADE_COINS, DAILY_BUY_CAP_COINS - spent, player.coins)
            bought = max(0, int(Decimal(budget) / price))
            while bought and buy_amounts(bought, price).paid_by_player > player.coins:
                bought -= 1
            if not bought:
                continue
            amounts = buy_amounts(bought, price)
            assert 1 <= amounts.gross <= MAX_TRADE_COINS
            spent += amounts.gross
            player.coins -= amounts.paid_by_player
            player.holdings[company] = (units + bought, now)
        player.fees += amounts.fee
        player.trades += 1
        assert player.coins >= 0 and spent <= DAILY_BUY_CAP_COINS


def spot_simulation(players=1000, days=14, seed=12, multiplier=DEFAULT_MULTIPLIER):
    rng = random.Random(seed)
    kits, grid = kit_amounts(), price_grid(days, multiplier)
    people = [Player(STYLES[i % 3], rng.choice(kits)) for i in range(players)]
    rows = []
    for day in range(days):
        for player in people:
            spot_day(player, day, grid, rng)
        quotes = grid[(day + 1) * 1440 - 1]
        for style in STYLES:
            cohort = [p for p in people if p.style == style]
            cash = [p.coins for p in cohort]
            equity = [
                p.coins
                + sum(
                    sell_amounts(units, quotes[c][0]).received_by_player
                    for c, (units, _) in p.holdings.items()
                )
                for p in cohort
            ]
            rows.append(
                {
                    "day": day + 1,
                    "style": style,
                    "players": len(cohort),
                    "wallet": describe(cash),
                    "marked_net_worth": describe(equity),
                }
            )
    return {
        "days": rows,
        "total_fees": sum(p.fees for p in people),
        "trades": sum(p.trades for p in people),
        "multiplier": multiplier,
        "insolvent_wallets": sum(p.coins == 0 for p in people),
        "public_replay_foresight_probe": replay_oracle(grid, days),
    }


def replay_oracle(grid, days):
    """Feasible demo-only attacker: known future, nonoverlapping 10min round trips.

    Chooses up to four profitable trades/day, <=500 gross each, paying both fees.
    This is a lower bound on exploitable foresight profits, not an optimal strategy.
    """
    coins, history = 1000, []
    for day in range(days):
        candidates = []
        for minute in range(day * 1440, (day + 1) * 1440 - MIN_HOLD_MINUTES):
            for company, (price, halted) in enumerate(grid[minute]):
                close = minute + MIN_HOLD_MINUTES
                exit_price, exit_halted = grid[close][company]
                units = int(Decimal(MAX_TRADE_COINS) / price)
                if not units or halted or exit_halted:
                    continue
                buy, sell = buy_amounts(units, price), sell_amounts(units, exit_price)
                profit = sell.received_by_player - buy.paid_by_player
                if profit > 0:
                    candidates.append((profit, minute, close, buy.paid_by_player))
        selected = []
        for profit, opened, closed, cost in sorted(candidates, reverse=True):
            if cost > coins or any(not (closed < a or opened > b) for a, b in selected):
                continue
            coins += profit
            selected.append((opened, closed))
            if len(selected) == 4:
                break
        history.append(coins)
    return {
        "initial_wallet": 1000,
        "wallet_by_day": history,
        "final_wallet": coins,
        "note": "Public demo prices are knowable ahead of time; never rank these coins.",
    }


def leveraged_payout(stake, start_price, prices, direction=1):
    """Unimplemented 10x scenario: isolated collateral, zero floor, no fees.

    Every intermediate tick is checked: liquidation cannot recover on a later tick.
    No max profit/hold/fee policy is inferred from the absent position engine.
    """
    value = Decimal(stake)
    for price in prices:
        value = Decimal(stake) * (1 + 10 * direction * (price / start_price - 1))
        if value <= 0:
            return 0
    return int(value.to_integral_value(rounding=ROUND_FLOOR))


def leverage_risk():
    replay = load_replay()
    changes, payouts = [], []
    for prices in replay.closes.values():
        changes.append((max(prices) / min(prices) - 1) * 100)
        for start in range(len(prices) - MIN_HOLD_MINUTES):
            path = prices[start + 1 : start + MIN_HOLD_MINUTES + 1]
            for direction in (-1, 1):
                payouts.append(leveraged_payout(500, prices[start], path, direction))
    return {
        "status": "planned sensitivity only; not a server rule or 14-day forecast",
        "stake": 500,
        "leverage": 10,
        "fees": "excluded: leveraged fee basis unspecified",
        "recorded_10_minute_payout_min_max": [min(payouts), max(payouts)],
        "largest_recorded_price_range_percent": float(max(changes)),
        "synthetic_adverse_10_percent_payout": leveraged_payout(500, Decimal(100), [Decimal(90)]),
        "synthetic_favorable_10_percent_payout": leveraged_payout(
            500, Decimal(100), [Decimal(110)]
        ),
        "flat_500_stake_round_trip_fee_sensitivity": {
            "2_percent_collateral_each_side": 20,
            "2_percent_10x_notional_each_side": 200,
        },
    }


def flat_round_trip_probe():
    """Exhaustively check cents across supported company limits at several unit sizes."""
    best, checks = -(10**9), 0
    for cents in range(100, 50001):
        price = Decimal(cents) / 100
        for units in (1, 2, 5, 10, 100):
            buy, sell = buy_amounts(units, price), sell_amounts(units, price)
            if buy.gross <= MAX_TRADE_COINS:
                best = max(best, sell.received_by_player - buy.paid_by_player)
                checks += 1
    assert best < 0
    return {"valid_pairs": checks, "largest_coin_change": best}


def run(players=1000, days=14, seed=12, multiplier=DEFAULT_MULTIPLIER):
    from tools.economy.planned import scenario

    if players < 3 or days < 1:
        raise ValueError("Use at least three players and one day.")
    return {
        "players": players,
        "days": days,
        "seed": seed,
        "replay_sha256": hashlib.sha256(REPLAY_FILE.read_bytes()).hexdigest(),
        "market_data": "90 recorded minutes, ping-pong repeated; Binance Vision CC BY-NC-SA 4.0",
        "assumptions": [
            "Equal style counts; kits sampled uniformly; all players receive a kit on day 1.",
            "Casual: half of days, one visit; case-focused: no trades; trader: four visits/day.",
            "Visits pick a random company/time, buy affordable units and try to sell 60min later.",
            "Halts skip orders; holdings persist; latest purchase resets the holding clock.",
            "Net worth marks holdings net of fees even if halted; it is not available cash.",
            "No current-main recurring grants or case/building/pool/duel routes exist.",
        ],
        "implemented_spot": spot_simulation(players, days, seed, multiplier),
        "planned_case_numeric_caps_only": case_numbers(),
        "planned_10x_risk": leverage_risk(),
        "flat_spot_loop_probe": flat_round_trip_probe(),
        "planned_all_features_scenario": scenario(players, days, seed),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=int, default=1000)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--seed", type=int, default=12)
    parser.add_argument(
        "--multiplier", type=int, choices=range(20, 101), default=DEFAULT_MULTIPLIER
    )
    args = parser.parse_args()
    print(json.dumps(run(args.players, args.days, args.seed, args.multiplier), indent=2))


if __name__ == "__main__":
    main()
