"""Helpers for the case data tests: a fresh copy of the raw case file, and ways to break it on purpose.

The linter tests (test_case_lint.py) change one thing in a copy of the real file and check that the
rule for that thing notices. This file holds the small tools they share. Nothing here prints or
copies story text: a test that needs the culprit's id reads it from the data, never from a literal.

Used by: test_case_data.py and test_case_lint.py.
"""

import json
from collections.abc import Callable
from typing import Any

from server.game.case_data import CASE_PATH, CaseData, parse_case

Raw = dict[str, Any]


def raw_case() -> Raw:
    """A fresh copy of the real case file as plain data. Change it freely."""
    return json.loads(CASE_PATH.read_text(encoding="utf-8"))


def broken(change: Callable[[Raw], None]) -> CaseData:
    """The real file with one change made on purpose, read into data (the checks are not run)."""
    raw = raw_case()
    change(raw)
    return parse_case(raw)


def card_of(raw: Raw, card_id: str) -> Raw:
    """The card entry with this id, as plain data."""
    for card in raw["cards"]:
        if card["id"] == card_id:
            return card
    raise AssertionError(f"no card {card_id} in the case file")


def route_of(raw: Raw, route_id: str) -> Raw:
    """The route entry with this id, as plain data."""
    for card in raw["cards"]:
        for route in card["routes"]:
            if route["id"] == route_id:
                return route
    raise AssertionError(f"no route {route_id} in the case file")


def hotspot_of(raw: Raw, hotspot_id: str) -> Raw:
    """The hotspot entry with this id (in any place), as plain data."""
    for place in raw["places"]:
        for hotspot in place["hotspots"]:
            if hotspot["id"] == hotspot_id:
                return hotspot
    raise AssertionError(f"no hotspot {hotspot_id} in the case file")


def kit_of(raw: Raw, kit_id: str) -> Raw:
    """The kit entry with this id, as plain data."""
    for kit in raw["kits"]:
        if kit["id"] == kit_id:
            return kit
    raise AssertionError(f"no kit {kit_id} in the case file")


def suspect_of(raw: Raw, suspect_id: str) -> Raw:
    """The suspect entry with this id, as plain data."""
    for suspect in raw["suspects"]:
        if suspect["id"] == suspect_id:
            return suspect
    raise AssertionError(f"no suspect {suspect_id} in the case file")


def light_of(raw: Raw, light_id: str) -> Raw:
    """The light entry with this id, as plain data."""
    for light in raw["night"]["lights"]:
        if light["id"] == light_id:
            return light
    raise AssertionError(f"no light {light_id} in the case file")


def deduction_of(raw: Raw, deduction_id: str) -> Raw:
    """The deduction entry with this id, as plain data."""
    for deduction in raw["deductions"]:
        if deduction["id"] == deduction_id:
            return deduction
    raise AssertionError(f"no deduction {deduction_id} in the case file")
