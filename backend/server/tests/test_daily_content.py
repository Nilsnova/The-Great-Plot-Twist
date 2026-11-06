"""Tests for daily/content.py and the two files it reads: bulletin.json and chapter_two_hook.json.

Both files are for the server only (they are not on the public content list, see test_content.py).
The server checks every field when it starts, and these tests try each rule with a small change to
the real file. No network.
"""

import json
import logging
from datetime import date
from pathlib import Path

import pytest

from server.daily.bulletin_content import FEED_NAMES, STATE_NAMES
from server.daily.content import (
    BULLETIN_FILE,
    HOOK_FILE,
    DailyContentError,
    load_daily_content,
    read_daily_content,
)
from server.tests.bulletin_helpers import spoilers_in

MISSING = object()  # stands for "this field is not in the file"


def read_document(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


REAL_BULLETIN = read_document(BULLETIN_FILE)
REAL_HOOK = read_document(HOOK_FILE)


def with_value(document: dict, path: tuple, value) -> dict:
    """A copy of the document with the value at `path` replaced. MISSING removes the field."""
    copy = json.loads(json.dumps(document))
    parent = copy
    for step in path[:-1]:
        parent = parent[step]
    if value is MISSING:
        del parent[path[-1]]
    else:
        parent[path[-1]] = value
    return copy


def write_files(folder: Path, bulletin: dict | None = None, hook: dict | None = None):
    """Write the two files into `folder` (the real ones, with the changes given). Returns paths."""
    bulletin_path = folder / "bulletin.json"
    hook_path = folder / "chapter_two_hook.json"
    bulletin_path.write_text(json.dumps(bulletin or REAL_BULLETIN), encoding="utf-8")
    hook_path.write_text(json.dumps(hook or REAL_HOOK), encoding="utf-8")
    return bulletin_path, hook_path


def all_texts(value) -> list[str]:
    """Every text in a JSON document, however deep."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for item in value.values() for text in all_texts(item)]
    if isinstance(value, list):
        return [text for item in value for text in all_texts(item)]
    return []


# --- the real files ---


def test_the_real_bulletin_and_hook_files_load():
    content = read_daily_content()

    assert content.bulletin.relit_line_hours == 48
    assert content.hook.id == "chapter_two_hook"
    assert content.hook.fires_by_night == 3


def test_the_real_bulletin_has_a_word_for_every_state_and_every_feed():
    bulletin = read_daily_content().bulletin

    assert set(bulletin.state_words) == set(STATE_NAMES) == {"storm", "fog", "rain", "calm"}
    assert set(bulletin.feed_words) == set(FEED_NAMES) == {"live", "cache", "stale", "replay"}
    assert bulletin.state_words["calm"] == "calm and clear"


def test_the_real_bulletin_has_the_day_1_notice_and_four_reset_lines():
    bulletin = read_daily_content().bulletin

    assert [notice.on for notice in bulletin.calendar] == [date(2026, 11, 16)]
    assert len(bulletin.resets) == 4


def test_the_real_hook_describes_the_beam():
    hook = read_daily_content().hook

    assert (hook.chart_x, hook.chart_y) == (440, 12)
    assert hook.pattern == ("short", "short", "long")
    assert hook.flash.pause_seconds == 4.0


def test_the_real_files_are_inside_backend_so_they_ship_with_the_api():
    assert BULLETIN_FILE.parent == HOOK_FILE.parent
    assert BULLETIN_FILE.parent.name == "content"
    assert BULLETIN_FILE.is_file()
    assert HOOK_FILE.is_file()


def test_open_world_texts_name_no_culprit_and_no_case_answer():
    texts = all_texts(REAL_BULLETIN) + all_texts(REAL_HOOK)

    assert spoilers_in(*texts) == []


def test_the_texts_use_no_em_or_en_dashes():
    texts = all_texts(REAL_BULLETIN) + all_texts(REAL_HOOK)

    dashes = ("\u2014", "\u2013")  # an em dash and an en dash, written as escapes on purpose

    assert [text for text in texts if any(dash in text for dash in dashes)] == []


# --- a good copy loads, and a missing or broken file gives no content ---


def test_a_copy_of_the_real_files_loads(tmp_path):
    bulletin_path, hook_path = write_files(tmp_path)

    assert read_daily_content(bulletin_path, hook_path) == read_daily_content()


def test_a_missing_or_broken_file_gives_no_content_and_a_log_line(tmp_path, caplog):
    bulletin_path, hook_path = write_files(tmp_path)
    bulletin_path.write_text("{ not json", encoding="utf-8")

    with caplog.at_level(logging.ERROR):
        from_broken = load_daily_content(bulletin_path, hook_path)
        from_missing = load_daily_content(tmp_path / "gone.json", hook_path)

    assert from_broken is None
    assert from_missing is None
    assert caplog.text.count("The harbor bulletin content cannot be used") == 2


def test_a_broken_hook_file_also_gives_no_content(tmp_path, caplog):
    bulletin_path, hook_path = write_files(tmp_path)
    hook_path.write_text("[]", encoding="utf-8")

    with caplog.at_level(logging.ERROR):
        content = load_daily_content(bulletin_path, hook_path)

    assert content is None
    assert "chapter_two_hook.json" in caplog.text


def test_a_number_of_hundreds_of_digits_gives_no_content_and_a_log_line_not_a_crash(
    tmp_path, caplog
):
    # Python's JSON reader accepts such a number. It must not crash create_app() at start-up.
    huge = with_value(REAL_HOOK, ("beam", "flash", "shortSeconds"), 10**400)
    bulletin_path, hook_path = write_files(tmp_path, hook=huge)

    with caplog.at_level(logging.ERROR):
        content = load_daily_content(bulletin_path, hook_path)

    assert content is None
    assert "chapter_two_hook.json" in caplog.text
    assert "shortSeconds" in caplog.text


def test_the_real_files_load_without_a_log_line(caplog):
    with caplog.at_level(logging.WARNING):
        content = load_daily_content()

    assert content is not None
    assert caplog.text == ""


# --- the rules of bulletin.json ---

LONG_TEXT = "x" * 601


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("stateWords", "calm"), MISSING),
        (("stateWords", "snow"), "snow"),
        (("stateWords", "fog"), ""),
        (("stateWords", "fog"), 7),
        (("stateWords",), "fog"),
        (("noForecast",), ""),
        (("noForecast",), MISSING),
        (("weatherLine",), "Tonight: {tonight}."),
        (("weatherLine",), "Tomorrow: {tomorrow}."),
        (("weatherLine",), "Tonight: {tonight}. Tomorrow: {tomorrow}. {other}"),
        (("weatherLine",), ""),
        (("fogNightLines", "real"), ""),
        (("fogNightLines", "almanac"), MISSING),
        (("fogNightLines", "rule"), "Fog by rule."),
        (("exchange", "feedWords", "live"), MISSING),
        (("exchange", "feedWords", "old"), "old"),
        (("exchange", "feedWords", "stale"), ""),
        (("exchange", "allOpen"), "No company is paused."),
        (("exchange", "somePaused"), "Island Exchange: {feed}."),
        (("exchange", "somePaused"), "Paused: {companies}."),
        (("exchange",), MISSING),
        (("relitLine",), ""),
        (("relitLine",), LONG_TEXT),
        (("relitLineHours",), 0),
        (("relitLineHours",), 169),
        (("relitLineHours",), 48.5),
        (("relitLineHours",), "48"),
        (("relitLineHours",), True),
        (("relitLineHours",), MISSING),
        (("calendar",), "none"),
        (("calendar", 0, "on"), "2026-02-30"),
        (("calendar", 0, "on"), "16 Nov 2026"),
        (("calendar", 0, "on"), MISSING),
        (("calendar", 0, "text"), ""),
        (("calendar", 0), "Day 1"),
        (("resets",), []),
        (("resets",), MISSING),
        (("resets", 0, "when"), ""),
        (("resets", 0, "what"), MISSING),
        (("resets", 1), 5),
    ],
)
def test_a_bad_bulletin_value_is_refused_and_the_message_names_the_file_and_field(
    tmp_path, path, value
):
    bulletin_path, hook_path = write_files(
        tmp_path, bulletin=with_value(REAL_BULLETIN, path, value)
    )

    with pytest.raises(DailyContentError) as problem:
        read_daily_content(bulletin_path, hook_path)

    assert "bulletin.json" in str(problem.value)
    assert str(path[0]) in str(problem.value)


def test_a_calendar_date_that_appears_twice_is_refused(tmp_path):
    twice = with_value(REAL_BULLETIN, ("calendar",), REAL_BULLETIN["calendar"] * 2)
    bulletin_path, hook_path = write_files(tmp_path, bulletin=twice)

    with pytest.raises(DailyContentError, match="2026-11-16"):
        read_daily_content(bulletin_path, hook_path)


def test_two_calendar_notices_on_different_days_are_accepted(tmp_path):
    other_day = {"on": "2026-11-17", "text": "Day 2."}
    two = with_value(REAL_BULLETIN, ("calendar",), [*REAL_BULLETIN["calendar"], other_day])
    bulletin_path, hook_path = write_files(tmp_path, bulletin=two)

    content = read_daily_content(bulletin_path, hook_path)

    assert [notice.on for notice in content.bulletin.calendar] == [
        date(2026, 11, 16),
        date(2026, 11, 17),
    ]


def test_an_empty_calendar_is_accepted(tmp_path):
    no_notices = with_value(REAL_BULLETIN, ("calendar",), [])
    bulletin_path, hook_path = write_files(tmp_path, bulletin=no_notices)

    assert read_daily_content(bulletin_path, hook_path).bulletin.calendar == ()


@pytest.mark.parametrize("hours", [1, 168])
def test_the_edges_of_the_relit_line_hours_are_accepted(tmp_path, hours):
    changed = with_value(REAL_BULLETIN, ("relitLineHours",), hours)
    bulletin_path, hook_path = write_files(tmp_path, bulletin=changed)

    assert read_daily_content(bulletin_path, hook_path).bulletin.relit_line_hours == hours


# --- the rules of chapter_two_hook.json ---


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("id",), "chapter_three_hook"),
        (("id",), MISSING),
        (("firesByNight",), 0),
        (("firesByNight",), 8),
        (("firesByNight",), 2.5),
        (("firesByNight",), "3"),
        (("bulletinLine",), ""),
        (("bulletinLine",), LONG_TEXT),
        (("notice", "title"), ""),
        (("notice", "text"), "   "),
        (("notice", "text"), LONG_TEXT),
        (("notice", "text"), MISSING),
        (("notice",), MISSING),
        (("beam", "chart", "x"), -1),
        (("beam", "chart", "x"), 448),
        (("beam", "chart", "y"), -1),
        (("beam", "chart", "y"), 256),
        (("beam", "chart", "y"), 12.5),
        (("beam", "chart"), MISSING),
        (("beam", "pattern"), []),
        (("beam", "pattern"), ["short"] * 13),
        (("beam", "pattern"), ["short", "medium", "long"]),
        (("beam", "pattern"), ["long", "short", "long"]),  # the harbor alarm
        (("beam", "pattern"), "short"),
        (("beam", "pattern"), MISSING),
        (("beam", "flash", "shortSeconds"), 0),
        (("beam", "flash", "longSeconds"), -1),
        (("beam", "flash", "gapSeconds"), 10.01),
        (("beam", "flash", "pauseSeconds"), "4"),
        (("beam", "flash", "pauseSeconds"), True),
        (("beam", "flash"), MISSING),
        (("beam",), MISSING),
    ],
)
def test_a_bad_hook_value_is_refused_and_the_message_names_the_file_and_field(
    tmp_path, path, value
):
    bulletin_path, hook_path = write_files(tmp_path, hook=with_value(REAL_HOOK, path, value))

    with pytest.raises(DailyContentError) as problem:
        read_daily_content(bulletin_path, hook_path)

    assert "chapter_two_hook.json" in str(problem.value)
    assert str(path[-1]) in str(problem.value)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("firesByNight",), 1),
        (("firesByNight",), 7),
        (("beam", "chart", "x"), 0),
        (("beam", "chart", "x"), 447),
        (("beam", "chart", "y"), 0),
        (("beam", "chart", "y"), 255),
        (("beam", "pattern"), ["long"]),
        (("beam", "pattern"), ["short"] * 12),
        (("beam", "pattern"), ["long", "short", "short"]),
        (("beam", "flash", "shortSeconds"), 10),
        (("beam", "flash", "pauseSeconds"), 0.1),
    ],
)
def test_the_edges_of_every_allowed_hook_range_are_accepted(tmp_path, path, value):
    bulletin_path, hook_path = write_files(tmp_path, hook=with_value(REAL_HOOK, path, value))

    read_daily_content(bulletin_path, hook_path)
