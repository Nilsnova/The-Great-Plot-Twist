"""Tests that a sealed signal never leaks (specs/A7-lantern-duels.md, section 9).

A captain's signals reach the other captain only after both envelopes are in, and only as part of
the stored reveal. The main test here builds TWO fake databases that differ only in the signals
the challenger sealed, plays the same requests of the named captain (Bob) and of a visitor
(Carol) against both, and demands byte-identical answers. It covers the list, the detail, every
refusal of the answer and of the cancel route, and the state after a withdrawal, a decline and an
expiry. The challenger's own view (Alice) is of course allowed to differ: those are her signals.

The second test reads the log at DEBUG level and demands that no signal, name or player id is in
it.
"""

import logging

import pytest

from server.duels import rules
from server.tests.duels_helpers import ALICE, BOB, CAROL, PLAYERS, World

FLASHY = ["flash", "shade", "shade", "mirror", "shade"]
QUIET = ["shade", "shade", "shade", "shade", "shade"]
MIXED = ["mirror", "mirror", "flash", "shade", "shade"]

ONE_DAY_AND_A_BIT = 25 * 3600


def build_world(challenger_signals: list[str]) -> tuple[World, str, str]:
    """A world where Alice sent a named challenge to Bob and an open challenge to everybody."""
    world = World()
    named = world.challenge("alice", signals=challenger_signals, actionUid="challenge-0001")
    open_one = world.challenge(
        "alice", signals=challenger_signals, actionUid="challenge-0002", drop=("opponentName",)
    )
    return world, named.json()["duel"]["id"], open_one.json()["duel"]["id"]


def observe(*responses) -> list[tuple]:
    """What a client would see of each response: status, caching header and the exact body."""
    return [
        (response.status_code, response.headers.get("cache-control"), response.content)
        for response in responses
    ]


def looking(world: World, named: str, open_one: str) -> list[tuple]:
    return observe(
        world.listing("bob"),
        world.listing("carol"),
        world.detail("bob", named),
        world.detail("carol", named),
        world.detail("bob", open_one),
        world.detail("carol", open_one),
    )


def refused_answers(world: World, named: str, open_one: str) -> list[tuple]:
    """Every way an answer is refused after, or before, the server has seen the envelope."""
    world.database.wallets[BOB] = 5  # Bob cannot pay the stake of 100
    broke = world.answer("bob", named)
    world.database.wallets[BOB] = 1000
    for _ in range(3):  # the pair limit of the day is used up
        world.database.insert_duel(
            status="finished",
            outcome="draw",
            stake=10,
            opponent_id=BOB,
            round_results=["even"] * 5,
            answered_at=world.clock.now.isoformat(),
            closed_at=world.clock.now.isoformat(),
        )
    limit = world.answer("bob", named, actionUid="answer-0002")
    return observe(
        broke,
        limit,
        world.answer("carol", named),
        world.answer("bob", named, signals=["shade", "shade", "shade"], actionUid="answer-0003"),
        world.answer("bob", named, signals=["flash"] * 5, actionUid="answer-0004"),
        world.answer("alice", named, actionUid="answer-0005"),
        world.answer("alice", named, actionUid="challenge-0001"),
        world.answer("bob", "00000000-0000-4000-8000-0000000000ff"),
    )


def refused_cancels(world: World, named: str, open_one: str) -> list[tuple]:
    return observe(
        world.cancel("carol", open_one),
        world.cancel("bob", open_one),
        world.cancel("carol", named),
        world.cancel("carol", "00000000-0000-4000-8000-0000000000ff"),
    )


def after_a_withdrawal(world: World, named: str, open_one: str) -> list[tuple]:
    world.cancel("alice", named)
    world.cancel("alice", open_one)
    return observe(
        world.listing("bob"),
        world.listing("carol"),
        world.detail("bob", named),
        world.detail("carol", open_one),
        world.answer("bob", named),
        world.answer("carol", open_one),
        world.cancel("bob", named),
    )


def after_a_decline(world: World, named: str, open_one: str) -> list[tuple]:
    declined = world.cancel("bob", named)
    return observe(
        declined,
        world.cancel("bob", named),
        world.listing("bob"),
        world.detail("bob", named),
        world.answer("bob", named),
    )


