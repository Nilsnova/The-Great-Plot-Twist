"""Tests for crews/codes.py: making a crew code, tidying up what a player types, the guess limit.

Pure functions, so there is no database and no network. Random choices use a fixed seed.
"""

import inspect
import random
import secrets

import pytest

from server.crews.codes import (
    CODE_ALPHABET,
    CODE_LENGTH,
    MAX_WRONG_CODES,
    WRONG_CODE_WINDOW_SECONDS,
    make_crew_code,
    normalize_code,
)

# --- making a code ---


def test_a_code_has_six_symbols_from_the_alphabet():
    rng = random.Random(42)

    codes = [make_crew_code(rng) for _ in range(200)]

    assert all(len(code) == CODE_LENGTH for code in codes)
    assert all(symbol in CODE_ALPHABET for code in codes for symbol in code)


def test_the_code_length_is_six():
    assert CODE_LENGTH == 6


@pytest.mark.parametrize("confusing", list("01OIL"))
def test_the_alphabet_has_no_easily_confused_symbols(confusing):
    assert confusing not in CODE_ALPHABET


def test_the_alphabet_has_31_different_symbols():
    assert len(CODE_ALPHABET) == 31
    assert len(set(CODE_ALPHABET)) == 31


def test_the_same_seed_gives_the_same_code():
    first = make_crew_code(random.Random(7))
    second = make_crew_code(random.Random(7))

    assert first == second


def test_different_seeds_give_different_codes():
    codes = {make_crew_code(random.Random(seed)) for seed in range(20)}

    assert len(codes) > 15


def test_codes_use_the_system_random_by_default():
    # A guessable generator (a plain random.Random) would let someone predict the next code.
    default = inspect.signature(make_crew_code).parameters["rng"].default

    assert isinstance(default, secrets.SystemRandom)


# --- tidying up what a player types ---


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("K7QF2M", "K7QF2M"),
        ("k7qf2m", "K7QF2M"),
        ("k7q-f2m ", "K7QF2M"),
        (" K7Q F2M", "K7QF2M"),
        ("K7-QF-2M", "K7QF2M"),
    ],
)
def test_normalize_accepts_lowercase_spaces_and_hyphens(typed, expected):
    assert normalize_code(typed) == expected


def test_a_line_break_at_the_end_is_tidied_away_like_a_space():
    assert normalize_code("K7QF2M\n") == "K7QF2M"


@pytest.mark.parametrize(
    "typed",
    [
        "K7QF2",  # too short
        "K7QF2MM",  # too long
        "K7QF2O",  # the letter O is not in the alphabet
        "K7QF21",  # nor is the digit 1
        "K7Q\nF2M",  # a line break in the middle is not tidied away
        "",
        "      ",
        "K7QF2!",
        "K7QF\u00dfM",  # a letter outside A-Z
        "K7QF2\u017f",  # the long s: upper() would make it a plain S, so it is refused first
    ],
)
def test_normalize_refuses_wrong_length_or_symbols(typed):
    assert normalize_code(typed) is None


def test_a_code_made_by_make_crew_code_survives_normalize():
    code = make_crew_code(random.Random(3))

    assert normalize_code(code) == code
    assert normalize_code(code.lower()) == code


# --- the limit on wrong guesses ---


def test_the_guess_limit_is_10_wrong_codes_in_10_minutes():
    assert MAX_WRONG_CODES == 10
    assert WRONG_CODE_WINDOW_SECONDS == 600
