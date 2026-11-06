"""The shape of chapter_two_hook.json: the Board notice and the beam of the Chapter 2 hook.

After the first crew relights the coast, a strange new light shows up far beyond the old fog line
(OPEN-WORLD.md 10.2, "Chapter 2 hook"). This file holds what the game shows about it. The checks
run when the server starts (daily/content.py adds the file name to every message):

    id            always "chapter_two_hook". The browser keeps its "new" mark for the notice by it.
    firesByNight  the hook fires at the end of the first calm night among the first this many nights
                  after the Relighting, or at the end of the last of them (1 to 7)
    bulletinLine  the one line in the bulletin of the morning it fires
    notice        the Board notice: a title and a text. It describes the flashes in words and
                  names no exact pattern, so Chapter 2 can still choose one. It must not name the
                  missing lens: the lens count comes from the ledger at Gull's Rest, which is on
                  the spoiler list (CASE-FILE 14.3).
    beam          data for the beam on the sea chart, for the package that draws it: the position
                  on the 448 by 256 chart, the pattern of flashes (a proposal) and their timings

The pattern may be 1 to 12 flashes, each "short" or "long". It must not be the harbor alarm
(long, short, long), so the new light cannot be mistaken for a call that the harbor already uses.

Used by: daily/content.py (loads the file), daily/chapter_two_hook.py (fires_by_night),
routes/bulletin.py (sends the notice and the beam) and the tests.
"""

from dataclasses import dataclass

from server.content_fields import (
    ContentError,
    get_list,
    get_number_above_zero,
    get_object,
    get_text,
    get_whole_number,
)

HOOK_ID = "chapter_two_hook"
HARBOR_ALARM = ("long", "short", "long")
FLASH_WORDS = ("short", "long")

LOWEST_FIRES_BY_NIGHT, HIGHEST_FIRES_BY_NIGHT = 1, 7
CHART_WIDTH, CHART_HEIGHT = 448, 256  # the sea chart, in chart units (frontend/GRAPHICS.md)
LONGEST_PATTERN = 12
LONGEST_FLASH_SECONDS = 10


@dataclass(frozen=True)
class FlashTimings:
    """How long each part of the flashing lasts, in seconds."""

    short_seconds: float
    long_seconds: float
    gap_seconds: float  # between two flashes
    pause_seconds: float  # between two rounds of the pattern


@dataclass(frozen=True)
class HookContent:
    """The checked content of chapter_two_hook.json."""

    id: str
    fires_by_night: int
    bulletin_line: str
    notice_title: str
    notice_text: str
    chart_x: int  # where the beam is on the sea chart: 0 to 447
    chart_y: int  # 0 to 255
    pattern: tuple[str, ...]  # "short" and "long", in the order they flash
    flash: FlashTimings


def get_id(data: dict) -> str:
    """The id must be exactly "chapter_two_hook"."""
    hook_id = get_text(data, "id")
    if hook_id != HOOK_ID:
        raise ContentError(f"id must be {HOOK_ID}")
    return hook_id


def get_pattern(beam: dict) -> tuple[str, ...]:
    """The flashes: 1 to 12 of "short" and "long", and not the harbor alarm."""
    pattern = get_list(beam, "pattern", "beam")
    if not 1 <= len(pattern) <= LONGEST_PATTERN:
        raise ContentError(f"beam.pattern must have 1 to {LONGEST_PATTERN} flashes")
    if not all(word in FLASH_WORDS for word in pattern):
        raise ContentError(f"beam.pattern may only contain {' and '.join(FLASH_WORDS)}")
    if tuple(pattern) == HARBOR_ALARM:
        raise ContentError("beam.pattern must not be the harbor alarm (long, short, long)")
    return tuple(pattern)


def get_flash(beam: dict) -> FlashTimings:
    """The four timings, each above 0 and at most 10 seconds."""
    flash = get_object(beam, "flash", "beam")

    def seconds(name: str) -> float:
        return get_number_above_zero(flash, name, "beam.flash", up_to=LONGEST_FLASH_SECONDS)

    return FlashTimings(
        short_seconds=seconds("shortSeconds"),
        long_seconds=seconds("longSeconds"),
        gap_seconds=seconds("gapSeconds"),
        pause_seconds=seconds("pauseSeconds"),
    )


def hook_from_data(data: dict) -> HookContent:
    """Check the parts of chapter_two_hook.json and build the content. Raises ContentError."""
    notice = get_object(data, "notice")
    beam = get_object(data, "beam")
    chart = get_object(beam, "chart", "beam")
    return HookContent(
        id=get_id(data),
        fires_by_night=get_whole_number(
            data, "firesByNight", "", LOWEST_FIRES_BY_NIGHT, HIGHEST_FIRES_BY_NIGHT
        ),
        bulletin_line=get_text(data, "bulletinLine"),
        notice_title=get_text(notice, "title", "notice"),
        notice_text=get_text(notice, "text", "notice"),
        chart_x=get_whole_number(chart, "x", "beam.chart", 0, CHART_WIDTH - 1),
        chart_y=get_whole_number(chart, "y", "beam.chart", 0, CHART_HEIGHT - 1),
        pattern=get_pattern(beam),
        flash=get_flash(beam),
    )
