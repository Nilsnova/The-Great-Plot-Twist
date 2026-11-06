"""Captain names: the word lists and the plain rules that turn them into "Brave Puffin 17".

Why the server makes the names (decision D006): names appear on a projector. They must never come
from a login, because a player controls their own GitHub name, and never from free text. A captain
name is an adjective, a noun and a number from 10 to 99, picked from the lists in
backend/content/names.json. Every word in those lists is kind and plain. A new player gets one name,
and may re-roll it once (routes/captain_name.py).

This file holds only the rules, as plain functions that need no database and no web server:
  * load_word_lists reads and checks names.json, and stops with a clear message if it is broken,
  * pick_name and pick_new_name make a name (a re-roll never gives the same name back),
  * placeholder_name says what the sign-up trigger called the player before they got a name,
  * is_valid_display_name repeats the rules of the database column profiles.display_name.

Used by: account/name_store.py, routes/captain_name.py and routes/me.py.
"""

import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

from plot_twist.engine import CONTENT_DIR

# PENDING Nils' decision (N9 in specs/M1-backbone.md): the words need a human look before a class
# sees them. Names appear on a projector. The pairs to look at are listed in
# backend/content/README.md, in the section about names.json.
NAMES_PATH = CONTENT_DIR / "names.json"

# The sign-up trigger (handle_new_user in the foundation migration) names every new player
# "Captain-" and the first 6 characters of their id. A test compares both numbers with the SQL.
PLACEHOLDER_PREFIX = "Captain-"
PLACEHOLDER_ID_LENGTH = 6

# A name ends with a number from 10 to 99, so it always has two digits.
LOWEST_NUMBER = 10
HIGHEST_NUMBER = 99

# A player may change their generated name once.
MAX_REROLLS = 1

# One word: a capital letter and then 1 to 11 small letters, so 2 to 12 letters in all.
WORD_PATTERN = r"[A-Z][a-z]{1,11}"
MIN_WORDS_PER_LIST = 32

# The rules of the database column profiles.display_name (foundation migration, section 2).
DISPLAY_NAME_MIN_LENGTH = 2
DISPLAY_NAME_MAX_LENGTH = 24
DISPLAY_NAME_PATTERN = r"[A-Za-z0-9 _.-]+"

# Two spaces and the two digits of the number, around the two words of a name.
SPACES_AND_NUMBER_LENGTH = 2 + len(str(HIGHEST_NUMBER))

# A module constant, because ruff refuses a function call in a default value (rule B008).
SYSTEM_RANDOM = random.SystemRandom()


@dataclass(frozen=True)
class WordLists:
    """The two lists a name is made from."""

    adjectives: tuple[str, ...]
    nouns: tuple[str, ...]


def read_word_list(content: dict, key: str) -> tuple[str, ...]:
    """One list of words from names.json. Raises ValueError if it is not a good list."""
    words = content.get(key)
    if not isinstance(words, list):
        raise ValueError(f"names.json needs a list called '{key}'.")
    for word in words:
        if not isinstance(word, str) or not re.fullmatch(WORD_PATTERN, word):
            raise ValueError(
                f"names.json, '{key}': {word!r} must be one word of 2 to 12 letters, "
                "A-Z and a-z, with a capital first letter."
            )
    if len(words) < MIN_WORDS_PER_LIST:
        raise ValueError(
            f"names.json, '{key}' needs at least {MIN_WORDS_PER_LIST} words (it has {len(words)})."
        )
    return tuple(words)


def check_no_word_twice(adjectives: tuple[str, ...], nouns: tuple[str, ...]) -> None:
    """No word may appear twice, neither inside one list nor in both lists."""
    seen: set[str] = set()
    for word in (*adjectives, *nouns):
        if word in seen:
            raise ValueError(f"The word '{word}' appears twice in names.json.")
        seen.add(word)


def check_longest_name_fits(adjectives: tuple[str, ...], nouns: tuple[str, ...]) -> None:
    """The longest adjective with the longest noun must still be a name the database accepts."""
    longest_adjective = max(len(word) for word in adjectives)
    longest_noun = max(len(word) for word in nouns)
    longest_name = longest_adjective + longest_noun + SPACES_AND_NUMBER_LENGTH
    if longest_name > DISPLAY_NAME_MAX_LENGTH:
        raise ValueError(
            f"The longest possible name would have {longest_name} characters, but a display "
            f"name has at most {DISPLAY_NAME_MAX_LENGTH}. Use shorter words in names.json."
        )


def load_word_lists(path: Path = NAMES_PATH) -> WordLists:
    """Read and check the word lists. Raises ValueError, with the problem in words, if it fails."""
    with open(path, encoding="utf-8") as file:
        try:
            content = json.load(file)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path.name} is not valid JSON.") from error
    if not isinstance(content, dict):
        raise ValueError(f"{path.name} must be a JSON object with the lists adjectives and nouns.")
    adjectives = read_word_list(content, "adjectives")
    nouns = read_word_list(content, "nouns")
    check_no_word_twice(adjectives, nouns)
    check_longest_name_fits(adjectives, nouns)
    return WordLists(adjectives=adjectives, nouns=nouns)


def placeholder_name(player_id: str) -> str:
    """The name the sign-up trigger gives a new player, for example Captain-3fa85f."""
    return PLACEHOLDER_PREFIX + player_id[:PLACEHOLDER_ID_LENGTH]


def is_placeholder(name: str, player_id: str) -> bool:
    """True if `name` is still the sign-up placeholder of this player: no captain name yet."""
    return name == placeholder_name(player_id)


def is_valid_display_name(name: str) -> bool:
    """True if the database would accept this display name (2 to 24 characters, no outer space)."""
    if not DISPLAY_NAME_MIN_LENGTH <= len(name) <= DISPLAY_NAME_MAX_LENGTH:
        return False
    if re.fullmatch(DISPLAY_NAME_PATTERN, name) is None:
        return False
    return name == name.strip(" ")


def format_name(adjective: str, noun: str, number: int) -> str:
    return f"{adjective} {noun} {number}"


def pick_parts(words: WordLists, rng: random.Random) -> tuple[str, str, int]:
    """An adjective, a noun and a number, picked at random."""
    adjective = rng.choice(words.adjectives)
    noun = rng.choice(words.nouns)
    number = rng.randint(LOWEST_NUMBER, HIGHEST_NUMBER)
    return adjective, noun, number


def next_number(number: int) -> int:
    """The number after this one. The highest number is followed by the lowest."""
    if number >= HIGHEST_NUMBER:
        return LOWEST_NUMBER
    return number + 1


def pick_name(words: WordLists, rng: random.Random = SYSTEM_RANDOM) -> str:
    """A new captain name, for example Brave Puffin 17. Pass a seeded Random in a test."""
    adjective, noun, number = pick_parts(words, rng)
    return format_name(adjective, noun, number)


def pick_new_name(words: WordLists, current: str, rng: random.Random = SYSTEM_RANDOM) -> str:
    """A captain name that is not `current`, for the re-roll.

    If the pick happens to be the current name, the number moves on by one. That makes the result
    different for certain, without a loop that could run for long.
    """
    adjective, noun, number = pick_parts(words, rng)
    if format_name(adjective, noun, number) == current:
        number = next_number(number)
    return format_name(adjective, noun, number)
