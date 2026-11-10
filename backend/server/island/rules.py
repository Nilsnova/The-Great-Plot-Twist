"""The rules of the island: what each spot shows, what may be built, the loot cap, the weather.

Pure Python: no network, no database, no clock. The rules take the catalogue (islands.json) and
plain values, and give plain values back.

Who enforces what: this file decides what may be built where and what the screen shows. The
database decides what depends on what happened before (is the spot taken? can the player pay? is a
wave running? is it too early to finish?), because only the database sees two requests at the
same moment. The loot is worked out in the database too (wave_finish); loot_cap() below is the same
rule in Python, for the tests and the documentation.

Used by: service.py and the tests.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.island.catalogue import IslandCatalogue, Kind, Loot, Spot, Weather

# The weather state the waves use when the real weather cannot be read.
CALM = "calm"
# The cabin stands from the start (BUILD-PLAN 3.3). It is not a build spot and has no row.
CABIN = "cabin"


class BuildRefused(ApiError):
    """A build the rules do not allow. Nothing was changed."""


@dataclass(frozen=True)
class SpotView:
    """One build spot as the API shows it: {id, kind, built, cost}."""

    id: str
    kind: str
    built: bool
    cost: int  # the price of the kind, also once it is built


def kind_named(catalogue: IslandCatalogue, kind: str) -> Kind | None:
    for entry in catalogue.kinds:
        if entry.kind == kind:
            return entry
    return None


def price_of(catalogue: IslandCatalogue, kind: str) -> int:
    """The price of a kind. Every spot's kind is in the list (the loader checks it)."""
    entry = kind_named(catalogue, kind)
    if entry is None:
        raise ValueError(f"No price for the kind {kind}.")
    return entry.coins


def plan_spots(catalogue: IslandCatalogue, built_spots: set[str]) -> tuple[SpotView, ...]:
    """Every build spot of an island, in the order of the file. Other rows are ignored."""
    return tuple(
        SpotView(spot.id, spot.kind, spot.id in built_spots, price_of(catalogue, spot.kind))
        for spot in catalogue.spots
    )


def find_spot(catalogue: IslandCatalogue, spot_id: str) -> Spot:
    for spot in catalogue.spots:
        if spot.id == spot_id:
            return spot
    if spot_id == CABIN:
        raise BuildRefused(409, "spot_taken", "Your cabin already stands there.")
    raise BuildRefused(404, "no_such_spot", "There is no such build spot on your island.")


def check_build(
    catalogue: IslandCatalogue, spot_id: str, kind: str, built_spots: set[str]
) -> tuple[Spot, int]:
    """Check that this kind may be built on this spot, and say what it costs.

    The checks come in a fixed order, and the first one that fails is the answer:
      1. the cabin                                409 spot_taken
      2. an unknown spot                          404 no_such_spot
      3. a kind that does not belong there        422 wrong_kind
      4. a spot where something stands already    409 spot_taken (the database checks it again)
    Whether the player can pay is not asked here: the wallet answers that in the same step.
    """
    spot = find_spot(catalogue, spot_id)
    if kind != spot.kind:
        wanted = kind_named(catalogue, spot.kind)
        name = wanted.name.lower() if wanted else spot.kind
        raise BuildRefused(422, "wrong_kind", f"Only a {name} can stand on this spot.")
    if spot.id in built_spots:
        raise spot_taken(catalogue, spot)
    return spot, price_of(catalogue, spot.kind)


def spot_taken(catalogue: IslandCatalogue, spot: Spot) -> BuildRefused:
    entry = kind_named(catalogue, spot.kind)
    name = entry.name if entry else "Something"
    return BuildRefused(409, "spot_taken", f"{name} already stands on this spot.")


def loot_cap(loot: Loot, wave: int, houses: int) -> int:
    """The loot for surviving wave `wave` with `houses` houses: 10 + 5 x wave + 5 x houses."""
    return loot.base + loot.per_wave * wave + loot.per_house * houses


def weather_for(catalogue: IslandCatalogue, state: str | None) -> Weather:
    """What a weather state does to the pirates. An unknown or missing state is calm."""
    by_kind = {line.kind: line for line in catalogue.weather}
    return by_kind.get(state or CALM, by_kind[CALM])
