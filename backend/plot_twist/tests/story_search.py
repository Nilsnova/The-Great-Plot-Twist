"""Helpers for the Story v2 tests: what the player sees, and searches over every playthrough.

A search tries every allowed action from a new game, the same way test_every_ending_is_reachable
does, and writes no files (a Game without a save_path never opens one). The loops live here, not in
the tests, so each test reads as one behavior (docs/ENGINEERING.md, section 5).

Used by: test_story_v2.py.
"""

from typing import Any

from plot_twist.engine import Game, GameState, Story
from plot_twist.tests.test_acceptance import MAX_SEARCH_STATES

# ---------- What the player sees ----------


def everything_shown(game: Game) -> str:
    """The scene text and its notes, as one string."""
    return " ".join([game.scene["text"]] + game.scene_notes())


def allowed_action_ids(game: Game) -> list[str]:
    """The ids of the choices on screen that the player may take."""
    return [action["id"] for action, allowed in game.visible_actions() if allowed]


def visible_action_ids(game: Game) -> list[str]:
    """The ids of every choice on screen, including locked ones."""
    return [action["id"] for action, _allowed in game.visible_actions()]


# ---------- Searches over every playthrough ----------


def states_after_each_allowed_action(game: Game, data: dict[str, Any]) -> list[dict[str, Any]]:
    """The states a player reaches from one state by taking one allowed action."""
    game.state = GameState.from_dict(data)
    action_ids = allowed_action_ids(game)
    reached = []
    for action_id in action_ids:
        game.state = GameState.from_dict(data)
        game.perform(action_id)
        reached.append(game.state.to_dict())
    return reached


def reachable_states(story: Story) -> list[dict[str, Any]]:
    """Every state a player can reach, found by trying every allowed action from a new game."""
    game = Game(story=story)  # no save_path, so searching writes no files
    queue = [game.new_state().to_dict()]
    seen, states = set(), []
    while queue:
        data = queue.pop()
        key = (data["scene"], tuple(sorted(data["inventory"])), tuple(sorted(data["flags"])))
        if key in seen:
            continue
        seen.add(key)
        states.append(data)
        assert len(states) < MAX_SEARCH_STATES, "The search does not end: a state keeps growing."
        if not data["ended"]:
            queue.extend(states_after_each_allowed_action(game, data))
    return states


def end_states(story: Story) -> list[dict[str, Any]]:
    """The reachable states in which the story has ended."""
    return [state for state in reachable_states(story) if state["ended"]]


def decision_of(flags: list[str]) -> str:
    """Which choice the flags show: trusted, warned, or none when neither flag is on."""
    if "trusted_fisherman" in flags:
        return "trusted"
    if "warned_harbor" in flags:
        return "warned"
    return "none"


def profiles(story: Story) -> set[tuple[str, str, bool]]:
    """(ending scene, decision, has read the log) for every end state."""
    return {
        (state["scene"], decision_of(state["flags"]), "read_log" in state["flags"])
        for state in end_states(story)
    }


def shown_in_each_trapped_end_state(story: Story) -> list[str]:
    """Everything the player sees in each end state that ends locked in the tower."""
    game = Game(story=story)
    texts = []
    for state in end_states(story):
        if state["scene"] == "ending_trapped":
            game.state = GameState.from_dict(state)
            texts.append(everything_shown(game))
    return texts


def end_inventories(story: Story) -> set[tuple[str, ...]]:
    """The inventory (sorted item ids) of every end state, without repeats."""
    return {tuple(sorted(state["inventory"])) for state in end_states(story)}


def flags_checked_by(conditions: dict[str, list[str]]) -> set[str]:
    """The flags a conditions object looks at, whether it wants them on or off."""
    return set(conditions.get("flags", [])) | set(conditions.get("not_flags", []))


def flags_set_but_never_checked(story: Story) -> list[str]:
    """Flags that some action sets but that no `requires` and no note `when` ever looks at."""
    set_flags, checked_flags = set(), set()
    for scene in story["scenes"].values():
        for action in scene.get("actions", []):
            set_flags.update(action.get("set", []))
            checked_flags |= flags_checked_by(action.get("requires", {}))
        for note in scene.get("notes", []):
            checked_flags |= flags_checked_by(note["when"])
    return sorted(set_flags - checked_flags)
