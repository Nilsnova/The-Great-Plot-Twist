"""Tests for predictions/questions.py: the hand-picked list of questions, and the real file.

The list lives in backend/content/predictions/questions.json. The loader checks every field and
stops with a message that names the question and the field. A question that a person has not
read yet (reviewedBy or reviewedOn is "pending") is loaded but never served.

The tests that use a made-up file write it into a temporary folder. The tests of the real file
only check what must always be true, so they keep passing when a person marks a question as read.
"""

import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from server.predictions.manifold import parse_market
from server.predictions.questions import (
    BLOCKED_WORDS,
    MAX_QUESTIONS,
    QUESTIONS_FILE,
    TOPICS,
    QuestionsError,
    find_blocked_word,
    find_question,
    load_questions,
    served_questions,
)
from server.predictions.source import load_recording
from server.predictions.stake_rules import MIN_MINUTES_BEFORE_EVENT

CONTENT_FOLDER = QUESTIONS_FILE.parent


def good_entry(**changes) -> dict:
    """One valid entry of questions.json. A test changes one field and keeps the rest."""
    entry = {
        "id": "groundhog-2027",
        "source": "manifold",
        "marketId": "pRq8uqsEus",
        "text": "Will Punxsutawney Phil see his shadow on Groundhog Day, 2 February 2027?",
        "topic": "weather",
        "decidedBy": "The Groundhog Club announcement on 2 February 2027, as resolved on Manifold.",
        "eventAt": "2027-02-02T12:00:00Z",
        "closesAt": "2027-02-01T23:00:00Z",
        "reviewedBy": "Nils",
        "reviewedOn": "2026-11-20",
    }
    entry.update(changes)
    return entry


def second_entry(**changes) -> dict:
    return good_entry(id="warmest-year-2026", marketId="q68phStPls", **changes)


def write_questions(tmp_path: Path, entries: list, file_format: int = 1) -> Path:
    path = tmp_path / "questions.json"
    path.write_text(json.dumps({"format": file_format, "questions": entries}), encoding="utf-8")
    return path


def load_one(tmp_path: Path, **changes):
    """Load a file with one entry, changed as the test says."""
    return load_questions(write_questions(tmp_path, [good_entry(**changes)]))


# --- a good file ---


def test_a_good_entry_becomes_a_question_with_our_own_names(tmp_path):
    (question,) = load_one(tmp_path)

    assert question.id == "groundhog-2027"
    assert question.market_id == "pRq8uqsEus"
    assert question.topic == "weather"
    assert question.text.startswith("Will Punxsutawney Phil")
    assert question.decided_by.endswith("as resolved on Manifold.")
    assert question.event_at == datetime(2027, 2, 2, 12, 0, tzinfo=UTC)
    assert question.closes_at == datetime(2027, 2, 1, 23, 0, tzinfo=UTC)
    assert question.reviewed_by == "Nils"
    assert question.reviewed_on == "2026-11-20"


def test_questions_keep_the_order_of_the_file(tmp_path):
    path = write_questions(tmp_path, [second_entry(), good_entry()])

    assert [question.id for question in load_questions(path)] == [
        "warmest-year-2026",
        "groundhog-2027",
    ]


def test_the_time_of_the_decision_is_optional(tmp_path):
    entry = good_entry()
    del entry["eventAt"]

    (question,) = load_questions(write_questions(tmp_path, [entry]))

    assert question.event_at is None


def test_times_with_another_offset_are_turned_into_utc(tmp_path):
    (question,) = load_one(tmp_path, closesAt="2027-02-02T00:00:00+01:00")

    assert question.closes_at == datetime(2027, 2, 1, 23, 0, tzinfo=UTC)


def test_the_longest_allowed_text_is_accepted(tmp_path):
    text = "Will " + "x" * 134 + "?"

    (question,) = load_one(tmp_path, text=text)

    assert len(question.text) == 140


# --- the file as a whole ---


def test_a_missing_file_is_a_questions_error(tmp_path):
    with pytest.raises(QuestionsError, match="Cannot read questions.json"):
        load_questions(tmp_path / "questions.json")


def test_a_file_that_is_not_json_is_a_questions_error(tmp_path):
    path = tmp_path / "questions.json"
    path.write_text("{ not json", encoding="utf-8")

    with pytest.raises(QuestionsError, match="Cannot read questions.json"):
        load_questions(path)


