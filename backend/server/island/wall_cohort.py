"""Bounded wall identities shared by the perimeter catalogue and placement rules."""

LEGACY_WALL_CAPACITY = 12
PERIMETER_WALL_CAPACITY = 128


def is_inventory_wall_id(spot: str, capacity: int = PERIMETER_WALL_CAPACITY) -> bool:
    """Only canonical additional IDs are inventory; the original twelve keep their sites."""
    if (
        not isinstance(spot, str)
        or not spot.startswith("wall_")
        or type(capacity) is not int
        or not LEGACY_WALL_CAPACITY <= capacity <= PERIMETER_WALL_CAPACITY
    ):
        return False
    suffix = spot.removeprefix("wall_")
    return (
        1 <= len(suffix) <= 3
        and suffix.isascii()
        and suffix.isdecimal()
        and spot == f"wall_{int(suffix)}"
        and LEGACY_WALL_CAPACITY < int(suffix) <= capacity
    )
