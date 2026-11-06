"""Content linter: checks the data files in backend/content/ before they reach a player.

Run it from the backend folder:

    cd backend && uv run python tools/lint_content.py
    python3 tools/lint_content.py            (any Python 3.9 or newer works, nothing to install)

It reads files and changes nothing. It uses only the Python standard library and never imports the
server or FastAPI, so it also runs in a clean checkout. Used by: everyone who edits files in
backend/content/, and backend/server/tests/test_lint_content.py. One of those tests runs it on the
real folder, so `uv run pytest` fails when the content is wrong. This header is the linter's
contract: it lists every check. The file is longer than the usual 200 lines because eight checks
share one report and one run, and the design asks for a single script that runs by its file name.
Each check is a few small functions, in the order of the list below.

Options
    --root PATH          the content folder (default: backend/content, found from this file)
    --today YYYY-MM-DD   the day that check L7 counts from (default: today; the tests set it)

Output. One line per finding, then a summary:

    ERROR content/market/companies.json:14:7 companies[3].ticker: duplicate ticker "SHT" ...
    WARNING content/partners.json file: no schema yet: only the general checks ran on this file
    NOTE content/secret/case.json file: No case file yet: case rules skipped.
    Content check: 0 errors, 1 warning, 17 files.

A path starts at the folder that holds content/. ":line:column" follows it when the linter knows
the place in the text. "where" is the place inside the file, such as companies[3].ticker or
scenes.cottage.actions[1].goto. Findings are sorted by file and place. A NOTE is information: it
is not counted in the summary.

Messages never print text from content/secret/ (the case names the culprit, and logs are public),
and they never print a secret-looking string.

Exit codes
    0   no errors (warnings and notes are fine)
    1   at least one error
    2   the linter itself could not run (a bad option, or the content folder is missing)

The checks (every .json and .md file under the root is read and counted in the summary)

  L1  JSON parses. Every .json file is UTF-8 JSON. A repeated key, NaN, Infinity and -Infinity are
      errors too (Python's parser accepts them quietly). The message gives line and column.
  L2  No em dash (U+2014) and no en dash (U+2013) in any .json or .md file, also not written as
      the JSON escapes \\u2014 and \\u2013. The message gives line and column.
  L3  Required fields. These files have a schema (extra fields are allowed):
        story.json              the format of backend/content/README.md: title, start, items
                                (name, description), scenes (title, text, notes, actions) and
                                actions (id, label, message, goto, take, set, requires, ...)
        market/companies.json   about, nameCheck, companies (1 to 20): id, name, ticker, kind,
                                follows, symbol (island only), market, currency, priceDecimals,
                                tagline and the optional delistAtRelighting
                                (specs/L4-exchange-v2.md, section 4.1)
        market/calendars.json   validFrom, validTo, markets: id, name, timeZone, utcOffset, opens,
                                closes and the optional closedDays, shortDays, source (4.5)
        market/replay.json      credit, licence, licenceUrl (https://), candles, candleSeconds,
                                closes
        secret/case.json        the case rules of L8
      Files in weather/ are saved answers of a weather service: they are only parsed (L1) and
      scanned (L2, L6). Any other .json file gets a warning "no schema yet".
  L4  Ids are unique and exist.
        story            start and every goto name a scene. Every take, has and missing names an
                         item. Every flag in flags and not_flags is set by some action. Action ids
                         are unique in the whole story. (A flag that is set but never used is only
                         a warning, because the case may read it.)
        companies        ids, tickers and Binance pairs are unique; every stock names a market that
                         is in calendars.json; island companies use the market "always"; stocks have
                         no symbol; at most 20 companies; only greyfathom-salvage may carry
                         delistAtRelighting.
        calendars        market ids are unique; every closed or short day lies inside validFrom to
                         validTo and is listed once; no day is both closed and short; a short day
                         closes after the market opens and before its regular close; a day on a
                         weekend is a warning; utcOffset matches timeZone on every day of the
                         window (skipped with a NOTE when this machine has no time-zone data).
        replay           closes holds exactly "candles" prices above 0 for every island pair, and
                         for every other series it holds.
  L5  No real personal names in game data. A person field (speaker, character, person, npc, owner,
      author, captain, and name inside partners, suspects or characters) must hold a title (a word
      from TITLE_WORDS) or an allowed name (ALLOWED_NAMES, decision D013). A text of more than 8
      words in such a field is a description, not a name, and is not checked. Emails and @handles
      are errors in any text. Stock company names are real on purpose and are not person fields.
      (Saved weather answers are not game data and are skipped.)
  L6  Nothing secret on the public list. PUBLIC_CONTENT in server/routes/content.py is read with
      ast (the file is never imported). Each value is a plain file name (no "/", "\\" or "..", no
      leading dot, nothing from secret/), the file exists, and its name holds none of "secret",
      "case", "solution" or "answer". A secret-looking string (sb_secret_, a JWT, -----BEGIN,
      the word SECRET followed by an equals sign, SERVICE_ROLE) is an error in any content file.
  L7  The calendar is still valid: a warning when validTo is less than 14 days after --today.
  L8  The case rules, when secret/case.json exists (otherwise one NOTE). S3 owns the case format and
      may refine these rules; they follow the approved case format (docs/story/CASE-FILE.md and the
      case section of backend/content/README.md) and also read the flatter shape that the L4 spec
      first described. Read now: cards (exactly 8, ids C1 to C8, once each), deductions
      (exactly 4, ids D1 to D4, each naming two different existing cards, every card in exactly one
      deduction), suspects (unique ids), the culprit (accusation.culprit, or culprit at the top;
      it must be a suspect), routes (unique ids; a route sits inside its card, or at the top with a
      cardId that exists; prices are whole numbers of 0 or more, minutes are numbers of 0 or more;
      a needs_share names a company in companies.json). Spoiler rule: no text of the case file
      longer than 20 characters appears in any public file.
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import re
import sys
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# This file is backend/tools/lint_content.py, so the backend folder is one level up.
DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "content"

# Where the list of public content lives, seen from the folder that holds content/.
ROUTES_FILE = Path("server") / "routes" / "content.py"

ERROR = "ERROR"
WARNING = "WARNING"
NOTE = "NOTE"

CONTENT_SUFFIXES = (".json", ".md")

# The files that have a schema, as names inside the content folder.
STORY_FILE = "story.json"
COMPANIES_FILE = "market/companies.json"
CALENDARS_FILE = "market/calendars.json"
REPLAY_FILE = "market/replay.json"
CASE_FILE = "secret/case.json"
WEATHER_FOLDER = "weather/"
SECRET_FOLDER = "secret/"

# --- Companies (specs/L4-exchange-v2.md, section 4.1) ---
MAX_COMPANIES = 20
COMPANY_KINDS = ("island", "stock")
ALWAYS_OPEN = "always"
GREYFATHOM_ID = "greyfathom-salvage"
MAX_PRICE_DECIMALS = 8

# --- Calendars (specs/L4-exchange-v2.md, section 4.5) ---
EXPIRY_WARNING_DAYS = 14
# The probe for "does this machine have time-zone data": the zone of the team's own city.
PROBE_TIME_ZONE = "Europe/Lisbon"
WEEKDAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)
FIRST_WEEKEND_DAY = 5  # date.weekday(): Monday is 0, so Saturday is 5

# --- People (check L5) ---
PERSON_FIELDS = ("speaker", "character", "person", "npc", "owner", "author", "captain")
PEOPLE_CONTAINERS = ("partners", "suspects", "characters")
TITLE_WORDS = (
    "Captain",
    "Keeper",
    "Harbor",
    "Master",
    "Clerk",
    "Commander",
    "Foreman",
    "Fisherman",
    "Coastguard",
    "Doorman",
    "Dockhand",
    "Ferry",
    "Stranger",
    "Informant",
)
ALLOWED_NAMES = ("Elena Vos", "Elena")  # decision D013: Elena is the one named character
# A name or a title is a few words. A longer text in a person field is a description (the approved
# case file has "owner": "The crew model decides how the clock moves ...") and is not checked.
MOST_WORDS_IN_A_NAME = 8

# --- Public content (check L6) ---
SECRET_NAME_WORDS = ("secret", "case", "solution", "answer")

# --- The case (check L8) ---
CARD_IDS = tuple(f"C{number}" for number in range(1, 9))
DEDUCTION_IDS = tuple(f"D{number}" for number in range(1, 5))
SPOILER_LENGTH = 20  # case text longer than this must not appear in a public file
ROUTE_COIN_FIELDS = ("price", "coins")
ROUTE_MINUTE_FIELDS = ("minutes", "timer_minutes", "estimate_minutes")

# --- Patterns. Each one says what it accepts; they are used with fullmatch unless noted. ---
ID_PATTERN = re.compile(r"[a-z0-9-]+")  # lowercase letters, digits and hyphens
CAPITALS_AND_DIGITS = re.compile(r"[A-Z0-9]+")
CURRENCY_PATTERN = re.compile(r"[A-Z]{3,5}")
OFFSET_PATTERN = re.compile(r"[+-](?:[01][0-9]|2[0-3]):[0-5][0-9]")  # +HH:MM or -HH:MM
HTTPS_PATTERN = re.compile(r"https://\S+")
DAY_PATTERN = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")  # YYYY-MM-DD
CLOCK_PATTERN = re.compile(r"([01][0-9]|2[0-3]):([0-5][0-9])")  # HH:MM
ID_HINT = "lowercase letters, digits and hyphens"
HTTPS_HINT = "an address that starts with https://"

# A JSON text is cut into pieces: a string (with its escapes), one of the six structure
# characters, or any other run of characters (a number, true, false, null, NaN, Infinity).
JSON_TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:"]+')
NOT_A_NUMBER = ("NaN", "Infinity", "-Infinity")

# The two dashes the project forbids. chr() keeps the dash characters out of this file itself.
EM_DASH = chr(0x2014)
EN_DASH = chr(0x2013)
# A JSON file can also write a dash with an escape: a backslash and then u2014 (or u2013).
JSON_EM_DASH = "\\" + "u2014"
JSON_EN_DASH = "\\" + "u2013"
DASH_NAMES = {
    EM_DASH: "em dash (U+2014)",
    EN_DASH: "en dash (U+2013)",
    JSON_EM_DASH: "em dash (U+2014, written as a JSON escape)",
    JSON_EN_DASH: "en dash (U+2013, written as a JSON escape)",
}
DASH_PATTERN = re.compile("|".join(re.escape(dash) for dash in (EM_DASH, EN_DASH)))
JSON_DASH_PATTERN = re.compile("|".join(re.escape(dash) for dash in DASH_NAMES))

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
HANDLE_PATTERN = re.compile(r"(?<![\w.])@\w{2,}")  # an @name that does not follow a letter
TITLE_PATTERN = re.compile(r"\b(?:" + "|".join(TITLE_WORDS) + r")\b", re.IGNORECASE)

# Secret-looking strings. The label says what was found and never repeats the string itself.
# The SECRET= pattern is written in two pieces on purpose: the secret scan in docs/ENGINEERING.md
# (section 6) reads the commits, and it would flag this file for holding the whole word.
SECRET_PATTERNS = (
    ("an sb_secret_ key", re.compile(r"sb_secret_")),
    ("a JWT token", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.")),
    ("a private key block", re.compile(r"-----BEGIN")),
    ("a SECRET= setting", re.compile("SECRET" + "=")),
    ("a SERVICE_ROLE key name", re.compile(r"SERVICE_ROLE")),
)


# ---------------------------------------------------------------------------------------------
# The things every check shares: findings, files and the context of one run
# ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    """One thing the linter wants to tell a person."""

    severity: str  # ERROR, WARNING or NOTE
    path: str  # as printed: starts at the folder that holds content/
    where: str  # the place inside the file, for example companies[3].ticker
    message: str
    line: int = 0  # 0 means the linter does not know the line
    column: int = 0

    def text(self) -> str:
        place = self.path
        if self.line:
            place = f"{place}:{self.line}:{self.column}"
        return f"{self.severity} {place} {self.where}: {self.message}"


class Report:
    """Collects the findings of one run."""

    def __init__(self, base: Path) -> None:
        self.base = base  # paths are printed from this folder on
        self.findings: list[Finding] = []
        self.file_count = 0

    def show_path(self, path: Path) -> str:
        try:
            return path.relative_to(self.base).as_posix()
        except ValueError:
            return str(path)

    def add(
        self, severity: str, path: Path, where: str, message: str, line: int = 0, column: int = 0
    ) -> None:
        shown_path = self.show_path(path)
        self.findings.append(Finding(severity, shown_path, where, message, line, column))

    def error(self, path: Path, where: str, message: str, line: int = 0, column: int = 0) -> None:
        self.add(ERROR, path, where, message, line, column)

    def warning(self, path: Path, where: str, message: str, line: int = 0, column: int = 0) -> None:
        self.add(WARNING, path, where, message, line, column)

    def note(self, path: Path, where: str, message: str) -> None:
        self.add(NOTE, path, where, message)

    def count(self, severity: str) -> int:
        return sum(1 for finding in self.findings if finding.severity == severity)


@dataclass
class ContentFile:
    """One .json or .md file under the content folder."""

    path: Path
    name: str  # the path inside the content folder, written with "/": market/companies.json
    text: str = ""  # empty when the file is not valid UTF-8
    data: Any = None  # the parsed JSON, for .json files that json.loads accepted
    parsed: bool = False

    @property
    def is_json(self) -> bool:
        return self.path.suffix == ".json"

    @property
    def is_secret(self) -> bool:
        return self.name.startswith(SECRET_FOLDER)


@dataclass
class Context:
    """Everything one run knows: the folder, the day, the report and the files."""

    root: Path
    today: date
    report: Report
    files: dict[str, ContentFile]
    public_names: list[str] = field(default_factory=list)  # public files that are fine, by name


def shown(file: ContentFile, value: Any) -> str:
    """A value quoted for a message. Values from secret files are never printed."""
    if file.is_secret:
        return "(hidden: secret file)"
    return f'"{value}"'


def parsed_data(ctx: Context, name: str) -> Any:
    """The parsed JSON of a file, or None when the file is missing or did not parse."""
    file = ctx.files.get(name)
    if file is None or not file.parsed:
        return None
    return file.data


def child_path(where: str, key: str | int) -> str:
    """The place of a child: a list index becomes [2], a key becomes .key."""
    if isinstance(key, int):
        return f"{where}[{key}]"
    return f"{where}.{key}" if where else key


def line_and_column(text: str, offset: int) -> tuple[int, int]:
    """The line and the column (both counted from 1) of a character offset in a text."""
    line = text.count("\n", 0, offset) + 1
    column = offset - (text.rfind("\n", 0, offset) + 1) + 1
    return line, column


def plural(count: int, word: str) -> str:
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def is_whole_number(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_number(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def parse_day(text: str) -> date | None:
    """A date written as YYYY-MM-DD, or None when it is not one (or the day does not exist)."""
    match = DAY_PATTERN.fullmatch(text)
    if match is None:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_clock(text: str) -> int | None:
    """A time written as HH:MM, as minutes since midnight, or None."""
    match = CLOCK_PATTERN.fullmatch(text)
    if match is None:
        return None
    hours, minutes = (int(part) for part in match.groups())
    return hours * 60 + minutes


# ---------------------------------------------------------------------------------------------
# Section: reads one JSON object and reports what is wrong with it
# ---------------------------------------------------------------------------------------------


def range_words(lowest: int | None, highest: int | None) -> str:
    """'from 0 to 8', 'above 0' or 'of 0 or more'."""
    if lowest is not None and highest is not None:
        return f"from {lowest} to {highest}"
    if lowest == 1:
        return "above 0"
    if lowest is not None:
        return f"of {lowest} or more"
    return ""


def quoted_choices(choices: tuple[str, ...]) -> str:
    """('island', 'stock') becomes '"island" or "stock"'."""
    quoted = [f'"{choice}"' for choice in choices]
    if len(quoted) == 1:
        return quoted[0]
    return ", ".join(quoted[:-1]) + " or " + quoted[-1]


def text_problem(
    value: str,
    shortest: int,
    longest: int | None,
    pattern: re.Pattern[str] | None,
    hint: str,
    choices: tuple[str, ...],
) -> str:
    """Why a text is not allowed, or an empty string when it is fine."""
    if len(value) < shortest or (longest is not None and len(value) > longest):
        return f"must have {shortest} to {longest} characters" if longest else "must not be empty"
    if choices and value not in choices:
        return "must be " + quoted_choices(choices)
    if pattern is not None and not pattern.fullmatch(value):
        return f"must be {hint}"
    return ""


class Section:
    """One JSON object that is being checked: its data and where it sits inside its file.

    The reading methods return the value when it is fine. Otherwise they report the problem and
    return None, so the caller can simply skip whatever depends on that value.
    """

    def __init__(self, file: ContentFile, report: Report, data: dict, where: str) -> None:
        self.file = file
        self.report = report
        self.data = data
        self.where = where

    def path_to(self, key: str) -> str:
        return child_path(self.where, key)

    def problem(self, key: str, message: str) -> None:
        self.report.error(self.file.path, self.path_to(key), message)

    def warn(self, key: str, message: str) -> None:
        self.report.warning(self.file.path, self.path_to(key), message)

    def shown(self, value: Any) -> str:
        return shown(self.file, value)

    def is_missing(self, key: str, optional: bool) -> bool:
        """True when the key is absent. A required key that is absent is reported."""
        if key in self.data:
            return False
        if not optional:
            self.problem(key, "is missing")
        return True

    def text(
        self,
        key: str,
        shortest: int = 1,
        longest: int | None = None,
        pattern: re.Pattern[str] | None = None,
        hint: str = "",
        choices: tuple[str, ...] = (),
        optional: bool = False,
    ) -> str | None:
        if self.is_missing(key, optional):
            return None
        value = self.data[key]
        if not isinstance(value, str):
            self.problem(key, "must be text")
            return None
        problem = text_problem(value, shortest, longest, pattern, hint, choices)
        if problem:
            self.problem(key, problem)
            return None
        return value

    def whole_number(
        self,
        key: str,
        lowest: int | None = None,
        highest: int | None = None,
        optional: bool = False,
    ) -> int | None:
        if self.is_missing(key, optional):
            return None
        value = self.data[key]
        too_small = lowest is not None and is_whole_number(value) and value < lowest
        too_big = highest is not None and is_whole_number(value) and value > highest
        if not is_whole_number(value) or too_small or too_big:
            self.problem(key, f"must be a whole number {range_words(lowest, highest)}".rstrip())
            return None
        return value

    def number(self, key: str, lowest: int, optional: bool = False) -> float | None:
        if self.is_missing(key, optional):
            return None
        value = self.data[key]
        if not is_number(value) or value < lowest:
            self.problem(key, f"must be a number {range_words(lowest, None)}")
            return None
        return value

    def flag(self, key: str) -> None:
        """An optional key that, when it is there, must be exactly true."""
        if key in self.data and self.data[key] is not True:
            self.problem(key, "must be true when present")

    def day(self, key: str, optional: bool = False) -> date | None:
        value = self.text(key, optional=optional)
        if value is None:
            return None
        day = parse_day(value)
        if day is None:
            self.problem(key, "must be a date like 2026-12-31 (YYYY-MM-DD)")
        return day

    def clock(self, key: str) -> int | None:
        value = self.text(key)
        if value is None:
            return None
        minutes = parse_clock(value)
        if minutes is None:
            self.problem(key, "must be a time like 09:30 (HH:MM)")
        return minutes

    def texts(self, key: str, optional: bool = True) -> list[str] | None:
        """A list of texts. A missing key is an empty list when it is optional."""
        if self.is_missing(key, optional):
            return [] if optional else None
        value = self.data[key]
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            self.problem(key, "must be a list of texts")
            return None
        return value

    def section(self, key: str, optional: bool = False) -> Section | None:
        if self.is_missing(key, optional):
            return None
        value = self.data[key]
        if not isinstance(value, dict):
            self.problem(key, "must be an object")
            return None
        return Section(self.file, self.report, value, self.path_to(key))

    def sections(self, key: str, optional: bool = False) -> list[Section] | None:
        """A list of objects, each as a Section. A missing optional list is empty."""
        if self.is_missing(key, optional):
            return [] if optional else None
        value = self.data[key]
        if not isinstance(value, list):
            self.problem(key, "must be a list")
            return None
        result = []
        for index, item in enumerate(value):
            if isinstance(item, dict):
                result.append(
                    Section(self.file, self.report, item, child_path(self.path_to(key), index))
                )
            else:
                self.problem(child_path(key, index), "must be an object")
        return result

    def section_table(self, key: str) -> dict[str, Section] | None:
        """An object whose values are objects (scenes by id), as Sections by name."""
        table = self.section(key)
        if table is None:
            return None
        result = {}
        for name, item in table.data.items():
            if isinstance(item, dict):
                result[name] = Section(self.file, self.report, item, table.path_to(name))
            else:
                table.problem(name, "must be an object")
        return result


def root_section(ctx: Context, file: ContentFile) -> Section | None:
    """The top-level object of a file that has a schema, or None (reported) when it is not one."""
    if not isinstance(file.data, dict):
        ctx.report.error(file.path, "file", "must be an object, but the file holds something else")
        return None
    return Section(file, ctx.report, file.data, "")


def check_unique(
    section: Section, key: str, value: str | None, seen: dict[str, str], noun: str
) -> None:
    """Report a value that was used before. `seen` maps each value to where it was first used."""
    if value is None:
        return
    if value in seen:
        section.problem(key, f"duplicate {noun} {section.shown(value)} (first at {seen[value]})")
    else:
        seen[value] = section.path_to(key)


# ---------------------------------------------------------------------------------------------
# L1: loading the files and parsing JSON
# ---------------------------------------------------------------------------------------------


def find_json_traps(text: str) -> list[tuple[int, str]]:
    """Find repeated keys and NaN or Infinity in a text that json.loads accepted.

    Python's JSON parser keeps the last of two equal keys and reads NaN, so both slip through.
    This walks the pieces of the text and remembers, for every open object, the keys it has seen.
    A list has no keys. Returns (offset, message) pairs.
    """
    problems: list[tuple[int, str]] = []
    keys_seen: list[set[str] | None] = []  # one entry per open { or [; None for a list
    next_is_key = False
    for match in JSON_TOKEN.finditer(text):
        token = match.group()
        if token == "{":
            keys_seen.append(set())
            next_is_key = True
        elif token == "[":
            keys_seen.append(None)
            next_is_key = False
        elif token in ("}", "]"):
            keys_seen.pop()
            next_is_key = False
        elif token == ",":
            next_is_key = keys_seen[-1] is not None
        elif token in NOT_A_NUMBER:
            problems.append((match.start(), f"{token} is not valid JSON: use a normal number"))
        elif next_is_key:
            key = json.loads(token)
            if key in keys_seen[-1]:
                problems.append((match.start(), f'repeated key "{key}": the last one would win'))
            keys_seen[-1].add(key)
            next_is_key = False
    return problems


def parse_json(file: ContentFile, report: Report) -> None:
    try:
        file.data = json.loads(file.text)
    except json.JSONDecodeError as error:
        message = f"not valid JSON: {error.msg}"
        report.error(file.path, "json", message, error.lineno, error.colno)
        return
    file.parsed = True
    for offset, message in find_json_traps(file.text):
        line, column = line_and_column(file.text, offset)
        report.error(file.path, "json", message, line, column)


def read_content_file(path: Path, name: str, report: Report) -> ContentFile:
    """Read one file as UTF-8 and, for JSON, parse it. Problems go into the report."""
    file = ContentFile(path, name)
    raw = path.read_bytes()
    try:
        file.text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        before = raw[: error.start].decode("utf-8", errors="replace")
        line, column = line_and_column(before, len(before))
        report.error(path, "file", f"not valid UTF-8 ({error.reason})", line, column)
        return file
    if file.is_json:
        parse_json(file, report)
    return file


def load_files(root: Path, report: Report) -> dict[str, ContentFile]:
    """Every .json and .md file under the root, by name, in alphabetical order."""
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix in CONTENT_SUFFIXES:
            name = path.relative_to(root).as_posix()
            files[name] = read_content_file(path, name, report)
    return files


# ---------------------------------------------------------------------------------------------
# L2 and L6: text rules that apply to every file (dashes, secret-looking strings)
# ---------------------------------------------------------------------------------------------


def check_dashes(ctx: Context, file: ContentFile) -> None:
    pattern = JSON_DASH_PATTERN if file.is_json else DASH_PATTERN
    for match in pattern.finditer(file.text):
        line, column = line_and_column(file.text, match.start())
        message = f"{DASH_NAMES[match.group()]} is not allowed: use a comma, a colon or a hyphen"
        ctx.report.error(file.path, "text", message, line, column)


def check_secrets(ctx: Context, file: ContentFile) -> None:
    for label, pattern in SECRET_PATTERNS:
        for match in pattern.finditer(file.text):
            line, column = line_and_column(file.text, match.start())
            message = f"looks like a secret ({label}): secrets never belong in content files"
            ctx.report.error(file.path, "text", message, line, column)


# ---------------------------------------------------------------------------------------------
# L3 and L4: story.json
# ---------------------------------------------------------------------------------------------

# What each kind of reference must point at, and the complaint when it does not.
UNKNOWN_REFERENCE = {
    "scene": "names a scene that does not exist: {}",
    "item": "names an item that does not exist: {}",
    "flag": "names a flag that no action sets: {}",
}
# The four condition lists of a requires or a note's when, and what each one names.
CONDITION_LISTS = (("has", "item"), ("missing", "item"), ("flags", "flag"), ("not_flags", "flag"))


@dataclass
class Reference:
    """One place in the story that names a scene, an item or a flag."""

    section: Section
    key: str  # the key inside the section, for example "goto" or "has[0]"
    kind: str  # "scene", "item" or "flag"
    value: str


@dataclass
class StoryReads:
    """What reading the scenes collected, to be checked once all of them are read."""

    references: list[Reference] = field(default_factory=list)
    flags_set: dict[str, tuple[Section, str]] = field(default_factory=dict)  # flag -> where set
    action_ids: dict[str, str] = field(default_factory=dict)  # action id -> where first used


def read_conditions(conditions: Section, reads: StoryReads) -> None:
    for key, kind in CONDITION_LISTS:
        for index, value in enumerate(conditions.texts(key) or []):
            reads.references.append(Reference(conditions, child_path(key, index), kind, value))


def read_action(action: Section, reads: StoryReads) -> None:
    check_unique(action, "id", action.text("id"), reads.action_ids, "action id")
    action.text("label")
    action.text("message")
    action.text("blocked_message", optional=True)
    action.flag("hide_when_blocked")
    for key, kind in (("goto", "scene"), ("take", "item")):
        value = action.text(key, optional=True)
        if value is not None:
            reads.references.append(Reference(action, key, kind, value))
    for index, flag in enumerate(action.texts("set") or []):
        reads.flags_set.setdefault(flag, (action, child_path("set", index)))
    requires = action.section("requires", optional=True)
    if requires is not None:
        read_conditions(requires, reads)


def read_scene(scene: Section, reads: StoryReads) -> None:
    scene.text("title")
    scene.text("text")
    scene.flag("ending")
    for note in scene.sections("notes", optional=True) or []:
        note.text("text")
        when = note.section("when")
        if when is not None:
            read_conditions(when, reads)
    for action in scene.sections("actions", optional=True) or []:
        read_action(action, reads)


def resolve_story_references(reads: StoryReads, items: dict, scenes: dict) -> None:
    """L4: every scene, item and flag that the story names must exist."""
    known = {"scene": set(scenes), "item": set(items), "flag": set(reads.flags_set)}
    for reference in reads.references:
        if reference.value not in known[reference.kind]:
            complaint = UNKNOWN_REFERENCE[reference.kind]
            shown_value = reference.section.shown(reference.value)
            reference.section.problem(reference.key, complaint.format(shown_value))
    flags_used = {ref.value for ref in reads.references if ref.kind == "flag"}
    for flag, (action, key) in reads.flags_set.items():
        if flag not in flags_used:
            action.warn(key, f"flag {action.shown(flag)} is set but no condition uses it")


def check_story(ctx: Context, file: ContentFile) -> None:
    story = root_section(ctx, file)
    if story is None:
        return
    story.text("title")
    start = story.text("start")
    items = story.section_table("items")
    scenes = story.section_table("scenes")
    for item in (items or {}).values():
        item.text("name")
        item.text("description")
    reads = StoryReads()
    for scene in (scenes or {}).values():
        read_scene(scene, reads)
    if items is None or scenes is None:
        return
    if start is not None and start not in scenes:
        story.problem("start", f"must name a scene, but there is no scene {story.shown(start)}")
    resolve_story_references(reads, items, scenes)


# ---------------------------------------------------------------------------------------------
# L3 and L4: market/companies.json
# ---------------------------------------------------------------------------------------------

# (key, shortest, longest, pattern, what the pattern means) for the text fields of a company.
COMPANY_TEXT_RULES = (
    ("id", 2, 40, ID_PATTERN, ID_HINT),
    ("name", 2, 40, None, ""),
    ("ticker", 1, 6, CAPITALS_AND_DIGITS, "capital letters and digits"),
    ("follows", 2, 60, None, ""),
    ("currency", 1, None, CURRENCY_PATTERN, "3 to 5 capital letters"),
    ("tagline", 1, 120, None, ""),
)


def calendar_market_ids(ctx: Context) -> set[str] | None:
    """The market ids that calendars.json defines, or None when that file cannot be read."""
    data = parsed_data(ctx, CALENDARS_FILE)
    if not isinstance(data, dict) or not isinstance(data.get("markets"), list):
        return None
    markets = [market for market in data["markets"] if isinstance(market, dict)]
    return {market["id"] for market in markets if isinstance(market.get("id"), str)}


def company_entries(ctx: Context) -> list[dict] | None:
    """The companies of companies.json that are objects, or None when it cannot be read."""
    data = parsed_data(ctx, COMPANIES_FILE)
    if not isinstance(data, dict) or not isinstance(data.get("companies"), list):
        return None
    return [company for company in data["companies"] if isinstance(company, dict)]


def company_ids(ctx: Context) -> set[str] | None:
    companies = company_entries(ctx)
    if companies is None:
        return None
    return {company["id"] for company in companies if isinstance(company.get("id"), str)}


def island_symbols(ctx: Context) -> list[str] | None:
    """The Binance pairs that island companies follow, or None when companies.json is unreadable."""
    companies = company_entries(ctx)
    if companies is None:
        return None
    islands = [company for company in companies if company.get("kind") == "island"]
    return [company["symbol"] for company in islands if isinstance(company.get("symbol"), str)]


def read_island(company: Section, seen_pairs: dict[str, str]) -> None:
    symbol = company.text("symbol", 5, 20, CAPITALS_AND_DIGITS, "capital letters and digits")
    check_unique(company, "symbol", symbol, seen_pairs, "Binance pair")
    market = company.text("market")
    if market is not None and market != ALWAYS_OPEN:
        company.problem("market", f'island companies trade around the clock: use "{ALWAYS_OPEN}"')


def read_stock(company: Section, markets: set[str] | None) -> None:
    if "symbol" in company.data:
        company.problem("symbol", "stocks have no symbol (only island companies follow a pair)")
    market = company.text("market")
    if market is None:
        return
    if markets is None:
        company.problem(
            "market", f"{company.shown(market)} cannot be checked: no readable calendars.json"
        )
    elif market not in markets:
        company.problem("market", f"market {company.shown(market)} is not in calendars.json")


def read_company(company: Section, markets: set[str] | None, seen: dict[str, dict]) -> None:
    values = {}
    for key, shortest, longest, pattern, hint in COMPANY_TEXT_RULES:
        values[key] = company.text(key, shortest, longest, pattern, hint)
    check_unique(company, "id", values["id"], seen["id"], "id")
    check_unique(company, "ticker", values["ticker"], seen["ticker"], "ticker")
    kind = company.text("kind", choices=COMPANY_KINDS)
    company.whole_number("priceDecimals", 0, MAX_PRICE_DECIMALS)
    company.flag("delistAtRelighting")
    if "delistAtRelighting" in company.data and values["id"] != GREYFATHOM_ID:
        company.problem(
            "delistAtRelighting", f"only {GREYFATHOM_ID} may be delisted at the Relighting"
        )
    if kind == "island":
        read_island(company, seen["symbol"])
    elif kind == "stock":
        read_stock(company, markets)


def check_companies(ctx: Context, file: ContentFile) -> None:
    data = root_section(ctx, file)
    if data is None:
        return
    data.text("about")
    data.text("nameCheck")
    companies = data.sections("companies")
    if companies is None:
        return
    if not companies:
        data.problem("companies", "must list at least one company")
    if len(companies) > MAX_COMPANIES:
        message = f"must list at most {MAX_COMPANIES} companies, found {len(companies)}"
        data.problem("companies", message)
    markets = calendar_market_ids(ctx)
    seen: dict[str, dict] = {"id": {}, "ticker": {}, "symbol": {}}
    for company in companies:
        read_company(company, markets, seen)


# ---------------------------------------------------------------------------------------------
# L3, L4 and L7: market/calendars.json
# ---------------------------------------------------------------------------------------------


def check_day_in_window(entry: Section, day: date, window: tuple[date | None, date | None]) -> None:
    start, end = window
    if start is not None and end is not None and not start <= day <= end:
        entry.problem("date", f"{day} is outside the calendar ({start} to {end})")
    if day.weekday() >= FIRST_WEEKEND_DAY:
        weekday = WEEKDAY_NAMES[day.weekday()]
        entry.warn("date", f"{day} is a {weekday}: the market is closed at weekends anyway")


def check_short_close(entry: Section, opens: int | None, closes: int | None) -> None:
    close = entry.clock("closes")
    if close is None:
        return
    if opens is not None and close <= opens:
        entry.problem("closes", "must be after the market opens")
    if closes is not None and close >= closes:
        entry.problem("closes", "must be before the regular close")


def read_days(
    market: Section,
    key: str,
    window: tuple[date | None, date | None],
    hours: tuple[int | None, int | None] | None,
) -> dict[date, Section]:
    """Read closedDays (hours is None) or shortDays (hours is opens and closes). Days by date."""
    days: dict[date, Section] = {}
    for entry in market.sections(key, optional=True) or []:
        entry.text("name")
        day = entry.day("date")
        if hours is not None:
            check_short_close(entry, hours[0], hours[1])
        if day is None:
            continue
        check_day_in_window(entry, day, window)
        if day in days:
            entry.problem("date", f"{day} is listed twice (first at {days[day].path_to('date')})")
        else:
            days[day] = entry
    return days


def check_market(
    market: Section, window: tuple[date | None, date | None], seen_ids: dict[str, str]
) -> None:
    check_unique(market, "id", market.text("id", 2, 40, ID_PATTERN, ID_HINT), seen_ids, "market id")
    market.text("name")
    market.text("timeZone")
    market.text("utcOffset", pattern=OFFSET_PATTERN, hint="+HH:MM or -HH:MM")
    market.text("source", optional=True, pattern=HTTPS_PATTERN, hint=HTTPS_HINT)
    opens = market.clock("opens")
    closes = market.clock("closes")
    if opens is not None and closes is not None and closes <= opens:
        market.problem("closes", "must be after opens")
    closed = read_days(market, "closedDays", window, None)
    short = read_days(market, "shortDays", window, (opens, closes))
    for day, entry in short.items():
        if day in closed:
            entry.problem("date", f"{day} is also a closed day: a day cannot be both")


def time_zone_data_available() -> bool:
    """False on a machine without a time-zone database (some Windows setups)."""
    try:
        ZoneInfo(PROBE_TIME_ZONE)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def offset_on(zone: ZoneInfo, day: date) -> str:
    """The UTC offset of a zone at noon on a day, written +HH:MM or -HH:MM."""
    noon = datetime(day.year, day.month, day.day, 12, 0, tzinfo=zone)
    minutes = int(noon.utcoffset().total_seconds() // 60)
    sign = "+" if minutes >= 0 else "-"
    hours, rest = divmod(abs(minutes), 60)
    return f"{sign}{hours:02d}:{rest:02d}"


def check_market_offset(market: Section, first: date, last: date) -> None:
    """L4: the utcOffset of a market is the real offset of its time zone on every day."""
    zone_name = market.data.get("timeZone")
    offset = market.data.get("utcOffset")
    if not isinstance(zone_name, str) or not isinstance(offset, str):
        return
    if not OFFSET_PATTERN.fullmatch(offset):
        return
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError):
        market.problem("timeZone", f"{market.shown(zone_name)} is not a known time zone")
        return
    day = first
    while day <= last:
        real = offset_on(zone, day)
        if real != offset:
            message = f"{offset} does not match {zone_name} on {day} (it is {real} that day)"
            market.problem("utcOffset", message)
            return
        day += timedelta(days=1)


def check_offsets(
    ctx: Context, file: ContentFile, markets: list[Section], window: tuple[date | None, date | None]
) -> None:
    first, last = window
    if first is None or last is None:
        return
    if not time_zone_data_available():
        message = "No time-zone data on this machine: utcOffset was not checked against timeZone."
        ctx.report.note(file.path, "file", message)
        return
    for market in markets:
        check_market_offset(market, first, last)


def check_expiry(ctx: Context, calendar: Section, valid_to: date) -> None:
    """L7: warn when the calendar is about to run out, or already has."""
    days_left = (valid_to - ctx.today).days
    if days_left >= EXPIRY_WARNING_DAYS:
        return
    if days_left >= 0:
        message = (
            f"the calendar ends on {valid_to}, in {plural(days_left, 'day')}: add the next period"
        )
    else:
        ago = plural(-days_left, "day")
        message = f"the calendar ended {ago} ago (on {valid_to}): add the next period"
    calendar.warn("validTo", message)


def check_calendars(ctx: Context, file: ContentFile) -> None:
    calendar = root_section(ctx, file)
    if calendar is None:
        return
    calendar.text("about", optional=True)
    calendar.day("checkedOn", optional=True)
    valid_from = calendar.day("validFrom")
    valid_to = calendar.day("validTo")
    window = (valid_from, valid_to)
    if valid_from is not None and valid_to is not None and valid_from > valid_to:
        calendar.problem("validTo", "must not be before validFrom")
    markets = calendar.sections("markets")
    if markets is not None:
        if not markets:
            calendar.problem("markets", "must list at least one market")
        seen_ids: dict[str, str] = {}
        for market in markets:
            check_market(market, window, seen_ids)
        check_offsets(ctx, file, markets, window)
    if valid_to is not None:
        check_expiry(ctx, calendar, valid_to)


# ---------------------------------------------------------------------------------------------
# L3 and L4: market/replay.json
# ---------------------------------------------------------------------------------------------


def check_series(closes: Section, pair: str, candles: int | None) -> None:
    """One pair of the recording: exactly `candles` prices, each above 0."""
    series = closes.data[pair]
    if not isinstance(series, list):
        closes.problem(pair, "must be a list of prices")
        return
    if candles is not None and len(series) != candles:
        closes.problem(pair, f"must hold exactly {candles} prices, found {len(series)}")
    for index, price in enumerate(series):
        if not is_number(price) or price <= 0:
            closes.problem(child_path(pair, index), "must be a number above 0")


def check_replay(ctx: Context, file: ContentFile) -> None:
    replay = root_section(ctx, file)
    if replay is None:
        return
    replay.text("credit")
    replay.text("licence")
    replay.text("licenceUrl", pattern=HTTPS_PATTERN, hint=HTTPS_HINT)
    candles = replay.whole_number("candles", 1)
    replay.whole_number("candleSeconds", 1)
    closes = replay.section("closes")
    if closes is None:
        return
    for pair in closes.data:
        check_series(closes, pair, candles)
    for pair in island_symbols(ctx) or []:
        if pair not in closes.data:
            replay.problem("closes", f"has no prices for the island pair {pair}")


# ---------------------------------------------------------------------------------------------
# L5: no real personal names in game data
# ---------------------------------------------------------------------------------------------


def all_strings(node: Any, where: str) -> Iterator[tuple[str, str]]:
    """Every text value in a JSON value, with its place. Keys are not values."""
    if isinstance(node, str):
        yield where, node
    elif isinstance(node, dict):
        for key, child in node.items():
            yield from all_strings(child, child_path(where, key))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            yield from all_strings(child, child_path(where, index))


def texts_of_person_field(value: Any, where: str) -> Iterator[tuple[str, str]]:
    """The text of a person field: a text, or each text of a list of texts."""
    if isinstance(value, str):
        yield where, value
    elif isinstance(value, list):
        for index, item in enumerate(value):
            if isinstance(item, str):
                yield child_path(where, index), item


def names_in_people(container: Any, where: str) -> Iterator[tuple[str, str]]:
    """The name of each person in a list or a table of people."""
    if isinstance(container, list):
        children = [(child_path(where, index), child) for index, child in enumerate(container)]
    elif isinstance(container, dict):
        children = [(child_path(where, key), child) for key, child in container.items()]
    else:
        return
    for child_where, child in children:
        if isinstance(child, dict) and isinstance(child.get("name"), str):
            yield child_path(child_where, "name"), child["name"]


def person_texts(node: Any, where: str) -> Iterator[tuple[str, str]]:
    """Every text that names a person: the person fields and the names inside people lists."""
    if isinstance(node, dict):
        for key, child in node.items():
            child_where = child_path(where, key)
            if key in PERSON_FIELDS:
                yield from texts_of_person_field(child, child_where)
            if key in PEOPLE_CONTAINERS:
                yield from names_in_people(child, child_where)
            yield from person_texts(child, child_where)
    elif isinstance(node, list):
        for index, child in enumerate(node):
            yield from person_texts(child, child_path(where, index))


def is_title_or_allowed_name(text: str) -> bool:
    return text.strip() in ALLOWED_NAMES or TITLE_PATTERN.search(text) is not None


def check_people(ctx: Context, file: ContentFile) -> None:
    for where, text in person_texts(file.data, ""):
        is_description = len(text.split()) > MOST_WORDS_IN_A_NAME
        if is_description or is_title_or_allowed_name(text):
            continue
        message = (
            f"{shown(file, text)} is not a title or an allowed name "
            "(characters have titles, not personal names)"
        )
        ctx.report.error(file.path, where, message)
    for where, text in all_strings(file.data, ""):
        if EMAIL_PATTERN.search(text):
            ctx.report.error(file.path, where, "contains an email address: remove it")
        elif HANDLE_PATTERN.search(text):
            ctx.report.error(file.path, where, "contains an @handle: remove it")


def check_game_data(ctx: Context) -> None:
    """L5 runs on every parsed JSON file except the saved weather answers."""
    for name, file in ctx.files.items():
        if file.parsed and not name.startswith(WEATHER_FOLDER):
            check_people(ctx, file)


# ---------------------------------------------------------------------------------------------
# L6: nothing secret on the public list
# ---------------------------------------------------------------------------------------------


def find_public_content(tree: ast.Module) -> ast.Dict | None:
    """The dictionary that PUBLIC_CONTENT is set to, found without running the file."""
    for statement in tree.body:
        if isinstance(statement, ast.AnnAssign) and statement.value is not None:
            targets, value = [statement.target], statement.value
        elif isinstance(statement, ast.Assign):
            targets, value = statement.targets, statement.value
        else:
            continue
        is_public_list = any(isinstance(t, ast.Name) and t.id == "PUBLIC_CONTENT" for t in targets)
        if is_public_list and isinstance(value, ast.Dict):
            return value
    return None


def public_name_problem(root: Path, filename: str) -> str:
    """Why a file name cannot be public, or an empty string when it is fine."""
    slashed = filename.replace("\\", "/")
    if slashed.startswith(SECRET_FOLDER):
        return "must not point into secret/: secret content is never public"
    if "/" in slashed or ".." in filename:
        return 'must be a plain file name without a path (no "/", "\\" or "..")'
    if filename.startswith("."):
        return "must not start with a dot"
    if not (root / filename).is_file():
        return f"the file does not exist in {root.name}/"
    for word in SECRET_NAME_WORDS:
        if word in filename.lower():
            return f'the name must not contain "{word}"'
    return ""


def check_public_entry(ctx: Context, path: Path, key_node: Any, value_node: ast.expr) -> None:
    is_text_key = isinstance(key_node, ast.Constant) and isinstance(key_node.value, str)
    where = f'PUBLIC_CONTENT["{key_node.value}"]' if is_text_key else "PUBLIC_CONTENT"
    line, column = value_node.lineno, value_node.col_offset + 1
    if not (isinstance(value_node, ast.Constant) and isinstance(value_node.value, str)):
        ctx.report.error(path, where, "the file name must be plain text", line, column)
        return
    problem = public_name_problem(ctx.root, value_node.value)
    if problem:
        ctx.report.error(path, where, problem, line, column)
    else:
        ctx.public_names.append(value_node.value)


def check_public_list(ctx: Context) -> None:
    path = ctx.root.parent / ROUTES_FILE
    if not path.is_file():
        message = "cannot find the list of public content, so its checks were skipped"
        ctx.report.warning(path, "file", message)
        return
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError) as error:
        line = getattr(error, "lineno", None) or 0
        column = getattr(error, "offset", None) or 0
        ctx.report.error(path, "file", "cannot read this file as Python code", line, column)
        return
    public_dict = find_public_content(tree)
    if public_dict is None:
        ctx.report.error(path, "file", "PUBLIC_CONTENT was not found as a dictionary")
        return
    # A dictionary's keys and values are two lists of the same length; a key is None for "**other".
    for index, key_node in enumerate(public_dict.keys):
        check_public_entry(ctx, path, key_node, public_dict.values[index])


# ---------------------------------------------------------------------------------------------
# L8: the case rules
# ---------------------------------------------------------------------------------------------


def read_exact_ids(case: Section, key: str, expected: tuple[str, ...], noun: str) -> dict:
    """A list whose ids must be exactly `expected`, once each. Returns the entries by id."""
    entries = case.sections(key)
    if entries is None:
        return {}
    span = f"{expected[0]} to {expected[-1]}"
    if len(entries) != len(expected):
        found = len(entries)
        case.problem(key, f"must list exactly {len(expected)} {noun}s ({span}), found {found}")
    by_id: dict[str, Section] = {}
    for entry in entries:
        entry_id = entry.text("id")
        if entry_id is None:
            continue
        if entry_id not in expected:
            entry.problem("id", f"must be one of {span}, not {entry.shown(entry_id)}")
        elif entry_id in by_id:
            first = by_id[entry_id].path_to("id")
            entry.problem("id", f"duplicate {noun} id {entry.shown(entry_id)} (first at {first})")
        else:
            by_id[entry_id] = entry
    for expected_id in expected:
        if expected_id not in by_id:
            case.problem(key, f"{noun} {expected_id} is missing")
    return by_id


def check_deduction_pairs(case: Section, deductions: dict, cards: dict) -> None:
    """Each deduction names two different cards, and every card is in exactly one deduction."""
    uses = {card_id: 0 for card_id in cards}
    for deduction in deductions.values():
        pair = deduction.texts("cards", optional=False)
        if pair is None:
            continue
        if len(pair) != 2:
            deduction.problem("cards", f"must name exactly two cards, found {len(pair)}")
        elif pair[0] == pair[1]:
            deduction.problem("cards", "must name two different cards")
        named = set()
        for index, card_id in enumerate(pair[:2]):
            if card_id in cards:
                named.add(card_id)
            else:
                complaint = f"names a card that does not exist: {deduction.shown(card_id)}"
                deduction.problem(child_path("cards", index), complaint)
        for card_id in named:
            uses[card_id] += 1
    for card_id, count in uses.items():
        if count == 0:
            case.problem("deductions", f"card {card_id} is in no deduction")
        elif count > 1:
            case.problem("deductions", f"card {card_id} is in {count} deductions")


def read_suspect_ids(case: Section) -> set[str]:
    seen: dict[str, str] = {}
    for suspect in case.sections("suspects") or []:
        check_unique(suspect, "id", suspect.text("id"), seen, "suspect id")
    return set(seen)


def check_culprit(case: Section, suspect_ids: set[str]) -> None:
    """The culprit sits under accusation (the approved case file) or at the top (the first spec)."""
    accusation = case.section("accusation", optional=True)
    if accusation is not None and "culprit" in accusation.data:
        owner = accusation
    elif "culprit" in case.data:
        owner = case
    else:
        case.problem("accusation.culprit", "is missing: the culprit must be one of the suspects")
        return
    culprit = owner.text("culprit")
    if culprit is not None and culprit not in suspect_ids:
        owner.problem("culprit", "is not one of the suspects")


def check_route(route: Section, seen_ids: dict[str, str], companies: set[str] | None) -> None:
    check_unique(route, "id", route.text("id"), seen_ids, "route id")
    for key in ROUTE_COIN_FIELDS:
        route.whole_number(key, 0, optional=True)
    for key in ROUTE_MINUTE_FIELDS:
        route.number(key, 0, optional=True)
    share = route.text("needs_share", optional=True)
    if share is not None and companies is not None and share not in companies:
        route.problem("needs_share", "names a company that is not in companies.json")


def check_routes(ctx: Context, case: Section, cards: dict) -> None:
    """Routes sit inside their card, or in a list at the top with a cardId."""
    routes = []
    for card in cards.values():
        routes += card.sections("routes", optional=True) or []
    for route in case.sections("routes", optional=True) or []:
        card_id = route.text("cardId")
        if card_id is not None and card_id not in cards:
            route.problem("cardId", f"names a card that does not exist: {route.shown(card_id)}")
        routes.append(route)
    seen_ids: dict[str, str] = {}
    companies = company_ids(ctx)
    for route in routes:
        check_route(route, seen_ids, companies)


def normalized(text: str) -> str:
    """A text in lowercase with single spaces, so a copy still matches after small changes."""
    return " ".join(text.split()).lower()


def check_spoilers(ctx: Context, case_file: ContentFile) -> None:
    """No long text of the case file may appear in a public file."""
    case_texts = [
        (where, normalized(text))
        for where, text in all_strings(case_file.data, "")
        if len(text) > SPOILER_LENGTH
    ]
    for name in ctx.public_names:
        public = ctx.files.get(name)
        if public is None or not public.parsed:
            continue
        for where, text in all_strings(public.data, ""):
            public_text = normalized(text)
            for case_where, case_text in case_texts:
                if case_text in public_text:
                    message = f"repeats text from the secret case file (at {case_where})"
                    ctx.report.error(public.path, where, message)
                    break


def check_case(ctx: Context) -> None:
    file = ctx.files.get(CASE_FILE)
    if file is None:
        ctx.report.note(ctx.root / CASE_FILE, "file", "No case file yet: case rules skipped.")
        return
    case = root_section(ctx, file) if file.parsed else None
    if case is None:
        return
    cards = read_exact_ids(case, "cards", CARD_IDS, "card")
    deductions = read_exact_ids(case, "deductions", DEDUCTION_IDS, "deduction")
    check_deduction_pairs(case, deductions, cards)
    check_culprit(case, read_suspect_ids(case))
    check_routes(ctx, case, cards)
    check_spoilers(ctx, file)


# ---------------------------------------------------------------------------------------------
# Running everything, and the command line
# ---------------------------------------------------------------------------------------------

# The checks of L3 and L4 for each file that has a schema.
SCHEMA_CHECKS = {
    STORY_FILE: check_story,
    COMPANIES_FILE: check_companies,
    CALENDARS_FILE: check_calendars,
    REPLAY_FILE: check_replay,
}


def check_schemas(ctx: Context) -> None:
    for name, file in ctx.files.items():
        if not file.parsed:
            continue
        if name in SCHEMA_CHECKS:
            SCHEMA_CHECKS[name](ctx, file)
        elif name != CASE_FILE and not name.startswith(WEATHER_FOLDER):
            message = "no schema yet: only the general checks ran on this file"
            ctx.report.warning(file.path, "file", message)


def run_checks(root: Path, today: date) -> Report:
    report = Report(root.parent)
    files = load_files(root, report)
    ctx = Context(root, today, report, files)
    for file in files.values():
        check_dashes(ctx, file)
        check_secrets(ctx, file)
    check_public_list(ctx)
    check_schemas(ctx)
    check_game_data(ctx)
    check_case(ctx)
    report.file_count = len(files)
    return report


def print_report(report: Report) -> None:
    def place(finding: Finding) -> tuple:
        return (finding.path, finding.line, finding.column, finding.where, finding.message)

    for finding in sorted(report.findings, key=place):
        print(finding.text())
    errors = plural(report.count(ERROR), "error")
    warnings = plural(report.count(WARNING), "warning")
    print(f"Content check: {errors}, {warnings}, {plural(report.file_count, 'file')}.")


def parse_day_argument(text: str) -> date:
    day = parse_day(text)
    if day is None:
        raise argparse.ArgumentTypeError(f"{text!r} is not a day like 2026-11-06 (YYYY-MM-DD)")
    return day


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lint_content.py", description="Check the data files in backend/content/."
    )
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="the content folder")
    parser.add_argument(
        "--today", type=parse_day_argument, default=None, help="the day for check L7 (YYYY-MM-DD)"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = args.root.resolve()
    if not root.is_dir():
        print(f"Cannot run: {root} is not a folder.", file=sys.stderr)
        return 2
    try:
        report = run_checks(root, args.today or date.today())
    except OSError as error:
        print(f"Cannot run: {error}", file=sys.stderr)
        return 2
    print_report(report)
    return 1 if report.count(ERROR) else 0


if __name__ == "__main__":
    sys.exit(main())
