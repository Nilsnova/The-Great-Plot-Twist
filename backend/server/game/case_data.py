"""Load the private case data into frozen records, then enforce the load-time rules.

Used by: case_service.py and pure case rules. Errors never repeat story prose.
"""

import json
from pathlib import Path

from plot_twist.engine import CONTENT_DIR
from server.game.case_errors import CaseDataError
from server.game.case_parse import parse_case
from server.game.case_types import (
    Accusation,
    Board,
    Card,
    CaseData,
    Chart,
    CoinReward,
    Deduction,
    EntryProfile,
    Hotspot,
    Kit,
    Light,
    Night,
    PaidRoutes,
    Partners,
    Place,
    Reveal,
    RevealLine,
    Rewards,
    Route,
    Suspect,
    Window,
)

CASE_ID = "false_light"
CASE_PATH = CONTENT_DIR / "secret" / "case.json"
MINIMUM_ROUTE_KINDS = ("kit", "open", "timed")

__all__ = [
    "CASE_ID",
    "CASE_PATH",
    "MINIMUM_ROUTE_KINDS",
    "CaseDataError",
    "load_case",
    "parse_case",
    "Accusation",
    "Board",
    "Card",
    "CaseData",
    "Chart",
    "CoinReward",
    "Deduction",
    "EntryProfile",
    "Hotspot",
    "Kit",
    "Light",
    "Night",
    "PaidRoutes",
    "Partners",
    "Place",
    "Reveal",
    "RevealLine",
    "Rewards",
    "Route",
    "Suspect",
    "Window",
]


def unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise CaseDataError("L2", "case.json", "an object repeats a key")
        result[key] = value
    return result


def load_case(path: Path = CASE_PATH) -> CaseData:
    """Read only this private file and fail closed when its structure or content is invalid."""
    from server.game.case_checks import run_checks

    try:
        raw = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        if isinstance(error, CaseDataError):
            raise
        raise CaseDataError("L1", "case.json", "the case file could not be read as JSON") from None
    data = parse_case(raw)
    run_checks(data)
    return data