def test_the_file_format_must_be_1(tmp_path):
    with pytest.raises(QuestionsError, match="'format' must be 1"):
        load_questions(write_questions(tmp_path, [good_entry()], file_format=2))


def test_an_empty_list_of_questions_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="1 to 40"):
        load_questions(write_questions(tmp_path, []))


def test_40_questions_are_accepted(tmp_path):
    entries = [
        good_entry(id=f"question-{number:02d}", marketId=f"market{number:04d}")
        for number in range(MAX_QUESTIONS)
    ]

    assert len(load_questions(write_questions(tmp_path, entries))) == 40


def test_more_than_40_questions_are_refused(tmp_path):
    entries = [
        good_entry(id=f"question-{number:02d}", marketId=f"market{number:04d}")
        for number in range(MAX_QUESTIONS + 1)
    ]

    with pytest.raises(QuestionsError, match="1 to 40"):
        load_questions(write_questions(tmp_path, entries))


def test_an_entry_that_is_not_an_object_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match=r"questions\[0\] must be an object"):
        load_questions(write_questions(tmp_path, ["groundhog-2027"]))


def test_two_questions_with_the_same_id_are_refused(tmp_path):
    path = write_questions(tmp_path, [good_entry(), good_entry(marketId="q68phStPls")])

    with pytest.raises(QuestionsError, match="share the same 'id'"):
        load_questions(path)


def test_two_questions_about_the_same_market_are_refused(tmp_path):
    path = write_questions(tmp_path, [good_entry(), good_entry(id="second-groundhog")])

    with pytest.raises(QuestionsError, match="share the same 'marketId'"):
        load_questions(path)


def test_a_field_that_is_not_part_of_the_format_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'reviewdBy' is not a field"):
        load_one(tmp_path, reviewdBy="Nils")


@pytest.mark.parametrize(
    "field",
    [
        "id",
        "source",
        "marketId",
        "text",
        "topic",
        "decidedBy",
        "closesAt",
        "reviewedBy",
        "reviewedOn",
    ],
)
def test_a_missing_required_field_is_refused_and_named(tmp_path, field):
    entry = good_entry()
    del entry[field]

    with pytest.raises(QuestionsError, match=f"'{field}'"):
        load_questions(write_questions(tmp_path, [entry]))


def test_an_error_names_the_question_and_the_field(tmp_path):
    path = write_questions(tmp_path, [good_entry(), second_entry(text="Short?")])

    with pytest.raises(QuestionsError) as problem:
        load_questions(path)

    assert str(problem.value).startswith("questions[1] (warmest-year-2026): 'text'")


# --- id and market id ---


@pytest.mark.parametrize("bad_id", ["", "a", "Groundhog", "ground hog", "ground_hog", "x" * 41, 7])
def test_a_bad_id_is_refused(tmp_path, bad_id):
    with pytest.raises(QuestionsError, match="'id'"):
        load_one(tmp_path, id=bad_id)


def test_ids_may_have_two_to_forty_lowercase_letters_digits_and_hyphens(tmp_path):
    assert load_one(tmp_path, id="ab")[0].id == "ab"
    assert load_one(tmp_path, id="a-1" * 13 + "z")[0].id == "a-1" * 13 + "z"


@pytest.mark.parametrize("bad_id", ["abc12", "a b c d e", "market/../x", "x" * 41, "marketé", ""])
def test_a_bad_market_id_is_refused(tmp_path, bad_id):
    with pytest.raises(QuestionsError, match="'marketId'"):
        load_one(tmp_path, marketId=bad_id)


def test_a_market_id_has_six_to_forty_letters_and_digits(tmp_path):
    assert load_one(tmp_path, marketId="Ab1234")[0].market_id == "Ab1234"
    assert load_one(tmp_path, marketId="A" * 40)[0].market_id == "A" * 40


# --- the source ---


def test_manifold_is_the_only_accepted_source(tmp_path):
    assert load_one(tmp_path, source="manifold")[0].id == "groundhog-2027"


def test_kalshi_is_refused_because_its_terms_forbid_caching_and_sharing(tmp_path):
    with pytest.raises(QuestionsError, match="Kalshi's terms forbid caching and sharing"):
        load_one(tmp_path, source="kalshi")


def test_metaculus_is_refused_because_it_needs_an_account_and_hides_the_numbers(tmp_path):
    with pytest.raises(QuestionsError, match="Metaculus needs an account and hides the numbers"):
        load_one(tmp_path, source="metaculus")


