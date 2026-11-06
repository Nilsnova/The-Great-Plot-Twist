"""Pure match outcomes and kickoff cutoff. Used by the sports desk; no wallet writes."""

from datetime import datetime, timedelta

from server.sports.models import Match, aware

# L5 also closes at least an hour before the event. Money caps and pool arithmetic
# belong to its shared prediction rules once that package lands on main.
PICK_LEAD_TIME = timedelta(hours=1)
REFUND_STATUSES = ("postponed", "cancelled", "suspended")


def validate_pick(match: Match, pick: str) -> None:
    """Football has three picks; NBA has no draw. A pick never supplies the result."""
    allowed = ("home", "draw", "away") if match.sport == "football" else ("home", "away")
    if pick not in allowed:
        raise ValueError("That pick is not an outcome for this sport.")


def closes_at(match: Match) -> datetime:
    return match.kickoff - PICK_LEAD_TIME


def picking_open(match: Match, now: datetime) -> bool:
    aware(now)
    return match.status == "scheduled" and now < closes_at(match)


def outcome(match: Match) -> str | None:
    """A final winner, void for a disrupted fixture, or None while the result is unknown.

    This does not establish source freshness or authority. A route must not settle
    a live pool from recorded/stale data merely because that data has a final score.
    """
    if match.status in REFUND_STATUSES:
        return "void"
    if match.status != "finished":
        return None
    if match.home_score == match.away_score:
        return "draw"
    return "home" if match.home_score > match.away_score else "away"
