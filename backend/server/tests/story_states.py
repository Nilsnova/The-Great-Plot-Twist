"""Test helpers for the Act 1 story: the eight routes, a search for every ending, and Story v2.

The tests of the referee (test_referee.py), of the entry kits (test_entry_kits.py) and of the intro
route (test_intro_route.py) all need the same facts about the story, so they live here once:

  * the eight routes to the eight end states of today's story, each with the kit it must give,
  * end_states(), a search that finds every end state of ANY story (it does not trust the routes),
  * story_v2_fixture(), today's story plus the one action that Story v2 adds (keep_quiet).

The routes were replayed on the real engine and the real story.json: today's story has 122
reachable states, 8 of them end states. A route is a list of action ids, in the order the player
picks them. The words in the names say what the player did: WARNED means the note to the harbor
master (flag warned_harbor), TRUSTED means telling the fisherman (flag trusted_fisherman), SILENT
means neither. LOG means the player also read the keeper's logbook (flag read_log).

Used by: test_referee.py, test_entry_kits.py and test_intro_route.py.
"""

import copy
from collections import deque
from dataclasses import dataclass

from plot_twist.engine import Game, GameState, Story, load_story

# The pieces every route is made of. After TO_SHORE the player stands at the shore with the key and
# the lantern. After TO_LAMP they stand in the lamp room, where the last move picks the ending.
TO_SHORE = ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern"]
TO_SHORE_WITH_LOG = ["to_desk", "take_key", "read_log", "desk_back", "to_shore", "take_lantern"]
TO_LAMP = ["shore_back", "to_tower", "unlock_door", "climb"]


@dataclass(frozen=True)
class Route:
    """One way through Act 1, and what the referee must say about it."""

    name: str
    moves: list[str]
    ending: str
    decision: str
    read_log: bool
    kit: str


# The eight end states of today's story. Each is reached by exactly one kind of route.
ROUTES = [
    Route(
        "warned_rescue",
        TO_SHORE + ["warn_harbor"] + TO_LAMP + ["signal"],
        "ending_rescue",
        "warned",
        False,
        "true_keeper",
    ),
    Route(
        "warned_rescue_log",
        TO_SHORE_WITH_LOG + ["warn_harbor"] + TO_LAMP + ["signal"],
        "ending_rescue",
        "warned",
        True,
        "true_keeper",
    ),
    Route(
        "warned_trapped",
        TO_SHORE + ["warn_harbor"] + TO_LAMP + ["untie"],
        "ending_trapped",
        "warned",
        False,
        "witness",
    ),
    Route(
        "warned_trapped_log",
        TO_SHORE_WITH_LOG + ["warn_harbor"] + TO_LAMP + ["untie"],
        "ending_trapped",
        "warned",
        True,
        "witness",
    ),
    Route(
        "trusted_trapped",
        TO_SHORE + ["trust_fisherman"] + TO_LAMP + ["untie"],
        "ending_trapped",
        "trusted",
        False,
        "informant",
    ),
    Route(
        "trusted_trapped_log",
        TO_SHORE_WITH_LOG + ["trust_fisherman"] + TO_LAMP + ["untie"],
        "ending_trapped",
        "trusted",
        True,
        "informant",
    ),
    Route(
        "silent_trapped",
        TO_SHORE + TO_LAMP + ["untie"],
        "ending_trapped",
        "none",
        False,
        "stranger",
    ),
    Route(
        "silent_trapped_log",
        TO_SHORE_WITH_LOG + TO_LAMP + ["untie"],
        "ending_trapped",
        "none",
        True,
        "stranger",
    ),
]

# The routes that the other tests use by name.
WARNED_RESCUE = ROUTES[0].moves  # 11 moves
WARNED_TRAPPED = ROUTES[2].moves  # 11 moves
TRUSTED_TRAPPED = ROUTES[4].moves  # 11 moves
SILENT_TRAPPED = ROUTES[6].moves  # 10 moves
SILENT_TRAPPED_WITH_LOG = ROUTES[7].moves  # 11 moves

# A state of the story, in a form a set can hold: the scene, the items, the flags and whether the
# story has ended. The order of items and flags does not matter, so they are frozen sets.
StateKey = tuple[str, frozenset[str], frozenset[str], bool]


def key_of(state: GameState) -> StateKey:
    return (state.scene, frozenset(state.inventory), frozenset(state.flags), state.ended)


def state_after(story: Story, key: StateKey, action_id: str) -> StateKey | None:
    """The state that follows if the player picks `action_id` in state `key`.

    None if the engine does not accept that action there.
    """
    scene, items, flags, ended = key
    game = Game(story=story, save_path=None)
    game.state = GameState(scene=scene, inventory=sorted(items), flags=sorted(flags), ended=ended)
    if not game.perform(action_id).accepted:
        return None
    return key_of(game.state)


def reachable_states(story: Story) -> set[StateKey]:
    """Every state a player can reach, found by trying every action of every state in turn.

    This is a breadth-first search: first the start state, then everything one move away, and so on
    until nothing new turns up. It plays the real engine, so it knows nothing about the routes.
    """
    start = key_of(Game(story=story, save_path=None).state)
    seen = {start}
    queue = deque([start])
    while queue:
        key = queue.popleft()
        scene, _items, _flags, ended = key
        if ended:
            continue
        for action in story["scenes"][scene].get("actions", []):
            following = state_after(story, key, action["id"])
            if following is not None and following not in seen:
                seen.add(following)
                queue.append(following)
    return seen


def end_states(story: Story) -> set[StateKey]:
    """Every state in which the story has ended."""
    return {key for key in reachable_states(story) if key[3]}


# The one action Story v2 adds at the shore (STORY-V2-CHANGES.md, change 5): a third choice that
# sets no flag, for the player who takes no side. It is the stand-in the tests use until the story
# branch is merged, and it changes no rule of the engine: it has no goto, no take and no set.
KEEP_QUIET = {
    "id": "keep_quiet",
    "label": "Say nothing to anyone",
    "requires": {"not_flags": ["trusted_fisherman", "warned_harbor"]},
    "hide_when_blocked": True,
    "message": "You keep what you know to yourself and watch the fisherman tie up his red boat.",
}


def story_v2_fixture() -> Story:
    """A copy of today's story with keep_quiet added at the shore, right after warn_harbor."""
    story = copy.deepcopy(load_story())
    actions = story["scenes"]["shore"]["actions"]
    position = [action["id"] for action in actions].index("warn_harbor") + 1
    actions.insert(position, copy.deepcopy(KEEP_QUIET))
    return story
