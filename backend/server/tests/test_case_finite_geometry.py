"""Corrupt numeric content fails closed before it can reach compass geometry."""

import pytest

from server.game.case_errors import CaseDataError
from server.game.case_read import Reader


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf"), True])
def test_coordinate_pairs_reject_nonfinite_or_boolean_values(value):
    with pytest.raises(CaseDataError, match="two finite numbers"):
        Reader({"chart_xy": [1, value]}, "light").pair("chart_xy")


def test_coordinate_reader_preserves_valid_chart_values():
    assert Reader({"xy": [302, 192.87]}, "light").pair("xy") == (302, 192.87)
