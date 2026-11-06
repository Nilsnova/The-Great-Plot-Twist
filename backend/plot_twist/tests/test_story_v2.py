"""Tests for Story v2: the small content edits to backend/content/story.json (decision 2).

Story v2 changes words, not rules. Every scene id and action id stays, no flag or item is added and
the engines stay as they are. These tests pin down what the new words must do:
  - one ending line for each decision, each with its own "Plot twist:" line;
  - a third choice for saying nothing;
  - a lead for players who read the log;
  - hints that every player sees: the seal on the key, the circled nights, the torn page and the
    lit window;
  - two shore fixes: the red boat is described only while it is tied up, and the warned note shows
    the window answering before the boat slips away.

The original tests (test_acceptance.py and the others) stay as they are, except one:
test_a_note_is_shown_only_while_its_conditions_hold in test_engine_rules.py. Story v2 shows one more
shore note (the fisherman tying up the red boat) to a player who trusted the fisherman, so that
test now finds the shore notes by their conditions and still checks the exact list. The helpers
that search every playthrough are in story_search.py.

Used by: pytest (uv run pytest, from the backend folder). The parity tests for the new routes are
in test_web_parity.py and use the route lists defined here.
"""

from plot_twist.engine import Game, Story
from plot_twist.tests.story_search import (
    allowed_action_ids,
    end_inventories,
    end_states,
    everything_shown,
    flags_set_but_never_checked,
    profiles,
    shown_in_each_trapped_end_state,
    visible_action_ids,
)
from plot_twist.tests.test_acceptance import GameTestCase

# ---------- The routes the tests play ----------

# From a new game to the shore, with the key and the lantern in the inventory.
TO_SHORE_WITH_ITEMS = ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern"]
# From the shore up to the lamp room.
TO_LAMP_ROOM = ["shore_back", "to_tower", "unlock_door", "climb"]
# The three routes that end locked in the tower. They differ only in the choice at the shore.
TRUSTED_TRAPPED = TO_SHORE_WITH_ITEMS + ["trust_fisherman"] + TO_LAMP_ROOM + ["untie"]
WARNED_TRAPPED = TO_SHORE_WITH_ITEMS + ["warn_harbor"] + TO_LAMP_ROOM + ["untie"]
SILENT_TRAPPED = TO_SHORE_WITH_ITEMS + ["keep_quiet"] + TO_LAMP_ROOM + ["untie"]

# ---------- The words the tests look for ----------

# The three lines a locked-in player hears through the door, one for each decision.
THANKS_LINE = "'Thanks for telling me where to look,' he called."
NEVER_CAME_LINE = "The harbor master never came."
STRANGER_LINE = "'Whoever you are, nobody knows you're up there.'"
DECISION_LINES = [THANKS_LINE, NEVER_CAME_LINE, STRANGER_LINE]
# Each of the three lines ends with one sentence that starts with these words.
PLOT_TWIST = "Plot twist:"

SEAL = "an anchor with an open eye"
CIRCLED_NIGHTS = "Three nights in the tide tables are circled"
TORN_PAGE = "A page has been torn out of the logbook."
TORN_PAGE_LEAD = "'old watchtower'"
LIT_WINDOW = "Across the bay, the harbor master's window glows."
TIED_UP_BOAT = "A fisherman in a yellow coat is tying up a red boat."

# The choices on the shore when you arrive, in the order they are listed.
SHORE_CHOICES_ON_ARRIVAL = [
    "take_lantern",
    "trust_fisherman",
    "warn_harbor",
    "keep_quiet",
    "shore_back",
]

# ---------- The 8 end states ----------

# Each end state as (ending scene, decision, has read the log). The decision is read from the
# flags: "trusted", "warned", or "none" when neither choice was made.
EIGHT_END_STATES = {
    ("ending_rescue", "warned", False),
    ("ending_rescue", "warned", True),
    ("ending_trapped", "warned", False),
    ("ending_trapped", "warned", True),
    ("ending_trapped", "trusted", False),
    ("ending_trapped", "trusted", True),
    ("ending_trapped", "none", False),
    ("ending_trapped", "none", True),
}
# Warned, trusted and never decided, each with and without the log read.
TRAPPED_END_STATES = 6

# ---------- Helpers for this file ----------


def snapshot(game: Game) -> tuple[str, list[str], list[str]]:
    """The scene, the inventory and the flags, copied so later moves cannot change them."""
    return (game.state.scene, list(game.state.inventory), list(game.state.flags))


def decision_line_counts(story: Story) -> list[int]:
    """For each trapped end state, how many of the three decision lines it shows."""
    return [
        sum(line in shown for line in DECISION_LINES)
        for shown in shown_in_each_trapped_end_state(story)
    ]


def plot_twist_line_counts(story: Story) -> list[int]:
    """For each trapped end state, how many "Plot twist:" lines it shows."""
    return [shown.count(PLOT_TWIST) for shown in shown_in_each_trapped_end_state(story)]


