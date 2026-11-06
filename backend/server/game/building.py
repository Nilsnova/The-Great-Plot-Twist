"""The rules of the home islet: what can be built where, what is missing, what the islet shows.

Pure Python: no network, no database, no clock. The rules take plain values (the catalogue from
buildings.json, the buildings that stand, the coins and the timber the player holds) and give plain
values back, so a test can call them without a web server.

The islet has five spots. Each one holds one kind of building and nothing else: the cabin (there
from the start, free, no levels), the workshop, the windmill, the greenhouse and the signal
station. For now only the workshop and the signal station can be built. The windmill and the
greenhouse wait until timber has a second source (the driftline). A spot is in one of three
states for the player:

    built   something stands there (the cabin always, the others after a build)
    empty   nothing stands there yet, and it can be built
    locked  nothing stands there, and it cannot be built yet

Who enforces what: this file decides what is allowed and what the screen shows. The database
function islet_build() checks the rules that depend on what a player did before (is the plot
taken? is there enough timber?) in the same step that moves the coins, because only the database
sees two requests at the same moment.

Used by: islet_service.py (looks at an islet, builds) and the tests.
"""

import logging
from dataclasses import dataclass
from datetime import datetime

from server.errors import ApiError
from server.game.building_catalogue import (
    SIGNAL_STATION,  # the building the finale counts (CASE-FILE section 10.2)
    BuildingCatalogue,
    Cost,
    Spot,
)

logger = logging.getLogger(__name__)

# The words of `missing`, in this order.
COINS = "coins"
TIMBER = "timber"

# The three states of a spot.
BUILT = "built"
EMPTY = "empty"
LOCKED = "locked"

# Level 1 is the only level that can be built today.
FIRST_LEVEL = 1


class BuildRefused(ApiError):
    """A build the rules do not allow. Nothing was changed."""


@dataclass(frozen=True)
class StandingBuilding:
    """One building that stands on a player's islet (a row of the table islet_buildings)."""

    plot: str
    building_type: str
    level: int
    built_at: datetime


@dataclass(frozen=True)
class SpotPlan:
    """One spot as GET /api/islet shows it."""

    spot: Spot
    state: str  # BUILT, EMPTY or LOCKED
    level: int | None  # None for the cabin and for spots where nothing stands
    built_at: datetime | None  # None for the cabin and for spots where nothing stands
    cost: Cost | None  # None when something stands there
    missing: tuple[str, ...]  # what the player is short of, for an empty spot
    can_build: bool


@dataclass(frozen=True)
class IsletPlan:
    """The whole islet as GET /api/islet shows it."""

    coins: int
    timber: int
    spots: tuple[SpotPlan, ...]  # in the order of the file
    signal_station_built: bool


def find_spot(catalogue: BuildingCatalogue, plot: str) -> Spot:
    """The spot with this plot id. Raises 404 no_such_plot if there is none."""
    for spot in catalogue.spots:
        if spot.plot == plot:
            return spot
    raise BuildRefused(404, "no_such_plot", "There is no such plot on your islet.")


def find_spot_of_building(catalogue: BuildingCatalogue, building_type: str) -> Spot:
    """The spot that holds this kind of building. Raises 404 no_such_building if there is none."""
    for spot in catalogue.spots:
        if spot.building_type == building_type:
            return spot
    raise BuildRefused(404, "no_such_building", "There is no such building.")


def level_one_cost(catalogue: BuildingCatalogue) -> Cost:
    """What a level 1 building costs, from the price list of the file."""
    for step in catalogue.price_list:
        if step.level == FIRST_LEVEL:
            return step.cost
    raise ValueError("The price list has no entry for level 1.")  # the loader makes sure it has


def check_build(catalogue: BuildingCatalogue, plot: str, building_type: str) -> tuple[Spot, Cost]:
    """Check that this building may be built on this plot, and say what it costs.

    The checks come in a fixed order, and the first one that fails is the answer:
      1. an unknown plot                           404 no_such_plot
      2. an unknown building                       404 no_such_building
      3. a building that belongs on another plot   422 wrong_plot
      4. a spot that is there from the start       409 plot_occupied
      5. a spot that cannot be built yet           409 not_buildable_yet
    Whether the plot is taken and whether the player has the timber and the coins are not asked
    here: islet_build() answers that, in the same step that moves the coins.
    """
    spot = find_spot(catalogue, plot)
    wanted = find_spot_of_building(catalogue, building_type)
    if wanted.plot != spot.plot:
        raise BuildRefused(
            422,
            "wrong_plot",
            f"The {wanted.name.lower()} belongs on the {wanted.plot_name.lower()}, "
            f"not on the {spot.plot_name.lower()}.",
        )
    if spot.stands_from_start:
        raise BuildRefused(409, "plot_occupied", f"Your {spot.name.lower()} already stands here.")
    if not spot.buildable:
        raise BuildRefused(409, "not_buildable_yet", spot.locked_note or "Not yet.")
    return spot, level_one_cost(catalogue)


def missing_for(cost: Cost, coins: int, timber: int) -> tuple[str, ...]:
    """What the player is short of for this cost: nothing, coins, timber or both (in that order)."""
    missing = []
    if coins < cost.coins:
        missing.append(COINS)
    if timber < cost.timber:
        missing.append(TIMBER)
    return tuple(missing)


def plan_spot(
    catalogue: BuildingCatalogue,
    spot: Spot,
    standing: StandingBuilding | None,
    coins: int,
    timber: int,
) -> SpotPlan:
    """What one spot looks like for a player. `standing` is the building on it, if any.

    The state is decided in this order:
      1. a spot that is there from the start is built, with no level and no time
      2. a spot with a building on it is built, with the level and the time of the building
      3. a spot that cannot be built yet is locked: its cost is shown and nothing is missing
      4. any other spot is empty, with what is missing and whether the player can build it
    """
    if spot.stands_from_start:
        return SpotPlan(spot, BUILT, None, None, None, (), False)
    if standing is not None:
        return SpotPlan(spot, BUILT, standing.level, standing.built_at, None, (), False)
    cost = level_one_cost(catalogue)
    if not spot.buildable:
        return SpotPlan(spot, LOCKED, None, None, cost, (), False)
    missing = missing_for(cost, coins, timber)
    return SpotPlan(spot, EMPTY, None, None, cost, missing, not missing)


def has_signal_station(standing: list[StandingBuilding]) -> bool:
    """True if one of the buildings that stand is a signal station."""
    return any(row.building_type == SIGNAL_STATION for row in standing)


def plan_islet(
    catalogue: BuildingCatalogue, standing: list[StandingBuilding], coins: int, timber: int
) -> IsletPlan:
    """The whole islet for a player. A building on a plot the file does not list is skipped."""
    by_plot = {}
    known_plots = {spot.plot for spot in catalogue.spots}
    for row in standing:
        if row.plot in known_plots:
            by_plot[row.plot] = row
        else:
            logger.warning("A building stands on plot %s, which buildings.json lacks.", row.plot)
    plans = tuple(
        plan_spot(catalogue, spot, by_plot.get(spot.plot), coins, timber)
        for spot in catalogue.spots
    )
    return IsletPlan(coins, timber, plans, has_signal_station(standing))
