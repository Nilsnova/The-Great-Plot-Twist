"""Tests for account/names.py: the word lists and the rules that make a captain name.

Everything here is pure: no database, no network. Anything random uses a seeded random.Random, so
a test gives the same names on every run. The first part reads backend/content/names.json (the
real word lists); the second part checks the loader with broken files.
"""

import json
import random
import re
from pathlib import Path

import pytest

from plot_twist.engine import CONTENT_DIR
from server.account.names import (
    HIGHEST_NUMBER,
    LOWEST_NUMBER,
    NAMES_PATH,
    PLACEHOLDER_ID_LENGTH,
    PLACEHOLDER_PREFIX,
    SYSTEM_RANDOM,
    WORD_PATTERN,
    WordLists,
    is_placeholder,
    is_valid_display_name,
    load_word_lists,
    pick_name,
    pick_new_name,
    placeholder_name,
)
from server.routes.content import PUBLIC_CONTENT
from server.tests.helpers import REPO_ROOT

FOUNDATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"
PLAYER_ID = "11111111-2222-3333-4444-555555555555"

WORDS = load_word_lists()


class ChosenNumber(random.Random):
    """A random generator that always picks the same number. It lets a test force a repeat."""

    def __init__(self, number: int) -> None:
        super().__init__(0)
        self.number = number

    def randint(self, a: int, b: int) -> int:
        return self.number


# --- the word lists ---


def test_the_names_file_is_in_the_content_folder():
    assert NAMES_PATH == CONTENT_DIR / "names.json"
    assert NAMES_PATH.is_file()


def test_the_word_lists_load_with_at_least_32_words_each():
    assert len(WORDS.adjectives) >= 32
    assert len(WORDS.nouns) >= 32


@pytest.mark.parametrize("word", [*WORDS.adjectives, *WORDS.nouns])
def test_every_word_is_one_capitalised_word_of_letters(word):
    assert re.fullmatch(WORD_PATTERN, word)


def test_no_word_appears_twice():
    everything = [*WORDS.adjectives, *WORDS.nouns]

    assert len(everything) == len(set(everything))


def test_the_word_lists_are_server_only_and_never_served():
    # Public content is listed in PUBLIC_CONTENT and served to anyone. The word lists are not.
    assert "names.json" not in PUBLIC_CONTENT.values()
    assert "names" not in PUBLIC_CONTENT


def test_the_names_file_has_only_the_three_expected_keys():
    keys = list(json.loads(NAMES_PATH.read_text(encoding="utf-8")))

    assert keys == ["about", "adjectives", "nouns"]


# --- what a name looks like ---


def test_the_longest_possible_name_fits_the_profile_rules():
    longest_adjective = max(len(word) for word in WORDS.adjectives)
    longest_noun = max(len(word) for word in WORDS.nouns)
    two_spaces_and_two_digits = 4

    assert longest_adjective + longest_noun + two_spaces_and_two_digits <= 24


def test_a_thousand_generated_names_pass_the_profile_rules():
    rng = random.Random(42)

    names = [pick_name(WORDS, rng) for _ in range(1000)]

    assert all(is_valid_display_name(name) for name in names)


def test_a_name_is_adjective_noun_and_a_number_from_10_to_99():
    rng = random.Random(42)

    for _ in range(200):
        adjective, noun, number = pick_name(WORDS, rng).split(" ")
        assert adjective in WORDS.adjectives
        assert noun in WORDS.nouns
        assert number.isdecimal()
        assert LOWEST_NUMBER <= int(number) <= HIGHEST_NUMBER


def test_the_numbers_have_two_digits():
    assert (LOWEST_NUMBER, HIGHEST_NUMBER) == (10, 99)


def test_the_same_seed_gives_the_same_names():
    first = [pick_name(WORDS, random.Random(7)) for _ in range(3)]
    second = [pick_name(WORDS, random.Random(7)) for _ in range(3)]

    assert first == second


def test_different_seeds_give_different_names():
    names = {pick_name(WORDS, random.Random(seed)) for seed in range(50)}

    assert len(names) > 40


def test_names_are_not_always_the_same_without_a_seed():
    # The default is the system's random source, not a fixed seed.
    names = {pick_name(WORDS) for _ in range(30)}

    assert len(names) > 20


def test_the_default_random_source_is_the_system_one():
    assert isinstance(SYSTEM_RANDOM, random.SystemRandom)


# --- a different name for the re-roll ---


