"""Act 1 engine parity for every state/action and seeded history. Used by pytest."""

import json
import shutil
import subprocess
from pathlib import Path

from plot_twist.engine import Game, load_story
from plot_twist.tests.act1_graph import build_graph

RUNNER = Path(__file__).with_name("act1_correctness_runner.mjs")


def python_probe(story: dict, prefix: list[str], move: str) -> dict:
    game = Game(story=story, save_path=None)
    game.new_game()
    for prior in prefix:
        assert game.perform(prior).accepted
    result = game.perform(move)
    state = game.state.to_dict()
    return {
        "accepted": result.accepted,
        "message": result.message,
        "state": state,
        "visible": [[a["id"], ok] for a, ok in game.visible_actions()],
        "notes": game.scene_notes(),
        "resumed": True,
        "resumedState": state,
    }


def test_every_state_action_and_seeded_history_matches_browser_and_resume():
    # Node is a required gate for G21 parity; a skipped test cannot establish agreement.
    node = shutil.which("node")
    assert node is not None, "Node.js is required to compare the Python and browser engines"
    story = load_story()
    graph = build_graph(story)
    moves = sorted({
        action["id"]
        for scene in story["scenes"].values()
        for action in scene.get("actions", [])
    } | {"__unknown_action__"})
    cases = [{"prefix": list(prefix), "moves": moves} for prefix in graph.prefixes.values()]
    for seed in range(32):
        route = graph.seeded_route(seed)
        cases.extend(
            {"prefix": list(route[:index]), "moves": [move]}
            for index, move in enumerate(route)
        )
    output = subprocess.run(
        [node, str(RUNNER)], input=json.dumps({"story": story, "cases": cases}),
        capture_output=True, text=True, timeout=30, check=False,
    )
    assert output.returncode == 0, output.stderr
    web_cases = json.loads(output.stdout)
    for sample, web_steps in zip(cases, web_cases, strict=True):
        assert len(web_steps) == len(sample["moves"])
        for move, actual in zip(sample["moves"], web_steps, strict=True):
            assert actual == python_probe(story, sample["prefix"], move), (sample["prefix"], move)
