"""The build grid of your island (T36, flexible placement, decision D041): pure rules, no database.

Each of the 22 build spots keeps its id, its slot (wall, tower, watchtower or house) and what
stands on it, but it may stand on any free cell of a grid of half units. A spot covers a square
footprint (2 by 2 units for walls and towers, 3 by 3 for the watchtower and the houses).

    load_layout()   reads backend/content/island_layout.json (island_layout() keeps one copy)
    positions_of()  where each spot stands: its stored position, else its fixed spot (an old save);
                    a wall off every pirate path stands on the nearest free wall lane cell (D056)
    info_of()       the layout version and whether moving is available, for the island answer
    check_move()    whether one spot may move to one cell; raises MoveRefused with the reason
    route_open()    whether the boarders still find a way from the heart to the beach
    on_wall_lane()  whether a wall centred on (x, z) stands on a pirate path (D056, "wallLanes")

Used by: service.py (the positions in every island answer) and placement.py (the move route).
The browser repeats these rules for its preview in frontend/src/island/placement.js.
"""

import json
import math
from collections import deque
from dataclasses import dataclass, replace
from functools import cache
from pathlib import Path

from server.errors import ApiError
from server.island.wall_cohort import (
    LEGACY_WALL_CAPACITY,
    PERIMETER_WALL_CAPACITY,
    is_inventory_wall_id,
)

# backend/server/island/layout.py -> parents[2] is backend/
CONTENT_FILE = Path(__file__).resolve().parents[2] / "content" / "island_layout.json"
# Positions further out than this are never on the island (it is about 20 by 22 units).
MAX_UNITS = 30
SEA, BEACH = 0, 1
# Walls never block the route: the boarders hack through them (src/pirates/sim.js).
WALL_SLOT = "wall"
Position = tuple[float, float]


class LayoutFileError(ValueError):
    """island_layout.json is missing or broken."""


class MoveRefused(ApiError):
    """A move the placement rules do not allow. Nothing was changed."""


@dataclass(frozen=True)
class LayoutSpot:
    spot: str
    slot: str
    x: float  # the fixed spot of before (an old save stands here)
    z: float


@dataclass(frozen=True)
class Box:
    """Something that stands on the island and covers w by d units around (x, z)."""

    id: str
    name: str
    x: float
    z: float
    w: float
    d: float


@dataclass(frozen=True)
class LayoutRules:
    version: int
    grid: float
    rx: float
    rz: float
    seed: float
    heart: Position
    footprints: dict[str, float]
    spots: tuple[LayoutSpot, ...]
    keep_out: tuple[Box, ...]
    # D056: on row z, a wall may be centred on every grid cell from x0 to x1 (one pair per run).
    wall_lanes: dict[float, tuple[tuple[float, float], ...]]
    # D060: the extra tower spots ("extraSpots"); part of `spots` only in island_layout(more=True).
    extra_spots: tuple[LayoutSpot, ...] = ()


@dataclass(frozen=True)
class LayoutInfo:
    """What an island answer says about its layout."""

    version: int  # 1: the fixed spots of an old save, 2: something was placed on the grid
    grid: float
    movable: bool  # False while the layout table cannot be read (before its migration)
    wall_rule_version: int = 0  # Separate trusted policy; version above still means fixed/stored.
    wall_capacity: int = LEGACY_WALL_CAPACITY


def read_spot(row: list) -> LayoutSpot:
    spot, slot, x, z = row
    return LayoutSpot(str(spot), str(slot), float(x), float(z))


def read_box(row: dict) -> Box:
    return Box(row["id"], row["name"], row["x"], row["z"], row["w"], row["d"])


def read_lanes(rows: list) -> dict[float, tuple[tuple[float, float], ...]]:
    lanes = {}
    for z, *runs in rows:
        lanes[float(z)] = tuple(
            (float(runs[i]), float(runs[i + 1])) for i in range(0, len(runs) - 1, 2)
        )
    return lanes


