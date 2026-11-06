"""Offline Exchange v2 rehearsal, using production math and the public recorded prices.

Run from backend: python -m tools.economy.simulate. No network, credentials or live
SQL are used. The wider economy scenario is explicitly a counterfactual workload.
"""

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from statistics import median

from server.game.case_data import load_case
from server.market.companies import load_companies
from server.market.positions import (
    DAILY_STAKE_CAP_COINS,
    FALLING,
    FEE_BASIS_POINTS,
    LEVERAGE,
    MAX_STAKE_COINS,
    MIN_STAKE_COINS,
    RELIT_FEE_BASIS_POINTS,
    RISING,
    Closing,
    closing_amounts,
    fee_for,
    is_used_up,
)
from server.market.replay import REPLAY_FILE, load_replay, replay_minute

BACKEND = Path(__file__).resolve().parents[2]
START = datetime(2026, 11, 6, 8, tzinfo=UTC)
STYLES = ("casual", "case-focused", "trader")
HOLD_MINUTES = 60  # workload assumption; the real Exchange has no minimum hold
PROBE_MINUTES = 10


def percentile90(values: list[int]) -> int:
    """Nearest-rank percentile, including small cohorts."""
    return sorted(values)[math.ceil(len(values) * 0.9) - 1]


def describe(values: list[int]) -> dict:
    return {"median": median(values), "p90": percentile90(values)}


def kit_amounts() -> list[int]:
    data = json.loads((BACKEND / "content/entry_kits.json").read_text())
    return [kit["coins"] for kit in data["kits"]]


def case_numbers() -> dict:
    """Return numeric economics through the private loader, never plot text or answers."""
    case = load_case()
    card = case.rewards.coin("first_card")
    deduction = case.rewards.coin("deduction")
    solve = case.rewards.coin("solve_share")
    return {
        "cards": min(len(case.cards) * card.amount, card.max_per_player),
        "deductions": min(len(case.deductions) * deduction.amount, deduction.max_per_player),
        "solve": min(
            solve.base + len(case.deductions) * solve.per_part + solve.finale_role,
            solve.maximum,
            solve.max_per_player,
        ),
        "shortcuts": sorted(route.coins for route in case.routes if route.coins > 0),
        "finale_build": max(light.planning_price_coins for light in case.night.lights),
    }


def price_grid(days: int) -> list[tuple[Decimal, ...]]:
    """Actual unamplified island prices; the recording contains no stocks."""
    replay = load_replay()
    symbols = [company.symbol for company in load_companies() if not company.is_stock]
    return [
        tuple(replay_minute(replay, symbols, START + timedelta(minutes=minute)).prices.values())
        for minute in range(days * 1440)
    ]


def path_close(
    stake: int,
    entry: Decimal,
    prices: list[Decimal],
    side: str,
    basis_points: int = FEE_BASIS_POINTS,
) -> Closing:
    """Check every supplied tick; a position reaching zero cannot recover later."""
    price = entry
    for price in prices:
        if is_used_up(side, entry, price):
            return closing_amounts(side, stake, entry, price, basis_points)
    return closing_amounts(side, stake, entry, price, basis_points)


def leveraged_payout(
    stake: int, start_price: Decimal, prices: list[Decimal], direction: int = 1
) -> int:
    """Gross production value; each scenario accounts for its fees separately."""
    if direction not in (-1, 1):
        raise ValueError("A direction must be rising (1) or falling (-1).")
    return path_close(stake, start_price, prices, RISING if direction == 1 else FALLING).value


def affordable_stake(coins: int, remaining: int, basis_points: int = FEE_BASIS_POINTS) -> int:
    stake = min(MAX_STAKE_COINS, remaining, coins)
    while stake >= MIN_STAKE_COINS and stake + fee_for(stake, basis_points) > coins:
        stake -= 1
    return stake if stake >= MIN_STAKE_COINS else 0


