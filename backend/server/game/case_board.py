"""Pure deduction pairing and contributor rules, shared by views and board writes.

Used by: the case reward model and Phase 2 board decisions.
"""

from collections.abc import Iterable

from server.game.case_data import CaseData, Deduction
from server.game.case_snapshot import CaseSnapshot, Pin


def deduction_for_pair(data: CaseData, a: str, b: str) -> Deduction | None:
    if a == b:
        return None
    return next((item for item in data.deductions if set(item.cards) == {a, b}), None)


def two_seats_pinned(pins: Iterable[Pin], a: str, b: str, now: int) -> bool:
    effective = tuple(pin for pin in pins if pin.pinned_second <= now)
    return any(
        left.card_id == a and right.card_id == b and left.seat_no != right.seat_no
        for left in effective
        for right in effective
    )


def deduction_parts(data: CaseData, snapshot: CaseSnapshot, player_id: str) -> tuple[str, ...]:
    return tuple(
        formed.deduction_id
        for formed in snapshot.formed
        if any(
            pin.pinned_by == player_id
            and pin.card_id in data.deduction(formed.deduction_id).cards
            and pin.ordered_second <= formed.formed_second
            for pin in snapshot.pins
        )
    )
