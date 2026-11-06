"""Compass and seeded chart checks use public coordinates, never story answers.

Used by: developers checking the geometry that the night rules consume.
"""

from dataclasses import replace
from math import hypot
from uuid import UUID

import pytest

from server.game.case_data import load_case
from server.game.finale_geometry import (
    angular_distance,
    bearing_to,
    glow_position,
    normalize_bearing,
    on_target,
    schooner_position,
)


@pytest.mark.parametrize(
    "target,expected", [((0, -1), 0), ((1, 0), 90), ((0, 1), 180), ((-1, 0), 270)]
)
def test_bearing_follows_the_compass_rule(target, expected):
    assert bearing_to((0, 0), target) == expected


@pytest.mark.parametrize("offset,expected", [(5, True), (5.1, False), (6, False), (-5, True)])
def test_off_target_uses_the_inclusive_tolerance(offset, expected):
    assert on_target(offset, 0, 5) is expected
    assert angular_distance(359, 1) == 2
    assert on_target(359, 1, 2)


@pytest.mark.parametrize("sent,expected", [(359.96, 0.0), (360, 0.0), (-0.04, 0.0), (721.24, 1.2)])
def test_bearings_are_normalised_to_one_decimal_below_360(sent, expected):
    assert normalize_bearing(sent) == expected


@pytest.mark.parametrize("sent", [float("inf"), float("-inf"), float("nan")])
def test_nonfinite_bearings_are_rejected(sent):
    with pytest.raises(ValueError, match="finite"):
        normalize_bearing(sent)


def test_schooner_is_seeded_by_the_crew_id_and_stays_within_20_units():
    chart = load_case().night.chart
    ids = tuple(str(UUID(int=index)) for index in range(200))
    points = tuple(schooner_position(crew, chart) for crew in ids)
    assert points[0] == schooner_position(ids[0], chart)
    assert points[0] != points[1]
    for point in points:
        assert (
            hypot(point[0] - chart.fog_center[0], point[1] - chart.fog_center[1])
            <= chart.max_offset_from_fog_center
        )
    changed = replace(chart, fog_center=(0, 0), max_offset_from_fog_center=1)
    assert hypot(*schooner_position(ids[0], changed)) <= 1.01


def test_glow_rounds_the_seeded_point_to_whole_units():
    chart = load_case().night.chart
    crew = str(UUID(int=200))
    assert glow_position(crew, chart) == tuple(
        round(value) for value in schooner_position(crew, chart)
    )
