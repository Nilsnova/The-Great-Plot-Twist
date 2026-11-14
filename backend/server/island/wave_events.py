"""Wave events and the bonus loot they allow (docs/GAME-V3.md section 4.2 and 4.3).

Every browser picks a wave's event from its seed and number (frontend/src/pirates/wave-events.js
eventFor); this module repeats the same 32-bit steps (mulberry32, integer weights), so the server
knows which event a wave had without trusting the browser. The table is
backend/content/wave_events.json (the browser keeps a copy; tests keep the two equal and check its
samples in both languages).

The finish route uses allowed_bonuses(): a won wave may ask for

    galleon   the treasure galleon was sunk: only on a wave whose event is treasure_galleon
    finisher  a boss finisher was won: only on a boss wave (every bossEvery-th, so wave 100 too)

both on an island only (Pirate Point has no events or finishers). A bonus the wave does not allow
is dropped, never refused, so a browser that drifted keeps its normal loot. bonus_base() is what
the allowed bonuses add to the loot's base (the boss multiplier applies after, like all loot).
Like the ships sunk, the server cannot see the battle itself: it pays a bonus only where the
wave could have had it, and at most once per finish.

Used by: routes/waves.py (finish) and the tests.
"""

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

TABLE_FILE = Path(__file__).resolve().parents[2] / "content" / "wave_events.json"
MASK = 0xFFFFFFFF
TWO32 = 4294967296
MAX_WAVE = 100
BONUS_KINDS = ("galleon", "finisher")


@dataclass(frozen=True)
class EventTable:
    first_wave: int
    surprise_u32: int
    events: tuple[tuple[str, int, int], ...]  # (id, from, weight)
    bonus: dict[str, tuple[int, int]]  # kind -> (base, per wave)
    base: tuple[str | None, ...]  # the seed-free base event of every wave 0..100


def imul(a: int, b: int) -> int:
    """JavaScript's Math.imul, as an unsigned 32-bit number."""
    return ((a & MASK) * (b & MASK)) & MASK


def u32_stream(seed: int):
    """mulberry32 as 32-bit integers (wave-events.js u32Stream)."""
    state = seed & MASK

    def step() -> int:
        nonlocal state
        state = (state + 0x6D2B79F5) & MASK
        t = state
        t = imul(t ^ (t >> 15), t | 1)
        t = t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK)
        return (t ^ (t >> 14)) & MASK

    return step


def weighted(pool: list[tuple[str, int, int]], u: int) -> str:
    total = sum(weight for _, _, weight in pool)
    at = (u * total) // TWO32
    for event_id, _, weight in pool:
        if at < weight:
            return event_id
        at -= weight
    return pool[-1][0]


def read_table(path: Path = TABLE_FILE) -> EventTable:
    data = json.loads(path.read_text(encoding="utf-8"))
    events = tuple((item["id"], int(item["from"]), int(item["weight"])) for item in data["events"])
    first = int(data["firstWave"])
    base: list[str | None] = [None] * (MAX_WAVE + 1)
    previous = None
    for wave in range(first, MAX_WAVE + 1):
        pool = [item for item in events if item[1] <= wave and item[0] != previous]
        base[wave] = previous = weighted(pool, u32_stream(imul(wave, 0x85EBCA6B) ^ 0x27D4EB2F)())
    bonus = {
        kind: (int(item["base"]), int(item["perWave"])) for kind, item in data["bonus"].items()
    }
    surprise = math.floor(float(data["surprise"]) * TWO32)
    return EventTable(first, surprise, events, bonus, tuple(base))


@lru_cache(maxsize=1)
def table() -> EventTable:
    return read_table()


def event_for(
    wave: int, seed: int, flagship: bool = False, rules: EventTable | None = None
) -> str | None:
    """The event of a wave, or None (waves 1-2, Pirate Point): wave-events.js eventFor."""
    rules = rules or table()
    if flagship or not isinstance(wave, int) or wave < rules.first_wave or wave > MAX_WAVE:
        return None
    base, before = rules.base[wave], rules.base[wave - 1] if wave > rules.first_wave else None
    dice = u32_stream((int(seed) & MASK) ^ imul(wave, 0x9E3779B1))
    if dice() < rules.surprise_u32:
        pool = [item for item in rules.events if item[1] <= wave and item[0] not in (base, before)]
        if pool:
            return weighted(pool, dice())
    return base


def allowed_bonuses(
    asked: list[str] | None, *, place: str, wave: int | None, seed: int | None, boss_every: int
) -> list[str]:
    """The bonuses of `asked` this wave allows, each once, in a fixed order."""
    if not asked or place != "island" or wave is None or seed is None:
        return []
    allowed = []
    if "galleon" in asked and event_for(wave, seed) == "treasure_galleon":
        allowed.append("galleon")
    if "finisher" in asked and boss_every > 0 and wave % boss_every == 0:
        allowed.append("finisher")
    return allowed


def bonus_base(bonuses: list[str], wave: int, rules: EventTable | None = None) -> int:
    """What the allowed bonuses add to the loot's base: base + perWave x wave each."""
    rules = rules or table()
    n = max(1, min(MAX_WAVE, wave))
    return sum(
        rules.bonus[kind][0] + rules.bonus[kind][1] * n for kind in bonuses if kind in rules.bonus
    )
