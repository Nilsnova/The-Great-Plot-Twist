"""Validate and freeze partner dialogue, then select it by the recorded salt.

Used by: partner orders, their view and the finale. Only pick_line returns dialogue.
"""

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from types import MappingProxyType
from typing import Any

from plot_twist.engine import CONTENT_DIR

DEFAULT_LINES_PATH = CONTENT_DIR / "partners.json"
_PLACEHOLDERS = frozenset(("minutes", "light", "price"))
_CARDS = frozenset(f"C{number}" for number in range(1, 9))
_VARIANTS = {
    "order_accepted": frozenset(("go", "pin", "man_light", "wait")),
    "arrived": frozenset(("any",)),
    "found_card": _CARDS,
    "found_nothing": frozenset(("any",)),
    "pinned_card": _CARDS,
    "cannot_do_it": frozenset(
        ("wrong_kit", "no_coins", "locked_window", "busy", "already_have", "not_ready")
    ),
    "manning_light": frozenset(("any",)),
    "beam_locked": frozenset(("any",)),
    "case_solved": frozenset(("any",)),
    "takeover": frozenset(("any",)),
}
_ALIASES = {
    "order_accepted": frozenset(("search", "fetch")),
    "cannot_do_it": frozenset(
        ("light_not_for_partners", "no_lead", "not_carrying", "not_nightfall", "light_taken")
    ),
}
_BANNED_WORDS = (
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
_BANNED = re.compile(
    r"\b(?:"
    + "|".join(word.replace(" ", r"\s+") + "s?" for word in _BANNED_WORDS)
    + r"|fishermen|foremen|tries|matches)\b",
    re.IGNORECASE,
)
_IDS = re.compile(r"\b[CD][0-9]+\b", re.IGNORECASE)
_TOKENS = re.compile(r"\{(minutes|light|price)\}")


@dataclass(frozen=True, repr=False)
class LineBank:
    _lines: Mapping[str, Mapping[str, tuple[str, ...]]] = field(repr=False)
    _variant_maps: Mapping[str, Mapping[str, str]] = field(repr=False)


def _require(condition: bool) -> None:
    if not condition:
        raise ValueError("The partner line bank is invalid.")


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _fields(value: Any, keys: set[str] | frozenset[str]) -> None:
    _require(isinstance(value, Mapping) and set(value) == keys)


def _line_fields(line: Any) -> frozenset[str]:
    _require(_text(line))
    _require(len(line) <= 80 and line.isascii() and all(char.isprintable() for char in line))
    _require("-" not in line and _BANNED.search(line) is None and _IDS.search(line) is None)
    remainder = _TOKENS.sub("", line)
    _require("{" not in remainder and "}" not in remainder)
    return frozenset(_TOKENS.findall(line))


def _check_header(raw: Any) -> None:
    _fields(
        raw,
        {
            "about",
            "format_version",
            "voice",
            "max_characters",
            "pick_rule",
            "placeholders",
            "speakers",
            "events",
        },
    )
    _require(type(raw["format_version"]) is int and raw["format_version"] == 1)
    _require(type(raw["max_characters"]) is int and raw["max_characters"] == 80)
    _require(all(_text(raw[key]) for key in ("about", "voice", "pick_rule")))
    _fields(raw["placeholders"], _PLACEHOLDERS)
    _require(all(_text(value) for value in raw["placeholders"].values()))
    _fields(raw["speakers"], {"1", "2", "3", "4"})
    ids = set()
    for speaker in raw["speakers"].values():
        _fields(speaker, {"npc_id", "title"})
        npc_id = speaker["npc_id"]
        _require(isinstance(npc_id, str) and re.fullmatch(r"[a-z0-9_]{2,40}", npc_id) is not None)
        _require(npc_id not in ids and _text(speaker["title"]))
        ids.add(npc_id)
    _fields(raw["events"], set(_VARIANTS))


def _event_lines(name: str, event: Any) -> tuple[Mapping, Mapping]:
    keys = {"used_when", "salt_is", "variant_is", "placeholders_used", "lines"}
    if name in _ALIASES:
        keys.add("variant_map")
    _fields(event, keys)
    _require(all(_text(event[key]) for key in ("used_when", "salt_is", "variant_is")))
    placeholders = event["placeholders_used"]
    _require(isinstance(placeholders, list) and all(isinstance(item, str) for item in placeholders))
    _require(len(set(placeholders)) == len(placeholders) and set(placeholders) <= _PLACEHOLDERS)
    _fields(event["lines"], _VARIANTS[name])
    lines, used = {}, set()
    for variant, group in event["lines"].items():
        _require(isinstance(group, list) and bool(group))
        for line in group:
            used.update(_line_fields(line))
        lines[variant] = tuple(group)
    _require(used == set(placeholders))
    aliases = event.get("variant_map", {})
    _fields(aliases, _ALIASES.get(name, frozenset()))
    _require(all(isinstance(value, str) and value in lines for value in aliases.values()))
    return MappingProxyType(lines), MappingProxyType(dict(aliases))


def parse_lines(raw: Mapping[str, Any]) -> LineBank:
    """Accept the versioned bank shape and keep no mutable input references."""
    _check_header(raw)
    lines, maps = {}, {}
    for name, event in raw["events"].items():
        lines[name], maps[name] = _event_lines(name, event)
    return LineBank(MappingProxyType(lines), MappingProxyType(maps))


def _unique_object(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        _require(key not in result)
        result[key] = value
    return result


def load_lines(path: str | Path = DEFAULT_LINES_PATH) -> LineBank:
    """Fail closed without repeating file contents or parser diagnostics."""
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
    except (OSError, ValueError):
        raise ValueError("The partner line bank could not be read.") from None
    return parse_lines(raw)


def pick_line(
    bank: LineBank,
    event: str,
    variant: str,
    salt: int,
    values: Mapping[str, str | int] | None = None,
) -> str:
    """Map a raw variant, select by salt modulo count, then fill server values."""
    _require(type(salt) is int and salt >= 0)
    try:
        variant = bank._variant_maps[event].get(variant, variant)
        group = bank._lines[event][variant]
    except (KeyError, TypeError):
        raise ValueError("The requested partner line is not available.") from None
    values = {} if values is None else values
    _require(isinstance(values, Mapping) and set(values) <= _PLACEHOLDERS)
    for key, value in values.items():
        _require(_text(value) if key == "light" else type(value) is int and value >= 0)
    try:
        return group[salt % len(group)].format_map(values)
    except (KeyError, ValueError, TypeError):
        raise ValueError("The partner line values are invalid.") from None