@pytest.mark.parametrize("source", ["polymarket", "weather"])
def test_polymarket_and_weather_are_reserved_and_not_built_yet(tmp_path, source):
    with pytest.raises(QuestionsError, match="reserved, not built yet"):
        load_one(tmp_path, source=source)


def test_any_other_source_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'source' must be 'manifold'"):
        load_one(tmp_path, source="a-friend-told-me")


# --- the topic ---


def test_the_topics_are_the_five_agreed_ones():
    assert TOPICS == ("weather", "science", "technology", "culture", "sport")


@pytest.mark.parametrize("topic", TOPICS)
def test_every_agreed_topic_is_accepted(tmp_path, topic):
    assert load_one(tmp_path, topic=topic)[0].topic == topic


@pytest.mark.parametrize("topic", ["politics", "Weather", "", "war"])
def test_a_topic_that_is_not_on_the_list_is_refused(tmp_path, topic):
    with pytest.raises(QuestionsError, match="'topic'"):
        load_one(tmp_path, topic=topic)


# --- the text ---


def test_a_text_over_140_characters_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'text'.*10 to 140"):
        load_one(tmp_path, text="Will " + "x" * 135 + "?")


def test_a_text_under_10_characters_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'text'.*10 to 140"):
        load_one(tmp_path, text="Will it?")


def test_a_text_without_a_question_mark_at_the_end_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'text' must end with a question mark"):
        load_one(tmp_path, text="Phil will see his shadow on Groundhog Day.")


def test_a_text_that_is_not_text_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'text'"):
        load_one(tmp_path, text=42)


@pytest.mark.parametrize("word", BLOCKED_WORDS)
def test_every_blocked_word_is_refused_in_a_text(tmp_path, word):
    with pytest.raises(QuestionsError, match=f"blocked word '{word}'"):
        load_one(tmp_path, text=f"Will there be a {word} this winter at the harbor?")


def test_a_blocked_word_is_found_in_any_case(tmp_path):
    with pytest.raises(QuestionsError, match="blocked word 'war'"):
        load_one(tmp_path, text="Will there be a WAR this winter at the harbor?")


def test_a_blocked_word_is_refused_as_a_whole_word_only_so_warmest_passes(tmp_path):
    (question,) = load_one(tmp_path, text="Will 2026 be the warmest year on record?")

    assert question.text == "Will 2026 be the warmest year on record?"


@pytest.mark.parametrize(
    "text",
    [
        "Will the warming of 2026 beat every record?",
        "Will the Warrior statue be unveiled in Lisbon this year?",
        "Will Dr. Voteng open a new bakery in the harbor town?",
        "Will the skills workshop open in the harbor town this year?",
    ],
)
def test_words_that_only_contain_a_blocked_word_are_not_blocked(text):
    assert find_blocked_word(text) is None


@pytest.mark.parametrize(
    ("text", "word"),
    [
        ("Is there a war in the story?", "war"),
        ("Who will be president of the club?", "president"),
        ("Was the song a drug-free anthem?", "drug"),
        ("Will the (election) be held?", "election"),
    ],
)
def test_find_blocked_word_names_the_word_it_found(text, word):
    assert find_blocked_word(text) == word


def test_find_blocked_word_gives_none_for_a_clean_text():
    assert find_blocked_word("Will 2026 be the warmest year on record?") is None


def test_the_blocked_words_are_the_agreed_list():
    assert set(BLOCKED_WORDS) == {
        "war", "wars", "kill", "killed", "killing", "attack", "attacks", "bomb", "nuclear",
        "terror", "terrorist", "shooting", "shot", "murder",
        "dead", "die", "dies", "death", "deaths", "dying", "suicide",
        "election", "elections", "vote", "votes", "president",
        "sex", "porn", "drug", "drugs", "pregnant", "pregnancy",
    }  # fmt: skip


# --- decided by ---


def test_decided_by_must_end_with_as_resolved_on_manifold(tmp_path):
    with pytest.raises(QuestionsError, match="'decidedBy' must end with"):
        load_one(tmp_path, decidedBy="The Groundhog Club announcement on 2 February 2027.")


def test_decided_by_must_be_10_to_160_characters(tmp_path):
    too_long = "x" * 140 + " as resolved on Manifold."

    with pytest.raises(QuestionsError, match="'decidedBy'.*10 to 160"):
        load_one(tmp_path, decidedBy=too_long)
    with pytest.raises(QuestionsError, match="'decidedBy'.*10 to 160"):
        load_one(tmp_path, decidedBy="as resolved on Manifold."[:9])


