"""Tests for predictions/source.py: one cached Manifold source for each question.

Nothing here uses the network. A FakeManifold plays Manifold, a FakeClock moves time only when the
test says so, and the fallback is the real recording in backend/content/predictions/recorded/.
"""

import asyncio
import json
import logging
import shutil
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import pytest

from server.adapters.base import CachedSource, SourceUnavailable
from server.predictions.questions import load_questions
from server.predictions.source import (
    TTL_SECONDS,
    RecordedOnlySource,
    load_recording,
    make_question_sources,
)
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock
from server.tests.prediction_helpers import (
    RECORDED_FOLDER,
    FakeManifold,
    recorded_answer,
    recording_names,
)

GROUNDHOG = "groundhog-2027"
GROUNDHOG_MARKET = "pRq8uqsEus"
DEMO_SETTINGS = replace(CONFIGURED_SETTINGS, demo_mode=True)


def build(
    fake: FakeManifold, settings=CONFIGURED_SETTINGS, clock=None, folder=RECORDED_FOLDER.parent
):
    """The sources of the real list of questions, on a fake Manifold. Returns sources and clock."""
    clock = clock or FakeClock()
    sources = make_question_sources(
        load_questions(), settings, transport=fake.transport, clock=clock, folder=folder
    )
    return sources, clock


def get(source: CachedSource):
    return asyncio.run(source.get())


# --- one source for each listed question ---


def test_there_is_one_source_for_each_listed_question():
    sources, _ = build(FakeManifold())

    assert sorted(sources) == sorted(question.id for question in load_questions())


def test_a_source_is_named_after_manifold_and_the_question():
    sources, _ = build(FakeManifold())

    assert sources[GROUNDHOG].name == f"manifold:{GROUNDHOG}"


def test_an_answer_is_kept_for_120_seconds():
    sources, _ = build(FakeManifold())

    assert TTL_SECONDS == 120
    assert sources[GROUNDHOG].ttl.total_seconds() == 120


def test_a_fetch_is_cut_off_after_3_seconds():
    sources, _ = build(FakeManifold())

    assert sources[GROUNDHOG].timeout_seconds == 3.0


def test_each_source_asks_manifold_about_its_own_market():
    fake = FakeManifold()
    sources, _ = build(fake)

    get(sources["ophelia-two-billion"])

    assert [request.url.path.rsplit("/", 1)[-1] for request in fake.requests] == ["uyczEh8yAh"]


def test_building_the_sources_never_calls_manifold():
    fake = FakeManifold()

    build(fake)

    assert fake.calls == 0


# --- the cache ---


def test_the_first_get_fetches_and_says_live():
    fake = FakeManifold()
    sources, clock = build(fake)

    result = get(sources[GROUNDHOG])

    assert result.source == "live"
    assert result.fetched_at == clock.now
    assert result.data.market_id == GROUNDHOG_MARKET
    assert fake.calls == 1


def test_a_second_get_within_120_seconds_does_not_fetch_again():
    fake = FakeManifold()
    sources, clock = build(fake)
    get(sources[GROUNDHOG])
    clock.advance(119)

    result = get(sources[GROUNDHOG])

    assert result.source == "cache"
    assert fake.calls == 1


def test_after_120_seconds_it_fetches_again():
    fake = FakeManifold()
    sources, clock = build(fake)
    get(sources[GROUNDHOG])
    clock.advance(120)

    result = get(sources[GROUNDHOG])

    assert result.source == "live"
    assert fake.calls == 2


def test_a_change_at_manifold_shows_after_the_cache_runs_out():
    fake = FakeManifold()
    sources, clock = build(fake)
    assert get(sources[GROUNDHOG]).data.is_resolved is False
    fake.resolve(GROUNDHOG_MARKET, "NO")
    clock.advance(121)

    state = get(sources[GROUNDHOG]).data

    assert (state.is_resolved, state.decided_as) == (True, "no")


# --- when Manifold fails ---


def test_a_failure_after_a_good_answer_gives_the_old_answer_marked_stale():
    fake = FakeManifold()
    sources, clock = build(fake)
    first = get(sources[GROUNDHOG])
    fake.status = 429
    clock.advance(200)

    result = get(sources[GROUNDHOG])

    assert result.source == "stale"
    assert result.fetched_at == first.fetched_at
    assert result.data == first.data


def test_a_failure_from_the_start_gives_the_recorded_answer_marked_fallback():
    fake = FakeManifold()
    fake.status = 500
    sources, _ = build(fake)

    result = get(sources[GROUNDHOG])

    assert result.source == "fallback"
    assert result.fetched_at == datetime(2026, 11, 5, 22, 46, 22, tzinfo=UTC)
    assert result.data.market_id == GROUNDHOG_MARKET
    assert result.data.is_resolved is False


def test_after_a_failure_the_source_waits_one_ttl_before_it_asks_again():
    fake = FakeManifold()
    fake.status = 429
    sources, clock = build(fake)
    get(sources[GROUNDHOG])
    clock.advance(60)
    get(sources[GROUNDHOG])

    assert fake.calls == 1

    clock.advance(61)
    get(sources[GROUNDHOG])

    assert fake.calls == 2


def test_an_answer_the_parser_refuses_counts_as_a_failed_fetch():
    fake = FakeManifold()
    fake.change(GROUNDHOG_MARKET, token="CASH")
    sources, _ = build(fake)

    result = get(sources[GROUNDHOG])

    assert result.source == "fallback"


