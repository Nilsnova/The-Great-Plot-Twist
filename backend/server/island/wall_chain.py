"""Canonical bounded wall-chain quotes. Prices and placement come from current server rules."""

import math
from dataclasses import dataclass

from server.errors import ApiError
from server.island import layout, rules
from server.island.catalogue import IslandCatalogue, with_wall_capacity
from server.island.layout_store import LayoutSnapshot, positions_from
from server.island.rules import Built

MAX_CHAIN_PIECES = 32


@dataclass(frozen=True)
class WallPlacement:
    spot: str
    x: float
    z: float

    def wire(self) -> dict:
        return {"spot": self.spot, "x": self.x, "z": self.z}


@dataclass(frozen=True)
class WallQuote:
    placements: tuple[WallPlacement, ...]
    unit_cost: int
    remaining: int

    @property
    def total_cost(self) -> int:
        return self.unit_cost * len(self.placements)

    def wire(self) -> dict:
        return {
            "placements": [p.wire() for p in self.placements],
            "unitCost": self.unit_cost,
            "totalCost": self.total_cost,
            "remaining": self.remaining,
            "wallRuleVersion": 1,
            "wallCapacity": 128,
        }


def chain_cells(cells: list[tuple[float, float]]) -> tuple[tuple[float, float], ...]:
    """Keep ordered half-grid intent; each next piece shares a full cardinal edge."""
    if not 1 <= len(cells) <= MAX_CHAIN_PIECES:
        raise ApiError(422, "invalid_chain", "Choose between 1 and 32 wall pieces.")
    out = []
    for x, z in cells:
        if any(
            type(v) not in (int, float)
            or not math.isfinite(v)
            or abs(v) > layout.MAX_UNITS
            or v % 0.5 != 0
            for v in (x, z)
        ):
            raise ApiError(422, "off_grid", "Pick a square of the build grid.")
        cell = (float(x) + 0, float(z) + 0)
        if cell in out:
            raise ApiError(409, "place_taken", "That wall run crosses itself.")
        if out:
            dx, dz = abs(cell[0] - out[-1][0]), abs(cell[1] - out[-1][1])
            if not ((dx == 2 and dz == 0) or (dx == 0 and dz == 2)):
                raise ApiError(422, "invalid_chain", "Connect each wall to the previous piece.")
        out.append(cell)
    return tuple(out)


def quote_chain(
    catalogue: IslandCatalogue,
    built: dict[str, Built],
    snapshot: LayoutSnapshot,
    cells: list[tuple[float, float]],
    *,
    wave: int,
    role: str | None,
) -> WallQuote:
    """Allocate eligible IDs in input order and validate the whole final layout before quoting."""
    if (snapshot.rule_version, snapshot.capacity) != (1, 128):
        raise ApiError(409, "walls_not_ready", "Open perimeter wall building first.")
    cells = chain_cells(cells)
    catalogue = with_wall_capacity(catalogue, snapshot.capacity)
    geometry = layout.island_layout(
        more=True
    )  # Policy1 reserves all D060 sites, even paused offers.
    positions = layout.positions_of(
        geometry, positions_from(snapshot.rows), wall_rule_version=1, wall_capacity=128
    )
    for spot, item in built.items():
        if item.kind == "wall" and spot not in positions:
            raise ApiError(502, "database_error", "A wall's saved position could not be read.")
    eligible = []
    for spot in catalogue.spots:
        if spot.kinds != ("wall",) or spot.id in built:
            continue
        try:
            rules.check_build(catalogue, spot.id, "wall", built, wave)
        except ApiError as error:
            if error.code == "locked":
                continue
            raise
        eligible.append(spot.id)
    if len(eligible) < len(cells):
        raise ApiError(
            409, "wall_limit", "There are not enough wall pieces available for this run."
        )
    selected = eligible[: len(cells)]
    # Original unbuilt sites may be selected together; their old reservations move as one intent.
    final = {spot: at for spot, at in positions.items() if spot not in selected}
    placements = tuple(
        WallPlacement(spot, x, z) for spot, (x, z) in zip(selected, cells, strict=True)
    )
    for p in placements:
        layout.check_move(geometry, final, p.spot, p.x, p.z, wall_rule_version=1, wall_capacity=128)
        final[p.spot] = (p.x, p.z)
    price = rules.engineer_price(catalogue, rules.price_of(catalogue, "wall"), role)
    wall_count = sum(item.kind == "wall" for item in built.values())
    return WallQuote(placements, price, snapshot.capacity - wall_count - len(placements))
