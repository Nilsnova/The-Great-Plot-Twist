"""Load-time case identity, reference and route-shape checks L1 through L8.

Used by: case_checks.py. Diagnostics name fixed schema locations, never story values.
"""

import re

from server.game.case_check_refs import check_l3 as check_l3
from server.game.case_errors import require
from server.game.case_types import CaseData

ID = re.compile(r"[a-z0-9_]{2,40}")


def check_l1(data: CaseData) -> None:
    require(
        "L1",
        "case.json",
        data.format_version == 1 and data.case_id == "false_light",
        "the format version and case id must match this game",
    )
    for index, window in enumerate(data.windows):
        require(
            "L1",
            f"case_clock.windows[{index}]",
            window.every_minutes > 0
            and 0 <= window.from_minute < window.every_minutes
            and 0 < window.open_minutes <= window.every_minutes - window.from_minute,
            "window minutes must describe a nonempty interval inside its period",
        )
    for index, route in enumerate(data.routes):
        require(
            "L1",
            f"routes[{index}]",
            min(route.coins, route.timer_minutes, route.estimate_minutes) >= 0,
            "route costs and minutes cannot be negative",
        )


def check_unique(rule: str, place: str, values: tuple) -> None:
    ids = [item.id for item in values]
    require(rule, place, len(ids) == len(set(ids)), "ids must be unique")


def check_l2(data: CaseData) -> None:
    require(
        "L2",
        "cards",
        {card.id for card in data.cards} == {f"C{i}" for i in range(1, 9)},
        "card ids must be exactly the eight reserved ids",
    )
    require(
        "L2",
        "deductions",
        {row.id for row in data.deductions} == {f"D{i}" for i in range(1, 5)},
        "deduction ids must be exactly the four reserved ids",
    )
    groups = (
        ("kits", data.kits),
        ("places", data.places),
        ("suspects", data.suspects),
        ("windows", data.windows),
        ("lights", data.night.lights),
        ("rewards.coins", data.rewards.coins),
    )
    for place, values in groups:
        check_unique("L2", place, values)
        require("L2", place, all(ID.fullmatch(item.id) for item in values), "invalid id format")
    for index, place in enumerate(data.places):
        check_unique("L2", f"places[{index}].hotspots", place.hotspots)
        require(
            "L2",
            f"places[{index}].hotspots",
            all(ID.fullmatch(spot.id) for spot in place.hotspots),
            "invalid hotspot id format",
        )
    for place, values in (
        ("cards", data.cards),
        ("deductions", data.deductions),
        ("entry_profiles", data.entry_profiles),
        ("routes", data.routes),
    ):
        check_unique("L2", place, values)
    for index, route in enumerate(data.routes):
        require(
            "L2",
            f"routes[{index}]",
            re.fullmatch(re.escape(route.card_id) + r"\.[a-z0-9_]{2,40}", route.id) is not None,
            "the route id must belong to its card",
        )
    for index, profile in enumerate(data.entry_profiles):
        require(
            "L2",
            f"entry_profiles[{index}]",
            re.fullmatch(r"[a-z0-9_]{2,40}\.(no_log|read_log)", profile.id) is not None,
            "invalid entry profile id format",
        )
    check_unique("L2", "reveal.lines", data.reveal.lines)
    require(
        "L2",
        "reveal.lines",
        all(ID.fullmatch(line.id) for line in data.reveal.lines),
        "invalid reveal line id format",
    )


def check_l4(data: CaseData) -> None:
    hotspots = {(place.id, spot.id): spot for place in data.places for spot in place.hotspots}
    for index, route in enumerate(data.routes):
        spot = hotspots.get((route.place, route.hotspot))
        require(
            "L4",
            f"routes[{index}]",
            spot is not None and spot.card == route.card_id,
            "the route must sit at its card's hotspot",
        )


def check_l5(data: CaseData) -> None:
    require(
        "L5",
        "cards",
        len(data.cards) == 8 and len(data.deductions) == 4,
        "the case needs eight cards and four deductions",
    )
    used = []
    for index, deduction in enumerate(data.deductions):
        require(
            "L5",
            f"deductions[{index}]",
            len(deduction.cards) == 2 and len(set(deduction.cards)) == 2,
            "a deduction needs two different cards",
        )
        used.extend(deduction.cards)
        require(
            "L5",
            f"deductions[{index}]",
            all(
                card.deduction == deduction.id for card in data.cards if card.id in deduction.cards
            ),
            "the card's deduction must point back",
        )
    require(
        "L5",
        "deductions",
        sorted(used) == sorted(card.id for card in data.cards),
        "each card must appear in exactly one deduction",
    )


def check_l6(data: CaseData) -> None:
    opened = [card for card in data.cards if card.kind == "open"]
    cheap = [card for card in data.cards if card.kind == "kit"]
    require(
        "L6",
        "cards",
        len(opened) == len(cheap) == 4,
        "four cards must be open and four must belong to kits",
    )
    require(
        "L6",
        "cards",
        {card.cheap_for_kit for card in cheap} == {kit.id for kit in data.kits},
        "each kit must have its own cheap card",
    )
    require(
        "L6",
        "kits",
        all(
            any(card.id == kit.cheap_card and card.cheap_for_kit == kit.id for card in cheap)
            for kit in data.kits
        ),
        "each cheap card must point back to its kit",
    )
    require(
        "L6",
        "cards",
        all(route.kind != "kit" for card in opened for route in card.routes),
        "an open card cannot have a kit route",
    )


def check_l7(data: CaseData) -> None:
    for index, card in enumerate(data.cards):
        if card.kind != "kit":
            continue
        routes = [route for route in card.routes if route.kind == "kit"]
        require("L7", f"cards[{index}]", len(routes) == 1, "a kit card needs exactly one kit route")
        kit = routes[0]
        require(
            "L7",
            f"cards[{index}]",
            kit.kit == card.cheap_for_kit and kit.coins == 0 and kit.open_when == "always",
            "the kit route must be free, always open and match its kit",
        )
        require(
            "L7",
            f"cards[{index}]",
            all(
                route.timer_minutes >= kit.timer_minutes + (3 if route.kind == "paid" else 0)
                for route in card.routes
                if route.kind in ("kit", "timed", "paid")
            ),
            "the kit route must be fastest and paid routes at least three minutes slower",
        )


def check_l8(data: CaseData) -> None:
    partner_kinds = set(data.partners.may_use_route_kinds)
    player_kinds = {"share", "world", "log_reader"}
    for index, route in enumerate(data.routes):
        valid = route.kind in {"kit", "open", "timed", "paid"} | player_kinds
        valid &= route.coins > 0 if route.kind == "paid" else route.coins == 0
        valid &= not route.players_only if route.kind in partner_kinds else True
        valid &= route.players_only if route.kind in player_kinds else True
        valid &= (route.kit is not None) == (route.kind == "kit")
        valid &= (route.open_when != "always") == (route.kind == "timed")
        valid &= (route.needs_world is not None) == (route.kind == "world")
        valid &= (route.needs_share is not None) == (route.kind == "share")
        valid &= (route.needs_profile is not None) == (route.kind == "log_reader")
        valid &= (route.needs_flag is not None) == (route.kind == "share")
        valid &= not route.starts_in_journal or (route.kind == "kit" and route.timer_minutes == 0)
        require("L8", f"routes[{index}]", valid, "route fields do not match its kind")