# ---------- The tests ----------


class TestEndingLines(GameTestCase):
    def test_trapped_after_trusting_keeps_the_thanks_line(self):
        self.play(*TRUSTED_TRAPPED)
        self.assertEqual(self.game.state.scene, "ending_trapped")
        self.assertIn(THANKS_LINE, everything_shown(self.game))

    def test_trapped_after_warning_says_the_harbor_master_never_came(self):
        self.play(*WARNED_TRAPPED)
        self.assertIn(NEVER_CAME_LINE, everything_shown(self.game))
        self.assertNotIn("Thanks for telling me where to look", everything_shown(self.game))

    def test_trapped_after_telling_no_one_shows_the_stranger_line(self):
        self.play(*SILENT_TRAPPED)
        self.assertIn(STRANGER_LINE, everything_shown(self.game))

    def test_each_trapped_end_state_shows_exactly_one_decision_line(self):
        counts = decision_line_counts(self.game.story)
        self.assertEqual(counts, [1] * TRAPPED_END_STATES)

    def test_each_trapped_end_state_shows_exactly_one_plot_twist_line(self):
        counts = plot_twist_line_counts(self.game.story)
        self.assertEqual(counts, [1] * TRAPPED_END_STATES)


class TestEndStates(GameTestCase):
    def test_story_has_exactly_eight_end_states(self):
        self.assertEqual(len(end_states(self.game.story)), len(EIGHT_END_STATES))
        self.assertEqual(profiles(self.game.story), EIGHT_END_STATES)

    def test_every_end_state_holds_the_key_and_the_lantern(self):
        self.assertEqual(end_inventories(self.game.story), {("brass_key", "oil_lantern")})


class TestThirdPath(GameTestCase):
    def test_tell_no_one_is_offered_only_before_a_decision(self):
        self.play("to_shore")
        self.assertIn("keep_quiet", allowed_action_ids(self.game))
        self.play("warn_harbor")
        self.assertNotIn("keep_quiet", visible_action_ids(self.game))

    def test_tell_no_one_is_gone_after_trusting_the_fisherman(self):
        self.play("to_shore", "trust_fisherman")
        self.assertNotIn("keep_quiet", visible_action_ids(self.game))

    def test_tell_no_one_comes_after_the_warning_and_before_the_way_back(self):
        self.play("to_shore")
        self.assertEqual(visible_action_ids(self.game), SHORE_CHOICES_ON_ARRIVAL)

    def test_tell_no_one_changes_no_state(self):
        self.play("to_shore")  # nothing in hand yet, so a stray item would show
        before = snapshot(self.game)
        self.play("keep_quiet")
        self.assertEqual(snapshot(self.game), before)


class TestLogCard(GameTestCase):
    def test_reading_the_log_shows_the_torn_page_lead(self):
        self.play("to_desk")
        self.assertNotIn(TORN_PAGE_LEAD, everything_shown(self.game))
        self.play("read_log")
        self.assertIn(TORN_PAGE_LEAD, everything_shown(self.game))

    def test_every_set_flag_is_checked_somewhere(self):
        self.assertEqual(flags_set_but_never_checked(self.game.story), [])


class TestPlantedHints(GameTestCase):
    def test_key_tag_shows_the_seal(self):
        self.play("to_desk", "take_key")
        self.assertIn(SEAL, self.game.state.message)
        descriptions = dict(self.game.inventory_details())
        self.assertIn(SEAL, descriptions["Brass key"])

    def test_desk_shows_the_circled_nights_and_the_torn_page(self):
        self.play("to_desk")
        self.assertIn(CIRCLED_NIGHTS, self.game.scene["text"])
        self.assertIn(TORN_PAGE, self.game.scene["text"])

    def test_shore_shows_the_lit_window_before_any_choice(self):
        self.play("to_shore")
        self.assertIn(LIT_WINDOW, self.game.scene["text"])


class TestShoreFixes(GameTestCase):
    def test_warned_note_shows_the_window_before_the_boat_leaves(self):
        self.play("to_shore", "warn_harbor")
        shown = everything_shown(self.game)
        self.assertIn("window goes dark", shown)
        self.assertIn("red boat slips away", shown)
        self.assertLess(shown.index("window goes dark"), shown.index("red boat slips away"))

    def test_tied_up_red_boat_shows_only_until_the_warning(self):
        self.play("to_shore")
        self.assertIn(TIED_UP_BOAT, everything_shown(self.game))
        self.play("warn_harbor")
        self.assertNotIn(TIED_UP_BOAT, everything_shown(self.game))

    def test_tied_up_red_boat_still_shows_after_trusting_the_fisherman(self):
        self.play("to_shore", "trust_fisherman")
        self.assertIn(TIED_UP_BOAT, everything_shown(self.game))
