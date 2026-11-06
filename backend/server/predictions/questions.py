"""The list of prediction questions, loaded from backend/content/predictions/questions.json.

The questions are picked by hand. Nothing is ever listed automatically: questions that people
make on Manifold can be personal or in bad taste. This file reads the list, checks every field and
hands out Question objects. A mistake in the file stops the desk at start-up with a message that
names the question and the field, so a typo cannot hide until a player stakes.

Two guards keep bad questions away. The first is a person: a question is shown only when
"reviewedBy" and "reviewedOn" name who read the Manifold question and its description, and when.
Until then both say "pending", the question is loaded but never served and never stakeable. The
second is a list of blocked words that must not appear in our text of the question (whole words,
any case). "war" is blocked, "warmest" is not: matching pieces of words is wrong.

The format of the file is written in backend/content/predictions/README.md.

Used by: desk.py (which questions exist and which are served), source.py (one source for each),
and the tests.
"""

import json
import re
import string
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from server.predictions.stake_rules import MIN_MINUTES_BEFORE_EVENT

# backend/server/predictions/questions.py -> parents[2] is backend/
CONTENT_FOLDER = Path(__file__).resolve().parents[2] / "content" / "predictions"
QUESTIONS_FILE = CONTENT_FOLDER / "questions.json"

FILE_FORMAT = 1
MAX_QUESTIONS = 40
PENDING = "pending"

# The database allows the same characters for a question id (prediction_pools_question_id_format).
ID_CHARACTERS = set(string.ascii_lowercase + string.digits + "-")
MARKET_ID_CHARACTERS = set(string.ascii_letters + string.digits)

TOPICS = ("weather", "science", "technology", "culture", "sport")

# Every field of one entry. A name that is not here is a typo, so it is refused.
REQUIRED_FIELDS = (
    "id",
    "source",
    "marketId",
    "text",
    "topic",
    "decidedBy",
    "closesAt",
    "reviewedBy",
    "reviewedOn",
)
OPTIONAL_FIELDS = ("eventAt",)

DECIDED_BY_ENDING = "as resolved on Manifold."

# Why a source is refused. Manifold is the only one built.
SOURCE_REFUSALS = {
    "kalshi": "Kalshi's terms forbid caching and sharing its data.",
    "metaculus": "Metaculus needs an account and hides the numbers.",
    "polymarket": "'polymarket' is reserved, not built yet.",
    "weather": "'weather' is reserved, not built yet.",
}

# The second guard after the human review. Matched as whole words, in any case.
BLOCKED_WORDS = (
    # violence
    "war", "wars", "kill", "killed", "killing", "attack", "attacks", "bomb", "nuclear",
    "terror", "terrorist", "shooting", "shot", "murder",
    # death
    "dead", "die", "dies", "death", "deaths", "dying", "suicide",
    # politics
    "election", "elections", "vote", "votes", "president",
    # adult and personal
    "sex", "porn", "drug", "drugs", "pregnant", "pregnancy",
)  # fmt: skip

# \b is the edge of a word, so "war" does not match inside "warmest" or "Warrior".
BLOCKED_WORD_PATTERN = re.compile(r"\b(" + "|".join(BLOCKED_WORDS) + r")\b", re.IGNORECASE)

DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


class QuestionsError(ValueError):
    """The questions file has a problem. The message says where."""


@dataclass(frozen=True)
class Question:
    """One hand-picked question."""

    id: str  # the pool key in the database and questionId in the API
    market_id: str  # the Manifold market; the only value that is ever put into the address
    text: str  # our own wording of the question, which ends with a question mark
    topic: str
    decided_by: str  # who decides, in plain words, ending "as resolved on Manifold."
    event_at: datetime | None  # when the outcome is decided, if there is one moment
    closes_at: datetime  # when staking closes (UTC)
    reviewed_by: str  # who read the Manifold question, or "pending"
    reviewed_on: str  # the date they read it (YYYY-MM-DD), or "pending"

    @property
    def is_reviewed(self) -> bool:
        """True only when a person has read the question: neither field says "pending"."""
        return PENDING not in (self.reviewed_by, self.reviewed_on)


def find_blocked_word(text: str) -> str | None:
    """The first blocked word in the text (as a whole word, in any case), or None."""
    match = BLOCKED_WORD_PATTERN.search(text)
    return match.group(1).lower() if match else None


def fail(where: str, field: str, problem: str) -> QuestionsError:
    return QuestionsError(f"{where}: '{field}' {problem}")


def read_text_field(
    entry: dict[str, Any], field: str, where: str, shortest: int, longest: int
) -> str:
    """A text field of the right length. The error names the question and the field."""
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        raise fail(where, field, "must be text that is not empty.")
    if not shortest <= len(value) <= longest:
        raise fail(where, field, f"must be {shortest} to {longest} characters long.")
    return value


def read_characters(entry: dict[str, Any], field: str, where: str, allowed: set[str]) -> None:
    """The text of `field` may only use the allowed characters."""
    if not set(entry[field]) <= allowed:
        raise fail(where, field, "has a character that is not allowed.")


