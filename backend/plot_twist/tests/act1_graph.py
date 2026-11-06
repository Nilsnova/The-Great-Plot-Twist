"""Finite Act 1 state graph and reproducible move logs. Used by the G21 correctness tests.

A state key ignores the last message and the order of inventory/flags: neither controls a rule.
Cycles mean there are infinitely many move logs. We exhaust states and edges, then separately
sample longer histories with fixed seeds; we do not claim to enumerate infinite histories.
"""

import copy
import random
from collections import deque
from dataclasses import dataclass
from typing import Any

from plot_twist.engine import Game, GameState, Story

StateKey = tuple[str, frozenset[str], frozenset[str], bool]


def state_key(state: GameState) -> StateKey:
    return state.scene, frozenset(state.inventory), frozenset(state.flags), state.ended


def play(story: Story, moves: tuple[str, ...]) -> Game:
    game = Game(story=story, save_path=None)
    for index, move in enumerate(moves):
        assert game.perform(move).accepted, (index, move)
    return game


@dataclass
class Act1Graph:
    """One real prefix per state, all accepted transitions, and a shortest ending suffix."""

    story: Story
    prefixes: dict[StateKey, tuple[str, ...]]
    states: dict[StateKey, dict[str, Any]]
    edges: dict[StateKey, list[tuple[str, StateKey]]]
    suffixes: dict[StateKey, tuple[str, ...]]

    def edge_routes(self) -> list[tuple[str, ...]]:
        """Complete logs that collectively visit every accepted transition, including loops."""
        assert self.suffixes.keys() == self.states.keys(), "Some reachable state cannot finish"
        routes = {
            self.prefixes[before] + (move,) + self.suffixes[after]
            for before, edges in self.edges.items()
            for move, after in edges
        }
        return sorted(routes)

    def seeded_route(self, seed: int, steps: int = 150) -> tuple[str, ...]:
        """Wander for at most `steps` legal moves, then take a known route to an ending."""
        rng = random.Random(seed)
        game = Game(story=self.story, save_path=None)
        moves = []
        for _ in range(steps):
            if game.state.ended:
                break
            move, _following = rng.choice(self.edges[state_key(game.state)])
            assert game.perform(move).accepted
            moves.append(move)
        return tuple(moves) + self.suffixes[state_key(game.state)]


def build_graph(story: Story) -> Act1Graph:
    """Breadth-first traversal with a safety bound, and backward search from every ending."""
    game = Game(story=story, save_path=None)
    start = state_key(game.state)
    graph = Act1Graph(story, {start: ()}, {start: game.state.to_dict()}, {}, {})
    queue = deque([start])
    reverse: dict[StateKey, list[tuple[StateKey, str]]] = {}
    while queue:
        before = queue.popleft()
        graph.edges[before] = []
        data = graph.states[before]
        if data["ended"]:
            continue
        scene = story["scenes"][data["scene"]]
        for action in scene.get("actions", []):
            game.state = GameState.from_dict(copy.deepcopy(data))
            if not game.perform(action["id"]).accepted:
                continue
            after = state_key(game.state)
            graph.edges[before].append((action["id"], after))
            reverse.setdefault(after, []).append((before, action["id"]))
            if after not in graph.states:
                graph.prefixes[after] = graph.prefixes[before] + (action["id"],)
                graph.states[after] = game.state.to_dict()
                queue.append(after)
                assert len(graph.states) <= 10_000, "Act 1 traversal exceeded its safety bound"
    queue = deque(key for key in graph.states if key[3])
    graph.suffixes = dict.fromkeys(queue, ())
    while queue:
        after = queue.popleft()
        for before, move in reverse.get(after, []):
            if before not in graph.suffixes:
                graph.suffixes[before] = (move,) + graph.suffixes[after]
                queue.append(before)
    return graph
