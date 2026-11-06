"""Resolve case content references before the service can accept a request.

Used by: load-time rule L3 in case_checks.py. Diagnostics contain schema locations only.
"""

import json
from collections.abc import Mapping

from plot_twist.engine import CONTENT_DIR
from server.game.case_errors import require
from server.game.case_types import CaseData


def check_l3(data: CaseData) -> None:
    kits = {item.id for item in data.kits}
    cards = {item.id for item in data.cards}
    deductions = {item.id for item in data.deductions}
    suspects = {item.id for item in data.suspects}
    lights = {item.id for item in data.night.lights}
    windows = {item.id for item in data.windows} | {"always"}
    places = {item.id: {spot.id for spot in item.hotspots} for item in data.places}
    company_data = json.loads((CONTENT_DIR / "market" / "companies.json").read_text())
    companies = {item["id"] for item in company_data["companies"]}
    for index, route in enumerate(data.routes):
        require(
            "L3",
            f"routes[{index}]",
            route.place in places
            and route.hotspot in places[route.place]
            and route.open_when in windows
            and (route.kit is None or route.kit in kits)
            and (route.needs_share is None or route.needs_share in companies),
            "a route references an unknown kit, place, hotspot, window or company",
        )
    for index, card in enumerate(data.cards):
        require(
            "L3",
            f"cards[{index}]",
            card.deduction in deductions
            and set(card.opens_after) <= deductions
            and (card.cheap_for_kit is None or card.cheap_for_kit in kits),
            "a card references an unknown deduction or kit",
        )
    for index, deduction in enumerate(data.deductions):
        require(
            "L3",
            f"deductions[{index}]",
            set(deduction.cards) <= cards
            and (deduction.clears is None or deduction.clears in suspects),
            "a deduction references an unknown card or suspect",
        )
    for index, place in enumerate(data.places):
        require(
            "L3",
            f"places[{index}].hotspots",
            all(
                (spot.card is None or spot.card in cards)
                and (spot.light is None or spot.light in lights)
                for spot in place.hotspots
            ),
            "a hotspot references an unknown card or light",
        )
    for index, kit in enumerate(data.kits):
        require(
            "L3",
            f"kits[{index}]",
            kit.starts_at in places and kit.home in places and kit.cheap_card in cards,
            "a kit references an unknown place or card",
        )
    require(
        "L3",
        "entry_profiles",
        all(profile.kit in kits for profile in data.entry_profiles),
        "an entry profile references an unknown kit",
    )
    require(
        "L3",
        "accusation",
        set(data.accusation.suspects) <= suspects
        and data.accusation.culprit in suspects
        and set(data.accusation.needs_deductions) <= deductions,
        "an accusation reference is unknown",
    )
    for index, light in enumerate(data.night.lights):
        require(
            "L3",
            f"night.lights[{index}]",
            light.place in places
            and light.hotspot in places[light.place]
            and set(light.ready.get("fit_after", ())) <= deductions,
            "a light references an unknown place, hotspot or deduction",
        )
    require(
        "L3",
        "partners",
        set(data.partners.kit_order) <= kits and set(data.partners.may_man_lights) <= lights,
        "partner defaults reference an unknown kit or light",
    )
    for index, suspect in enumerate(data.suspects):
        require(
            "L3",
            f"suspects[{index}]",
            suspect.cleared_by is None or suspect.cleared_by in deductions,
            "a suspect references an unknown deduction",
        )
    for index, deduction in enumerate(data.deductions):
        require(
            "L3",
            f"deductions[{index}].opens",
            set(deduction.opens) <= cards | lights | {"nightfall", "accusation"},
            "a deduction opens an unknown card, light or action",
        )
    line_ids = {line.id for line in data.reveal.lines} | {
        "closing_line",
        "log_reader_line",
        "last_beat",
    }
    require(
        "L3",
        "reveal.order",
        set(data.reveal.order) <= line_ids,
        "reveal order references an unknown line",
    )
    for index, line in enumerate(data.raw.get("continuity_lines", ())):
        valid = isinstance(line, Mapping) and line.get("place") in places
        valid = valid and line.get("hotspot") in places[line["place"]]
        require(
            "L3",
            f"continuity_lines[{index}]",
            valid,
            "a continuity line references an unknown place or hotspot",
        )
