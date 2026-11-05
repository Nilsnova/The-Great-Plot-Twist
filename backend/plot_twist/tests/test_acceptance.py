"""Acceptance scenarios A1-A6 from the Plot Twist brief, plus checks on the story file.

These are the original tests of Nils' solo game (tests/test_acceptance.py at commit e235ee4),
ported with the same assertions. They are unittest classes, which pytest runs as they are.
The imports are unchanged. Three things differ:
  - the search for endings no longer needs a trick to avoid writing files (a Game without a
    save_path writes nothing);
  - that search has a safety bound (MAX_SEARCH_STATES), so a bug that makes states grow forever
    fails with a message instead of hanging the test run;
  - the unittest.main() block at the end is gone, because pytest starts the tests.

The story comes from backend/content/story.json (load_story reads it).

Used by: pytest (uv run pytest, from the backend folder).
"""

import os
import tempfile
import unittest

from plot_twist.engine import Game, GameState, load_story

# The real story has 122 reachable states. If the search for endings ever passes this many, a
# state keeps growing (for example a flag that is set twice) and the search would never end.
MAX_SEARCH_STATES = 10_000


class GameTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.save_path = os.path.join(self.tmp.name, "save.json")
        self.game = Game(save_path=self.save_path)
        self.game.new_game()

    def tearDown(self):
        self.tmp.cleanup()

    def play(self, *action_ids, game=None):
        game = game or self.game
        for action_id in action_ids:
            result = game.perform(action_id)
            self.assertTrue(result.accepted, f"{action_id} was rejected: {result.message}")

    def reopen(self):
        """Simulate closing and restarting the app."""
        game = Game(save_path=self.save_path)
        game.resume()
        return game


class TestAcceptance(GameTestCase):
    def test_a1_locked_route(self):
        self.play("to_tower")
        before = (self.game.state.scene, list(self.game.state.inventory))
        result = self.game.perform("unlock_door")
        self.assertFalse(result.accepted)
        self.assertIn("key", result.message)
        self.assertEqual((self.game.state.scene, self.game.state.inventory), before)

    def test_a2_unlocked_route(self):
        self.play("to_desk", "take_key", "desk_back", "to_tower", "unlock_door")
        self.assertEqual(self.game.state.scene, "stairwell")
        self.assertIn("brass_key", self.game.state.inventory)  # the key is not used up

    def test_a3_no_duplicate_collection(self):
        self.play("to_desk", "take_key", "desk_back", "to_desk")
        visible_ids = [a["id"] for a, _ in self.game.visible_actions()]
        self.assertNotIn("take_key", visible_ids)  # the drawer no longer offers a key
        self.assertFalse(self.game.perform("take_key").accepted)
        self.assertEqual(self.game.state.inventory.count("brass_key"), 1)
        self.assertIn("The drawer is empty now. You already took the key.", self.game.scene_notes())

    def test_a4_resume_correctly(self):
        self.play("to_shore", "take_lantern", "warn_harbor")
        routes_before = [(a["id"], ok) for a, ok in self.game.visible_actions()]

        resumed = self.reopen()
        self.assertEqual(resumed.state.scene, "shore")
        self.assertEqual(resumed.state.inventory, ["oil_lantern"])
        self.assertEqual(resumed.state.flags, ["warned_harbor"])
        self.assertEqual([(a["id"], ok) for a, ok in resumed.visible_actions()], routes_before)

    def test_a5_two_outcomes(self):
        # Path 1: warn the harbor, which unlocks the signal ending.
        self.play("to_desk", "take_key", "read_log", "desk_back",
                  "to_shore", "take_lantern", "warn_harbor", "shore_back",
                  "to_tower", "unlock_door", "climb", "signal")
        self.assertTrue(self.game.state.ended)
        self.assertEqual(self.game.state.scene, "ending_rescue")

        # Path 2: from a new game, trust the fisherman. The signal is then blocked.
        self.game.new_game()
        self.play("to_desk", "take_key", "desk_back",
                  "to_shore", "take_lantern", "trust_fisherman", "shore_back",
                  "to_tower", "unlock_door", "climb")
        self.assertFalse(self.game.perform("signal").accepted)
        self.play("untie")
        self.assertEqual(self.game.state.scene, "ending_trapped")

        # Once the story has ended, story actions cannot change it.
        finished = self.game.state.to_dict()
        self.assertEqual(self.game.visible_actions(), [])
        self.assertFalse(self.game.perform("signal").accepted)
        self.assertFalse(self.game.perform("untie").accepted)
        self.assertEqual(self.game.state.to_dict(), finished)
        self.assertEqual(self.reopen().state.to_dict(), finished)

    def test_a6_restart_safely(self):
        self.play("to_shore", "take_lantern", "trust_fisherman")
        saved = self.game.state.to_dict()

        # Cancelling means new_game() is never called, so nothing changes.
        self.assertEqual(self.reopen().state.to_dict(), saved)

        # Confirming the restart resets everything.
        self.game.new_game()
        for game in (self.game, self.reopen()):
            self.assertEqual(game.state.scene, "cottage")
            self.assertEqual(game.state.inventory, [])
            self.assertEqual(game.state.flags, [])
            self.assertFalse(game.state.ended)


class TestStoryContent(unittest.TestCase):
    def setUp(self):
        self.story = load_story()

    def test_minimum_size(self):
        self.assertGreaterEqual(len(self.story["scenes"]), 5)
        self.assertGreaterEqual(len(self.story["items"]), 2)
        endings = [s for s in self.story["scenes"].values() if s.get("ending")]
        self.assertGreaterEqual(len(endings), 2)

    def test_references_are_valid(self):
        scenes, items = self.story["scenes"], self.story["items"]
        for scene in scenes.values():
            for action in scene.get("actions", []):
                if "goto" in action:
                    self.assertIn(action["goto"], scenes)
                if "take" in action:
                    self.assertIn(action["take"], items)

    def test_every_ending_is_reachable(self):
        """R4: search every possible playthrough from a new game."""
        game = Game(story=self.story)  # no save_path, so exploring writes no files
        start = game.new_state()
        seen, queue, endings_reached = set(), [start.to_dict()], set()
        while queue:
            data = queue.pop()
            key = (data["scene"], tuple(sorted(data["inventory"])), tuple(sorted(data["flags"])))
            if key in seen:
                continue
            seen.add(key)
            self.assertLess(
                len(seen),
                MAX_SEARCH_STATES,
                "The search does not end: a state keeps growing, "
                "for example a flag that is set twice.",
            )
            if data["ended"]:
                endings_reached.add(data["scene"])
                continue
            game.state = GameState.from_dict(data)
            for action, allowed in game.visible_actions():
                if allowed:
                    game.state = GameState.from_dict(data)
                    game.perform(action["id"])
                    queue.append(game.state.to_dict())
        all_endings = {sid for sid, s in self.story["scenes"].items() if s.get("ending")}
        self.assertEqual(endings_reached, all_endings)
