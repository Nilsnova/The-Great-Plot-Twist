"""Prepare bounded earned evidence for a future helper, without I/O or game writes.

Internal callers must pass validated server content, a server-owned snapshot, the Player from
authentication and server case seconds. Never construct these from an AI request body. This
module supplies data, not a prompt, model connection, tool or claim about reply safety.
"""

import json
import re

from server.auth import Player
from server.game.case_data import CaseData
from server.game.case_snapshot import CaseSnapshot
from server.game.case_view import build_case_view

MAX_CONTEXT_BYTES = 16_384
MAX_CARDS = 16
MAX_DEDUCTIONS = 8
FIELD_BYTES = {"id": 64, "title": 256, "name": 256, "text": 2048, "finding": 2048}
IDENTIFIER = re.compile(r"[A-Za-z0-9_.-]{1,64}")


class HintContextError(ValueError):
    """A generic refusal that never carries player identifiers or protected prose."""

    def __init__(self):
        super().__init__("Earned hint context is unavailable.")


def _field(row: dict, key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip() or "\0" in value:
        raise HintContextError()
    try:
        valid = len(value.encode("utf-8")) <= FIELD_BYTES[key]
    except UnicodeEncodeError:
        valid = False
    if not valid or (key == "id" and IDENTIFIER.fullmatch(value) is None):
        raise HintContextError()
    return value


def _rows(rows: list, fields: tuple[str, ...], maximum: int) -> list[dict]:
    if type(rows) is not list or len(rows) > maximum:
        raise HintContextError()
    result, identifiers = [], set()
    for row in rows:
        if type(row) is not dict:
            raise HintContextError()
        projected = {key: _field(row, key) for key in fields}
        if projected["id"] in identifiers:
            raise HintContextError()
        identifiers.add(projected["id"])
        result.append(projected)
    return result


def _project(view: dict) -> dict:
    if type(view) is not dict:
        raise HintContextError()
    board = view.get("board")
    if type(board) is not dict:
        raise HintContextError()
    deductions = board.get("deductions")
    if type(deductions) is not list or len(deductions) > MAX_DEDUCTIONS:
        raise HintContextError()
    if any(type(row) is not dict or type(row.get("complete")) is not bool for row in deductions):
        raise HintContextError()
    cards = _rows(board.get("cards"), ("id", "title", "text"), MAX_CARDS)
    completed = _rows(
        [row for row in deductions if row["complete"]], ("id", "name", "finding"), MAX_DEDUCTIONS
    )
    result = {"version": 1, "cards": cards, "deductions": completed, "citationIds": []}
    for prefix, rows in (("card", cards), ("deduction", completed)):
        result["citationIds"].extend(f"{prefix}:{row['id']}" for row in rows)
    encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > MAX_CONTEXT_BYTES:
        raise HintContextError()
    return result


def earned_hint_context(data: CaseData, snapshot: CaseSnapshot, player: Player, now: int) -> dict:
    """Project an already opened crew case; this never calls a service or initializes it."""
    if not isinstance(data, CaseData) or not isinstance(snapshot, CaseSnapshot):
        raise HintContextError()
    if not isinstance(player, Player) or not isinstance(player.id, str) or not player.id:
        raise HintContextError()
    if type(now) is not int or not 0 <= now < 2**31:
        raise HintContextError()
    if snapshot.status not in ("active", "finished"):
        raise HintContextError()
    if type(snapshot.write_revision) is not int or not 1 <= snapshot.write_revision < 2**63:
        raise HintContextError()
    if sum(seat.player_id == player.id for seat in snapshot.seats) != 1:
        raise HintContextError()
    if any(
        type(row.formed_second) is not int or not 0 <= row.formed_second <= now
        for row in snapshot.formed
    ):
        raise HintContextError()
    view = build_case_view(data, snapshot, player.id, now)
    if view is None:
        raise HintContextError()
    return _project(view)