# --- the times ---


def test_a_closing_time_without_a_time_zone_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'closesAt' must have a time zone"):
        load_one(tmp_path, closesAt="2027-02-01T23:00:00")


def test_a_closing_time_that_is_only_a_date_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'closesAt' must have a time zone"):
        load_one(tmp_path, closesAt="2027-02-01")


@pytest.mark.parametrize("bad_time", ["tomorrow", "", None, 1798761540])
def test_a_closing_time_that_is_not_a_time_is_refused(tmp_path, bad_time):
    with pytest.raises(QuestionsError, match="'closesAt'"):
        load_one(tmp_path, closesAt=bad_time)


def test_the_time_of_the_decision_needs_a_time_zone_too(tmp_path):
    with pytest.raises(QuestionsError, match="'eventAt' must have a time zone"):
        load_one(tmp_path, eventAt="2027-02-02T12:00:00")


def test_a_question_must_close_at_least_60_minutes_before_it_is_decided(tmp_path):
    assert MIN_MINUTES_BEFORE_EVENT == 60
    event = datetime(2027, 2, 2, 12, 0, tzinfo=UTC)
    closes = event - timedelta(minutes=59)

    with pytest.raises(QuestionsError, match="'closesAt' must be at least 60 minutes before"):
        load_one(tmp_path, closesAt=closes.isoformat())


def test_closing_exactly_60_minutes_before_the_decision_is_accepted(tmp_path):
    event = datetime(2027, 2, 2, 12, 0, tzinfo=UTC)

    (question,) = load_one(tmp_path, closesAt=(event - timedelta(minutes=60)).isoformat())

    assert question.closes_at == event - timedelta(minutes=60)


def test_closing_after_the_decision_is_refused(tmp_path):
    with pytest.raises(QuestionsError, match="'closesAt' must be at least 60 minutes before"):
        load_one(tmp_path, closesAt="2027-02-03T00:00:00Z")


# --- reviewed by a person ---


def test_a_question_with_a_reviewer_and_a_date_is_reviewed(tmp_path):
    (question,) = load_one(tmp_path)

    assert question.is_reviewed is True


@pytest.mark.parametrize(
    "changes",
    [
        {"reviewedBy": "pending"},
        {"reviewedOn": "pending"},
        {"reviewedBy": "pending", "reviewedOn": "pending"},
    ],
)
def test_pending_in_either_field_means_the_question_is_not_reviewed(tmp_path, changes):
    (question,) = load_one(tmp_path, **changes)

    assert question.is_reviewed is False


@pytest.mark.parametrize("bad_date", ["6 Nov 2026", "2026-13-01", "2026-11-31", "20261106", "", 5])
def test_a_review_date_must_be_a_real_date_written_year_month_day(tmp_path, bad_date):
    with pytest.raises(QuestionsError, match="'reviewedOn'"):
        load_one(tmp_path, reviewedOn=bad_date)


@pytest.mark.parametrize("bad_name", ["", "   ", "x" * 61, 5])
def test_a_reviewer_must_be_a_name(tmp_path, bad_name):
    with pytest.raises(QuestionsError, match="'reviewedBy'"):
        load_one(tmp_path, reviewedBy=bad_name)


def test_a_pending_question_is_loaded_but_not_served(tmp_path):
    entries = [good_entry(reviewedBy="pending", reviewedOn="pending"), second_entry()]
    questions = load_questions(write_questions(tmp_path, entries))

    assert [question.id for question in questions] == ["groundhog-2027", "warmest-year-2026"]
    assert [question.id for question in served_questions(questions)] == ["warmest-year-2026"]


def test_served_questions_keep_the_order_of_the_file(tmp_path):
    entries = [second_entry(), good_entry()]
    questions = load_questions(write_questions(tmp_path, entries))

    assert [question.id for question in served_questions(questions)] == [
        "warmest-year-2026",
        "groundhog-2027",
    ]


def test_find_question_finds_a_reviewed_question_by_its_id(tmp_path):
    questions = load_questions(write_questions(tmp_path, [good_entry()]))

    assert find_question(questions, "groundhog-2027") is questions[0]


def test_find_question_does_not_find_a_pending_question(tmp_path):
    questions = load_questions(write_questions(tmp_path, [good_entry(reviewedOn="pending")]))

    assert find_question(questions, "groundhog-2027") is None


