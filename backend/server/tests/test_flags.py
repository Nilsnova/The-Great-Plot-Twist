"""Tests for flags.py: the agreed flag names, switching them on and catching typos."""

import pytest

from server.flags import (
    FLAG_NAMES,
    UnknownFlagError,
    default_flags,
    is_enabled,
    known_flags_text,
    parse_flags,
)


def test_flag_names_are_exactly_the_agreed_list():
    assert FLAG_NAMES == (
        "market",
        "predictions",
        "sports",
        "arena",
        "raid",
        "live_presence",
        "companion_llm",
        "festival",
    )


def test_every_flag_is_off_by_default():
    assert default_flags() == {name: False for name in FLAG_NAMES}
    assert parse_flags("") == default_flags()


def test_festival_is_explicitly_opt_in_and_does_not_enable_arena():
    assert not is_enabled("festival", default_flags())
    assert is_enabled("festival", parse_flags("festival"))
    assert not is_enabled("arena", parse_flags("festival"))


def test_listed_flags_are_switched_on_and_the_rest_stay_off():
    flags = parse_flags("market,arena")

    assert flags["market"] is True
    assert flags["arena"] is True
    assert [name for name in FLAG_NAMES if flags[name]] == ["market", "arena"]


def test_spaces_empty_pieces_and_repeats_are_fine():
    flags = parse_flags(" market , ,arena,market, ")

    assert [name for name in FLAG_NAMES if flags[name]] == ["market", "arena"]


def test_unknown_flag_is_rejected_and_the_message_helps():
    with pytest.raises(UnknownFlagError) as problem:
        parse_flags("markt")

    message = str(problem.value)
    assert "markt" in message
    assert known_flags_text() in message  # the message lists every valid name


def test_every_unknown_flag_is_named():
    with pytest.raises(UnknownFlagError) as problem:
        parse_flags("foo,market,bar")

    assert "foo" in str(problem.value)
    assert "bar" in str(problem.value)


def test_flag_names_are_case_sensitive():
    with pytest.raises(UnknownFlagError):
        parse_flags("Market")


def test_is_enabled_reads_the_flags():
    flags = parse_flags("raid")

    assert is_enabled("raid", flags) is True
    assert is_enabled("market", flags) is False


def test_is_enabled_treats_a_missing_entry_as_off():
    assert is_enabled("market", {}) is False


def test_is_enabled_rejects_a_misspelled_name():
    with pytest.raises(UnknownFlagError, match="markt"):
        is_enabled("markt", default_flags())
