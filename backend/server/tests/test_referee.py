"""Tests for game/referee.py: the replay of an Act 1 move log with the original story engine.

The referee is pure: it takes a story, the kits and a list of action ids, and answers with a Verdict
or raises MoveLogRefused. So these tests need no web server and no database.

They cover, in order:
  * all eight end states of today's story map to the right kit (and the search that finds the end
    states does not use the routes, so a ninth end state would show up),
  * a forged log is refused, with the number of the first bad move,
  * the limit of 300 moves,
  * Story v2, which adds the action keep_quiet: old logs still replay to the same kit,
  * the fingerprint of the story file.

Used by: pytest (cd backend && uv run pytest).
"""

import copy
import hashlib
from pathlib import Path

import pytest

from plot_twist.engine import STORY_PATH, Game, load_story
from server.errors import ApiError
from server.game.entry_kits import kit_for, load_entry_kits
from server.game.referee import (
    MAX_MOVES,
    MoveLogRefused,
    Verdict,
    judge,
    story_fingerprint,
)
from server.tests.story_states import (
    ROUTES,
    SILENT_TRAPPED,
    TO_LAMP,
    TO_SHORE,
    WARNED_RESCUE,
    end_states,
    key_of,
    story_v2_fixture,
)

STORY = load_story()
KITS = load_entry_kits()


def refusal_of(actions: list[str], story=STORY) -> MoveLogRefused:
    """Judge a log that must be refused, and hand back the refusal."""
    with pytest.raises(MoveLogRefused) as caught:
        judge(story, KITS, actions)
    return caught.value


# --- the eight end states ---


@pytest.mark.parametrize("route", ROUTES, ids=[route.name for route in ROUTES])
def test_each_of_the_eight_end_states_maps_to_its_kit(route):
    verdict = judge(STORY, KITS, route.moves)

    assert verdict == Verdict(
        ending=route.ending,
        decision=route.decision,
        read_log=route.read_log,
        move_count=len(route.moves),
    )
    assert kit_for(KITS, verdict.ending, verdict.decision).id == route.kit


def decision_from_flags(flags: frozenset[str]) -> str:
    """The decision a state stands for, read from the flags the kits file names."""
    if KITS.trusted_flag in flags:
        return "trusted"
    if KITS.warned_flag in flags:
        return "warned"
    return "none"


def test_todays_story_has_eight_end_states_and_all_map_to_one_kit():
    # The search plays the real engine and knows nothing about the routes in story_states.py. If
    # the story gains a ninth end state, or an end state that has no kit, this test fails.
    ends = end_states(STORY)
    kit_ids = set()
    for scene, _items, flags, _ended in ends:
        kit_ids.add(kit_for(KITS, scene, decision_from_flags(flags)).id)

    assert len(ends) == 8
    assert kit_ids == {"true_keeper", "witness", "informant", "stranger"}


def test_the_eight_routes_reach_exactly_the_end_states_of_the_search():
    # The routes are what the other tests lean on, so check that between them they reach every
    # end state of the story and nothing else.
    reached = set()
    for route in ROUTES:
        game = Game(story=STORY, save_path=None)
        for move in route.moves:
            game.perform(move)
        reached.add(key_of(game.state))

    assert reached == end_states(STORY)


def test_a_verdict_is_a_frozen_value():
    verdict = judge(STORY, KITS, SILENT_TRAPPED)

    with pytest.raises(AttributeError):
        verdict.decision = "warned"


def test_reading_the_logbook_sets_read_log_and_nothing_else():
    without_log = judge(STORY, KITS, ROUTES[2].moves)  # warned_trapped
    with_log = judge(STORY, KITS, ROUTES[3].moves)  # warned_trapped_log

    assert (without_log.read_log, with_log.read_log) == (False, True)
    assert (without_log.ending, without_log.decision) == (with_log.ending, with_log.decision)


# --- forged logs ---


def test_an_unknown_action_id_is_refused_with_its_move_number():
    refusal = refusal_of(["to_desk", "fly_away"])

    assert refusal.status_code == 422
    assert refusal.code == "move_refused"
    assert "Move 2" in refusal.message
    assert "Reload the page" in refusal.message


@pytest.mark.parametrize("odd_id", ["TO_DESK", "to desk", "", "to_desk ", "../to_desk"])
def test_an_action_id_must_match_exactly(odd_id):
    refusal = refusal_of([odd_id])

    assert refusal.code == "move_refused"
    assert "Move 1" in refusal.message


def test_an_action_from_another_scene_is_refused():
    # take_key is a move of the desk, and the story starts in the cottage.
    refusal = refusal_of(["take_key"])

    assert refusal.code == "move_refused"
    assert "Move 1" in refusal.message


def test_a_blocked_action_is_refused_and_not_skipped():
    # The tower door needs the brass key. A replay that quietly skipped the refused move would go
    # on and could still end the story. This one must stop at the move the engine refused.
    key_never_taken = ["to_tower", "unlock_door"] + ["tower_back", "to_shore", "take_lantern"]
    refusal = refusal_of(key_never_taken)

    assert refusal.code == "move_refused"
    assert "Move 2" in refusal.message


def test_the_rescue_needs_the_warning_in_the_log():
    # signal is only possible after warn_harbor. Without it the engine refuses the last move.
    no_warning = TO_SHORE + TO_LAMP + ["signal"]

    refusal = refusal_of(no_warning)

    assert refusal.code == "move_refused"
    assert f"Move {len(no_warning)}" in refusal.message


def test_both_decisions_cannot_be_made_in_one_log():
    # trust_fisherman and warn_harbor shut each other out, so the second one is refused.
    both = TO_SHORE + ["trust_fisherman", "warn_harbor"]

    refusal = refusal_of(both)

    assert refusal.code == "move_refused"
    assert f"Move {len(both)}" in refusal.message


