"""Validated, provider-independent matches. Used by adapters and sports desk rules."""

from dataclasses import dataclass
from datetime import datetime

SPORTS = ("football", "basketball")
STATUSES = ("scheduled", "playing", "finished", "postponed", "cancelled", "suspended", "unknown")


def aware(value: datetime) -> None:
    """Refuse ambiguous local times instead of assuming the server's timezone."""
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise ValueError("A sports timestamp must include its timezone.")


def check_score(value: int | None) -> None:
    if value is not None and (type(value) is not int or not 0 <= value <= 1000):
        raise ValueError("A sports score must be a whole number from 0 to 1000.")


@dataclass(frozen=True)
class Match:
    """A league match. Names are text only; no crests, remote assets or provider HTML."""

    id: str
    sport: str
    competition: str
    home: str
    away: str
    kickoff: datetime
    status: str
    home_score: int | None = None
    away_score: int | None = None

    def __post_init__(self) -> None:
        aware(self.kickoff)
        if self.sport not in SPORTS or self.status not in STATUSES:
            raise ValueError("Unknown sports match kind or status.")
        for value in (self.id, self.competition, self.home, self.away):
            if not isinstance(value, str) or not value.strip() or len(value) > 120:
                raise ValueError("A sports label must be nonempty text, at most 120 characters.")
            if not value.isprintable():
                raise ValueError("Sports labels cannot contain control characters.")
        check_score(self.home_score)
        check_score(self.away_score)
        if self.status == "finished":
            if self.home_score is None or self.away_score is None:
                raise ValueError("A finished sports match needs both final scores.")
            if self.sport == "basketball" and self.home_score == self.away_score:
                raise ValueError("A finished basketball match cannot be a draw.")
