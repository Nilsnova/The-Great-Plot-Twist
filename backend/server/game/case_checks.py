"""Run the inexpensive case content checks in their numbered order.

Used by: case_data.load_case and the content mutation tests.
"""

from server.game.case_check_fairness import (
    check_l14,
    check_l15,
    check_l18,
    check_l19,
    filled_refs,
)
from server.game.case_check_routes import (
    check_l1,
    check_l2,
    check_l3,
    check_l4,
    check_l5,
    check_l6,
    check_l7,
    check_l8,
)
from server.game.case_types import CaseData

__all__ = ["LOAD_TIME_CHECKS", "filled_refs", "run_checks"]

LOAD_TIME_CHECKS = {
    "L1": check_l1,
    "L2": check_l2,
    "L3": check_l3,
    "L4": check_l4,
    "L5": check_l5,
    "L6": check_l6,
    "L7": check_l7,
    "L8": check_l8,
    "L14": check_l14,
    "L15": check_l15,
    "L18": check_l18,
    "L19": check_l19,
}


def run_checks(data: CaseData) -> None:
    for check in LOAD_TIME_CHECKS.values():
        check(data)
