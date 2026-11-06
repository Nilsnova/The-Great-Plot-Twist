"""Pure pin and pair decisions in the board's fixed refusal order.

Used by: the case service, board view and deterministic case planner.
"""

from dataclasses import dataclass

from server.game.case_board import deduction_for_pair, two_seats_pinned
from server.game.case_data import CaseData
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot, SeatState


@dataclass(frozen=True, repr=False)
class BoardDecision:
    accepted: bool
    reason: str | None = None
    message: str = ""
    seconds: int = 0
    deduction_id: str | None = None


def decide_pin(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, card_id: str, now: int
) -> BoardDecision:
    held = any(
        find.card_id == card_id and find.ready_second <= now
        for find in snapshot.finds_for_seat(seat.seat_no)
    )
    if not held:
        return BoardDecision(False, "card_not_held", UI_MESSAGES["card_not_held"])
    if any(pin.card_id == card_id and pin.seat_no == seat.seat_no for pin in snapshot.pins):
        return BoardDecision(False, "already_pinned", UI_MESSAGES["already_pinned"])
    return BoardDecision(True, message=UI_MESSAGES["pinned"])


def decide_pair(
    data: CaseData, snapshot: CaseSnapshot, card_a: str, card_b: str, now: int
) -> BoardDecision:
    lines = data.board.lines
    wait = max(0, snapshot.pair_wait_until - now)
    if wait:
        return BoardDecision(False, "pair_cooldown", lines["wait"].format(seconds=wait), wait)
    pinned = {pin.card_id for pin in snapshot.pins if pin.pinned_second <= now}
    if card_a not in pinned or card_b not in pinned:
        return BoardDecision(False, "not_pinned", lines["not_pinned"])
    if not two_seats_pinned(snapshot.pins, card_a, card_b, now):
        return BoardDecision(False, "different_seats_required", lines["same_seat"])
    deduction = deduction_for_pair(data, card_a, card_b)
    if deduction is None:
        wait = data.board.wrong_pair_wait_seconds
        message = f"{lines['wrong_pair']} {lines['wait'].format(seconds=wait)}"
        return BoardDecision(False, "wrong_pair", message, wait)
    if any(item.deduction_id == deduction.id for item in snapshot.formed):
        return BoardDecision(False, "already_deduced", UI_MESSAGES["already_deduced"])
    return BoardDecision(True, message=deduction.finding, deduction_id=deduction.id)