def test_moves_after_the_ending_are_refused():
    refusal = refusal_of(WARNED_RESCUE + ["to_desk"])

    assert refusal.code == "move_refused"
    assert f"Move {len(WARNED_RESCUE) + 1}" in refusal.message


def test_a_log_that_stops_before_an_ending_is_refused():
    refusal = refusal_of(["to_desk"])

    assert refusal.status_code == 422
    assert refusal.code == "no_ending"
    assert "stop before an ending" in refusal.message


def test_a_log_that_stops_one_move_before_the_ending_is_refused():
    refusal = refusal_of(WARNED_RESCUE[:-1])

    assert refusal.code == "no_ending"


def test_an_empty_log_is_no_ending():
    assert refusal_of([]).code == "no_ending"


def test_a_refusal_is_an_api_error_in_the_standard_shape():
    assert isinstance(refusal_of(["nope"]), ApiError)


# --- the limit of 300 moves ---


def test_301_moves_are_refused_before_any_replay():
    # An empty dictionary is not a story: replaying on it would raise a KeyError. So an answer of
    # too_many_moves proves that the length was checked first.
    too_many = ["to_desk", "desk_back"] * 150 + ["to_desk"]

    with pytest.raises(MoveLogRefused) as caught:
        judge({}, KITS, too_many)

    assert len(too_many) == MAX_MOVES + 1
    assert caught.value.status_code == 422
    assert caught.value.code == "too_many_moves"


def test_exactly_300_moves_are_accepted():
    # 145 round trips to the desk and back (290 moves), then the 10 moves of the silent route.
    log = ["to_desk", "desk_back"] * 145 + SILENT_TRAPPED

    verdict = judge(STORY, KITS, log)

    assert len(log) == MAX_MOVES == 300
    assert (verdict.ending, verdict.decision, verdict.move_count) == ("ending_trapped", "none", 300)
    assert kit_for(KITS, verdict.ending, verdict.decision).id == "stranger"


# --- the replay changes nothing ---


def test_a_replay_never_changes_the_story_or_writes_a_file(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    story = copy.deepcopy(STORY)

    judge(story, KITS, WARNED_RESCUE)

    assert story == STORY
    assert list(tmp_path.iterdir()) == []


def test_two_replays_of_one_log_give_the_same_verdict():
    first = judge(STORY, KITS, WARNED_RESCUE)
    second = judge(STORY, KITS, WARNED_RESCUE)

    assert first == second


# --- both decision flags at once is a bug in the content ---


def story_that_sets_both_decision_flags() -> dict:
    """A made-up story whose first move switches on trusted_fisherman AND warned_harbor."""
    return {
        "title": "Broken",
        "start": "start",
        "items": {},
        "scenes": {
            "start": {
                "title": "Start",
                "text": "x",
                "actions": [
                    {
                        "id": "both",
                        "label": "both",
                        "set": ["trusted_fisherman", "warned_harbor"],
                        "goto": "ending_trapped",
                        "message": "x",
                    }
                ],
            },
            "ending_trapped": {"title": "End", "ending": True, "text": "x"},
        },
    }


def test_both_decision_flags_at_once_is_a_content_error_and_never_a_kit():
    with pytest.raises(ValueError, match="decision flags"):
        judge(story_that_sets_both_decision_flags(), KITS, ["both"])


# --- Story v2 ---


def test_keep_quiet_is_refused_on_todays_story():
    log = TO_SHORE + ["keep_quiet"] + TO_LAMP + ["untie"]

    refusal = refusal_of(log)

    assert refusal.code == "move_refused"
    assert f"Move {len(TO_SHORE) + 1}" in refusal.message  # move 6


def test_story_v2_keep_quiet_ends_as_a_stranger():
    log = TO_SHORE + ["keep_quiet"] + TO_LAMP + ["untie"]

    verdict = judge(story_v2_fixture(), KITS, log)

    assert (verdict.ending, verdict.decision) == ("ending_trapped", "none")
    assert kit_for(KITS, verdict.ending, verdict.decision).id == "stranger"


def test_keep_quiet_sets_no_flag_so_it_cannot_become_a_decision():
    log = TO_SHORE + ["keep_quiet"] + TO_LAMP + ["untie"]

    assert judge(story_v2_fixture(), KITS, log).decision == "none"


def test_story_v2_still_has_eight_end_states_with_the_same_kits():
    v2_ends = end_states(story_v2_fixture())

    assert len(v2_ends) == 8
    assert v2_ends == end_states(STORY)


@pytest.mark.parametrize("route", ROUTES, ids=[route.name for route in ROUTES])
def test_old_logs_replay_to_the_same_kit_on_story_v2(route):
    verdict = judge(story_v2_fixture(), KITS, route.moves)

    assert judge(STORY, KITS, route.moves) == verdict
    assert kit_for(KITS, verdict.ending, verdict.decision).id == route.kit


# --- the fingerprint of the story file ---


def test_the_fingerprint_is_the_sha256_of_the_story_file():
    assert story_fingerprint() == hashlib.sha256(STORY_PATH.read_bytes()).hexdigest()
    assert len(story_fingerprint()) == 64


def test_the_fingerprint_follows_the_file_byte_for_byte(tmp_path: Path):
    story_file = tmp_path / "story.json"
    story_file.write_bytes(b'{"start": "a"}')
    before = story_fingerprint(story_file)

    story_file.write_bytes(b'{"start": "b"}')

    assert before == hashlib.sha256(b'{"start": "a"}').hexdigest()
    assert story_fingerprint(story_file) != before
