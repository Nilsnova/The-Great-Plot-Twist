"""Tests for content_fields.py: the small readers that check one field of a content file.

The loaders of the open-world content files (weather_states.json, bulletin.json and
chapter_two_hook.json) are built from these, and their own tests check each file's rules. Here
the readers are tested on their own, with small made-up objects.
"""

from datetime import date

import pytest

from server.content_fields import (
    MAX_TEXT_LENGTH,
    ContentError,
    check_exact_keys,
    field_path,
    get_date,
    get_list,
    get_number_above_zero,
    get_object,
    get_template,
    get_text,
    get_whole_number,
    read_iso_date,
    read_json_object,
)

# --- the file ---


def test_a_json_object_is_read_from_a_file(tmp_path):
    path = tmp_path / "content.json"
    path.write_text('{"a": 1}', encoding="utf-8")

    assert read_json_object(path) == {"a": 1}


@pytest.mark.parametrize("text", ["{ not json", "[1, 2]", '"text"', "42", "null", ""])
def test_a_file_that_is_not_one_json_object_is_refused(tmp_path, text):
    path = tmp_path / "content.json"
    path.write_text(text, encoding="utf-8")

    with pytest.raises(ContentError):
        read_json_object(path)


def test_a_missing_file_is_refused(tmp_path):
    with pytest.raises(ContentError, match="cannot read"):
        read_json_object(tmp_path / "missing.json")


def test_a_file_with_bytes_that_are_not_utf8_is_refused(tmp_path):
    path = tmp_path / "content.json"
    path.write_bytes(b'{"a": "\xff\xfe"}')

    with pytest.raises(ContentError):
        read_json_object(path)


# --- the names in messages ---


def test_a_field_is_named_with_the_path_of_its_parent():
    assert field_path("night", "startsHour") == "night.startsHour"
    assert field_path("", "night") == "night"


# --- objects, lists and texts ---


def test_an_object_and_a_list_are_found_by_name():
    parent = {"inner": {"x": 1}, "items": [1, 2]}

    assert get_object(parent, "inner") == {"x": 1}
    assert get_list(parent, "items") == [1, 2]


@pytest.mark.parametrize("value", [None, 5, "text", [1], True])
def test_a_field_that_is_not_an_object_is_refused(value):
    with pytest.raises(ContentError, match="parent.inner must be an object"):
        get_object({"inner": value}, "inner", "parent")


@pytest.mark.parametrize("value", [None, 5, "text", {"a": 1}, True])
def test_a_field_that_is_not_a_list_is_refused(value):
    with pytest.raises(ContentError, match="items must be a list"):
        get_list({"items": value}, "items")


def test_a_text_is_returned_as_it_is():
    assert get_text({"line": "Fog tonight."}, "line") == "Fog tonight."


@pytest.mark.parametrize("value", [None, "", "   ", 5, ["a"], True])
def test_a_text_that_is_empty_or_not_text_is_refused(value):
    with pytest.raises(ContentError, match="line must be text that is not empty"):
        get_text({"line": value}, "line")


def test_a_text_can_be_as_long_as_the_limit_and_no_longer():
    get_text({"line": "x" * MAX_TEXT_LENGTH}, "line")

    with pytest.raises(ContentError, match="at most"):
        get_text({"line": "x" * (MAX_TEXT_LENGTH + 1)}, "line")


def test_a_text_can_have_its_own_shorter_limit():
    with pytest.raises(ContentError, match="at most 5 characters"):
        get_text({"line": "abcdef"}, "line", longest=5)


# --- templates ---


def test_a_template_with_all_its_placeholders_is_accepted():
    text = "Tonight: {tonight}. Tomorrow: {tomorrow}."

    assert get_template({"t": text}, "t", "", ("{tonight}", "{tomorrow}")) == text


def test_a_template_without_one_of_its_placeholders_is_refused():
    with pytest.raises(ContentError, match=r"must contain \{tomorrow\}"):
        get_template({"t": "Tonight: {tonight}."}, "t", "", ("{tonight}", "{tomorrow}"))


@pytest.mark.parametrize(
    "text",
    ["Tonight: {tonight} {other}.", "Tonight: {tonight} }", "{ Tonight: {tonight}"],
)
def test_a_template_with_any_other_curly_brace_is_refused(text):
    with pytest.raises(ContentError, match="curly brace"):
        get_template({"t": text}, "t", "", ("{tonight}",))


# --- numbers ---


def test_a_whole_number_in_range_is_returned():
    assert get_whole_number({"n": 18}, "n", "night", 12, 23) == 18


@pytest.mark.parametrize("value", [11, 24, 18.5, "18", True, None, [18]])
def test_a_whole_number_out_of_range_or_of_another_kind_is_refused(value):
    with pytest.raises(ContentError, match="night.n must be a whole number from 12 to 23"):
        get_whole_number({"n": value}, "n", "night", 12, 23)


@pytest.mark.parametrize("value", [0.01, 0.4, 1, 1.0])
def test_a_number_above_zero_and_up_to_the_limit_is_returned(value):
    assert get_number_above_zero({"x": value}, "x", "", up_to=1) == float(value)


@pytest.mark.parametrize(
    "value",
    [
        0,
        -1,
        1.01,
        "0.5",
        True,
        None,
        float("nan"),
        float("inf"),
        # Python's JSON reader accepts a whole number of hundreds of digits. It does not fit a
        # float, and math.isfinite raises an OverflowError for it, so it must be refused first.
        pytest.param(10**400, id="a-whole-number-of-401-digits"),
        pytest.param(-(10**400), id="minus-a-whole-number-of-401-digits"),
    ],
)
def test_a_number_that_is_zero_negative_too_big_or_not_a_number_is_refused(value):
    with pytest.raises(ContentError, match="x must be a number above 0 and at most 1"):
        get_number_above_zero({"x": value}, "x", "", up_to=1)


# --- dates ---


@pytest.mark.parametrize(
    ("text", "expected"),
    [("2026-11-16", date(2026, 11, 16)), ("2027-02-28", date(2027, 2, 28))],
)
def test_a_date_written_as_year_month_day_is_read(text, expected):
    assert read_iso_date(text) == expected
    assert get_date({"on": text}, "on") == expected


@pytest.mark.parametrize(
    "text",
    [
        "2026-02-30",
        "2026-13-01",
        "16 Nov 2026",
        "2026-1-5",
        "20261116",
        "2026-W47-1",
        "2026-11-16T00:00",
        "",
    ],
)
def test_a_date_that_does_not_exist_or_is_written_another_way_is_refused(text):
    assert read_iso_date(text) is None
    with pytest.raises(ContentError, match="on must be a date written as YYYY-MM-DD"):
        get_date({"on": text}, "on")


@pytest.mark.parametrize("value", [None, 20261116, ["2026-11-16"], True])
def test_a_date_field_that_is_not_text_is_refused(value):
    with pytest.raises(ContentError, match="YYYY-MM-DD"):
        get_date({"on": value}, "on")


# --- exact keys ---


def test_an_object_with_exactly_the_keys_is_accepted():
    check_exact_keys({"a": 1, "b": 2}, ("b", "a"), "words")


@pytest.mark.parametrize("value", [{"a": 1}, {"a": 1, "b": 2, "c": 3}, {}])
def test_an_object_with_a_missing_or_extra_key_is_refused(value):
    with pytest.raises(ContentError, match="words must have exactly these keys: a, b"):
        check_exact_keys(value, ("a", "b"), "words")
