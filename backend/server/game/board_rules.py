"""Pure board pin and pair checks, in the contract's refusal order."""

from server.errors import ApiError
from server.game.case_board import deduction_for_pair, two_seats_pinned
from server.game.case_data import CaseData
from server.game.case_decisions import IntentDecision
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot, SeatState


def known_card(data: CaseData, card_id: str) -> None:
    if not any(card.id == card_id for card in data.cards):
        raise ApiError(404, "no_such_card", "That card is not available.")


def decide_pin(
    data: CaseData, state: CaseSnapshot, seat: SeatState, card_id: str, now: int
) -> IntentDecision:
    known_card(data, card_id)
    held = any(
        find.card_id == card_id and find.ready_second <= now
        for find in state.finds_for_seat(seat.seat_no)
    )
    if not held:
        return IntentDecision(False, "card_not_held", UI_MESSAGES["card_not_held"])
    if any(pin.card_id == card_id and pin.seat_no == seat.seat_no for pin in state.pins):
        return IntentDecision(False, "already_pinned", UI_MESSAGES["already_pinned"])
    return IntentDecision(True, message=UI_MESSAGES["pinned"], target=card_id)


def decide_pair(
    data: CaseData, state: CaseSnapshot, seat: SeatState, a: str, b: str, now: int
) -> IntentDecision:
    known_card(data, a)
    known_card(data, b)
    if now < state.pair_wait_until:
        wait = state.pair_wait_until - now
        return IntentDecision(
            False, "pair_cooldown", data.board.lines["wait"].format(seconds=wait), wait
        )
    pinned = {pin.card_id for pin in state.pins if pin.pinned_second <= now}
    if a not in pinned or b not in pinned:
        return IntentDecision(False, "not_pinned", data.board.lines["not_pinned"])
    if not two_seats_pinned(state.pins, a, b, now):
        return IntentDecision(False, "different_seats_required", data.board.lines["same_seat"])
    deduction = deduction_for_pair(data, a, b)
    if deduction is None:
        wait = data.board.wrong_pair_wait_seconds
        message = (
            data.board.lines["wrong_pair"] + " " + data.board.lines["wait"].format(seconds=wait)
        )
        return IntentDecision(False, "wrong_pair", message, wait)
    if any(formed.deduction_id == deduction.id for formed in state.formed):
        return IntentDecision(False, "already_deduced", UI_MESSAGES["already_deduced"])
    return IntentDecision(True, message=deduction.finding, target=deduction.id)