def after_an_expiry(world: World, named: str, open_one: str) -> list[tuple]:
    world.clock.advance(ONE_DAY_AND_A_BIT)
    return observe(
        world.answer("bob", named),
        world.listing("bob"),
        world.listing("carol"),
        world.detail("bob", named),
        world.detail("carol", open_one),
        world.answer("carol", open_one),
        world.cancel("bob", named),
    )


def after_the_open_challenge_was_taken(world: World, named: str, open_one: str) -> list[tuple]:
    world.answer("bob", open_one)  # Bob sees the reveal, which is his right. Carol must not.
    return observe(
        world.detail("carol", open_one),
        world.answer("carol", open_one, actionUid="answer-0009"),
        world.listing("carol"),
        world.cancel("carol", open_one),
    )


SCENARIOS = [
    looking,
    refused_answers,
    refused_cancels,
    after_a_withdrawal,
    after_a_decline,
    after_an_expiry,
    after_the_open_challenge_was_taken,
]


@pytest.mark.parametrize("other_plan", [QUIET, MIXED])
@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda scenario: scenario.__name__)
def test_the_other_captains_and_visitors_get_identical_answers_whatever_the_challenger_sealed(
    scenario, other_plan
):
    world_a, named_a, open_a = build_world(FLASHY)
    world_b, named_b, open_b = build_world(other_plan)

    seen_a = scenario(world_a, named_a, open_a)
    seen_b = scenario(world_b, named_b, open_b)

    assert seen_a == seen_b


def test_the_two_test_worlds_really_differ_in_what_the_challenger_sealed():
    world_a, named_a, _ = build_world(FLASHY)
    world_b, named_b, _ = build_world(QUIET)

    alice_in_a = world_a.detail("alice", named_a).json()["duel"]
    alice_in_b = world_b.detail("alice", named_b).json()["duel"]

    assert alice_in_a["yourSignals"] == FLASHY
    assert alice_in_b["yourSignals"] == QUIET
    assert world_a.database.moves != world_b.database.moves


def test_the_challenger_alone_sees_the_signals_of_a_withdrawn_duel():
    world, named, _ = build_world(FLASHY)
    world.cancel("alice", named)

    for_alice = world.detail("alice", named)
    for_bob = world.detail("bob", named)

    assert for_alice.json()["duel"]["yourSignals"] == FLASHY
    assert for_bob.json()["duel"]["yourSignals"] is None
    assert for_bob.json()["duel"]["reveal"] is None


def test_the_answer_shows_the_challenger_signals_for_the_first_time_after_both_are_in():
    world, named, _ = build_world(FLASHY)
    before = world.detail("bob", named)

    answer = world.answer("bob", named)

    assert [entry["theirs"] for entry in answer.json()["duel"]["reveal"]] == FLASHY
    assert answer.json()["duel"]["reveal"] is not None
    assert before.json()["duel"]["reveal"] is None


# --- the log ---


def needles() -> list[str]:
    """Everything that must never be written to a log: signals, names and player ids."""
    names = [name for _, name in PLAYERS.values()]
    return [*rules.SIGNALS, *names, ALICE, BOB, CAROL]


def found_in(text: str) -> list[str]:
    return [needle for needle in needles() if needle in text]


def test_signals_never_reach_the_log(caplog):
    caplog.set_level(logging.DEBUG)
    world = World()
    duel_id = world.start_duel()
    world.start_duel(actionUid="challenge-0002", drop=("opponentName",))

    world.listing("alice")
    world.listing("bob")
    world.detail("bob", duel_id)
    world.answer("carol", duel_id)  # a 404
    world.answer("bob", duel_id, signals=["flash"] * 5, actionUid="answer-0002")  # a 422
    world.answer("bob", duel_id)  # the real answer
    world.answer("bob", duel_id)  # a repeat
    world.cancel("alice", duel_id)  # a 409
    world.database.timeouts.add("duel_void")
    world.cancel("alice", world.database.duel(1)["id"])  # a 503, which is logged
    world.client.get(
        "/api/duels", headers={"Authorization": "Bearer test.mallory.signature"}
    )  # a 401

    assert found_in(caplog.text) == []
    assert caplog.records  # the log was really being recorded


def test_a_failing_database_call_logs_only_its_status_and_code(caplog):
    caplog.set_level(logging.DEBUG)
    world = World()
    duel_id = world.start_duel()
    world.database.timeouts.add("duel_answer")

    world.answer("bob", duel_id)

    assert found_in(caplog.text) == []
