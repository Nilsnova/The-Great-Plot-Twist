"""The buildings of a home islet, loaded from backend/content/buildings.json.

What each spot of the islet holds, what a level 1 building costs and how much timber every player
starts with live in a data file, not in code. This file reads it, checks every field and hands out
a BuildingCatalogue. A mistake in the file stops the home islet at start-up with a message that
names the entry and the field, so a typo cannot hide until a player builds. The format is written
in backend/content/README.md.

The file is for the server only. The browser never fetches it (decision D016): it gets everything
it needs through GET /api/islet.

Used by: building.py (the rules), islet_service.py (the prices and the starter pack), app.py (loads
the catalogue once, when the server starts) and the tests. The tests of the case read the price of
the signal station and the starter timber from here (building.level_one_cost(load_buildings()) and
catalogue.starter_timber) instead of copying the numbers.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from server.wallet import MAX_DELTA

logger = logging.getLogger(__name__)

# backend/server/game/building_catalogue.py -> parents[2] is backend/
CONTENT_FILE = Path(__file__).resolve().parents[2] / "content" / "buildings.json"

# The building that the finale counts (CASE-FILE section 10.2) and the spot it must stand on. The
# place registry has a hotspot with this id, and the case finale opens there.
SIGNAL_STATION = "signal_station"
SIGNAL_STATION_PLOT = "islet_signal_station"

# The limits of the file. The database allows the same names for a plot and a building (the check
# rules in the SQL file), and a player has at most one building per spot.
MAX_SPOTS = 10
MAX_STARTER_TIMBER = 100
MAX_TIMBER_PRICE = 1000
MAX_NOTE_LENGTH = 1000
ID_PATTERN = re.compile(r"[a-z0-9_]{2,40}")


class BuildingsFileError(ValueError):
    """The buildings file has a problem. The message says where."""


@dataclass(frozen=True)
class Cost:
    """What a building costs: whole coins and whole pieces of timber."""

    coins: int
    timber: int


@dataclass(frozen=True)
class PriceStep:
    """The price of one level. Only level 1 exists today."""

    level: int
    cost: Cost


@dataclass(frozen=True)
class Spot:
    """One spot of the islet. It holds one kind of building and nothing else."""

    plot: str  # the hotspot id in the place registry, for example "plot_2"
    plot_name: str  # what the player sees: "Workshop plot"
    building_type: str  # what stands here: "workshop"
    name: str  # the building as the player reads it: "Workshop"
    about: str  # one line about the building
    stands_from_start: bool  # True only for the cabin: free, there from the first day
    buildable: bool  # False while the spot cannot be built yet (the windmill, the greenhouse)
    locked_note: str | None  # why a spot that cannot be built yet is locked


@dataclass(frozen=True)
class BuildingCatalogue:
    """Everything the server knows about the buildings of a home islet."""

    play_money_note: str
    starter_timber: int  # every player gets this much timber once
    price_list: tuple[PriceStep, ...]
    spots: tuple[Spot, ...]  # in the order of the file, which is the order of the registry


def read_text(entry: dict, name: str, where: str, shortest: int, longest: int) -> str:
    """A text field: not blank, and the right length."""
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip():
        raise BuildingsFileError(f"{where}: '{name}' must be text that is not empty.")
    if not shortest <= len(value) <= longest:
        raise BuildingsFileError(
            f"{where}: '{name}' must be {shortest} to {longest} characters long."
        )
    return value


def read_id(entry: dict, name: str, where: str) -> str:
    """A plot or a building: 2 to 40 lowercase letters, digits or underscores."""
    value = entry.get(name)
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise BuildingsFileError(
            f"{where}: '{name}' must be 2 to 40 characters: lowercase letters, digits and "
            "underscores."
        )
    return value


def read_whole_number(entry: dict, name: str, where: str, lowest: int, highest: int) -> int:
    """A whole number from `lowest` to `highest`."""
    value = entry.get(name)
    message = f"{where}: '{name}' must be a whole number from {lowest} to {highest}."
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if isinstance(value, bool) or not isinstance(value, int):
        raise BuildingsFileError(message)
    if not lowest <= value <= highest:
        raise BuildingsFileError(message)
    return value


def read_flag(entry: dict, name: str, where: str, default: bool | None) -> bool:
    """A true or false field. `default` is used when the field is left out (None: required)."""
    value = entry.get(name, default)
    if not isinstance(value, bool):
        raise BuildingsFileError(f"{where}: '{name}' must be true or false.")
    return value


def read_locked_note(entry: dict, where: str) -> str | None:
    """The reason a spot is locked. It can be left out."""
    if "lockedNote" not in entry:
        return None
    return read_text(entry, "lockedNote", where, 1, 160)


def check_flags_of_one_spot(spot: Spot, where: str) -> None:
    """A spot is there from the start, or buildable, or locked with a reason. Never two of these."""
    if spot.stands_from_start and spot.buildable:
        raise BuildingsFileError(
            f"{where}: 'buildable' must be false for a spot that stands from the start."
        )
    if not spot.stands_from_start and not spot.buildable and spot.locked_note is None:
        raise BuildingsFileError(
            f"{where}: 'lockedNote' is needed for a spot that cannot be built yet."
        )


def read_spot(entry: object, position: int) -> Spot:
    """Check one entry of "spots" and turn it into a Spot."""
    where = f"spots[{position}]"
    if not isinstance(entry, dict):
        raise BuildingsFileError(f"{where} must be an object.")
    spot = Spot(
        plot=read_id(entry, "plot", where),
        plot_name=read_text(entry, "plotName", where, 2, 40),
        building_type=read_id(entry, "type", where),
        name=read_text(entry, "name", where, 2, 40),
        about=read_text(entry, "about", where, 1, 160),
        stands_from_start=read_flag(entry, "standsFromStart", where, default=False),
        buildable=read_flag(entry, "buildable", where, default=None),
        locked_note=read_locked_note(entry, where),
    )
    check_flags_of_one_spot(spot, where)
    return spot


def check_spots_together(spots: tuple[Spot, ...]) -> None:
    """No two spots share a plot or a building, and there is exactly one signal station."""
    plots = [spot.plot for spot in spots]
    if len(plots) != len(set(plots)):
        raise BuildingsFileError("Two spots share the same 'plot'.")
    types = [spot.building_type for spot in spots]
    if len(types) != len(set(types)):
        raise BuildingsFileError("Two spots share the same 'type'.")
    stations = [spot for spot in spots if spot.building_type == SIGNAL_STATION]
    if len(stations) != 1 or stations[0].plot != SIGNAL_STATION_PLOT:
        raise BuildingsFileError(
            f"Exactly one spot must have the type '{SIGNAL_STATION}', and its plot must be "
            f"'{SIGNAL_STATION_PLOT}'. The finale counts it."
        )


def read_spots(data: dict) -> tuple[Spot, ...]:
    """The "spots" list: 1 to MAX_SPOTS entries, each one checked."""
    entries = data.get("spots")
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_SPOTS:
        raise BuildingsFileError(f"'spots' must be a list of 1 to {MAX_SPOTS} entries.")
    spots = tuple(read_spot(entry, position) for position, entry in enumerate(entries))
    check_spots_together(spots)
    return spots


def read_price_list(data: dict) -> tuple[PriceStep, ...]:
    """The "priceList": exactly one entry for level 1 until the upgrades exist."""
    entries = data.get("priceList")
    if not isinstance(entries, list) or len(entries) != 1:
        raise BuildingsFileError("'priceList' must be a list with exactly one entry, for level 1.")
    where = "priceList[0]"
    entry = entries[0]
    if not isinstance(entry, dict):
        raise BuildingsFileError(f"{where} must be an object.")
    level = read_whole_number(entry, "level", where, 1, 1)
    cost = Cost(
        coins=read_whole_number(entry, "coins", where, 1, MAX_DELTA),
        timber=read_whole_number(entry, "timber", where, 0, MAX_TIMBER_PRICE),
    )
    return (PriceStep(level=level, cost=cost),)


def load_buildings(path: Path = CONTENT_FILE) -> BuildingCatalogue:
    """Read and check the buildings file. Raises BuildingsFileError if anything is wrong."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise BuildingsFileError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise BuildingsFileError(f"{path.name} must hold one JSON object.")
    where = path.name
    read_text(data, "about", where, 1, MAX_NOTE_LENGTH)  # the file explains itself; checked only
    return BuildingCatalogue(
        play_money_note=read_text(data, "playMoneyNote", where, 1, MAX_NOTE_LENGTH),
        starter_timber=read_whole_number(data, "starterTimber", where, 0, MAX_STARTER_TIMBER),
        price_list=read_price_list(data),
        spots=read_spots(data),
    )


def catalogue_or_none() -> BuildingCatalogue | None:
    """Like load_buildings, but a broken file does not stop the whole server.

    The home islet is a feature of its own. If its data file cannot be read (for example it did not
    make it into the deployment), the rest of the API must keep working. The error goes to the
    log, and the islet routes answer 503 islet_unavailable.
    """
    try:
        return load_buildings()
    except BuildingsFileError as error:
        logger.error("The home islet cannot start: %s", error)
        return None
