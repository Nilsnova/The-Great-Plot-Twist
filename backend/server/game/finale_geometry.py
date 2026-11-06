"""Compass geometry and deterministic crew targets; no game state is written here."""

import hashlib
import math

from server.game.case_types import Chart


def normalize_bearing(value: float) -> float:
    if not math.isfinite(value) or not 0 <= value < 360:
        raise ValueError("A bearing must be finite and between 0 and 360 degrees.")
    return round(value, 1) % 360


def bearing_to(light: tuple[float, float], target: tuple[float, float]) -> float:
    dx, dy = target[0] - light[0], light[1] - target[1]
    return math.degrees(math.atan2(dx, dy)) % 360


def angular_distance(left: float, right: float) -> float:
    distance = abs(left - right) % 360
    return min(distance, 360 - distance)


def on_target(sent: float, true: float, tolerance: float) -> bool:
    return angular_distance(sent, true) <= tolerance


def schooner_position(crew_id: str, chart: Chart) -> tuple[float, float]:
    digest = hashlib.sha256(f"false_light:schooner:{crew_id}".encode()).digest()
    angle = math.radians(int.from_bytes(digest[:4], "big") / 2**32 * 360)
    radius = chart.max_offset_from_fog_center * math.sqrt(
        int.from_bytes(digest[4:8], "big") / 2**32
    )
    x, y = chart.fog_center
    return round(x + radius * math.sin(angle), 2), round(y - radius * math.cos(angle), 2)


def glow_position(crew_id: str, chart: Chart) -> tuple[int, int]:
    x, y = schooner_position(crew_id, chart)
    return round(x), round(y)
