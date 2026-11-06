"""Read and validate the fixed partner bank, then fill one deterministic plain-text line.

Used by partner orders and views. Errors identify a bank field without echoing line text.
"""

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from string import Formatter
from types import MappingProxyType

from plot_twist.engine import CONTENT_DIR
from server.crews.seats import PARTNERS

BANK_PATH = CONTENT_DIR / "partners.json"
PLACEHOLDERS = frozenset(("minutes", "light", "price"))
CARD_VARIANTS = frozenset(f"C{number}" for number in range(1, 9))
EVENT_VARIANTS = {
    "order_accepted": frozenset(("go", "pin", "man_light", "wait")),
    "arrived": frozenset(("any",)),
    "found_card": CARD_VARIANTS,
    "found_nothing": frozenset(("any",)),
    "pinned_card": CARD_VARIANTS,
    "cannot_do_it": frozenset(
        ("wrong_kit", "no_coins", "locked_window", "busy", "already_have", "not_ready")
    ),
    "manning_light": frozenset(("any",)),
    "beam_locked": frozenset(("any",)),
    "case_solved": frozenset(("any",)),
    "takeover": frozenset(("any",)),
}
EVENT_PLACEHOLDERS = {
    "order_accepted": frozenset(("minutes", "light")),
    "cannot_do_it": frozenset(("minutes", "price")),
    "manning_light": frozenset(("light",)),
}
VARIANT_MAPS = {
    "order_accepted": {"search": "go", "fetch": "go"},
    "cannot_do_it": {
        "light_not_for_partners": "wrong_kit",
        "no_lead": "not_ready",
        "not_carrying": "not_ready",
        "not_nightfall": "not_ready",
        "light_taken": "not_ready",
    },
}
BANNED_WORDS = (
    "harbor master",
    "harbormaster",
    "fisherman",
    "foreman",
    "commander",
    "culprit",
    "guilty",
    "suspect",
    "traitor",
    "villain",
    "betray",
    "blame",
    "clue",
    "hint",
    "deduction",
    "deduce",
    "pair",
    "match",
    "proof",
    "proves",
    "clears",
    "innocent",
    "hidden",
    "secret",
    "lie",
    "liar",
    "window",
    "should",
    "maybe",
    "perhaps",
    "probably",
    "interesting",
    "strange",
    "odd",
    "suspicious",
    "fishy",
    "try",
    "why not",
    "think",
    "elena",
)
BANNED_PATTERN = re.compile(
    r"\b(?:"
    + "|".join(re.escape(word) for word in BANNED_WORDS)
    + r")s?\b|\b(?:fishermen|foremen|matches|tries)\b",
    re.IGNORECASE,
)
ID_PATTERN = re.compile(r"\b[CD]\d+\b", re.IGNORECASE)


class NpcLinesError(ValueError):
    """A bad bank or fill value, without repeating its possibly protected text."""


@dataclass(frozen=True, repr=False)
class LineEvent:
    lines: Mapping[str, tuple[str, ...]]
    variant_map: Mapping[str, str]
    salt_is: str


@dataclass(frozen=True, repr=False)
class LineBank:
    events: Mapping[str, LineEvent]
    speakers: Mapping[int, tuple[str, str]]
    max_characters: int


def require(condition: bool, field: str) -> None:
    if not condition:
        raise NpcLinesError(f"Invalid partner bank field: {field}.")


def fields_in(line: str) -> frozenset[str]:
    """No format conversions, indexing, attributes or escaped braces are permitted."""
    fields = set()
    try:
        for literal, field, spec, conversion in Formatter().parse(line):
            require("{" not in literal and "}" not in literal, "line placeholders")
            if field is not None:
                require(
                    field in PLACEHOLDERS and not spec and conversion is None, "line placeholders"
                )
                fields.add(field)
    except ValueError:
        raise NpcLinesError("Invalid partner bank field: line placeholders.") from None
    return frozenset(fields)


def checked_line(line: object, maximum: int, allowed: frozenset[str]) -> str:
    require(isinstance(line, str), "line text")
    require(
        bool(line) and len(line) <= maximum and line.isascii() and line.isprintable(), "line text"
    )
    require(
        "-" not in line and not BANNED_PATTERN.search(line) and not ID_PATTERN.search(line),
        "line wording",
    )
    require(fields_in(line).issubset(allowed), "event placeholders")
    return line


def parse_event(name: str, value: object, maximum: int) -> LineEvent:
    require(isinstance(value, dict), "event")
    lines = value.get("lines")
    require(isinstance(lines, dict) and set(lines) == EVENT_VARIANTS[name], "event variants")
    allowed = EVENT_PLACEHOLDERS.get(name, frozenset())
    declared = value.get("placeholders_used")
    require(
        isinstance(declared, list) and all(isinstance(item, str) for item in declared),
        "event placeholders",
    )
    require(len(declared) == len(set(declared)) and set(declared) == allowed, "event placeholders")
    result = {}
    for variant, choices in lines.items():
        require(isinstance(choices, list) and bool(choices), "variant lines")
        result[variant] = tuple(checked_line(line, maximum, allowed) for line in choices)
    aliases = value.get("variant_map", {})
    require(aliases == VARIANT_MAPS.get(name, {}), "variant map")
    salt = value.get("salt_is")
    require(isinstance(salt, str) and bool(salt), "event salt")
    return LineEvent(MappingProxyType(result), MappingProxyType(dict(aliases)), salt)


def parse_bank(raw: object) -> LineBank:
    require(isinstance(raw, dict), "root")
    require(type(raw.get("format_version")) is int and raw["format_version"] == 1, "format version")
    maximum = raw.get("max_characters")
    require(type(maximum) is int and 1 <= maximum <= 80, "character limit")
    placeholders = raw.get("placeholders")
    require(isinstance(placeholders, dict) and set(placeholders) == PLACEHOLDERS, "placeholders")
    speakers = raw.get("speakers")
    require(
        isinstance(speakers, dict) and set(speakers) == {str(seat) for seat in PARTNERS}, "speakers"
    )
    for seat, (npc_id, title) in PARTNERS.items():
        require(speakers[str(seat)] == {"npc_id": npc_id, "title": title}, "speaker")
    events = raw.get("events")
    require(isinstance(events, dict) and set(events) == set(EVENT_VARIANTS), "events")
    parsed = {name: parse_event(name, value, maximum) for name, value in events.items()}
    return LineBank(MappingProxyType(parsed), MappingProxyType(dict(PARTNERS)), maximum)


def unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate key")
        result[key] = value
    return result


def load_bank(path: Path = BANK_PATH) -> LineBank:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)
    except (OSError, ValueError):
        raise NpcLinesError("The partner bank could not be read as valid JSON.") from None
    return parse_bank(raw)


def pick_line(
    bank: LineBank,
    event: str,
    variant: str,
    salt: int,
    values: Mapping[str, object],
) -> str:
    """The caller supplies the stored order count or seat salt; nothing is random."""
    require(type(salt) is int and salt >= 0, "line salt")
    require(event in bank.events, "line event")
    selected = bank.events[event]
    variant = selected.variant_map.get(variant, variant)
    require(variant in selected.lines, "line variant")
    choices = selected.lines[variant]
    line = choices[salt % len(choices)]
    for field in fields_in(line):
        value = values.get(field)
        if field in ("minutes", "price"):
            require(type(value) is int and value >= 0, "numeric fill value")
        else:
            require(
                isinstance(value, str)
                and bool(value)
                and value.isascii()
                and value.isprintable()
                and "<" not in value
                and ">" not in value,
                "light fill value",
            )
    return line.format_map(values)
