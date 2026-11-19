"""Earned-income campaigns using production combat and catalogue rules, never assumed wins.

Used by MP-ECO-19 reviewers. Run from backend with Node 24+: python -m
tools.economy.funded_play. This headless measurement never connects to a game database.
"""

import argparse
import hashlib
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path

from server.island import layout, rescue, wave_events
from server.island.catalogue import IslandCatalogue, Weather, load_island, runtime_catalogue
from server.island.personal_captain import configuration
from server.island.wave_economy import freeze_reward_basis
from server.island.wave_rules import ALWAYS_ON
from server.island.wave_snapshot_template import WaveDefense, static_template
from tools.economy.island_balance_plans import Purchase, building_plan, quote

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "frontend/scripts/economy-funded-wave.mjs"
SKILL_ORDER = ("steady_aim", "cutlass", "long_barrel", "sweep", "quick_hands",
               "second_wind", "far_sight", "dead_eye")


class Combat:
    """One persistent, local production-simulator subprocess; no service or outcome stub."""

    def __init__(self) -> None:
        self.process = subprocess.Popen(
            ["node", str(SCRIPT)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, cwd=ROOT,
        )

    def play(self, options: dict, profiles: list[dict]) -> dict:
        self.process.stdin.write(json.dumps({"options": options, "profiles": profiles}) + "\n")
        self.process.stdin.flush()
        answer = json.loads(self.process.stdout.readline())
        if not answer.get("ok"):
            raise RuntimeError(answer)
        return answer["result"]

    def close(self) -> None:
        self.process.stdin.close()
        if self.process.wait(timeout=10):
            raise RuntimeError("Production simulator failed.")


@dataclass
class Campaign:
    """A measured headless account; its ledger is arithmetic, not canonical SQL receipts."""

    coins: int
    best: int = 0
    next_wave: int = 1
    buildings: dict[str, Purchase] = field(default_factory=dict)
    payments: dict[str, list[int]] = field(default_factory=dict)
    ledger: list[dict] = field(default_factory=list)
    seconds: float = 0
    personal_bests: list[int] = field(default_factory=list)

    def change(self, amount: int, reason: str, **facts) -> None:
        if self.coins + amount < 0:
            raise ValueError("The funded plan overspends.")
        self.coins += amount
        self.ledger.append({"reason": reason, "deltaCoins": amount,
                            "balanceCoins": self.coins, **facts})


def profiles_for(catalogue: IslandCatalogue, count: int, policy: str, best: int) -> list[dict]:
    """Every Captain starts fresh; all levels/skill points come from this measured run."""
    config = configuration(catalogue)
    level = max(i + 1 for i, wave in enumerate(config["levelWaves"]) if wave <= best)
    points, skills = best // config["wavesPerPoint"], []
    for name in SKILL_ORDER:
        row = next(row for row in config["tree"] if row["skill"] == name)
        if (row["cost"] <= points and (not row["needs"] or set(row["needs"]) & set(skills))
                and row["excludes"] not in skills and name not in config["retired"]
                and (row["role"] is None or level >= config["roleLevel"])):
            skills.append(name)
            points -= row["cost"]
    if level >= config["roleLevel"]:
        skills.append("gunner")
    return [{"id": f"captain_{i}", "level": level, "skills": list(skills), "weapon": "musket",
             "policy": "novice" if policy == "novice" or policy == "mixed" and i % 2 else
             "idle" if policy == "idle" else "veteran"} for i in range(count)]


def buy_queue(catalogue: IslandCatalogue, game: Campaign,
              queue: list[Purchase]) -> tuple[list[dict], dict | None]:
    bought = []
    while queue:
        item = queue[0]
        price, unlock = quote(catalogue, item)
        previous = game.buildings.get(item.plot)
        if item.level != (previous.level + 1 if previous else 1):
            raise ValueError("Funded plan skips a building level.")
        if previous and previous.kind != item.kind:
            raise ValueError("Funded plan replaces a standing kind.")
        if unlock > game.best or price > game.coins:
            return bought, {**asdict(item), "priceCoins": price, "unlockBest": unlock,
                            "reason": "locked" if unlock > game.best else "insufficient_funds"}
        queue.pop(0)
        game.change(-price, "building_purchase", **asdict(item))
        game.buildings[item.plot] = item
        game.payments.setdefault(item.plot, []).append(price)
        bought.append({**asdict(item), "paidCoins": price})
    return bought, None


def buy_adaptive(catalogue: IslandCatalogue, game: Campaign,
                 queue: list[Purchase]) -> tuple[list[dict], dict | None]:
    """A declared alternative: skip blocked priorities, without skipping actual asset levels."""
    bought = []
    while queue:
        selected = None
        for index, item in enumerate(queue):
            previous = game.buildings.get(item.plot)
            if (item.level != (previous.level + 1 if previous else 1)
                    or previous and previous.kind != item.kind):
                continue
            price, unlock = quote(catalogue, item)
            if unlock <= game.best and price <= game.coins:
                selected = index
                break
        if selected is None:
            first = queue[0]
            price, unlock = quote(catalogue, first)
            return bought, {**asdict(first), "priceCoins": price, "unlockBest": unlock,
                            "reason": "no_current_affordable_next_level"}
        item = queue.pop(selected)
        rows, blocked = buy_queue(catalogue, game, [item])
        assert blocked is None
        bought.extend(rows)
    return bought, None


def wave_options(catalogue: IslandCatalogue, game: Campaign, seed: int, weather: Weather) -> dict:
    geometry = {spot.spot: spot for spot in layout.island_layout(more=True).spots}
    defenses = [WaveDefense(item.plot, item.kind, True, item.level, None,
                            geometry[item.plot].x, geometry[item.plot].z, None)
                for item in game.buildings.values()]
    template = static_template(catalogue, defenses,
                               {name: 0 for name in ("gunner", "carpenter", "lookout", "guard")},
                               {}, weather, seed, [*ALWAYS_ON, "structure_recovery"], 0)
    return {**template["createWave"], "wave": game.next_wave, "seed": seed,
            "event": wave_events.event_for(game.next_wave, seed), "waveProtocol": 2,
            "recoveryVersion": 1}


def play_attempt(combat: Combat, catalogue: IslandCatalogue, game: Campaign,
                 count: int, policy: str, seed: int, weather: Weather) -> dict:
    played = game.next_wave
    personal_bests = game.personal_bests or [game.best] * count
    profiles = [profiles_for(catalogue, count, policy, best)[index]
                for index, best in enumerate(personal_bests)]
    options = wave_options(catalogue, game, seed, weather)
    result = combat.play(options, profiles)
    houses = sum(item.level for item in game.buildings.values() if item.kind == "house")
    basis = freeze_reward_basis(catalogue, played_wave=played, seed=seed, house_levels=houses)
    reward = basis.reward_coins(result.get("bonuses", [])) if result["survived"] else 0
    before, previous_best = game.coins, game.best
    game.change(reward, "pirate_loot" if reward else "normal_defeat", playedWave=played)
    if result["survived"]:
        game.best = max(game.best, played)
        game.next_wave = played + 1
        game.personal_bests = [max(best, played) for best in personal_bests]
    else:
        back = rescue.restart_back(catalogue.waves.restart_back, bool(result.get("rescued")))
        game.next_wave = max(1, game.best - back)
    game.seconds += result["time"]
    return {"playedWave": played, "bestBefore": previous_best, "seed": seed,
            "weather": weather.kind, "frozenProfiles": profiles,
            "openingCoins": before, "lootCoins": reward, "closingCoins": game.coins,
            "nextWave": game.next_wave, "result": result}


def campaign(combat: Combat, catalogue: IslandCatalogue, *, count: int, policy: str, priority: str,
             seed: int, attempts: int, target: int, weather_kind: str,
             earned_personal_bests: list[int] | None = None) -> dict:
    game = Campaign(catalogue.starting_coins, personal_bests=earned_personal_bests or [])
    queue, rows, stalled = building_plan(priority != "defense"), [], 0
    weather = next(row for row in catalogue.weather if row.kind == weather_kind)
    for index in range(attempts):
        buy = buy_adaptive if priority == "adaptive" else buy_queue
        bought, blocked = buy(catalogue, game, queue)
        row = play_attempt(combat, catalogue, game, count, policy,
                           seed + index * 7919, weather)
        row.update(attempt=index + 1, purchases=bought, blockedOffer=blocked)
        rows.append(row)
        stalled = stalled + 1 if game.best == row["bestBefore"] else 0
        if game.best >= target or stalled >= 6:
            break
    assert game.coins == catalogue.starting_coins + sum(row["deltaCoins"] for row in game.ledger)
    protocol_floor = sum(max(row["result"]["time"], catalogue.waves.minimum_seconds)
                         + catalogue.waves.countdown_seconds for row in rows)
    protocol_floor += 8 * sum(row["result"]["survived"] for row in rows[:-1])
    return {"captains": count, "policy": policy, "priority": priority, "seed": seed,
            "openingPersonalBests": earned_personal_bests or [0] * count,
            "closingPersonalBests": game.personal_bests or [0] * count,
            "startingCoins": catalogue.starting_coins, "bestWave": game.best,
            "simSeconds": round(game.seconds, 2), "closingCoins": game.coins,
            "calculatedProtocolFloorSeconds": round(protocol_floor, 2),
            "termination": "target_reached" if game.best >= target else
            "six_attempts_without_new_record" if stalled >= 6 else "attempt_budget",
            "unreachedBands": [name for name, low in (("mid", 10), ("late", 30))
                               if game.best < low],
            "attempts": rows, "ledger": game.ledger}


def source_inventory() -> dict:
    """Hash the simulator import closure and its actual server/catalogue inputs."""
    paths, pending, seen = [], [SCRIPT], set()
    while pending:
        path = pending.pop().resolve()
        if path in seen:
            continue
        seen.add(path)
        paths.append(path)
        if path.suffix in {".js", ".mjs"}:
            imports = re.findall(r"(?:from\s+|import\s*\()['\"](\.[^'\"]+)", path.read_text())
            pending.extend(path.parent / name for name in imports)
    paths += list((ROOT / "backend/server/island").glob("*.py"))
    paths += list((ROOT / "backend/content").glob("*.json"))
    paths += list((ROOT / "backend/tools/economy").glob("funded_*.py"))
    paths += list((ROOT / "supabase/migrations").glob("*.sql"))
    paths += [ROOT / "backend/uv.lock", ROOT / "frontend/package-lock.json",
              ROOT / "backend/server/tests/case_sql/stub.sql"]
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captains", default="1,2,4,10")
    parser.add_argument("--policies", default="novice,mixed,veteran")
    parser.add_argument("--priorities", default="defense,income,adaptive")
    parser.add_argument("--seeds", default="7919,15401")
    parser.add_argument("--attempts", type=int, default=60)
    parser.add_argument("--target", type=int, default=40)
    parser.add_argument("--weather", default="calm", choices=("calm", "storm", "fog"))
    parser.add_argument("--profile-restarts", action="store_true",
                        help="Reset successful runs; preserve earned veterans or admit new novices")
    args = parser.parse_args()
    catalogue = runtime_catalogue(load_island())
    combat = Combat()
    try:
        rows = [campaign(combat, catalogue, count=count, policy=policy, priority=priority,
                         seed=seed, attempts=args.attempts, target=args.target,
                         weather_kind=args.weather)
                for count in map(int, args.captains.split(","))
                for policy in args.policies.split(",") for priority in args.priorities.split(",")
                for seed in map(int, args.seeds.split(","))]
        restarts = []
        if args.profile_restarts:
            for previous in rows:
                if previous["priority"] != "defense" or previous["policy"] != "veteran":
                    continue
                if previous["bestWave"] < 30:
                    continue
                for kind in ("earned_veterans", "earned_veterans_and_new_captains"):
                    bests = list(previous["closingPersonalBests"])
                    if kind == "earned_veterans_and_new_captains":
                        bests = [best if index % 2 == 0 else 0
                                 for index, best in enumerate(bests)]
                    restarted = campaign(combat, catalogue, count=previous["captains"],
                        policy="mixed" if "new" in kind else "veteran", priority="defense",
                        seed=previous["seed"], attempts=args.attempts, target=args.target,
                        weather_kind=args.weather, earned_personal_bests=bests)
                    restarted.update(profileCohort=kind,
                        earnedBy={key: previous[key] for key in
                                  ("captains", "policy", "priority", "seed", "bestWave")},
                        resetModel="fresh grant; no cash/assets carried; personal best retained")
                    restarts.append(restarted)
    finally:
        combat.close()
    print(json.dumps({"evidenceLayer": "headless_production_simulation",
        "moneyLayer": "catalogue_funded_arithmetic_not_database_receipts",
        "profileMeaning": "scripted control policies; all progression earned in each fresh run",
        "protocolProjection": {"observed": False,
            "countdownSeconds": catalogue.waves.countdown_seconds,
            "minimumSeconds": catalogue.waves.minimum_seconds, "wonBreakSeconds": 8,
            "formula": "sum(max(simSeconds,minimum)+countdown)+8 per nonfinal won attempt",
            "excludes": "buying/reading/thinking, player availability, network and rendering"},
        "limitations": ["No authenticated rendered clients, network delay or human observations",
                        "Production collision/land checks; conservative static building blockers",
                        "No paid repair, revival, crew, research, weapon or wager execution",
                        "Unreached bands stay unmeasured; no free high-wave state"],
        "sources": source_inventory(), "campaigns": rows,
        "earnedProfileRestarts": restarts}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
