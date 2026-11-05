"""Check that the browser engine (frontend/src/story/engine.js) follows exactly the same rules
as the Python engine (plot_twist/engine.py).

How it works: both engines play the same lists of moves on the same story, which is
backend/content/story.json (load_story reads it and hands the very same data to Node.js).
After every move the test compares what each engine says: was the move accepted, which message
came back, what is the state, which actions are visible and which notes are shown. Any
difference fails the test.

This is the original parity test of Nils' solo game (tests/test_web_parity.py at commit
e235ee4), with the same moves and the same assertions. Two things differ. The message of every
move is compared too, so the fixed texts for refused moves cannot drift apart. And each test
sends all its move lists to Node.js in one run, because starting Node.js takes about 0.2
seconds and the original started it again for each of the 62 lists. The test needs Node.js and
is skipped, with a reason, when Node.js is not installed.

Story v2 adds two tests at the end of the class. They play the routes that end locked in the tower
after warning the harbor and after telling no one (the third choice at the shore). The two
original tests are unchanged. The route lists come from test_story_v2.py.

Used by: pytest (uv run pytest, from the backend folder).
"""

import json
import random
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any

from plot_twist.engine import Game, Story, load_story
from plot_twist.tests.test_story_v2 import SILENT_TRAPPED, WARNED_TRAPPED

RUNNER = Path(__file__).resolve().parent / "parity_runner.mjs"

NODE_MISSING = (
    "Node.js is not installed, so the Python and JavaScript engines cannot be compared. "
    "Install Node.js 22 or newer from https://nodejs.org to run this test."
)


@unittest.skipIf(shutil.which("node") is None, NODE_MISSING)
class TestWebParity(unittest.TestCase):
    def play_in_python(self, story: Story, actions: list[str]) -> list[dict[str, Any]]:
        """What the Python engine reports after each move of one list."""
        game = Game(story=story)  # no save_path: the Python engine writes no file here
        game.new_game()
        steps = []
        for action_id in actions:
            result = game.perform(action_id)
            steps.append({
                "accepted": result.accepted,
                "message": result.message,
                "state": game.state.to_dict(),
                "visible": [[a["id"], ok] for a, ok in game.visible_actions()],
                "notes": game.scene_notes(),
            })
        return steps

    def play_in_javascript(
        self, story: Story, playthroughs: list[list[str]]
    ) -> list[dict[str, Any]]:
        """What the JavaScript engine reports for several move lists, from one Node.js run."""
        output = subprocess.run(
            ["node", str(RUNNER)],
            input=json.dumps({"story": story, "playthroughs": playthroughs}),
            capture_output=True, text=True,
        )
        # Show Node.js's own error text if the runner or the JavaScript engine crashed.
        self.assertEqual(output.returncode, 0, output.stderr)
        return json.loads(output.stdout)

    def test_random_playthroughs_match(self):
        story = load_story()
        all_ids = [a["id"] for s in story["scenes"].values() for a in s.get("actions", [])]
        playthroughs = []
        for seed in range(60):
            rng = random.Random(seed)
            playthroughs.append([rng.choice(all_ids) for _ in range(60)])
        js_results = self.play_in_javascript(story, playthroughs)

        # strict=True: if one engine gave fewer answers than the other, that is an error.
        for seed, (actions, js) in enumerate(zip(playthroughs, js_results, strict=True)):
            python_steps = self.play_in_python(story, actions)
            for i, (py, web) in enumerate(zip(python_steps, js["steps"], strict=True)):
                self.assertEqual(py, web, f"seed {seed}, step {i} ({actions[i]})")
            self.assertTrue(js["resumed"])
            self.assertEqual(js["resumedState"], python_steps[-1]["state"])

    def test_both_endings(self):
        good = ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern", "warn_harbor",
                "shore_back", "to_tower", "unlock_door", "climb", "signal"]
        bad = ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern", "trust_fisherman",
               "shore_back", "to_tower", "unlock_door", "climb", "signal", "untie", "signal"]
        story = load_story()
        good_js, bad_js = self.play_in_javascript(story, [good, bad])
        cases = ((good, good_js, "ending_rescue"), (bad, bad_js, "ending_trapped"))
        for actions, js, ending in cases:
            python_steps = self.play_in_python(story, actions)
            self.assertEqual(python_steps, js["steps"])
            self.assertEqual(js["steps"][-1]["state"]["scene"], ending)
            self.assertTrue(js["steps"][-1]["state"]["ended"])

    def check_trapped_route_matches(self, actions: list[str]) -> None:
        """Both engines agree at every step of the route, and it ends locked in the tower."""
        story = load_story()
        (js,) = self.play_in_javascript(story, [actions])
        python_steps = self.play_in_python(story, actions)
        self.assertEqual(python_steps, js["steps"])
        self.assertEqual(js["steps"][-1]["state"]["scene"], "ending_trapped")
        self.assertTrue(js["steps"][-1]["state"]["ended"])

    def test_trapped_after_warning_matches(self):
        self.check_trapped_route_matches(WARNED_TRAPPED)

    def test_trapped_after_telling_no_one_matches(self):
        self.check_trapped_route_matches(SILENT_TRAPPED)
