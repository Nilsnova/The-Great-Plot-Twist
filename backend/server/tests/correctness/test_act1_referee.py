"""Replay all Act 1 edges and seeded histories to the approved kit. Used by pytest."""

import pytest

from plot_twist.engine import load_story
from plot_twist.tests.act1_graph import build_graph, play, state_key
from server.game.entry_kits import kit_for, load_entry_kits
from server.game.referee import MAX_MOVES, MoveLogRefused, judge

# Independent expected outcomes from the Act 1 contract, not computed with production kit logic.
EXPECTED_KITS = {
    ("ending_rescue", "warned"): "true_keeper",
    ("ending_trapped", "warned"): "witness",
    ("ending_trapped", "trusted"): "informant",
    ("ending_trapped", "none"): "stranger",
}


@pytest.fixture(scope="module")
def graph():
    return build_graph(load_story())


def expected_profile(moves: tuple[str, ...], ending: str) -> tuple[str, bool, str]:
    decision = "none"
    if "warn_harbor" in moves:
        decision = "warned"
    elif "trust_fisherman" in moves:
        decision = "trusted"
    return decision, "read_log" in moves, EXPECTED_KITS[ending, decision]


def test_referee_replays_every_edge_covering_route_and_seeded_walk_to_the_right_kit(graph):
    kits = load_entry_kits()
    routes = graph.edge_routes() + [graph.seeded_route(seed) for seed in range(64)]
    seen_ends, seen_profiles, visited_edges = set(), set(), set()
    for moves in routes:
        assert len(moves) <= MAX_MOVES
        game = play(graph.story, ())
        for move in moves:
            before = state_key(game.state)
            assert game.perform(move).accepted
            visited_edges.add((before, move, state_key(game.state)))
        assert game.state.ended
        verdict = judge(graph.story, kits, list(moves))
        decision, read_log, kit_id = expected_profile(moves, game.state.scene)
        assert (verdict.ending, verdict.decision, verdict.read_log, verdict.move_count) == (
            game.state.scene, decision, read_log, len(moves),
        )
        assert kit_for(kits, verdict.ending, verdict.decision).id == kit_id
        seen_ends.add(state_key(game.state))
        seen_profiles.add((verdict.ending, decision, read_log))
    assert seen_ends == {key for key in graph.states if key[3]}
    assert seen_profiles == {
        (ending, decision, read_log)
        for ending, decision in EXPECTED_KITS
        for read_log in (False, True)
    }
    assert visited_edges == {
        (before, move, after)
        for before, edges in graph.edges.items()
        for move, after in edges
    }


def test_every_nonterminal_prefix_is_refused_as_incomplete_and_not_awarded_a_kit(graph):
    kits = load_entry_kits()
    for key, prefix in graph.prefixes.items():
        if not key[3]:
            with pytest.raises(MoveLogRefused) as caught:
                judge(graph.story, kits, list(prefix))
            assert caught.value.code == "no_ending", prefix
