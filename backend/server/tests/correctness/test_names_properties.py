"""Exhaustive captain-name contracts and seeded generator regressions for G21.

These tests read only the public-in-the-repository name vocabulary. The small forbidden-token
list catches explicit regressions; it does not replace the pending human review of every word
and combination recorded in backend/content/README.md.
"""

import json
import random
import re
from dataclasses import dataclass
from itertools import product

from server.account.names import (
    NAMES_PATH,
    is_valid_display_name,
    load_word_lists,
    pick_name,
    pick_new_name,
)

# A deliberately small, inspectable regression list, not a claim about every language or joke.
FORBIDDEN_TOKENS = frozenset(
    {
        "bastard",
        "crap",
        "damn",
        "dumb",
        "fuck",
        "idiot",
        "moron",
        "nazi",
        "shit",
        "stupid",
        "ugly",
    }
)
SEEDS = (21, 2106, 20261106)


def assert_profile_contract(name: str) -> None:
    """Use the documented column grammar, independently of the production validator."""
    assert 2 <= len(name) <= 24
    assert re.fullmatch(r"[A-Za-z0-9 _.-]+", name)
    assert name == name.strip(" ")
    assert is_valid_display_name(name)


@dataclass
class ChosenParts:
    """Force every possible RNG outcome without depending on a lucky random sample."""

    adjective: str
    noun: str
    number: int
    choices: int = 0

    def choice(self, values: tuple[str, ...]) -> str:
        assert self.choices < 2
        chosen = (self.adjective, self.noun)[self.choices]
        assert chosen in values
        self.choices += 1
        return chosen

    def randint(self, lowest: int, highest: int) -> int:
        assert (lowest, highest) == (10, 99)
        assert self.choices == 2
        return self.number


def test_vocabulary_has_no_case_insensitive_duplicates_or_forbidden_tokens():
    raw = json.loads(NAMES_PATH.read_text(encoding="utf-8"))
    words = raw["adjectives"] + raw["nouns"]
    folded = [word.casefold() for word in words]

    assert len(folded) == len(set(folded))
    assert set(folded).isdisjoint(FORBIDDEN_TOKENS)
    # Whole tokens avoid false positives such as finding a short insult inside "Compass".
    assert all(re.fullmatch(r"[A-Z][a-z]{1,11}", word) for word in words)


def test_every_possible_generated_name_is_unique_and_fits_profile_rules():
    words = load_word_lists()
    seen = set()

    for adjective, noun, number in product(words.adjectives, words.nouns, range(10, 100)):
        name = pick_name(words, ChosenParts(adjective, noun, number))
        assert name == f"{adjective} {noun} {number}"
        assert_profile_contract(name)
        assert name not in seen
        seen.add(name)

    assert len(seen) == len(words.adjectives) * len(words.nouns) * 90


def test_forced_reroll_collision_wraps_correctly_for_every_suffix():
    words = load_word_lists()
    adjective = max(words.adjectives, key=len)
    noun = max(words.nouns, key=len)

    for number in range(10, 100):
        current = f"{adjective} {noun} {number}"
        new_name = pick_new_name(words, current, ChosenParts(adjective, noun, number))
        expected_number = 10 if number == 99 else number + 1
        assert new_name == f"{adjective} {noun} {expected_number}"
        assert new_name != current
        assert_profile_contract(new_name)


def test_seeded_generation_and_rerolls_cover_the_complete_vocabulary():
    words = load_word_lists()
    for seed in SEEDS:
        rng = random.Random(seed)
        again = random.Random(seed)
        adjectives, nouns, numbers = set(), set(), set()
        current = "Captain-000000"

        for _ in range(4000):
            generated = pick_name(words, rng)
            assert generated == pick_name(words, again)
            assert_profile_contract(generated)
            adjective, noun, number = generated.split(" ")
            assert adjective in words.adjectives
            assert noun in words.nouns
            assert re.fullmatch(r"[1-9][0-9]", number)
            adjectives.add(adjective)
            nouns.add(noun)
            numbers.add(int(number))

            rerolled = pick_new_name(words, current, rng)
            assert rerolled == pick_new_name(words, current, again)
            assert rerolled != current
            assert_profile_contract(rerolled)
            current = rerolled

        assert adjectives == set(words.adjectives)
        assert nouns == set(words.nouns)
        assert numbers == set(range(10, 100))
