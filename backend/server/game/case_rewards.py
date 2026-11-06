"""Pure contribution and reward calculations; the database still pays atomically.

Used by: accusation decisions, case credits and parity checks for the SQL rewards.
"""

from dataclasses import dataclass

from server.game.case_board import deduction_parts
from server.game.case_data import CaseData
from server.game.case_snapshot import CaseSnapshot


@dataclass(frozen=True)
class Payout:
    player_id: str
    seat_no: int
    kit: str
    contributor: bool
    pins: int
    parts: int
    finale_role: bool
    share: int


def deduction_rewarded_players(
    snapshot: CaseSnapshot, cards, formed_second: int
) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                pin.pinned_by
                for pin in snapshot.pins
                if pin.pinned_by is not None
                and pin.card_id in cards
                and pin.ordered_second <= formed_second
            }
        )
    )


def solve_shares(
    data: CaseData, snapshot: CaseSnapshot, accuser_id: str | None = None
) -> list[Payout]:
    reward = data.rewards.coin("solve_share")
    accusers = {item.player_id for item in snapshot.accusations if item.correct}
    if accuser_id is not None:
        accusers.add(accuser_id)
    result = []
    for seat in sorted(snapshot.seats, key=lambda item: item.seat_no):
        if seat.player_id is None:
            continue
        pins = sum(pin.pinned_by == seat.player_id for pin in snapshot.pins)
        parts = len(deduction_parts(data, snapshot, seat.player_id))
        role = seat.player_id in accusers or seat.player_id in snapshot.parted_players
        contributor = bool(pins or role)
        share = min(
            reward.maximum, reward.base + reward.per_part * parts + reward.finale_role * role
        )
        result.append(
            Payout(
                seat.player_id,
                seat.seat_no,
                seat.kit,
                contributor,
                pins,
                parts,
                role,
                share if contributor else 0,
            )
        )
    return result


def reward_ref(data: CaseData, reward_id: str, **identifiers: str) -> str:
    ref = data.rewards.coin(reward_id).ref.format(**identifiers)
    if not ref.startswith(f"{data.case_id}:") or len(ref) > 120:
        raise ValueError("A case reward ref must use its case id and fit the wallet limit.")
    return ref
