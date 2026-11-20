"""Common availability rules for display-only exact shared intents.

Used by snapshot quote builders. Domain SQL remains the authority for every mutation.
"""

from collections.abc import Callable

from server.errors import ApiError
from server.island.shared_snapshot_models import SnapshotFacts
from server.island.treasury_models import decimal_integer


def refusal(check: Callable[[], object]) -> str | None:
    try:
        check()
    except ApiError as error:
        return error.code
    return None


def phase_reason(facts: SnapshotFacts) -> str | None:
    if facts.admissionState == "paused":
        return "economy_path_unavailable"
    if facts.reserved:
        return "wave_running"
    return None


def quote(
    facts: SnapshotFacts,
    target: dict,
    intent: dict | None,
    reason: str | None = None,
    *,
    charge: int = 0,
) -> dict:
    reason = reason or phase_reason(facts)
    if reason is None and charge > decimal_integer(facts.economy.treasury.availableCoins):
        reason = "insufficient_funds"
    if intent is None and reason is None:
        raise ValueError("An unavailable exact intent needs an explicit reason.")
    return {"target": target, "intent": intent, "available": reason is None, "reason": reason}