@dataclass
class Player:
    """Workload accounting only; authoritative balances remain in SQL."""

    style: str
    coins: int
    fees: int = 0
    stakes: int = 0
    payouts: int = 0
    trades: int = 0
    liquidations: int = 0


def exchange_day(
    player: Player, day: int, grid: list[tuple[Decimal, ...]], rng: random.Random
) -> None:
    """Four separate time slots guarantee at most one position is open per player."""
    count = {"casual": 1, "case-focused": 0, "trader": 4}[player.style]
    if player.style == "casual" and rng.random() < 0.5:
        count = 0
    staked_today = 0
    for slot in range(count):
        minute = day * 1440 + slot * 360 + rng.randrange(300)
        company, side = rng.randrange(len(grid[0])), rng.choice((RISING, FALLING))
        stake = affordable_stake(player.coins, DAILY_STAKE_CAP_COINS - staked_today)
        if not stake:
            break
        entry = grid[minute][company]
        path = [grid[tick][company] for tick in range(minute + 1, minute + HOLD_MINUTES + 1)]
        opening_fee = fee_for(stake, FEE_BASIS_POINTS)
        closing = path_close(stake, entry, path, side)
        player.coins -= stake + opening_fee
        player.coins += closing.coins_change
        player.fees += opening_fee + closing.fee
        player.stakes += stake
        player.payouts += closing.value
        player.trades += 2
        player.liquidations += closing.used_up
        staked_today += stake
        assert player.coins >= 0 and staked_today <= DAILY_STAKE_CAP_COINS


def exchange_simulation(players: int = 1000, days: int = 14, seed: int = 12) -> dict:
    if players < 3 or days < 1:
        raise ValueError("Use at least three players and one day.")
    rng, kits, grid = random.Random(seed), kit_amounts(), price_grid(days)
    people = [Player(STYLES[i % 3], rng.choice(kits)) for i in range(players)]
    initial, rows = sum(player.coins for player in people), []
    for day in range(days):
        for player in people:
            exchange_day(player, day, grid, rng)
        for style in STYLES:
            cash = [player.coins for player in people if player.style == style]
            rows.append(
                {"day": day + 1, "style": style, "players": len(cash), "wallet": describe(cash)}
            )
    totals = {
        key: sum(getattr(player, key) for player in people)
        for key in ("fees", "stakes", "payouts", "trades", "liquidations")
    }
    final = sum(player.coins for player in people)
    assert final == initial - totals["stakes"] + totals["payouts"] - totals["fees"]
    minimum_cost = MIN_STAKE_COINS + fee_for(MIN_STAKE_COINS, FEE_BASIS_POINTS)
    return {
        "days": rows,
        "initial_wallet_total": initial,
        "final_wallet_total": final,
        **totals,
        "wallets_below_minimum_open_cost": sum(p.coins < minimum_cost for p in people),
    }


def replay_oracle(grid: list[tuple[Decimal, ...]], days: int) -> dict:
    """Demo foresight: four nonoverlapping 10-minute positions per day, both fees paid."""
    coins, history = 1000, []
    for day in range(days):
        candidates = []
        for minute in range(day * 1440, (day + 1) * 1440 - PROBE_MINUTES):
            close = minute + PROBE_MINUTES
            for company, entry in enumerate(grid[minute]):
                path = [grid[tick][company] for tick in range(minute + 1, close + 1)]
                for side in (RISING, FALLING):
                    result = path_close(MAX_STAKE_COINS, entry, path, side)
                    cost = MAX_STAKE_COINS + fee_for(MAX_STAKE_COINS, FEE_BASIS_POINTS)
                    profit = result.coins_change - cost
                    if profit > 0:
                        candidates.append((profit, minute, close, cost))
        selected = []
        for profit, opened, closed, cost in sorted(candidates, reverse=True):
            if cost > coins or any(not (closed < start or opened > end) for start, end in selected):
                continue
            coins += profit
            selected.append((opened, closed))
            if len(selected) == DAILY_STAKE_CAP_COINS // MAX_STAKE_COINS:
                break
        history.append(coins)
    return {
        "initial_wallet": 1000,
        "wallet_by_day": history,
        "final_wallet": coins,
        "note": "Public demo prices are knowable; this is not evidence about live prices.",
    }