def read_source(entry: dict[str, Any], where: str) -> None:
    """Only "manifold" is accepted. The other known sources are refused with their reason."""
    source = entry.get("source")
    if source == "manifold":
        return
    if isinstance(source, str) and source in SOURCE_REFUSALS:
        raise fail(where, "source", f"is refused: {SOURCE_REFUSALS[source]}")
    raise fail(where, "source", "must be 'manifold'.")


def read_question_text(entry: dict[str, Any], where: str) -> str:
    text = read_text_field(entry, "text", where, 10, 140)
    if not text.endswith("?"):
        raise fail(where, "text", "must end with a question mark.")
    blocked = find_blocked_word(text)
    if blocked is not None:
        raise fail(where, "text", f"contains the blocked word '{blocked}'.")
    return text


def read_decided_by(entry: dict[str, Any], where: str) -> str:
    decided_by = read_text_field(entry, "decidedBy", where, 10, 160)
    if not decided_by.endswith(DECIDED_BY_ENDING):
        raise fail(where, "decidedBy", f"must end with '{DECIDED_BY_ENDING}'")
    return decided_by


def read_time(entry: dict[str, Any], field: str, where: str) -> datetime:
    """A time with a time zone, such as 2026-12-17T12:00:00Z, turned into UTC."""
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        raise fail(where, field, "must be a time written like 2026-12-17T12:00:00Z.")
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise fail(where, field, "must be a time written like 2026-12-17T12:00:00Z.") from error
    if moment.tzinfo is None:
        raise fail(where, field, "must have a time zone, for example a Z for UTC.")
    return moment.astimezone(UTC)


def read_reviewed_on(entry: dict[str, Any], where: str) -> str:
    """The date a person read the question: YYYY-MM-DD, or "pending"."""
    value = entry.get("reviewedOn")
    if value == PENDING:
        return PENDING
    message = "must be a real date written like 2026-11-20, or 'pending'."
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        raise fail(where, "reviewedOn", message)
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise fail(where, "reviewedOn", message) from error
    return value


def read_question(entry: object, position: int) -> Question:
    """Check one entry of the file and turn it into a Question."""
    where = f"questions[{position}]"
    if not isinstance(entry, dict):
        raise QuestionsError(f"{where} must be an object.")
    for field in entry:
        if field not in REQUIRED_FIELDS + OPTIONAL_FIELDS:
            raise fail(where, field, "is not a field of a question.")
    # From here on the error also names the question, as soon as its id is known.
    entry_id = entry.get("id")
    if isinstance(entry_id, str) and entry_id:
        where = f"{where} ({entry_id})"

    question_id = read_text_field(entry, "id", where, 2, 40)
    read_characters(entry, "id", where, ID_CHARACTERS)
    read_source(entry, where)
    market_id = read_text_field(entry, "marketId", where, 6, 40)
    read_characters(entry, "marketId", where, MARKET_ID_CHARACTERS)
    text = read_question_text(entry, where)
    topic = entry.get("topic")
    if topic not in TOPICS:
        raise fail(where, "topic", f"must be one of: {', '.join(TOPICS)}.")
    decided_by = read_decided_by(entry, where)
    closes_at = read_time(entry, "closesAt", where)
    event_at = read_time(entry, "eventAt", where) if "eventAt" in entry else None
    if event_at is not None and closes_at > event_at - timedelta(minutes=MIN_MINUTES_BEFORE_EVENT):
        raise fail(
            where,
            "closesAt",
            f"must be at least {MIN_MINUTES_BEFORE_EVENT} minutes before 'eventAt'.",
        )
    return Question(
        id=question_id,
        market_id=market_id,
        text=text,
        topic=topic,
        decided_by=decided_by,
        event_at=event_at,
        closes_at=closes_at,
        reviewed_by=read_text_field(entry, "reviewedBy", where, 1, 60),
        reviewed_on=read_reviewed_on(entry, where),
    )


def check_no_duplicates(questions: list[Question]) -> None:
    """Every id and every market id is used by exactly one question."""
    for field_name in ("id", "market_id"):
        values = [getattr(question, field_name) for question in questions]
        if len(values) != len(set(values)):
            json_name = "marketId" if field_name == "market_id" else "id"
            raise QuestionsError(f"Two questions share the same '{json_name}'.")


def load_questions(path: Path = QUESTIONS_FILE) -> tuple[Question, ...]:
    """Read and check the questions file. Raises QuestionsError if anything is wrong."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise QuestionsError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict) or data.get("format") != FILE_FORMAT:
        raise QuestionsError(f"{path.name}: 'format' must be {FILE_FORMAT}.")
    entries = data.get("questions")
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_QUESTIONS:
        raise QuestionsError(f"'questions' must be a list of 1 to {MAX_QUESTIONS} entries.")
    questions = [read_question(entry, position) for position, entry in enumerate(entries)]
    check_no_duplicates(questions)
    return tuple(questions)


def served_questions(questions: tuple[Question, ...]) -> tuple[Question, ...]:
    """The questions a player may see: only those a person has read, in the order of the file."""
    return tuple(question for question in questions if question.is_reviewed)


def find_question(questions: tuple[Question, ...], question_id: str) -> Question | None:
    """A served question by its id. A pending or unknown question is not found."""
    for question in served_questions(questions):
        if question.id == question_id:
            return question
    return None
