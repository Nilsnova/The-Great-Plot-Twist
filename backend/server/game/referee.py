"""The referee: replays an Act 1 move log on the server and says how the story ended (package A3).

Why it exists: the browser plays Act 1 by itself and sends the list of moves it made, the move log.
The server cannot take the browser's word for how the story ended, because anybody can change the
code that runs in their own browser. So the server plays the same moves again, with the original
story engine (plot_twist/engine.py) on its own copy of the story (backend/content/story.json), and
only what that replay reaches counts. A kit comes from the replay, never from the request.

judge() checks, in this order:
  1. The log has at most MAX_MOVES moves. (The route refuses a longer log earlier, when it reads the
     request. This check is for code that calls judge() directly.)
  2. Every move is accepted by the engine at that point. The first move the engine does not accept
     refuses the whole log, and the message names its number. That covers a move that does not
     exist, a move of another scene, a blocked move (for example the tower door without the key)
     and any move after the ending.
  3. The story has ended. A log that stops earlier has no ending.
  4. The decision comes from the flags the story set. Warning the harbor master and trusting the
     fisherman shut each other out in the story. If both flags were ever set, the content is wrong
     and judge() raises ValueError instead of picking a kit.
  5. read_log is true if the player read the keeper's logbook.

The names of the flags come from entry_kits.json (game/entry_kits.py). The log carries no story
version. Story v2 adds actions but changes no rule, so an old log replays to the same end state.
A log that only a newer story allows is refused as move_refused, and the message tells the player to
reload the page. story_fingerprint() is the SHA-256 of the story file. It is stored with the entry
profile, so a later audit knows which story a profile was judged on. It is not required of the
browser.

This file is pure: no database, no web server. Replaying 300 moves takes a few milliseconds.

Used by: routes/intro.py and the tests.
"""

import hashlib
from dataclasses import dataclass
from pathlib import Path

from plot_twist.engine import STORY_PATH, Game, Story
from server.errors import ApiError
from server.game.entry_kits import EntryKits

# The longest move log the server will replay. The shortest way through Act 1 has 10 moves; 300
# leaves room for a player who wanders. The database repeats the number in the table rule
# entry_profiles_move_count_range, and a test compares the two.
MAX_MOVES = 300


@dataclass(frozen=True)
class Verdict:
    """How a replayed Act 1 ended."""

    ending: str  # the id of the ending scene, for example ending_trapped
    decision: str  # warned, trusted or none
    read_log: bool  # the player read the keeper's logbook
    move_count: int  # how many moves the log had


class MoveLogRefused(ApiError):
    """A move log the referee will not accept. Always a 422, and nothing is stored.

    The code says why: move_refused (a move the engine does not accept), no_ending (the moves stop
    before the story ends) or too_many_moves (more than MAX_MOVES).
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(422, code, message)


def story_fingerprint(path: Path = STORY_PATH) -> str:
    """The SHA-256 of the story file, as 64 hexadecimal characters."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replay(story: Story, actions: list[str]) -> Game:
    """Play the moves on a fresh game. Raises MoveLogRefused at the first move not accepted."""
    game = Game(story=story, save_path=None)  # no save path: the server never writes files
    for number, action_id in enumerate(actions, start=1):
        if not game.perform(action_id).accepted:
            raise MoveLogRefused(
                "move_refused",
                f"Move {number} is not possible at that point of the story. "
                "Reload the page and play Act 1 again.",
            )
    return game


def decide(flags: list[str], kits: EntryKits) -> str:
    """The decision the finished story stands for: warned, trusted or none."""
    trusted = kits.trusted_flag in flags
    warned = kits.warned_flag in flags
    if trusted and warned:
        raise ValueError(
            "The story set both decision flags at once, so it cannot say which kit to give. "
            "Check story.json and entry_kits.json."
        )
    if trusted:
        return "trusted"
    if warned:
        return "warned"
    return "none"


def judge(story: Story, kits: EntryKits, actions: list[str]) -> Verdict:
    """Replay the move log and say how Act 1 ended. Raises MoveLogRefused for a log to refuse."""
    if len(actions) > MAX_MOVES:
        raise MoveLogRefused("too_many_moves", f"A move log can have at most {MAX_MOVES} moves.")
    game = replay(story, actions)
    if not game.state.ended:
        raise MoveLogRefused("no_ending", "The moves stop before an ending.")
    return Verdict(
        ending=game.state.scene,
        decision=decide(game.state.flags, kits),
        read_log=kits.log_flag in game.state.flags,
        move_count=len(actions),
    )
