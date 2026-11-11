"""The island and its waves, loaded from backend/content/islands.json.

The spots (also Pirate Point's), the prices per level of the five kinds, the crew, the captain,
the unlocks, the starting coins, the loot rule, the wave timing and what each weather state does
to the pirates live in a data file (decision D016), so a price changes
by editing the file, not the code. This file reads it, checks every field and hands out an
IslandCatalogue. A mistake stops only the island routes (503 island_unavailable), never the whole
API. The numbers are the tables of docs/TOWER-DEFENSE.md and docs/ECONOMY.md; change them together.

The file is for the server only. The browser gets what it needs through GET /api/island.

Used by: app.py (loads it once at start-up), rules.py, service.py and the tests.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from server.wallet import MAX_DELTA

logger = logging.getLogger(__name__)

# backend/server/island/catalogue.py -> parents[2] is backend/
CONTENT_FILE = Path(__file__).resolve().parents[2] / "content" / "islands.json"

ID_PATTERN = re.compile(r"[a-z][a-z0-9_]{1,39}")
# The weather states of weather/states.py. Each one needs its line in the file.
WEATHER_KINDS = ("storm", "fog", "rain", "calm")
# The limits the database checks too (wave_runs in the migration). MAX_SPOTS: the longest spot list
# (22 island spots since the inner ring of TOWER-DEFENSE section 12), with room to spare.
MAX_SPOTS = 30
MAX_WAVE = 1000
MAX_SECONDS = 86400
MIN_SHIPS, MAX_SHIPS = 0.5, 3.0
# A building has at most 3 levels and a captain 5 (the check rules of the migration).
MAX_LEVEL = 3
MAX_CAPTAIN_LEVEL = 5
# The crew of docs/TOWER-DEFENSE.md section 3. The database knows exactly these three.
CREW_KINDS = ("gunner", "carpenter", "lookout")


class IslandFileError(ValueError):
    """islands.json has a problem. The message says where."""


@dataclass(frozen=True)
class Kind:
    kind: str  # "wall"
    name: str  # "Wall"
    prices: tuple[int, ...]  # index 0 = level 1 (the build), 1 = level 2, ...; length = max level
    unlock_wave: int  # the best won wave a player needs before this kind can be built

    @property
    def coins(self) -> int:
        """The price of building one (level 1)."""
        return self.prices[0]

    @property
    def max_level(self) -> int:
        return len(self.prices)


@dataclass(frozen=True)
class Spot:
    id: str  # "wall_1": the marker in the island scene and the plot in islet_buildings
    kinds: tuple[str, ...]  # what can stand here; the first is shown on an empty spot

    @property
    def kind(self) -> str:
        return self.kinds[0]


@dataclass(frozen=True)
class Crew:
    crew: str  # gunner, carpenter or lookout
    name: str
    coins: int  # the price of one
    max: int  # at most this many per island
    unlock_wave: int


@dataclass(frozen=True)
class Captain:
    prices: tuple[int, ...]  # index 0 = level 1 (free), 1 = level 2, ...; length = max level
    unlock_waves: tuple[int, ...]  # the same index: the best won wave each level needs


@dataclass(frozen=True)
class Loot:
    base: int  # loot for surviving wave n: base + per_wave * n + per_house * house levels
    per_wave: int
    per_house: int
    pirate_point_base: int  # the base on Pirate Point, where there are no houses
    boss_multiplier: int  # a boss wave pays this many times the loot


@dataclass(frozen=True)
class WaveTiming:
    countdown_seconds: int  # from the bell to the first ship
    minimum_seconds: int  # a finish earlier than this after the countdown is refused
    maximum_seconds: int  # after this the wave is over and pays nothing
    highest_wave: int  # the wave number never goes above this
    boss_every: int  # every boss_every-th wave is a boss wave
    restart_back: int  # after a lost wave the next bell rings best wave minus this (at least 1)


@dataclass(frozen=True)
class Weather:
    kind: str  # storm, fog, rain or calm
    label: str  # one line for the screen
    ships: float  # how many ships compared with calm weather
    fog: float  # how much fog hides the ships, 0 to 1


@dataclass(frozen=True)
class IslandCatalogue:
    play_money_note: str
    starting_coins: int
    kinds: tuple[Kind, ...]
    level_unlock_waves: tuple[int, ...]  # index 0 = level 1: the best won wave a level needs
    spots: tuple[Spot, ...]  # in the order of the file
    pirate_point_spots: tuple[Spot, ...]
    crew: tuple[Crew, ...]
    captain: Captain
    loot: Loot
    waves: WaveTiming
    weather: tuple[Weather, ...]


def read_whole(entry: dict, name: str, where: str, lowest: int, highest: int) -> int:
    value = entry.get(name)
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if isinstance(value, bool) or not isinstance(value, int) or not lowest <= value <= highest:
        raise IslandFileError(
            f"{where}: '{name}' must be a whole number from {lowest} to {highest}."
        )
    return value


def read_number(entry: dict, name: str, where: str, lowest: float, highest: float) -> float:
    value = entry.get(name)
    if (
        isinstance(value, bool)
        or not isinstance(value, int | float)
        or not lowest <= value <= highest
    ):
        raise IslandFileError(f"{where}: '{name}' must be a number from {lowest} to {highest}.")
    return float(value)


def read_text(entry: dict, name: str, where: str, longest: int) -> str:
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip() or len(value) > longest:
        raise IslandFileError(f"{where}: '{name}' must be text of 1 to {longest} characters.")
    return value


def read_id(entry: dict, name: str, where: str) -> str:
    value = entry.get(name)
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise IslandFileError(f"{where}: '{name}' must be 2 to 40 lowercase letters, digits or _.")
    return value


def read_list(data: dict, name: str, longest: int) -> list:
    entries = data.get(name)
    if not isinstance(entries, list) or not 1 <= len(entries) <= longest:
        raise IslandFileError(f"'{name}' must be a list of 1 to {longest} entries.")
    if not all(isinstance(entry, dict) for entry in entries):
        raise IslandFileError(f"Every entry of '{name}' must be an object.")
    return entries


def read_object(data: dict, name: str) -> dict:
    value = data.get(name)
    if not isinstance(value, dict):
        raise IslandFileError(f"'{name}' must be an object.")
    return value


def read_whole_list(entry: dict, name: str, where: str, lowest: int, longest: int) -> tuple:
    values = entry.get(name)
    if not isinstance(values, list) or not 1 <= len(values) <= longest:
        raise IslandFileError(f"{where}: '{name}' must be a list of 1 to {longest} whole numbers.")
    return tuple(
        read_whole({"value": value}, "value", f"{where}.{name}", lowest, MAX_DELTA)
        for value in values
    )


def read_kinds(data: dict) -> tuple[Kind, ...]:
    kinds = tuple(
        Kind(
            kind=read_id(entry, "kind", f"kinds[{index}]"),
            name=read_text(entry, "name", f"kinds[{index}]", 40),
            prices=read_whole_list(entry, "prices", f"kinds[{index}]", 1, MAX_LEVEL),
            unlock_wave=read_whole(entry, "unlockWave", f"kinds[{index}]", 0, MAX_WAVE),
        )
        for index, entry in enumerate(read_list(data, "kinds", MAX_SPOTS))
    )
    if len({kind.kind for kind in kinds}) != len(kinds):
        raise IslandFileError("Two entries of 'kinds' share the same 'kind'.")
    return kinds


def read_spots(data: dict, name: str, kinds: tuple[Kind, ...]) -> tuple[Spot, ...]:
    known = {kind.kind for kind in kinds}
    spots = []
    for index, entry in enumerate(read_list(data, name, MAX_SPOTS)):
        where = f"{name}[{index}]"
        spot_kinds = entry.get("kinds")
        if not isinstance(spot_kinds, list) or not 1 <= len(spot_kinds) <= 4:
            raise IslandFileError(f"{where}: 'kinds' must be a list of 1 to 4 kinds.")
        spot = Spot(
            id=read_id(entry, "id", where),
            kinds=tuple(read_id({"kind": kind}, "kind", where) for kind in spot_kinds),
        )
        unknown = [kind for kind in spot.kinds if kind not in known]
        if unknown:
            raise IslandFileError(f"{where}: the kind '{unknown[0]}' is not in 'kinds'.")
        spots.append(spot)
    if len({spot.id for spot in spots}) != len(spots):
        raise IslandFileError(f"Two entries of '{name}' share the same 'id'.")
    return tuple(spots)


def read_crew(data: dict) -> tuple[Crew, ...]:
    crew = tuple(
        Crew(
            crew=read_id(entry, "crew", f"crew[{index}]"),
            name=read_text(entry, "name", f"crew[{index}]", 40),
            coins=read_whole(entry, "coins", f"crew[{index}]", 1, MAX_DELTA),
            max=read_whole(entry, "max", f"crew[{index}]", 1, 10),
            unlock_wave=read_whole(entry, "unlockWave", f"crew[{index}]", 0, MAX_WAVE),
        )
        for index, entry in enumerate(read_list(data, "crew", len(CREW_KINDS)))
    )
    if sorted(member.crew for member in crew) != sorted(CREW_KINDS):
        raise IslandFileError(f"'crew' must have one entry for each of {', '.join(CREW_KINDS)}.")
    return crew


def read_captain(data: dict) -> Captain:
    entry = read_object(data, "captain")
    captain = Captain(
        prices=read_whole_list(entry, "prices", "captain", 0, MAX_CAPTAIN_LEVEL),
        unlock_waves=read_whole_list(entry, "unlockWaves", "captain", 0, MAX_CAPTAIN_LEVEL),
    )
    if len(captain.prices) != len(captain.unlock_waves):
        raise IslandFileError("captain: 'prices' and 'unlockWaves' must be equally long.")
    if captain.prices[0] != 0 or 0 in captain.prices[1:]:
        raise IslandFileError("captain: level 1 is free (0) and every later level costs coins.")
    return captain


def read_loot(data: dict) -> Loot:
    entry = read_object(data, "loot")
    return Loot(
        base=read_whole(entry, "base", "loot", 0, 1000),
        per_wave=read_whole(entry, "perWave", "loot", 0, 1000),
        per_house=read_whole(entry, "perHouse", "loot", 0, 1000),
        pirate_point_base=read_whole(entry, "piratePointBase", "loot", 0, 1000),
        boss_multiplier=read_whole(entry, "bossMultiplier", "loot", 1, 10),
    )


def read_waves(data: dict) -> WaveTiming:
    entry = read_object(data, "waves")
    timing = WaveTiming(
        countdown_seconds=read_whole(entry, "countdownSeconds", "waves", 0, 600),
        minimum_seconds=read_whole(entry, "minimumSeconds", "waves", 0, MAX_SECONDS),
        maximum_seconds=read_whole(entry, "maximumSeconds", "waves", 1, MAX_SECONDS),
        highest_wave=read_whole(entry, "highestWave", "waves", 1, MAX_WAVE),
        boss_every=read_whole(entry, "bossEvery", "waves", 0, MAX_WAVE),
        restart_back=read_whole(entry, "restartBack", "waves", 0, MAX_WAVE),
    )
    if timing.minimum_seconds > timing.maximum_seconds:
        raise IslandFileError("waves: 'minimumSeconds' cannot be more than 'maximumSeconds'.")
    return timing


def read_weather(data: dict) -> tuple[Weather, ...]:
    lines = tuple(
        Weather(
            kind=read_id(entry, "kind", f"weather[{index}]"),
            label=read_text(entry, "label", f"weather[{index}]", 80),
            ships=read_number(entry, "ships", f"weather[{index}]", MIN_SHIPS, MAX_SHIPS),
            fog=read_number(entry, "fog", f"weather[{index}]", 0.0, 1.0),
        )
        for index, entry in enumerate(read_list(data, "weather", len(WEATHER_KINDS)))
    )
    if sorted(line.kind for line in lines) != sorted(WEATHER_KINDS):
        raise IslandFileError(
            f"'weather' must have one entry for each of {', '.join(WEATHER_KINDS)}."
        )
    return lines


def load_island(path: Path = CONTENT_FILE) -> IslandCatalogue:
    """Read and check islands.json. Raises IslandFileError if anything is wrong."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise IslandFileError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise IslandFileError(f"{path.name} must hold one JSON object.")
    read_text(data, "about", path.name, 1000)  # the file explains itself; checked only
    kinds = read_kinds(data)
    return IslandCatalogue(
        play_money_note=read_text(data, "playMoneyNote", path.name, 200),
        starting_coins=read_whole(data, "startingCoins", path.name, 1, MAX_DELTA),
        kinds=kinds,
        level_unlock_waves=read_whole_list(data, "levelUnlockWaves", path.name, 0, MAX_LEVEL),
        spots=read_spots(data, "spots", kinds),
        pirate_point_spots=read_spots(data, "piratePointSpots", kinds),
        crew=read_crew(data),
        captain=read_captain(data),
        loot=read_loot(data),
        waves=read_waves(data),
        weather=read_weather(data),
    )


def island_or_none() -> IslandCatalogue | None:
    """Like load_island, but a broken file stops only the island routes, not the whole server."""
    try:
        return load_island()
    except IslandFileError as error:
        logger.error("The island cannot start: %s", error)
        return None