def leverage_risk() -> dict:
    replay = load_replay()
    values, receipts, changes = [], [], []
    for prices in replay.closes.values():
        changes.append((max(prices) / min(prices) - 1) * 100)
        for start in range(len(prices) - PROBE_MINUTES):
            path = list(prices[start + 1 : start + PROBE_MINUTES + 1])
            for side in (RISING, FALLING):
                closing = path_close(MAX_STAKE_COINS, prices[start], path, side)
                values.append(closing.value)
                receipts.append(closing.coins_change)
    return {
        "status": "Production arithmetic on recorded ten-minute windows; not a forecast.",
        "stake": MAX_STAKE_COINS,
        "leverage": LEVERAGE,
        "opening_fee": fee_for(MAX_STAKE_COINS, FEE_BASIS_POINTS),
        "recorded_gross_value_min_max": [min(values), max(values)],
        "recorded_close_receipt_min_max": [min(receipts), max(receipts)],
        "largest_recorded_price_range_percent": float(max(changes)),
        "adverse_10_percent_gross_value": leveraged_payout(500, Decimal(100), [Decimal(90)]),
        "favorable_10_percent_gross_value": leveraged_payout(500, Decimal(100), [Decimal(110)]),
    }


def flat_round_trip_probe() -> dict:
    """All allowed stakes, both sides and both fee regimes lose money at a flat price."""
    best, checks = -(10**9), 0
    for stake in range(MIN_STAKE_COINS, MAX_STAKE_COINS + 1):
        for basis_points in (FEE_BASIS_POINTS, RELIT_FEE_BASIS_POINTS):
            for side in (RISING, FALLING):
                for price in (Decimal("0.00000001"), Decimal("1.1246"), Decimal("76159.21")):
                    closing = closing_amounts(side, stake, price, price, basis_points)
                    best = max(best, closing.coins_change - stake - fee_for(stake, basis_points))
                    checks += 1
    assert best < 0
    return {"valid_pairs": checks, "largest_coin_change": best}


def run(players: int = 1000, days: int = 14, seed: int = 12) -> dict:
    from tools.economy.planned import scenario

    current = exchange_simulation(players, days, seed)
    return {
        "players": players,
        "days": days,
        "seed": seed,
        "replay_sha256": hashlib.sha256(REPLAY_FILE.read_bytes()).hexdigest(),
        "market_data": "90 recorded minutes, ping-pong repeated; Binance Vision CC BY-NC-SA 4.0",
        "assumptions": [
            "Equal style counts; kits sampled uniformly; every player receives one kit initially.",
            "Casual: half of days, one visit; case-focused: no trades; trader: four visits/day.",
            "Visits choose a company and rising/falling side without foresight, then hold 60min.",
            "Four daily slots are six hours apart: at most one position is open per player.",
            "Every tick checks for zero; fees/stakes use production pre-Relighting rules.",
            "All positions close before day end; distributions show wallet cash, not open equity.",
            "Recorded island prices only; no stocks, external requests or recurring income.",
            "Arithmetic/workload evidence only; HTTP and SQL protection have separate tests.",
        ],
        "implemented_exchange_v2": current,
        "case_numeric_caps_only": case_numbers(),
        "exchange_v2_risk": leverage_risk(),
        "flat_exchange_v2_loop_probe": flat_round_trip_probe(),
        "public_replay_foresight_probe": replay_oracle(price_grid(days), days),
        "counterfactual_wider_economy": scenario(players, days, seed),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--players", type=int, default=1000)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--seed", type=int, default=12)
    args = parser.parse_args()
    print(json.dumps(run(args.players, args.days, args.seed), indent=2))


if __name__ == "__main__":
    main()
