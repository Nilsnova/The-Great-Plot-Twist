"""The words of the Keeper's Lock: backend/content/keeper_lock.json, read and checked.

Server only (it is not on the public content list); the browser gets the question, the choices and
the messages through the lock routes. The riddle's answer lives in this file on purpose: it is not
a secret, only the question the lock asks when the weather cannot be read.

A broken file is a 503 lock_unavailable for the lock routes only. A test loads the real file, so a
mistake is caught before it is merged.

Used by: routes/lock.py and the tests.
"""

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from plot_twist.engine import CONTENT_DIR
from server.lock.sky import HINT, HINT_CONFIRM, SKIES

LOCK_PATH = CONTENT_DIR / "keeper_lock.json"
ID_PATTERN = r"[a-z_]{2,20}"
MAX_TEXT = 300
MESSAGE_KEYS = (
    "exact",
    "close",
    "hint",
    "clue",
    "wrong",
    "hintTooEarly",
    "hintOffered",
    "hintPrompt",
    "questionChanged",
    "alreadyOpen",
)


@dataclass(frozen=True)
class Choice:
    id: str
    label: str


@dataclass(frozen=True)
class LockContent:
    weather_question: str  # holds {place}
    weather_note: str
    skies: tuple[Choice, ...]
    clue_question: str
    clue_note: str
    clue_choices: tuple[Choice, ...]
    clue_answer: str
    messages: dict[str, str]

    def sky_label(self, sky: str) -> str:
        return next(choice.label for choice in self.skies if choice.id == sky)


def text(value: object, where: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > MAX_TEXT:
        raise ValueError(f"keeper_lock.json: {where} must be text of 1 to {MAX_TEXT} characters.")
    return value


def choices(value: object, where: str) -> tuple[Choice, ...]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"keeper_lock.json: {where} must be a list of choices.")
    result = []
    for number, item in enumerate(value):
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise ValueError(f"keeper_lock.json: {where}[{number}] needs an id and a label.")
        if not re.fullmatch(ID_PATTERN, item["id"]):
            raise ValueError(f"keeper_lock.json: {where}[{number}].id must match {ID_PATTERN}.")
        result.append(Choice(item["id"], text(item.get("label"), f"{where}[{number}].label")))
    return tuple(result)


def read_lock_content(path: Path = LOCK_PATH) -> LockContent:
    """Read and check the file. Raises ValueError (or OSError) when it is broken."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("keeper_lock.json must be a JSON object.")
    skies = choices(data.get("skies"), "skies")
    if tuple(choice.id for choice in skies) != SKIES:
        raise ValueError(f"keeper_lock.json: skies must be exactly {', '.join(SKIES)}, in order.")
    clue = data.get("clue")
    if not isinstance(clue, dict):
        raise ValueError("keeper_lock.json: clue must be an object.")
    clue_choices = choices(clue.get("choices"), "clue.choices")
    ids = [choice.id for choice in clue_choices]
    if len(set(ids)) != len(ids) or set(ids) & {*SKIES, HINT, HINT_CONFIRM}:
        raise ValueError("keeper_lock.json: clue choices must be unique and differ from the skies.")
    answer = clue.get("answer")
    if answer not in ids:
        raise ValueError("keeper_lock.json: clue.answer must be one of the clue choices.")
    raw_messages = data.get("messages")
    if not isinstance(raw_messages, dict):
        raise ValueError("keeper_lock.json: messages must be an object.")
    messages = {key: text(raw_messages.get(key), f"messages.{key}") for key in MESSAGE_KEYS}
    question = text(data.get("weatherQuestion"), "weatherQuestion")
    if "{place}" not in question:
        raise ValueError("keeper_lock.json: weatherQuestion must contain {place}.")
    return LockContent(
        weather_question=question,
        weather_note=text(data.get("weatherNote"), "weatherNote"),
        skies=skies,
        clue_question=text(clue.get("question"), "clue.question"),
        clue_note=text(clue.get("note"), "clue.note"),
        clue_choices=clue_choices,
        clue_answer=answer,
        messages=messages,
    )


@lru_cache(maxsize=1)
def lock_content() -> LockContent:
    """The real file, read once per server instance."""
    return read_lock_content(LOCK_PATH)
