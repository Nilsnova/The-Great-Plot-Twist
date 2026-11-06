"""Generic crew records for pure case-rule tests; story answers come only from loaded content."""

from datetime import UTC, datetime

from server.game.case_snapshot import CaseSnapshot, SeatState

PLAYER = "11111111-1111-4111-8111-111111111111"
FRIEND = "22222222-2222-4222-8222-222222222222"
START = datetime(2026, 11, 13, 10, 2, tzinfo=UTC)


def snapshot() -> CaseSnapshot:
    return CaseSnapshot(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "active",
        "crew",
        START,
        (
            SeatState(1, "informant", PLAYER, name="Brave Puffin 17"),
            SeatState(2, "stranger", npc_id="deckhand", name="the Deckhand"),
            SeatState(3, "true_keeper", FRIEND, name="Calm Heron 4"),
            SeatState(4, "witness", npc_id="cook", name="the Cook"),
        ),
    )
