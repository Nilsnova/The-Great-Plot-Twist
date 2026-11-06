"""Small immutable intent decisions shared by board and night rules."""

from dataclasses import dataclass


@dataclass(frozen=True, repr=False)
class IntentDecision:
    accepted: bool
    reason: str | None = None
    message: str = ""
    seconds: int = 0
    target: str | None = None
