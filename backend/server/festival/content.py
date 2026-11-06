"""Validate the non-secret festival configuration before building any live festival view."""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from plot_twist.engine import CONTENT_DIR

DURATION_SECONDS = 48 * 60 * 60
LAMP_IDS = tuple(f"festival_lamp_{number:02}" for number in range(1, 13))
CONTENT_PATH = CONTENT_DIR / "festival.json"


class FestivalContentError(ValueError):
    """Invalid configuration, without repeating file contents."""


@dataclass(frozen=True)
class FestivalContent:
    duration_seconds: int
    lamp_ids: tuple[str, ...]
    ring_name: str


def load_content(path: Path = CONTENT_PATH) -> FestivalContent:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        valid = (
            isinstance(raw, dict)
            and type(raw["durationSeconds"]) is int
            and raw["durationSeconds"] == DURATION_SECONDS
            and raw["phases"] == ["waiting", "active", "ended"]
            and raw["lampIds"] == list(LAMP_IDS)
            and raw["ringName"] == "Keepers' Ring"
        )
    except (OSError, ValueError, KeyError, TypeError):
        raise FestivalContentError("The festival configuration could not be read.") from None
    if not valid:
        raise FestivalContentError("The festival configuration does not match its contract.")
    return FestivalContent(DURATION_SECONDS, LAMP_IDS, raw["ringName"])


@lru_cache(maxsize=1)
def festival_content() -> FestivalContent:
    return load_content()
