"""Compass bearings and deterministic chart points for a crew's night.

Used by: the pure night decisions, finale view and case planner.
"""

from hashlib import sha256
from math import atan2, cos, degrees, isfinite, radians, sin, sqrt

from server.game.case_types import Chart

Point = tuple[float, float]


def bearing_to(light: Point, target: Point) -> float:
    dx = target[0] - light[0]
    dy = light[1] - target[1]
    return degrees(atan2(dx, dy)) % 360


def normalize_bearing(bearing: float) -> float:
    if not isfinite(bearing):
        raise ValueError("A bearing must be finite.")
    return round(round(bearing, 1) % 360, 1)


def angular_distance(first: float, second: float) -> float:
    distance = abs(first - second) % 360
    return min(distance, 360 - distance)


def on_target(sent: float, true: float, tolerance: float) -> bool:
    return angular_distance(sent, true) <= tolerance


def schooner_position(crew_id: str, chart: Chart) -> Point:
    digest = sha256(f"false_light:schooner:{crew_id}".encode()).digest()
    angle = int.from_bytes(digest[:4], "big") / 2**32 * 360
    radius = chart.max_offset_from_fog_center * sqrt(int.from_bytes(digest[4:8], "big") / 2**32)
    x = chart.fog_center[0] + radius * sin(radians(angle))
    y = chart.fog_center[1] - radius * cos(radians(angle))
    return round(x, 2), round(y, 2)


def glow_position(crew_id: str, chart: Chart) -> tuple[int, int]:
    x, y = schooner_position(crew_id, chart)
    return round(x), round(y)
