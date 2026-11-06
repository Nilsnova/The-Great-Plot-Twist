"""Festival lifecycle, calculated from the first Relighting, for future routes."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass(frozen=True)
class FestivalTimer:
    phase: str
    starts_at: datetime | None
    ends_at: datetime | None
    remaining_seconds: float


def require_aware(value: datetime) -> None:
    """Refuse ambiguous local timestamps instead of silently shifting the festival."""
    if value.utcoffset() is None:
        raise ValueError("Festival timestamps must include a timezone.")


def festival_timer(
    first_relit_at: datetime | None, now: datetime, duration_seconds: int
) -> FestivalTimer:
    """Active on [first Relighting, end); later solves never enter this calculation."""
    require_aware(now)
    now = now.astimezone(UTC)
    if type(duration_seconds) is not int or duration_seconds <= 0:
        raise ValueError("Festival duration must be a positive whole number of seconds.")
    if first_relit_at is None:
        return FestivalTimer("waiting", None, None, 0)
    require_aware(first_relit_at)
    first_relit_at = first_relit_at.astimezone(UTC)
    end = first_relit_at + timedelta(seconds=duration_seconds)
    if now < first_relit_at:
        return FestivalTimer("waiting", first_relit_at, end, 0)
    remaining = max(0, (end - now).total_seconds())
    phase = "active" if remaining > 0 else "ended"
    return FestivalTimer(phase, first_relit_at, end, remaining)
