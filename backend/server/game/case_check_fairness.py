"""Load-time dependency, spoiler, wallet and prose checks L14, L15, L18 and L19.

Used by: case_checks.py. Errors never contain a suspect id or protected prose.
"""

from collections.abc import Mapping
from string import Formatter
from typing import Any

from server.game.case_errors import CaseDataError, require
from server.game.case_types import CaseData
from server.wallet import MAX_REF_LENGTH, WALLET_REASONS


def check_l14(data: CaseData) -> None:
    order = {deduction.id: index for index, deduction in enumerate(data.deductions)}
    for index, card in enumerate(data.cards):
        require(
            "L14",
            f"cards[{index}]",
            card.deduction in order
            and all(
                gate in order and order[gate] < order[card.deduction] for gate in card.opens_after
            ),
            "a card cannot depend on its own deduction or a later deduction",
        )
    require(
        "L14",
        "night.opens_after",
        bool(data.night.opens_after) and set(data.night.opens_after) <= set(order),
        "the night must open after an existing deduction",
    )


def string_fields(value: Any, path: tuple = ()) -> list[tuple[tuple, str]]:
    if isinstance(value, str):
        return [(path, value)]
    if isinstance(value, Mapping):
        return [field for key, item in value.items() for field in string_fields(item, (*path, key))]
    if isinstance(value, tuple):
        return [
            field
            for index, item in enumerate(value)
            for field in string_fields(item, (*path, index))
        ]
    return []


def check_l15(data: CaseData) -> None:
    culprit = data.accusation.culprit
    for index, suspect in enumerate(data.suspects):
        clears = [deduction.id for deduction in data.deductions if deduction.clears == suspect.id]
        if suspect.id == culprit:
            valid = not clears and suspect.cleared_by is None and suspect.refused_line is None
        else:
            valid = (
                clears == [suspect.cleared_by]
                and suspect.cleared_by in data.accusation.needs_deductions
                and suspect.refused_line is not None
                and suspect.refused_line.startswith("Refused.")
            )
        require(
            "L15", f"suspects[{index}]", bool(valid), "suspect clearing and refusal rules disagree"
        )
    culprit_indexes = {
        index for index, suspect in enumerate(data.suspects) if suspect.id == culprit
    }
    for path, value in string_fields(data.raw):
        allowed = (
            path == ("accusation", "culprit")
            or path[:2] == ("accusation", "suspects")
            or (len(path) >= 2 and path[0] == "suspects" and path[1] in culprit_indexes)
        )
        require(
            "L15",
            "case.json",
            allowed or culprit not in value,
            "the solution id appears outside its permitted fields",
        )


def filled_refs(data: CaseData) -> dict[str, str]:
    """Fill only the documented placeholders with their longest legal identifiers."""
    templates = {f"coins.{reward.id}": reward.ref for reward in data.rewards.coins}
    templates["paid_routes.player_ref"] = data.rewards.paid_routes.player_ref
    templates["paid_routes.partner_ref"] = data.rewards.paid_routes.partner_ref
    values = {"crew_id": "0" * 36, "order_uid": "x" * 64, "card_id": "C8", "deduction_id": "D4"}
    result = {}
    for name, template in templates.items():
        try:
            fields = [field for _, field, _, _ in Formatter().parse(template) if field is not None]
            if not set(fields) <= set(values):
                raise ValueError
            result[name] = template.format(**values)
        except (KeyError, ValueError, IndexError):
            raise CaseDataError("L18", "rewards", "a ref has an unsupported placeholder") from None
    return result


def check_l18(data: CaseData) -> None:
    known = {name for name, _direction in WALLET_REASONS}
    reasons = {coin.reason for coin in data.rewards.coins} | {data.rewards.paid_routes.reason}
    require("L18", "rewards", reasons <= known, "a reason is not on the wallet reason list")
    require(
        "L18",
        "rewards",
        all(
            ref.startswith(f"{data.case_id}:") and len(ref) <= MAX_REF_LENGTH
            for ref in filled_refs(data).values()
        ),
        "wallet refs must use the case prefix and fit the wallet limit",
    )
    solve = data.rewards.coin("solve_share")
    require(
        "L18",
        "rewards.coins",
        solve.base
        <= solve.maximum
        <= solve.base + 4 * solve.per_deduction_part + solve.finale_role,
        "the solve share maximum must fit the base and contribution amounts",
    )


def check_l19(data: CaseData) -> None:
    forbidden = ("\u2014", "\u2013", "-" * 2)
    for _path, text in string_fields(data.raw):
        require(
            "L19",
            "case.json",
            bool(text.strip()) and not any(mark in text for mark in forbidden),
            "text must be nonempty and use plain punctuation",
        )
    twist = next((line for line in data.reveal.lines if line.id == "twist"), None)
    require(
        "L19",
        "reveal.lines",
        twist is not None and twist.text.startswith("Plot twist:"),
        "the twist line needs its required prefix",
    )
    for index, card in enumerate(data.cards):
        require("L19", f"cards[{index}]", len(card.text) <= 400, "card text is too long")
        require(
            "L19",
            f"cards[{index}].routes",
            all(len(route.found_line) <= 240 for route in card.routes),
            "a found line is too long",
        )
