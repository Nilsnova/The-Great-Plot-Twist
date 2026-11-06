"""The shape of bulletin.json: every word the harbor bulletin says, and what resets when.

The texts are content, not code (decision D016), so the team can change a sentence without touching
Python. This file describes the checked result: BulletinContent. The checks run when the server
starts (daily/content.py adds the file name to every message):

    stateWords      one word for each weather state: storm, fog, rain, calm. Exactly these four.
    noForecast      the words for "we do not know" (no hour of that night or day is known)
    weatherLine     the first line, with {tonight} and {tomorrow} in it
    fogNightLines   the line for a fog night, "real" (the weather made it) or "almanac" (the rule)
    exchange        feedWords: one phrase for each price feed (live, cache, stale, replay), exactly
                    these four; allOpen with {feed}; somePaused with {feed} and {companies}
    relitLine       the line for the days after the first solve, shown for relitLineHours (1 to 168)
    calendar        dated notices: {"on": "2026-11-16", "text": "..."}, each date at most once
    resets          what resets when, as {"when": "...", "what": "..."}. Not empty. The bulletin
                    sends them with the day, so the game can show a help box.

Nothing here may name the culprit or the case's answers (CASE-FILE 14.3). A test scans every text.

Used by: daily/content.py (loads the file), daily/bulletin.py (builds the lines), routes/bulletin.py
(sends `resets`) and the tests.
"""

from dataclasses import dataclass
from datetime import date

from server.content_fields import (
    ContentError,
    check_exact_keys,
    field_path,
    get_date,
    get_list,
    get_object,
    get_template,
    get_text,
    get_whole_number,
)

STATE_NAMES = ("storm", "fog", "rain", "calm")
FEED_NAMES = ("live", "cache", "stale", "replay")
FOG_NIGHT_KINDS = ("real", "almanac")

LOWEST_RELIT_LINE_HOURS, HIGHEST_RELIT_LINE_HOURS = 1, 168  # one hour to one week
MAX_LIST_ENTRIES = 50  # a list in the API is always short


@dataclass(frozen=True)
class ResetLine:
    """One line of "what resets when", for example "Every day at 00:00" and what happens."""

    when: str
    what: str


@dataclass(frozen=True)
class CalendarNotice:
    """A notice for one bulletin day."""

    on: date
    text: str


@dataclass(frozen=True)
class BulletinContent:
    """The checked content of bulletin.json. Treat the dictionaries as read-only."""

    state_words: dict[str, str]  # state -> word, for example "calm" -> "calm and clear"
    no_forecast: str
    weather_line: str  # has {tonight} and {tomorrow}
    fog_night_lines: dict[str, str]  # "real" or "almanac" -> the line
    feed_words: dict[str, str]  # feed -> phrase, for example "stale" -> "old prices (...)"
    exchange_all_open: str  # has {feed}
    exchange_some_paused: str  # has {feed} and {companies}
    relit_line: str
    relit_line_hours: int
    calendar: tuple[CalendarNotice, ...]
    resets: tuple[ResetLine, ...]


def get_words(parent: dict, name: str, where: str, keys: tuple[str, ...]) -> dict[str, str]:
    """An object with exactly these keys, each one a text that is not empty."""
    words = get_object(parent, name, where)
    path = field_path(where, name)
    check_exact_keys(words, keys, path)
    return {key: get_text(words, key, path) for key in keys}


def get_entries(parent: dict, name: str) -> list[dict]:
    """A list of objects of a sensible length (it may be empty, the caller says if it may not)."""
    entries = get_list(parent, name)
    if len(entries) > MAX_LIST_ENTRIES:
        raise ContentError(f"{name} must have at most {MAX_LIST_ENTRIES} entries")
    for position, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ContentError(f"{name}[{position}] must be an object")
    return entries


def read_calendar(data: dict) -> tuple[CalendarNotice, ...]:
    """The dated notices. A date that is written twice is refused."""
    notices = []
    for position, entry in enumerate(get_entries(data, "calendar")):
        where = f"calendar[{position}]"
        notices.append(CalendarNotice(get_date(entry, "on", where), get_text(entry, "text", where)))
    days = [notice.on for notice in notices]
    for day in days:
        if days.count(day) > 1:
            raise ContentError(f"calendar has the date {day.isoformat()} more than once")
    return tuple(notices)


def read_resets(data: dict) -> tuple[ResetLine, ...]:
    """The reset lines. There must be at least one."""
    entries = get_entries(data, "resets")
    if not entries:
        raise ContentError("resets must not be empty")
    return tuple(
        ResetLine(get_text(entry, "when", f"resets[{n}]"), get_text(entry, "what", f"resets[{n}]"))
        for n, entry in enumerate(entries)
    )


def bulletin_from_data(data: dict) -> BulletinContent:
    """Check the parts of bulletin.json and build the content. Raises ContentError."""
    exchange = get_object(data, "exchange")
    return BulletinContent(
        state_words=get_words(data, "stateWords", "", STATE_NAMES),
        no_forecast=get_text(data, "noForecast"),
        weather_line=get_template(data, "weatherLine", "", ("{tonight}", "{tomorrow}")),
        fog_night_lines=get_words(data, "fogNightLines", "", FOG_NIGHT_KINDS),
        feed_words=get_words(exchange, "feedWords", "exchange", FEED_NAMES),
        exchange_all_open=get_template(exchange, "allOpen", "exchange", ("{feed}",)),
        exchange_some_paused=get_template(
            exchange, "somePaused", "exchange", ("{feed}", "{companies}")
        ),
        relit_line=get_text(data, "relitLine"),
        relit_line_hours=get_whole_number(
            data, "relitLineHours", "", LOWEST_RELIT_LINE_HOURS, HIGHEST_RELIT_LINE_HOURS
        ),
        calendar=read_calendar(data),
        resets=read_resets(data),
    )
