"""Pure accusation decisions, with no answer that marks a suspect before the rules allow it.

Used by: the case service; all protected text remains in the loaded content.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.game.case_data import CaseData
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot


@dataclass(frozen=True, repr=False)
class AccuseDecision:
    accepted: bool
    reason: str | None = None
    message: str = ""
    seconds: int = 0


def decide_accusation(
    data: CaseData, snapshot: CaseSnapshot, suspect: str, now: int
) -> AccuseDecision:
    lines = data.accusation.lines
    if snapshot.solved_second is not None:
        return AccuseDecision(False, "already_solved", UI_MESSAGES["already_solved"])
    if snapshot.schooner_found_second is None:
        return AccuseDecision(False, "schooner_required", lines["needs_schooner"])
    formed = {item.deduction_id for item in snapshot.formed}
    if not set(data.accusation.needs_deductions).issubset(formed):
        return AccuseDecision(False, "evidence_required", lines["needs_deductions"])
    wait = max(0, snapshot.accuse_wait_until - now)
    if wait:
        return AccuseDecision(
            False, "accusation_cooldown", lines["wait"].format(seconds=wait), wait
        )
    known = next((item for item in data.suspects if item.id == suspect), None)
    if known is None:
        raise ApiError(404, "no_such_suspect", "That suspect is not in the case.")
    if suspect != data.accusation.culprit:
        wait = data.accusation.wrong_wait_seconds
        message = f"{known.refused_line} {lines['wait'].format(seconds=wait)}"
        return AccuseDecision(False, "accusation_refused", message, wait)
    return AccuseDecision(True, message=UI_MESSAGES["solved"])
