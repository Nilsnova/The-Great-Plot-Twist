"""Checked reading of content files: read one field, or say exactly which field is wrong.

The open-world content files (weather_states.json, bulletin.json, chapter_two_hook.json) are edited
by people, so the server checks every field when it starts and refuses a file with a message that
names the field ("night.startsHour must be a whole number from 12 to 23"). The loaders add the
file name in front. A typo is then found when the server starts, not when a player asks.

Each reader takes the object that should hold the field (`parent`), the field's `name`, and
`where`, the path of the parent for the message ("night", or "" for the top of the file).
A reader never repairs a value: a wrong value is an error.

Used by: weather/state_rules.py, daily/content.py, daily/bulletin_content.py and
daily/hook_content.py, and the tests.
"""

import json
import math
from datetime import date
from pathlib import Path
from typing import Any

# A text longer than this is probably a mistake in the file, so the readers refuse it.
MAX_TEXT_LENGTH = 600


class ContentError(ValueError):
    """A content file, or one of its fields, is wrong. The message names the field."""


def field_path(where: str, name: str) -> str:
    """The name of a field for a message: "night.startsHour", or just "night" at the top."""
    return f"{where}.{name}" if where else name


def read_json_object(path: Path) -> dict[str, Any]:
    """The JSON object in a file. A missing, unreadable or wrong file is a ContentError."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:  # a bad JSON file or bad UTF-8 are ValueErrors
        raise ContentError(f"cannot read the file ({type(error).__name__})") from error
    if not isinstance(data, dict):
        raise ContentError("the file must hold one JSON object")
    return data


def get_object(parent: dict[str, Any], name: str, where: str = "") -> dict[str, Any]:
    value = parent.get(name)
    if not isinstance(value, dict):
        raise ContentError(f"{field_path(where, name)} must be an object")
    return value


def get_list(parent: dict[str, Any], name: str, where: str = "") -> list[Any]:
    value = parent.get(name)
    if not isinstance(value, list):
        raise ContentError(f"{field_path(where, name)} must be a list")
    return value


def get_text(
    parent: dict[str, Any], name: str, where: str = "", longest: int = MAX_TEXT_LENGTH
) -> str:
    """A text that is not empty and not longer than `longest` characters."""
    value = parent.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ContentError(f"{field_path(where, name)} must be text that is not empty")
    if len(value) > longest:
        raise ContentError(f"{field_path(where, name)} must be at most {longest} characters")
    return value


def get_template(
    parent: dict[str, Any], name: str, where: str, placeholders: tuple[str, ...]
) -> str:
    """A text with every placeholder in it, for example "{tonight}", and no other curly braces."""
    text = get_text(parent, name, where)
    missing = [word for word in placeholders if word not in text]
    if missing:
        raise ContentError(f"{field_path(where, name)} must contain {', '.join(missing)}")
    leftover = text
    for word in placeholders:
        leftover = leftover.replace(word, "")
    if "{" in leftover or "}" in leftover:
        allowed = ", ".join(placeholders)
        raise ContentError(
            f"{field_path(where, name)} has a curly brace that is not one of {allowed}"
        )
    return text


def get_whole_number(
    parent: dict[str, Any], name: str, where: str, lowest: int, highest: int
) -> int:
    """A whole number from `lowest` to `highest`, both included."""
    value = parent.get(name)
    # True and False are numbers in Python (1 and 0), but they are never a setting.
    if isinstance(value, bool) or not isinstance(value, int) or not lowest <= value <= highest:
        raise ContentError(
            f"{field_path(where, name)} must be a whole number from {lowest} to {highest}"
        )
    return value


def get_number_above_zero(parent: dict[str, Any], name: str, where: str, up_to: float) -> float:
    """A number above 0 and up to `up_to`, which is included."""
    value = parent.get(name)
    is_number = isinstance(value, int | float) and not isinstance(value, bool)
    # Python's JSON reader accepts NaN, Infinity and a whole number of hundreds of digits, so check
    # for a real number on purpose. The range comes first: it refuses all three, and math.isfinite
    # raises an OverflowError for the huge whole number. (Comparing an int with a float is exact.)
    if not is_number or not 0 < value <= up_to or not math.isfinite(value):
        raise ContentError(
            f"{field_path(where, name)} must be a number above 0 and at most {up_to:g}"
        )
    return float(value)


def read_iso_date(text: str) -> date | None:
    """A date written exactly as YYYY-MM-DD, or None if it is not one."""
    # date.fromisoformat also takes other spellings (20261116, 2026-W47-1), so check the shape.
    if len(text) != 10 or text[4] != "-" or text[7] != "-":
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def get_date(parent: dict[str, Any], name: str, where: str = "") -> date:
    """A date written as YYYY-MM-DD (for example 2026-11-16) that exists."""
    value = parent.get(name)
    day = read_iso_date(value) if isinstance(value, str) else None
    if day is None:
        raise ContentError(f"{field_path(where, name)} must be a date written as YYYY-MM-DD")
    return day


def check_exact_keys(value: dict[str, Any], names: tuple[str, ...], where: str) -> None:
    """The object has exactly these keys: none missing and none extra."""
    if set(value) != set(names):
        raise ContentError(f"{where} must have exactly these keys: {', '.join(names)}")
