"""Replaceable case scenarios shared by view tests and the browser adapter contract.

All protected text comes from the loader at test time. These fixtures contain no solution.
"""

from datetime import UTC, datetime

from server.game.case_snapshot import CaseSnapshot, Find, Formed, Pin, SeatState

VIEWER = "11111111-1111-4111-8111-111111111111"
KEEPER = "22222222-2222-4222-8222-222222222222"
CREW = "33333333-3333-4333-8333-333333333333"
STARTED_AT = datetime(2026, 11, 13, 10, 2, tzinfo=UTC)
EXAMPLE_NOW = 2125


def example_snapshot() -> CaseSnapshot:
    """The specification's section 3.8 scenario, with fixed non-secret identifiers."""
    return CaseSnapshot(
        crew_id=CREW,
        status="active",
        mode="crew",
        started_at=STARTED_AT,
        seats=(
            SeatState(1, "informant", VIEWER, name="Brave Puffin 17"),
            SeatState(2, "stranger", npc_id="deckhand", name="the Deckhand"),
            SeatState(3, "true_keeper", KEEPER, name="Calm Heron 4"),
            SeatState(4, "witness", npc_id="cook", name="the Cook"),
        ),
        write_revision=8,
        crew_version=3,
        finds=(
            Find(1, "C1", "C1.notice_board", 180, 180, VIEWER),
            Find(3, "C3", "C3.key_tag", 300, 300, KEEPER),
            Find(4, "C2", "C2.radio_words", 0, 0, by_partner=True),
            Find(1, "C4", "C4.back_room", 1937, 2237, VIEWER),
        ),
        pins=(
            Pin(1, "C1", 180, 180, VIEWER),
            Pin(3, "C3", 300, 300, KEEPER),
            Pin(4, "C2", 900, 600, VIEWER, by_partner=True),
        ),
        formed=(Formed("D1", 960, VIEWER, 1),),
        coins=1300,
        timber=20,
    )
