"""Strict response parsing for sports providers; rejects ambiguous settlement data."""

from datetime import UTC, datetime
from typing import Any

from server.settings import FOOTBALL_COMPETITION_CODES
from server.sports.models import Match, aware

FOOTBALL_STATUSES = {
    "SCHEDULED": "scheduled", "TIMED": "scheduled", "IN_PLAY": "playing",
    "PAUSED": "playing", "FINISHED": "finished", "POSTPONED": "postponed",
    "CANCELLED": "cancelled", "SUSPENDED": "suspended",
}
# A knockout game that goes beyond 90 minutes. Picks settle on the 90-minute score, which v4 sends
# as score.regularTime; its fullTime adds extra time and, after a shoot-out, the penalties.
BEYOND_NINETY = ("EXTRA_TIME", "PENALTY_SHOOTOUT")


class UnreadableResult(ValueError):
    """A football row whose 90-minute score cannot be read. Never settled; the board drops it."""


def object_value(value: Any) -> dict:
    if not isinstance(value, dict):
        raise ValueError("A sports response must be a JSON object.")
    return value


def positive_id(value: Any) -> int:
    if type(value) is not int or value < 1:
        raise ValueError("A provider match id must be a positive whole number.")
    return value


def timestamp(value: Any) -> datetime:
    if not isinstance(value, str):
        raise ValueError("A sports kickoff must be an ISO timestamp with timezone.")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    aware(parsed)
    return parsed.astimezone(UTC)


def football_match(payload: Any, requested_id: int) -> Match:
    """football-data.org v4 match; free-plan competitions, settled on the 90-minute result."""
    data = object_value(payload)
    if positive_id(data.get("id")) != requested_id:
        raise ValueError("The sports provider returned a different match.")
    competition = object_value(data.get("competition"))
    if competition.get("code") not in FOOTBALL_COMPETITION_CODES:
        raise ValueError("Only free-plan football competitions are supported.")
    status = FOOTBALL_STATUSES.get(data.get("status"))
    if status is None:
        raise ValueError("Unsupported football status; no settlement is safe.")
    home, away = ninety_minutes(object_value(data.get("score")), status)
    return Match(
        f"fd-{requested_id}", "football", competition.get("name"),
        object_value(data.get("homeTeam")).get("name"),
        object_value(data.get("awayTeam")).get("name"),
        timestamp(data.get("utcDate")), status, home, away,
    )


def ninety_minutes(score: dict, status: str) -> tuple[Any, Any]:
    """The score after 90 minutes (plus stoppage time), the only score a pick settles on."""
    duration = score.get("duration")
    full_time = object_value(score.get("fullTime"))
    if duration in BEYOND_NINETY:
        regular = score.get("regularTime")
        if not isinstance(regular, dict):
            raise UnreadableResult("A game beyond 90 minutes needs its 90-minute score.")
        for side in ("home", "away"):
            part, total = regular.get(side), full_time.get(side)
            if type(part) is not int or (type(total) is int and part > total):
                raise UnreadableResult("The 90-minute score does not fit the final score.")
        return regular["home"], regular["away"]
    if status == "finished" and duration != "REGULAR":
        raise UnreadableResult("Only football results with a known duration can settle.")
    return full_time.get("home"), full_time.get("away")


def basketball_match(payload: Any, requested_id: int) -> Match:
    """balldontlie NBA v1 games; regular season, final winner including overtime."""
    data = object_value(object_value(payload).get("data"))
    if positive_id(data.get("id")) != requested_id:
        raise ValueError("The sports provider returned a different match.")
    if data.get("postseason") is not False:
        raise ValueError("Only NBA regular-season matches are supported.")
    status = basketball_status(data)
    return Match(
        f"bdl-{requested_id}", "basketball", "NBA",
        object_value(data.get("home_team")).get("full_name"),
        object_value(data.get("visitor_team")).get("full_name"),
        timestamp(data.get("datetime") or data.get("date")), status,
        data.get("home_team_score"), data.get("visitor_team_score"),
    )


def basketball_status(data: dict) -> str:
    status = data.get("status")
    if status == "Final":
        return "finished"
    if status in ("Postponed", "Cancelled", "Suspended"):
        return status.lower()
    period = data.get("period")
    if type(period) is not int or not 0 <= period <= 20:
        raise ValueError("An NBA period must be a whole number from 0 to 20.")
    # Scheduled provider labels contain a local tipoff time, not a stable enum.
    # Unknown statuses stay closed. A period alone never establishes a final result.
    if period > 0:
        return "playing"
    if isinstance(status, str) and status.endswith((" ET", " EST", " EDT")):
        return "scheduled"
    return "unknown"
