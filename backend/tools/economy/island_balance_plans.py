"""Cash-funded building timelines, with victory assumed rather than simulated.

Used by: the offline MP-ECO-19 assessment and its arithmetic tests.
"""

from dataclasses import asdict, dataclass

from server.island.catalogue import IslandCatalogue
from server.island.rules import is_boss, loot_cap


@dataclass(frozen=True)
class Purchase:
    plot: str
    kind: str
    level: int


def quote(catalogue: IslandCatalogue, purchase: Purchase) -> tuple[int, int]:
    """Return incremental price and earliest best wave; reject an impossible offer."""
    spot = next((row for row in catalogue.spots if row.id == purchase.plot), None)
    kind = next((row for row in catalogue.kinds if row.kind == purchase.kind), None)
    if spot is None or purchase.kind not in spot.kinds or kind is None:
        raise ValueError("The building does not fit this spot.")
    if not 1 <= purchase.level <= kind.max_level:
        raise ValueError("The building level is unavailable.")
    unlock = max(
        spot.unlock_wave,
        catalogue.campaign.spot_wave(spot.id),
        kind.level_waves[purchase.level - 1],
    )
    return kind.prices[purchase.level - 1], unlock


def buy_available(
    catalogue: IslandCatalogue,
    queue: list[Purchase],
    buildings: dict[str, Purchase],
    coins: int,
    best: int,
    reserve: int,
) -> tuple[int, list[dict]]:
    """Buy the strict priority queue until the first locked or unaffordable item."""
    bought = []
    while queue:
        purchase = queue[0]
        price, unlock = quote(catalogue, purchase)
        previous = buildings.get(purchase.plot)
        if previous is not None and previous.kind != purchase.kind:
            raise ValueError("The plan changes a standing building's kind.")
        if purchase.level != (previous.level + 1 if previous else 1):
            raise ValueError("The plan skips a building level.")
        if best < unlock or coins - price < reserve:
            break
        queue.pop(0)
        coins -= price
        buildings[purchase.plot] = purchase
        bought.append({**asdict(purchase), "unlockBest": unlock, "paidCoins": price})
    return coins, bought


def simulate_plan(
    catalogue: IslandCatalogue,
    purchases: list[Purchase],
    *,
    last_wave: int = 100,
    reserve_coins: int = 0,
) -> list[dict]:
    """One win of each wave; purchases happen before its bell using only prior income."""
    queue, buildings, coins, rows = list(purchases), {}, catalogue.starting_coins, []
    for wave in range(1, last_wave + 1):
        coins, bought = buy_available(catalogue, queue, buildings, coins, wave - 1, reserve_coins)
        houses = sum(item.level for item in buildings.values() if item.kind == "house")
        earned = loot_cap(catalogue.loot, wave, houses, boss=is_boss(catalogue, wave))
        rows.append(
            {
                "wave": wave,
                "bestAtPurchase": wave - 1,
                "purchases": bought,
                "houseLevelsAtBell": houses,
                "buildingLevels": sum(p.level for p in buildings.values()),
                "remainingPurchases": len(queue),
                "beforeIncomeCoins": coins,
                "income": earned,
                "closingCoins": coins + earned,
            }
        )
        coins += earned
    return rows


def group(kind: str, level: int, numbers: range) -> list[Purchase]:
    """Stable named spots, matching the current catalogue."""
    prefix = {"cannon": "cannon", "mortar": "cannon", "watchtower": "tower"}.get(kind, kind)
    return [Purchase(f"{prefix}_{number}", kind, level) for number in numbers]


def building_plan(income_first: bool) -> list[Purchase]:
    """Two declared priorities for the same eventual buildings; neither is a combat strategy."""
    first_cannons = 2 if income_first else 4
    plan = group("wall", 1, range(1, 7)) + group("cannon", 1, range(1, first_cannons + 1))
    for level in range(1, 4 if income_first else 2):
        plan += group("house", level, range(1, 3))
    plan += group("cannon", 1, range(first_cannons + 1, 5)) + group("mortar", 1, range(5, 8))
    for kind, numbers in [("wall", range(1, 7)), ("cannon", range(1, 5)), ("mortar", range(5, 8))]:
        plan += group(kind, 2, numbers)
    plan += group("watchtower", 1, range(1, 2)) + group("wall", 1, range(7, 13))
    plan += group("watchtower", 2, range(1, 2)) + group("wall", 2, range(7, 13))
    if not income_first:
        plan += group("house", 2, range(1, 3))
    for level in range(3, 6):
        for kind, numbers in [
            ("wall", range(1, 13)),
            ("cannon", range(1, 5)),
            ("mortar", range(5, 8)),
            ("watchtower", range(1, 2)),
        ]:
            plan += group(kind, level, numbers)
        if level == 3 and not income_first:
            plan += group("house", 3, range(1, 3))
    return plan