def test_a_new_name_is_never_the_current_name():
    # With one adjective and one noun, the only thing that can change is the number. The
    # generator is forced to pick 99, the current number. A re-roll that only picks again would
    # give "Brave Puffin 99" back.
    small = WordLists(adjectives=("Brave",), nouns=("Puffin",))

    new_name = pick_new_name(small, "Brave Puffin 99", ChosenNumber(99))

    assert new_name == "Brave Puffin 10"  # 99 wraps around to 10


def test_a_new_name_moves_the_number_on_by_one():
    small = WordLists(adjectives=("Brave",), nouns=("Puffin",))

    assert pick_new_name(small, "Brave Puffin 17", ChosenNumber(17)) == "Brave Puffin 18"


def test_a_new_name_keeps_the_pick_when_it_already_differs():
    small = WordLists(adjectives=("Brave",), nouns=("Puffin",))

    assert pick_new_name(small, "Calm Gannet 42", ChosenNumber(17)) == "Brave Puffin 17"


def test_a_new_name_differs_from_the_current_name_over_many_tries():
    rng = random.Random(42)
    current = pick_name(WORDS, rng)

    for _ in range(1000):
        new_name = pick_new_name(WORDS, current, rng)
        assert new_name != current
        assert is_valid_display_name(new_name)
        current = new_name


# --- the placeholder name from sign-up ---


def test_the_placeholder_is_captain_and_the_first_six_characters_of_the_id():
    assert placeholder_name(PLAYER_ID) == "Captain-111111"
    assert PLACEHOLDER_PREFIX == "Captain-"


def test_the_placeholder_matches_the_sign_up_function():
    # handle_new_user() in the foundation migration writes the placeholder. If its length or its
    # prefix ever changes, this test says that names.py must change too.
    sql = FOUNDATION.read_text(encoding="utf-8")

    length = re.search(r"c_id_length constant integer := (\d+);", sql)
    assert length, "Could not find c_id_length in the foundation migration."
    assert int(length.group(1)) == PLACEHOLDER_ID_LENGTH
    assert f"'{PLACEHOLDER_PREFIX}' || left(new.id::text, c_id_length)" in sql


def test_a_name_is_a_placeholder_only_for_its_own_player():
    assert is_placeholder("Captain-111111", PLAYER_ID)
    assert not is_placeholder("Captain-999999", PLAYER_ID)
    assert not is_placeholder("Brave Puffin 17", PLAYER_ID)


def test_a_generated_name_is_never_a_placeholder():
    rng = random.Random(42)

    for _ in range(500):
        name = pick_name(WORDS, rng)
        assert not name.startswith(PLACEHOLDER_PREFIX)
        assert not is_placeholder(name, PLAYER_ID)


# --- the profile rules (the database repeats them) ---


@pytest.mark.parametrize("name", ["Brave Puffin 17", "ab", "Captain-3fa85f", "a.b_c-d 9", "x" * 24])
def test_names_that_the_database_accepts_are_valid(name):
    assert is_valid_display_name(name)


@pytest.mark.parametrize(
    "name",
    ["", "x", "x" * 25, " lead", "trail ", "Bad<>Name", "Zoë Puffin 17", "tab\tname", "new\nline"],
)
def test_names_that_the_database_refuses_are_not_valid(name):
    assert not is_valid_display_name(name)


# --- the loader refuses a broken file ---


def write_names(tmp_path: Path, content: object) -> Path:
    path = tmp_path / "names.json"
    path.write_text(json.dumps(content), encoding="utf-8")
    return path


