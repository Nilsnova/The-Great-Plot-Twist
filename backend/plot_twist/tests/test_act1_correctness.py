"""Exhaust Act 1 transitions and prove that every reachable state can finish. Used by pytest."""

import copy

import pytest

from plot_twist.engine import Game, GameState, load_story
from plot_twist.tests.act1_graph import build_graph, state_key


@pytest.fixture(scope="module")
def graph():
    return build_graph(load_story())


def requirements_hold(conditions: dict, state: dict) -> bool:
    """Read the content's set constraints without calling either engine's condition helper."""
    items, flags = set(state["inventory"]), set(state["flags"])
    return (
        set(conditions.get("has", [])) <= items
        and not (set(conditions.get("missing", [])) & items)
        and set(conditions.get("flags", [])) <= flags
        and not (set(conditions.get("not_flags", [])) & flags)
    )


def expected_transition(story: dict, original: dict, action: dict) -> dict:
    """Interpret the content directly, independently of Game.perform and the graph builder."""
    expected = copy.deepcopy(original)
    item = action.get("take")
    if item and item not in expected["inventory"]:
        expected["inventory"].append(item)
    for flag in action.get("set", []):
        if flag not in expected["flags"]:
            expected["flags"].append(flag)
    expected["scene"] = action.get("goto", original["scene"])
    expected["ended"] = bool(story["scenes"][expected["scene"]].get("ending"))
    expected["message"] = action["message"]
    return expected


def test_all_declared_scenes_and_endings_are_reachable_without_dead_ends(graph):
    scenes = graph.story["scenes"]
    assert {key[0] for key in graph.states} == scenes.keys()
    assert {key[0] for key in graph.states if key[3]} == {
        scene_id for scene_id, scene in scenes.items() if scene.get("ending")
    }
    # Merely having an outgoing move misses a closed cycle with no path to an ending.
    assert graph.suffixes.keys() == graph.states.keys()
    for key, suffix in graph.suffixes.items():
        assert len(graph.prefixes[key]) + len(suffix) < 300
        assert bool(graph.edges[key]) != key[3]


def test_every_reachable_state_accepts_exactly_its_content_permits(graph):
    all_ids = {
        action["id"]
        for scene in graph.story["scenes"].values()
        for action in scene.get("actions", [])
    } | {"__unknown_action__"}
    game = Game(story=graph.story, save_path=None)
    for key, original in graph.states.items():
        local = {
            action["id"]: action
            for action in graph.story["scenes"][original["scene"]].get("actions", [])
        }
        expected_visible = [
            (action_id, requirements_hold(action.get("requires", {}), original))
            for action_id, action in local.items()
            if not key[3]
            and (
                not action.get("hide_when_blocked")
                or requirements_hold(action.get("requires", {}), original)
            )
        ]
        game.state = GameState.from_dict(copy.deepcopy(original))
        assert [(a["id"], ok) for a, ok in game.visible_actions()] == expected_visible
        for move in sorted(all_ids):
            game.state = GameState.from_dict(copy.deepcopy(original))
            expected = (
                not key[3] and move in local
                and requirements_hold(local[move].get("requires", {}), original)
            )
            assert game.perform(move).accepted == expected, (key, move)
            if not expected:
                assert game.state.to_dict() == original, (key, move)
                continue
            assert game.state.to_dict() == expected_transition(graph.story, original, local[move])
            assert (move, state_key(game.state)) in graph.edges[key]
            assert len(game.state.inventory) == len(set(game.state.inventory))
            assert len(game.state.flags) == len(set(game.state.flags))
            assert set(game.state.inventory) >= set(original["inventory"])
            assert set(game.state.flags) >= set(original["flags"])
            assert set(game.state.inventory) <= graph.story["items"].keys()
            assert not {"trusted_fisherman", "warned_harbor"} <= set(game.state.flags)
