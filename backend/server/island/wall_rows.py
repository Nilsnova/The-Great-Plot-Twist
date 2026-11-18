"""VIS71: at most three rows per existing east/south/west approach, not upgrade levels.

Count all reserved wall sites, including unbuilt ones, so the existing layout-only Move CAS
fences the complete rule input. The nearest approach to the heart wins; south owns the
45-degree boundary ties. East/west depth is x, south depth is z; a half-grid stagger is a new row.
"""

from collections.abc import Iterable

MAX_WALL_ROWS = 3
APPROACHES = ("east", "south", "west")
Position = tuple[float, float]


def wall_row_counts(walls: Iterable[Position], heart: Position) -> dict[str, int]:
    rows: dict[str, set[float]] = {name: set() for name in APPROACHES}
    for x, z in walls:
        dx, dz = x - heart[0], z - heart[1]
        approach = "south" if dz > 0 and dz >= abs(dx) else "west" if dx < 0 else "east"
        rows[approach].add(z if approach == "south" else x)
    return {name: len(rows[name]) for name in APPROACHES}


def added_wall_row(
    before: Iterable[Position], after: Iterable[Position], heart: Position
) -> str | None:
    """Preserve old excess while allowing corrections that do not add an excessive row."""
    was, next_rows = wall_row_counts(before, heart), wall_row_counts(after, heart)
    return next(
        (
            name for name in APPROACHES
            if next_rows[name] > MAX_WALL_ROWS and next_rows[name] > was[name]
        ),
        None,
    )