def test_the_fallback_is_the_recording_of_that_very_question():
    fake = FakeManifold()
    fake.status = 500
    sources, _ = build(fake)

    states = {name: get(source).data for name, source in sources.items()}

    assert {state.market_id for state in states.values()} == {
        question.market_id for question in load_questions()
    }


# --- demo mode ---


def test_demo_mode_never_calls_manifold():
    fake = FakeManifold()
    sources, _ = build(fake, settings=DEMO_SETTINGS)

    list(map(get, sources.values()))

    assert fake.calls == 0


def test_demo_mode_answers_with_the_recording_marked_fallback():
    sources, _ = build(FakeManifold(), settings=DEMO_SETTINGS)

    result = get(sources[GROUNDHOG])

    assert result.source == "fallback"
    assert result.data.market_id == GROUNDHOG_MARKET


def test_demo_mode_uses_the_recorded_only_source():
    sources, _ = build(FakeManifold(), settings=DEMO_SETTINGS)

    assert isinstance(sources[GROUNDHOG], RecordedOnlySource)
    assert sources[GROUNDHOG].can_call_outside() is False


def test_live_mode_uses_the_plain_cached_source():
    sources, _ = build(FakeManifold())

    assert type(sources[GROUNDHOG]) is CachedSource


def test_demo_mode_makes_no_failed_call_and_so_no_warning(caplog):
    sources, _ = build(FakeManifold(), settings=DEMO_SETTINGS)

    with caplog.at_level(logging.WARNING):
        get(sources[GROUNDHOG])

    assert caplog.text == ""


# --- the recordings ---


def copy_recording(tmp_path: Path, market_id: str) -> Path:
    folder = tmp_path / "recorded"
    folder.mkdir(exist_ok=True)
    shutil.copy(RECORDED_FOLDER / f"{market_id}.json", folder / f"{market_id}.json")
    return tmp_path


def test_load_recording_reads_the_answer_and_the_time_it_was_recorded():
    recording = load_recording(RECORDED_FOLDER.parent, GROUNDHOG_MARKET)

    assert recording.recorded_at == datetime(2026, 11, 5, 22, 46, 22, tzinfo=UTC)
    assert recording.data.market_id == GROUNDHOG_MARKET
    assert recording.data.closes_at == datetime(2027, 2, 2, 23, 59, tzinfo=UTC)


def test_a_missing_recording_is_none_and_logged_as_a_warning(tmp_path, caplog):
    with caplog.at_level(logging.WARNING):
        assert load_recording(tmp_path, GROUNDHOG_MARKET) is None

    assert GROUNDHOG_MARKET in caplog.text


def test_a_recording_that_is_not_json_is_none(tmp_path):
    folder = tmp_path / "recorded"
    folder.mkdir()
    (folder / f"{GROUNDHOG_MARKET}.json").write_text("{ not json", encoding="utf-8")

    assert load_recording(tmp_path, GROUNDHOG_MARKET) is None


def test_a_recording_of_another_market_is_none(tmp_path):
    copy_recording(tmp_path, "q68phStPls")
    (tmp_path / "recorded" / "q68phStPls.json").rename(tmp_path / "recorded" / "pRq8uqsEus.json")

    assert load_recording(tmp_path, GROUNDHOG_MARKET) is None


def test_a_recording_without_a_time_zone_in_its_date_is_none(tmp_path):
    copy_recording(tmp_path, GROUNDHOG_MARKET)
    path = tmp_path / "recorded" / f"{GROUNDHOG_MARKET}.json"
    saved = json.loads(path.read_text())
    saved["recordedAt"] = "2026-11-05T22:46:22"
    path.write_text(json.dumps(saved))

    assert load_recording(tmp_path, GROUNDHOG_MARKET) is None


def test_a_recording_with_a_cash_token_is_none(tmp_path):
    copy_recording(tmp_path, GROUNDHOG_MARKET)
    path = tmp_path / "recorded" / f"{GROUNDHOG_MARKET}.json"
    saved = json.loads(path.read_text())
    saved["answer"]["token"] = "CASH"
    path.write_text(json.dumps(saved))

    assert load_recording(tmp_path, GROUNDHOG_MARKET) is None


def test_every_recording_in_the_folder_loads():
    names = [name for name in recording_names() if load_recording(RECORDED_FOLDER.parent, name)]

    assert names == recording_names()


def test_the_saved_recording_and_its_answer_agree_on_the_market():
    assert recorded_answer(GROUNDHOG_MARKET)["id"] == GROUNDHOG_MARKET


# --- a question without a recording ---


def test_a_question_without_a_recording_has_no_fallback(tmp_path):
    fake = FakeManifold()
    fake.status = 500
    sources, _ = build(fake, folder=tmp_path)

    assert sources[GROUNDHOG].fallback is None


def test_a_question_without_a_recording_raises_source_unavailable_when_manifold_is_down(tmp_path):
    fake = FakeManifold()
    fake.status = 500
    sources, _ = build(fake, folder=tmp_path)

    with pytest.raises(SourceUnavailable) as problem:
        get(sources[GROUNDHOG])

    assert problem.value.status_code == 503
    assert problem.value.code == "source_unavailable"


def test_a_question_without_a_recording_still_works_while_manifold_answers(tmp_path):
    sources, _ = build(FakeManifold(), folder=tmp_path)

    assert get(sources[GROUNDHOG]).source == "live"


def test_a_missing_recording_does_not_stop_the_other_questions(tmp_path):
    copy_recording(tmp_path, "q68phStPls")
    fake = FakeManifold()
    fake.status = 500
    sources, _ = build(fake, folder=tmp_path)

    assert sources["warmest-year-2026"].fallback is not None
    assert sources[GROUNDHOG].fallback is None