def load_layout(path: Path = CONTENT_FILE) -> LayoutRules:
    """Read and check the layout file. Raises LayoutFileError on any mistake."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        rules = LayoutRules(
            version=int(data["version"]),
            grid=float(data["grid"]),
            rx=float(data["island"]["rx"]),
            rz=float(data["island"]["rz"]),
            seed=float(data["island"]["seed"]),
            heart=(float(data["heart"]["x"]), float(data["heart"]["z"])),
            footprints={slot: float(size) for slot, size in data["footprints"].items()},
            spots=tuple(read_spot(row) for row in data["spots"]),
            keep_out=tuple(read_box(row) for row in data["keepOut"]),
            wall_lanes=read_lanes(data["wallLanes"]["rows"]),
            extra_spots=tuple(read_spot(row) for row in data.get("extraSpots", {}).get("rows", [])),
        )
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise LayoutFileError(f"{path.name} cannot be read: {error}") from error
    check_file(rules, path)
    return rules


def check_file(rules: LayoutRules, path: Path) -> None:
    ids = [spot.spot for spot in rules.spots + rules.extra_spots]
    if len(ids) != len(set(ids)):
        raise LayoutFileError(f"{path.name} lists a spot twice.")
    for spot in rules.spots + rules.extra_spots:
        if spot.slot not in rules.footprints:
            raise LayoutFileError(f"{path.name}: {spot.spot} has the unknown slot {spot.slot}.")
        if not (on_grid(rules, spot.x) and on_grid(rules, spot.z)):
            raise LayoutFileError(f"{path.name}: {spot.spot} is not on the grid.")


@cache
def island_layout(more: bool = False) -> LayoutRules:
    """The layout file, read once per server process. more: with the extra tower spots of D060
    (the catalogue's more_tower_spots, the flag of the same name)."""
    rules = load_layout()
    return with_extra_spots(rules) if more else rules


def with_extra_spots(rules: LayoutRules) -> LayoutRules:
    """D060: the extra tower spots stand, block the route and can move like the others."""
    return replace(rules, spots=rules.spots + rules.extra_spots)


# --- where the spots stand ---


def spot_named(rules: LayoutRules, spot_id: str) -> LayoutSpot | None:
    for spot in rules.spots:
        if spot.spot == spot_id:
            return spot
    return None


def check_wall_policy(wall_rule_version: int, wall_capacity: int) -> None:
    """Never interpret an unknown persisted policy as permission or as a legacy downgrade."""
    if (
        type(wall_rule_version) is not int
        or type(wall_capacity) is not int
        or (wall_rule_version, wall_capacity)
        not in {(0, LEGACY_WALL_CAPACITY), (1, PERIMETER_WALL_CAPACITY)}
    ):
        raise ValueError("Unsupported wall placement policy.")


def positions_of(
    rules: LayoutRules,
    stored: dict[str, Position],
    *,
    wall_rule_version: int = 0,
    wall_capacity: int = LEGACY_WALL_CAPACITY,
) -> dict[str, Position]:
    """Every spot's place: the stored one if any, else its fixed spot. An old save stores
    nothing, so it is converted to the grid as it was (every fixed spot is a grid cell).
    Then settle_walls() puts a wall that stands on no pirate path (D056) on a lane."""
    check_wall_policy(wall_rule_version, wall_capacity)
    placed = {}
    for spot in rules.spots:
        placed[spot.spot] = stored.get(spot.spot, (spot.x, spot.z))
    if wall_rule_version == 0:
        return settle_walls(rules, placed, stored)
    # Added pieces have no spatial default and reserve nothing until accepted construction.
    placed.update(
        (spot, where) for spot, where in stored.items() if is_inventory_wall_id(spot, wall_capacity)
    )
    return placed


def settle_walls(
    rules: LayoutRules, placed: dict[str, Position], stored: dict[str, Position]
) -> dict[str, Position]:
    """D056: every wall stands on a pirate path. A wall off every lane (a wall moved before
    16 Nov 2026), or one whose new fixed spot another building now covers, stands on the
    nearest free lane cell instead. Deterministic: towers and houses keep their places, then
    the moved walls and then the unmoved ones are settled in file order, each on the nearest
    cell (ties: lower z, then lower x) clear of the fixed buildings and of everything settled
    before it. Nothing is written: the same stored rows give the same island on every read,
    and the wall's next move stores a lane cell for good."""
    walls = [spot.spot for spot in rules.spots if spot.slot == WALL_SLOT]
    order = [s for s in walls if s in stored] + [s for s in walls if s not in stored]
    settled = {spot.spot: placed[spot.spot] for spot in rules.spots if spot.slot != WALL_SLOT}
    out = dict(placed)
    for spot_id in order:
        where = placed[spot_id]
        if not wall_fits(rules, settled, spot_id, where):
            where = nearest_lane_cell(rules, settled, spot_id, where) or where
        settled[spot_id] = out[spot_id] = where
    return out


def wall_fits(
    rules: LayoutRules, others: dict[str, Position], spot_id: str, where: Position
) -> bool:
    """A wall may stand at `where` next to `others`: on a lane, on land, clear of everything."""
    if not on_wall_lane(rules, where[0], where[1]):
        return False
    if surface_class(rules, where[0], where[1]) == SEA:
        return False
    box = box_of(rules, spot_id, where)
    if any(overlaps(box, other) for other in rules.keep_out):
        return False
    return not any(
        other_id != spot_id and overlaps(box, box_of(rules, other_id, at))
        for other_id, at in others.items()
    )


def lane_cells(rules: LayoutRules) -> list[Position]:
    cells = []
    for z, runs in rules.wall_lanes.items():
        for first, last in runs:
            steps = round((last - first) / rules.grid)
            cells.extend((first + i * rules.grid, z) for i in range(steps + 1))
    return cells


def nearest_lane_cell(
    rules: LayoutRules, others: dict[str, Position], spot_id: str, where: Position
) -> Position | None:
    def far(cell: Position) -> tuple[float, float, float]:
        return ((cell[0] - where[0]) ** 2 + (cell[1] - where[1]) ** 2, cell[1], cell[0])

    for cell in sorted(lane_cells(rules), key=far):
        if wall_fits(rules, others, spot_id, cell):
            return cell
    return None


def place_spots(
    rules: LayoutRules,
    spots: tuple,
    stored: dict[str, Position] | None,
    *,
    wall_rule_version: int = 0,
    wall_capacity: int = LEGACY_WALL_CAPACITY,
) -> tuple:
    """The spot views (rules.SpotView) with the x and z of where each one stands."""
    placed = positions_of(
        rules, stored or {}, wall_rule_version=wall_rule_version, wall_capacity=wall_capacity
    )
    return tuple(
        replace(spot, x=placed[spot.id][0], z=placed[spot.id][1]) if spot.id in placed else spot
        for spot in spots
    )


def info_of(
    rules: LayoutRules,
    stored: dict[str, Position] | None,
    *,
    wall_rule_version: int = 0,
    wall_capacity: int = LEGACY_WALL_CAPACITY,
) -> LayoutInfo:
    """stored is None when the layout could not be read: the fixed spots, no moving."""
    check_wall_policy(wall_rule_version, wall_capacity)
    version = 2 if stored else 1
    return LayoutInfo(version, rules.grid, stored is not None, wall_rule_version, wall_capacity)


def footprint_of(
    rules: LayoutRules, spot_id: str, *, wall_capacity: int = LEGACY_WALL_CAPACITY
) -> float:
    spot = spot_named(rules, spot_id)
    if spot is not None:
        return rules.footprints[spot.slot]
    return rules.footprints[WALL_SLOT] if is_inventory_wall_id(spot_id, wall_capacity) else 0.0


def box_of(
    rules: LayoutRules, spot_id: str, where: Position, *, wall_capacity: int = LEGACY_WALL_CAPACITY
) -> Box:
    size = footprint_of(rules, spot_id, wall_capacity=wall_capacity)
    return Box(spot_id, "another building", where[0], where[1], size, size)


# --- the rules of a move ---


def on_wall_lane(rules: LayoutRules, x: float, z: float) -> bool:
    """D056: a wall centred on (x, z) stops boarders on their way to the heart."""
    return any(first <= x <= last for first, last in rules.wall_lanes.get(float(z), ()))


def on_grid(rules: LayoutRules, value: float) -> bool:
    return abs(value) <= MAX_UNITS and (value / rules.grid).is_integer()


def surface_class(rules: LayoutRules, x: float, z: float) -> int:
    """0 sea, 1 beach, 2 grass: the same shape as surfaceClass() in src/world/places/surfaces.js."""
    angle = math.atan2(z / rules.rz, x / rules.rx)
    edge = 1 + 0.055 * math.sin(angle * 5 + rules.seed) + 0.035 * math.cos(angle * 7)
    distance = math.hypot(x / rules.rx, z / rules.rz) / edge
    return 2 if distance < 0.85 else BEACH if distance < 1 else SEA


def overlaps(a: Box, b: Box) -> bool:
    """True when two footprints share ground. Touching edges do not count: walls form lines."""
    return abs(a.x - b.x) < (a.w + b.w) / 2 and abs(a.z - b.z) < (a.d + b.d) / 2


def check_move(
    rules: LayoutRules,
    positions: dict[str, Position],
    spot_id: str,
    x: float,
    z: float,
    *,
    wall_rule_version: int = 0,
    wall_capacity: int = LEGACY_WALL_CAPACITY,
) -> None:
    """Raise MoveRefused when `spot_id` may not stand at (x, z). The first failing rule wins:
    404 no_such_spot, 422 off_grid, 409 not_on_land, 409 off_path (a wall off every pirate
    path, D056), 409 place_taken, 409 blocks_route."""
    check_wall_policy(wall_rule_version, wall_capacity)
    spot = spot_named(rules, spot_id)
    inventory = wall_rule_version == 1 and is_inventory_wall_id(spot_id, wall_capacity)
    if spot is None and not inventory:
        raise MoveRefused(404, "no_such_spot", "There is no such build spot.")
    if not (on_grid(rules, x) and on_grid(rules, z)):
        raise MoveRefused(422, "off_grid", "Pick a square of the build grid.")
    if surface_class(rules, x, z) == SEA:
        raise MoveRefused(409, "not_on_land", "Buildings stand on land, not in the sea.")
    if wall_rule_version == 0 and spot.slot == WALL_SLOT and not on_wall_lane(rules, x, z):
        raise MoveRefused(409, "off_path", "Walls go on a pirate path.")
    moved = box_of(rules, spot_id, (x, z), wall_capacity=wall_capacity)
    for other in rules.keep_out:
        if overlaps(moved, other):
            raise MoveRefused(409, "place_taken", f"That is too close to {other.name}.")
    for other_id, where in positions.items():
        if other_id != spot_id and overlaps(
            moved, box_of(rules, other_id, where, wall_capacity=wall_capacity)
        ):
            raise MoveRefused(409, "place_taken", "Another building stands there.")
    if not route_open(rules, {**positions, spot_id: (x, z)}):
        raise MoveRefused(
            409, "blocks_route", "That would wall the heart in. Leave the pirates a way through."
        )


# --- the route from the heart to the beach ---


def cell_span(rules: LayoutRules, middle: float, size: float) -> range:
    """The cell numbers from one edge of a box to the other, both edges included."""
    first = math.ceil((middle - size / 2) / rules.grid)
    last = math.floor((middle + size / 2) / rules.grid)
    return range(first, last + 1)


def cells_under(rules: LayoutRules, box: Box) -> set[tuple[int, int]]:
    """The grid cells whose centre lies inside the box or on its edge."""
    columns, rows = cell_span(rules, box.x, box.w), cell_span(rules, box.z, box.d)
    return {(cx, cz) for cx in columns for cz in rows}


def blocked_cells(rules: LayoutRules, positions: dict[str, Position]) -> set[tuple[int, int]]:
    """Cells nobody walks through: towers, houses, the watchtower and the fixed buildings."""
    blocked: set[tuple[int, int]] = set()
    for other in rules.keep_out:
        if other.id != "heart":
            blocked |= cells_under(rules, other)
    for spot in rules.spots:
        if spot.slot != WALL_SLOT:
            blocked |= cells_under(rules, box_of(rules, spot.spot, positions[spot.spot]))
    return blocked


def route_open(rules: LayoutRules, positions: dict[str, Position]) -> bool:
    """True when a walk over free land cells (no diagonal steps) leads from heart to beach."""
    blocked = blocked_cells(rules, positions)
    start = (round(rules.heart[0] / rules.grid), round(rules.heart[1] / rules.grid))
    seen, queue = {start}, deque([start])
    while queue:
        cx, cz = queue.popleft()
        if surface_class(rules, cx * rules.grid, cz * rules.grid) == BEACH:
            return True
        for nx, nz in ((cx + 1, cz), (cx - 1, cz), (cx, cz + 1), (cx, cz - 1)):
            if (nx, nz) in seen or (nx, nz) in blocked:
                continue
            if surface_class(rules, nx * rules.grid, nz * rules.grid) == SEA:
                continue
            seen.add((nx, nz))
            queue.append((nx, nz))
    return False