def lists_of(count: int, *, prefix: str = "Word") -> list[str]:
    """A list of valid words: Worda, Wordb, ... (letters only, so they pass the word rule)."""
    letters = "abcdefghijklmnopqrstuvwxyz"
    return [prefix + letters[number % 26] + letters[number // 26] for number in range(count)]


def good_file(**changes):
    content = {
        "about": "x",
        "adjectives": lists_of(32, prefix="Ad"),
        "nouns": lists_of(32, prefix="No"),
    }
    content.update(changes)
    return content


def broken_by_a_bad_word() -> dict:
    adjectives = lists_of(32, prefix="Ad")
    adjectives[3] = "Sea-Dog"
    return good_file(adjectives=adjectives)


def broken_by_a_duplicate() -> dict:
    nouns = lists_of(32, prefix="No")
    nouns[9] = nouns[2]
    return good_file(nouns=nouns)


def broken_by_too_few_words() -> dict:
    return good_file(adjectives=lists_of(31, prefix="Ad"))


@pytest.mark.parametrize(
    "make_content", [broken_by_a_bad_word, broken_by_a_duplicate, broken_by_too_few_words]
)
def test_a_broken_word_list_is_refused(tmp_path, make_content):
    # The three ways a list can be broken, each with a message that says what is wrong.
    with pytest.raises(ValueError, match=r"names\.json|appears twice"):
        load_word_lists(write_names(tmp_path, make_content()))


def test_a_good_file_loads(tmp_path):
    words = load_word_lists(write_names(tmp_path, good_file()))

    assert len(words.adjectives) == 32
    assert len(words.nouns) == 32


@pytest.mark.parametrize(
    "bad_word", ["Sea-Dog", "sea", "SEA", "Sea Dog", "S", "Seadogsandmore", "Zoë", "Sea1", ""]
)
def test_a_word_that_is_not_one_capitalised_word_of_letters_is_refused(tmp_path, bad_word):
    adjectives = lists_of(32, prefix="Ad")
    adjectives[5] = bad_word
    path = write_names(tmp_path, good_file(adjectives=adjectives))

    with pytest.raises(ValueError, match="adjectives"):
        load_word_lists(path)


def test_a_word_that_appears_twice_is_refused(tmp_path):
    nouns = lists_of(32, prefix="No")
    nouns[7] = nouns[3]
    path = write_names(tmp_path, good_file(nouns=nouns))

    with pytest.raises(ValueError, match="twice"):
        load_word_lists(path)


def test_a_word_that_is_in_both_lists_is_refused(tmp_path):
    nouns = lists_of(32, prefix="No")
    nouns[0] = lists_of(32, prefix="Ad")[0]
    path = write_names(tmp_path, good_file(nouns=nouns))

    with pytest.raises(ValueError, match="twice"):
        load_word_lists(path)


@pytest.mark.parametrize("key", ["adjectives", "nouns"])
def test_a_list_with_fewer_than_32_words_is_refused(tmp_path, key):
    path = write_names(tmp_path, good_file(**{key: lists_of(31)}))

    with pytest.raises(ValueError, match="at least 32"):
        load_word_lists(path)


@pytest.mark.parametrize("key", ["adjectives", "nouns"])
@pytest.mark.parametrize("not_a_list", ["Brave", None, 42, {"Brave": 1}])
def test_a_list_that_is_not_a_list_of_text_is_refused(tmp_path, key, not_a_list):
    path = write_names(tmp_path, good_file(**{key: not_a_list}))

    with pytest.raises(ValueError, match=key):
        load_word_lists(path)


def test_a_word_that_is_not_text_is_refused(tmp_path):
    adjectives = lists_of(32, prefix="Ad")
    adjectives[0] = 42
    path = write_names(tmp_path, good_file(adjectives=adjectives))

    with pytest.raises(ValueError, match="adjectives"):
        load_word_lists(path)


@pytest.mark.parametrize("missing", ["adjectives", "nouns"])
def test_a_file_without_a_list_is_refused(tmp_path, missing):
    content = good_file()
    del content[missing]

    with pytest.raises(ValueError, match=missing):
        load_word_lists(write_names(tmp_path, content))


def test_a_file_that_is_not_an_object_is_refused(tmp_path):
    with pytest.raises(ValueError, match="object"):
        load_word_lists(write_names(tmp_path, ["Brave", "Puffin"]))


def test_a_file_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "names.json"
    path.write_text("not json", encoding="utf-8")

    with pytest.raises(ValueError, match="names"):
        load_word_lists(path)


def test_a_word_of_more_than_12_letters_is_refused(tmp_path):
    adjectives = lists_of(32, prefix="Ad")
    adjectives[0] = "Abcdefghijklm"  # 13 letters
    path = write_names(tmp_path, good_file(adjectives=adjectives))

    with pytest.raises(ValueError, match="adjectives"):
        load_word_lists(path)


def test_words_that_could_make_a_name_longer_than_24_characters_are_refused(tmp_path):
    # Each word is allowed on its own (12 letters), but 12 + 12 + 4 = 28 is more than the
    # database accepts. A player who drew that pair could never get a name.
    adjectives = lists_of(32, prefix="Ad")
    nouns = lists_of(32, prefix="No")
    adjectives[0] = "Abcdefghijkl"
    nouns[0] = "Mnopqrstuvwx"
    path = write_names(tmp_path, good_file(adjectives=adjectives, nouns=nouns))

    with pytest.raises(ValueError, match="24"):
        load_word_lists(path)
