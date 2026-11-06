"""Strict response parsing for sports providers; rejects ambiguous settlement data."""

from datetime import UTC, datetime
from typing import Any

from server.sports.models import Match, aware

FOOTBALL_STATUSES = {
    "SCHEDULED": "scheduled", "TIMED": "scheduled", "IN_PLAY": "playing",
    "PAUSED": "playing", "FINISHED": "finished", "POSTPONED": "postponed",
    "CANCELLED": "cancelled", "SUSPENDED": "suspended",
}


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
    """football-data.org v4 /matches/{id}; only league games with regular-time scores."""
    data = object_value(payload)
    if positive_id(data.get("id")) != requested_id:
        raise ValueError("The sports provider returned a different match.")
    competition = object_value(data.get("competition"))
    if competition.get("type") != "LEAGUE":
        raise ValueError("Only football league matches are supported.")
    status = FOOTBALL_STATUSES.get(data.get("status"))
    if status is None:
        raise ValueError("Unsupported football status; no settlement is safe.")
    score = object_value(data.get("score"))
    if status == "finished" and score.get("duration") != "REGULAR":
        raise ValueError("Only football regular-time results are supported.")
    full_time = object_value(score.get("fullTime"))
    return Match(
        f"fd-{requested_id}", "football", competition.get("name"),
        object_value(data.get("homeTeam")).get("name"),
        object_value(data.get("awayTeam")).get("name"),
        timestamp(data.get("utcDate")), status, full_time.get("home"), full_time.get("away"),
    )


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
