"""The content of the daily round, loaded once when the server starts.

Two files in backend/content/ belong to it, and only the server reads them (they are not on the
public list in routes/content.py, so no browser can read them through /api/content):

    bulletin.json          the words of the harbor bulletin and what resets when
    chapter_two_hook.json  the Board notice and the beam of the Chapter 2 hook

daily/bulletin_content.py and daily/hook_content.py check every field of one file each. This file
reads both, adds the file name to every message ("bulletin.json: relitLineHours must be a whole
number from 1 to 168") and keeps the result in one frozen object, DailyContent.

A mistake in either file must not stop the whole API from starting. load_daily_content() logs the
problem and returns None, and the bulletin route then answers 503 bulletin_unavailable. A test
checks that the real files load, so a broken file is caught before it is merged.

Used by: app.py (loads the content once at start-up), routes/bulletin.py and the tests.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

from server.content_fields import ContentError, read_json_object
from server.daily.bulletin_content import BulletinContent, bulletin_from_data
from server.daily.hook_content import HookContent, hook_from_data

logger = logging.getLogger(__name__)

# backend/server/daily/content.py -> parents[2] is backend/
CONTENT_FOLDER = Path(__file__).resolve().parents[2] / "content"
BULLETIN_FILE = CONTENT_FOLDER / "bulletin.json"
HOOK_FILE = CONTENT_FOLDER / "chapter_two_hook.json"


class DailyContentError(ValueError):
    """A daily content file has a problem. The message names the file and the field."""


@dataclass(frozen=True)
class DailyContent:
    """Everything the bulletin reads from its two content files."""

    bulletin: BulletinContent
    hook: HookContent


def read_daily_content(
    bulletin_path: Path = BULLETIN_FILE, hook_path: Path = HOOK_FILE
) -> DailyContent:
    """Read and check both files. Raises DailyContentError, which starts with the file name."""
    try:
        bulletin = bulletin_from_data(read_json_object(bulletin_path))
    except ContentError as error:
        raise DailyContentError(f"{bulletin_path.name}: {error}") from error
    try:
        hook = hook_from_data(read_json_object(hook_path))
    except ContentError as error:
        raise DailyContentError(f"{hook_path.name}: {error}") from error
    return DailyContent(bulletin=bulletin, hook=hook)


def load_daily_content(
    bulletin_path: Path = BULLETIN_FILE, hook_path: Path = HOOK_FILE
) -> DailyContent | None:
    """The content, or None if a file cannot be used (the problem is logged)."""
    try:
        return read_daily_content(bulletin_path, hook_path)
    except DailyContentError as error:
        logger.error("The harbor bulletin content cannot be used: %s", error)
        return None
