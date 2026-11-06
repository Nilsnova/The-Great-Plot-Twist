"""Read and freeze case fields with strict types and safe field-only errors.

Used by: case_parse.py. Never include a field value in an error.
"""

from collections.abc import Mapping
from types import MappingProxyType
from typing import Any

from server.game.case_errors import CaseDataError


def freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(freeze(item) for item in value)
    return value


class Reader:
    """One case object and its location. Missing or mistyped fields fail closed."""

    def __init__(self, value: Any, place: str) -> None:
        if not isinstance(value, dict):
            raise CaseDataError("L1", place, "an object is required")
        self.value = value
        self.place = place

    def read(self, name: str, kind: type, default: Any = ...) -> Any:
        value = self.value.get(name, default)
        if value is ... or not isinstance(value, kind) or (kind is int and type(value) is bool):
            raise CaseDataError("L1", self.place, f"{name} has a missing or invalid type")
        return value

    def text(self, name: str) -> str:
        return self.read(name, str)

    def optional_text(self, name: str) -> str | None:
        if self.value.get(name) is None:
            return None
        return self.text(name)

    def integer(self, name: str, default: Any = ...) -> int:
        return self.read(name, int, default)

    def boolean(self, name: str, default: Any = ...) -> bool:
        return self.read(name, bool, default)

    def strings(self, name: str) -> tuple[str, ...]:
        values = self.read(name, list)
        if not all(isinstance(item, str) for item in values):
            raise CaseDataError("L1", self.place, f"{name} must contain text")
        return tuple(values)

    def object(self, name: str) -> "Reader":
        return Reader(self.read(name, dict), f"{self.place}.{name}".lstrip("."))

    def objects(self, name: str) -> tuple["Reader", ...]:
        return tuple(
            Reader(item, f"{self.place}.{name}[{index}]".lstrip("."))
            for index, item in enumerate(self.read(name, list))
        )

    def lines(self, name: str) -> Mapping[str, str]:
        lines = self.read(name, dict)
        if not all(isinstance(key, str) and isinstance(item, str) for key, item in lines.items()):
            raise CaseDataError("L1", self.place, f"{name} must be a text mapping")
        return freeze(lines)

    def pair(self, name: str) -> tuple[float, float]:
        values = self.read(name, list)
        if len(values) != 2 or any(type(item) not in (int, float) for item in values):
            raise CaseDataError("L1", self.place, f"{name} must be two numbers")
        return (values[0], values[1])