def test_find_question_does_not_find_an_unknown_id(tmp_path):
    questions = load_questions(write_questions(tmp_path, [good_entry()]))

    assert find_question(questions, "no-such-question") is None


# --- the real file ---


def real_questions():
    return load_questions()


def test_the_real_file_loads():
    questions = real_questions()

    assert 1 <= len(questions) <= MAX_QUESTIONS


def test_the_real_file_has_the_five_agreed_questions_with_weather_first():
    questions = real_questions()

    assert [question.id for question in questions] == [
        "groundhog-2027",
        "warmest-year-2026",
        "avengers-opening-record",
        "ophelia-two-billion",
        "ai-song-top-20",
    ]
    assert [question.topic for question in questions[:2]] == ["weather", "weather"]


def test_ids_and_market_ids_in_the_real_file_are_unique():
    questions = real_questions()

    assert len({question.id for question in questions}) == len(questions)
    assert len({question.market_id for question in questions}) == len(questions)


def test_no_text_in_the_real_file_has_a_blocked_word():
    assert [q.id for q in real_questions() if find_blocked_word(q.text) is not None] == []


@pytest.mark.parametrize("question", real_questions(), ids=lambda question: question.id)
def test_the_real_file_names_a_reviewer_and_a_date_only_together(question):
    # "pending" means not read yet. Either both fields say so, or both name a person and a date.
    pending_fields = [question.reviewed_by == "pending", question.reviewed_on == "pending"]

    assert pending_fields in ([True, True], [False, False])


@pytest.mark.parametrize("question", real_questions(), ids=lambda question: question.id)
def test_every_listed_question_has_a_valid_recorded_answer(question):
    recording = load_recording(CONTENT_FOLDER, question.market_id)

    assert recording is not None
    assert recording.data.market_id == question.market_id
    assert recording.data.is_resolved is False


@pytest.mark.parametrize("question", real_questions(), ids=lambda question: question.id)
def test_a_question_closes_before_manifold_closes_it(question):
    recorded = load_recording(CONTENT_FOLDER, question.market_id).data

    assert question.closes_at <= recorded.closes_at


@pytest.mark.parametrize("question", real_questions(), ids=lambda question: question.id)
def test_the_recorded_manifold_question_has_no_blocked_word(question):
    saved = json.loads((CONTENT_FOLDER / "recorded" / f"{question.market_id}.json").read_text())

    assert find_blocked_word(saved["answer"]["question"]) is None


@pytest.mark.parametrize("path", sorted((CONTENT_FOLDER / "samples").glob("*.json")), ids=str)
def test_the_sample_questions_have_no_blocked_word_either(path):
    saved = json.loads(path.read_text())

    assert find_blocked_word(saved["answer"]["question"]) is None


@pytest.mark.parametrize("question", real_questions(), ids=lambda question: question.id)
def test_the_recorded_answer_of_a_question_parses_as_a_market(question):
    saved = json.loads((CONTENT_FOLDER / "recorded" / f"{question.market_id}.json").read_text())

    assert parse_market(saved["answer"], question.market_id).market_id == question.market_id


# --- the README of the content folder ---

README = (CONTENT_FOLDER / "README.md").read_text(encoding="utf-8")
README_JSON_BLOCKS = re.findall(r"```json\n(.*?)\n```", README, re.DOTALL)
README_ENTRIES = [
    json.loads(block)
    for block in README_JSON_BLOCKS
    if '"marketId"' in block and '"format"' not in block
]


def test_the_readme_example_file_is_a_valid_questions_file(tmp_path):
    example = next(json.loads(block) for block in README_JSON_BLOCKS if '"format"' in block)

    (question,) = load_questions(write_questions(tmp_path, example["questions"]))

    assert question.id == "groundhog-2027"


def test_the_readme_has_the_example_and_the_two_reserves():
    assert [entry["id"] for entry in README_ENTRIES] == ["berkeley-earth-2026", "world-chess-2026"]


@pytest.mark.parametrize("entry", README_ENTRIES, ids=lambda entry: entry["id"])
def test_a_reserve_in_the_readme_is_a_valid_entry_that_closes_before_manifold_does(entry, tmp_path):
    (question,) = load_questions(write_questions(tmp_path, [entry]))

    recorded = load_recording(CONTENT_FOLDER, question.market_id)

    assert question.is_reviewed is False
    assert recorded is not None
    assert question.closes_at <= recorded.data.closes_at
