"""Compass geometry and crew-seeded targets use the production chart rules."""

import math
import uuid

import pytest

from server.game.case_data import load_case
from server.game.finale_geometry import (
    angular_distance,
    bearing_to,
    normalize_bearing,
    on_target,
    schooner_position,
)


@pytest.mark.parametrize(
    ("point", "bearing"), [((0, -1), 0), ((1, 0), 90), ((0, 1), 180), ((-1, 0), 270)]
)
def test_bearings_follow_chart_compass(point, bearing):
    assert bearing_to((0, 0), point) == bearing


def test_tolerance_wraps_and_normalization_cannot_return_360():
    assert angular_distance(359, 1) == 2
    assert on_target(355, 0, 5)
    assert not on_target(354.9, 0, 5)
    assert normalize_bearing(359.96) == 0.0
    for value in (float("nan"), float("inf"), -1, 360):
        with pytest.raises(ValueError):
            normalize_bearing(value)


def test_crew_target_is_deterministic_and_inside_the_chart_disc():
    chart = load_case().night.chart
    points = [schooner_position(str(uuid.UUID(int=i)), chart) for i in range(200)]
    assert points == [schooner_position(str(uuid.UUID(int=i)), chart) for i in range(200)]
    assert len(set(points)) == 200
    assert all(
        math.dist(point, chart.fog_center) <= chart.max_offset_from_fog_center + 0.01
        for point in points
    )
