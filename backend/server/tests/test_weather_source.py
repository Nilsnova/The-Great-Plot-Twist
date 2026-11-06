"""Tests for weather/source.py: the cache, the fallbacks, demo mode and the recorded file.

Every test uses a fake network (httpx.MockTransport) and a fake clock, so nothing here talks to
Open-Meteo for real and nothing waits for real time to pass.
"""

import asyncio
import json
import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from server.adapters.base import SourceUnavailable
from server.tests.helpers import FakeClock, FakeReply, fail_with
from server.tests.weather_helpers import (
    BACKEND_ROOT,
    FOGGY_HOUR,
    LISBON_SETTINGS,
    WEATHER_CONTENT,
    answer_with_hours,
    answer_with_sample,
    hours_of,
    load_recorded_file,
    load_sample_answer,
    make_slow_transport,
    make_transport,
    replies_in_order,
    reply_with_answer,
)
from server.weather.open_meteo import parse_open_meteo_answer
from server.weather.source import (
    ATTRIBUTION,
    CONTENT_FOLDER,
    RECORDED_FILE_NAME,
    TTL_SECONDS,
    PlaceReading,
    RecordedOnlySource,
    load_recorded_weather,
    make_weather_source,
)

RECORDED_AT = datetime(2026, 11, 5, 17, 14, 33, tzinfo=UTC)
FIRST_HOUR = datetime(2026, 11, 5, 17, 0, tzinfo=UTC)

SECRET_LOOKING_WORDS = ("apikey", "api_key", "secret", "token", "password", "bearer")


def make_source(
    reply: FakeReply, clock: FakeClock | None = None, recorded_folder: Path = CONTENT_FOLDER
):
    """A weather source on a fake network. Returns the source and the list of requests it sent."""
    transport, seen = make_transport(reply)
    clock = clock or FakeClock()
    return make_weather_source(LISBON_SETTINGS, transport, clock, recorded_folder), seen


async def ask_at_the_same_moment(source, players: int):
    """Let `players` players ask the source for the weather at the very same moment."""
    return await asyncio.gather(*[source.get() for _ in range(players)])


def count_sources(results) -> dict[str, int]:
    """How many results came from each place, for example {"live": 1, "cache": 19}."""
    counts: dict[str, int] = {}
    for result in results:
        counts[result.source] = counts.get(result.source, 0) + 1
    return counts


def find_secret_looking_words(text: str) -> list[str]:
    """Every word from SECRET_LOOKING_WORDS that appears in the text (any capital letters)."""
    return [word for word in SECRET_LOOKING_WORDS if word in text.lower()]


# --- the cached source: live, cache, stale, fallback ---


def test_the_first_call_asks_open_meteo_and_says_live():
    clock = FakeClock()
    source, seen = make_source(answer_with_sample("rain"), clock)

    result = asyncio.run(source.get())

    assert result.source == "live"
    assert result.fetched_at == clock.now
    assert len(seen) == 1
    assert isinstance(result.data, PlaceReading)
    assert result.data.reading == parse_open_meteo_answer(load_sample_answer("rain"))


def test_the_coordinates_and_the_place_name_come_from_the_settings():
    source, seen = make_source(answer_with_sample("rain"))

    result = asyncio.run(source.get())

    assert seen[0].url.params["latitude"] == "38.72"
    assert seen[0].url.params["longitude"] == "-9.14"
    assert result.data.place == "Lisbon, Portugal"


def test_a_second_call_inside_ten_minutes_comes_from_the_cache_without_a_new_request():
    clock = FakeClock()
    source, seen = make_source(answer_with_sample("rain"), clock)
    first = asyncio.run(source.get())

    clock.advance(TTL_SECONDS - 1)
    second = asyncio.run(source.get())

    assert second.source == "cache"
    assert second.fetched_at == first.fetched_at
    assert second.data == first.data
    assert len(seen) == 1


def test_a_call_after_ten_minutes_asks_open_meteo_again():
    clock = FakeClock()
    source, seen = make_source(answer_with_sample("rain"), clock)
    asyncio.run(source.get())

    clock.advance(TTL_SECONDS)
    result = asyncio.run(source.get())

    assert result.source == "live"
    assert result.fetched_at == clock.now
    assert len(seen) == 2


def test_the_cache_time_is_ten_minutes_and_the_timeout_is_short():
    source, _ = make_source(answer_with_sample("rain"))

    assert TTL_SECONDS == 600
    assert source.name == "weather"
    assert source.ttl == timedelta(minutes=10)
    assert 0 < source.timeout_seconds <= 5


def test_many_calls_at_the_same_moment_cause_one_request():
    # The slow fake pauses before it answers, like a real network call. That lets the other 19
    # players arrive while the first request is still on its way, which is what we want to test.
    transport, seen = make_slow_transport(answer_with_sample("rain"))
    source = make_weather_source(LISBON_SETTINGS, transport, FakeClock())

    results = asyncio.run(ask_at_the_same_moment(source, players=20))

    assert len(seen) == 1
    assert count_sources(results) == {"live": 1, "cache": 19}


def test_when_open_meteo_goes_down_the_last_good_reading_is_returned_as_stale():
    clock = FakeClock()
    reply = replies_in_order(answer_with_sample("rain"), fail_with(httpx.ConnectError))
    source, _ = make_source(reply, clock)
    first = asyncio.run(source.get())

    clock.advance(TTL_SECONDS)
    second = asyncio.run(source.get())

    assert second.source == "stale"
    assert second.data == first.data
    assert second.fetched_at == first.fetched_at


def test_when_open_meteo_is_down_from_the_start_the_recorded_answer_is_the_fallback():
    source, _ = make_source(fail_with(httpx.ConnectError))

    result = asyncio.run(source.get())

    assert result.source == "fallback"
    assert result.fetched_at == RECORDED_AT
    assert result.data.place == "Torshavn, Faroe Islands"
    assert result.data.reading.weather_code == 3


def test_a_timeout_of_the_whole_call_also_falls_back():
    async def too_slow(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json={})

    source = make_weather_source(LISBON_SETTINGS, httpx.MockTransport(too_slow), FakeClock())
    source.timeout_seconds = 0.05  # do not make the test wait the real 3 seconds

    result = asyncio.run(source.get())

    assert result.source == "fallback"


def test_an_answer_without_weather_in_it_also_falls_back():
    source, _ = make_source(lambda request: httpx.Response(200, json={"error": True}))

    assert asyncio.run(source.get()).source == "fallback"


def test_after_a_failure_the_source_waits_one_cache_time_before_asking_again():
    clock = FakeClock()
    source, seen = make_source(fail_with(httpx.ConnectError), clock)
    asyncio.run(source.get())

    clock.advance(TTL_SECONDS - 1)
    asyncio.run(source.get())
    still_one_request = len(seen)
    clock.advance(1)
    asyncio.run(source.get())

    assert still_one_request == 1
    assert len(seen) == 2


def test_with_no_recorded_file_and_no_open_meteo_the_source_raises_source_unavailable(tmp_path):
    source, _ = make_source(fail_with(httpx.ConnectError), recorded_folder=tmp_path)

    with pytest.raises(SourceUnavailable):
        asyncio.run(source.get())


def test_failures_are_logged_without_the_address(caplog):
    source, _ = make_source(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.WARNING):
        asyncio.run(source.get())

    assert "weather" in caplog.text
    assert "ConnectError" in caplog.text
    assert "open-meteo.com" not in caplog.text


# --- the hours: the same cached answer carries them ---


def reply_with_four_foggy_hours() -> FakeReply:
    return reply_with_answer(answer_with_hours("rain", hours_of(FIRST_HOUR, 4, FOGGY_HOUR)))


def test_the_cached_data_carries_the_hours():
    clock = FakeClock()
    source, seen = make_source(reply_with_four_foggy_hours(), clock)
    first = asyncio.run(source.get())

    clock.advance(TTL_SECONDS - 1)
    second = asyncio.run(source.get())

    assert len(first.data.hours) == 4
    assert second.source == "cache"
    assert second.data.hours == first.data.hours
    assert len(seen) == 1


def test_a_stale_answer_keeps_its_hours():
    clock = FakeClock()
    reply = replies_in_order(reply_with_four_foggy_hours(), fail_with(httpx.ConnectError))
    source, _ = make_source(reply, clock)
    first = asyncio.run(source.get())

    clock.advance(TTL_SECONDS)
    second = asyncio.run(source.get())

    assert second.source == "stale"
    assert second.data.hours == first.data.hours


def test_an_answer_without_an_hourly_block_gives_a_reading_with_no_hours():
    source, _ = make_source(answer_with_sample("rain"))

    result = asyncio.run(source.get())

    assert result.data.hours == ()


def test_the_recorded_fallback_has_no_hours():
    # The answer recorded on 5 Nov 2026 was made before we asked for hours.
    recorded = load_recorded_weather()

    assert recorded is not None
    assert recorded.data.hours == ()


# --- demo mode: only the recorded answer ---


def test_demo_mode_never_asks_open_meteo_and_uses_the_recorded_answer():
    demo_settings = replace(LISBON_SETTINGS, demo_mode=True)
    transport, seen = make_transport(answer_with_sample("rain"))
    source = make_weather_source(demo_settings, transport, FakeClock())

    result = asyncio.run(source.get())

    assert seen == []
    assert result.source == "fallback"
    assert result.data.place == "Torshavn, Faroe Islands"


def test_demo_mode_off_asks_open_meteo():
    source, seen = make_source(answer_with_sample("rain"))

    asyncio.run(source.get())

    assert len(seen) == 1


def test_demo_mode_still_never_asks_open_meteo_after_the_cache_time_has_passed():
    demo_settings = replace(LISBON_SETTINGS, demo_mode=True)
    clock = FakeClock()
    transport, seen = make_transport(answer_with_sample("rain"))
    source = make_weather_source(demo_settings, transport, clock)
    asyncio.run(source.get())

    clock.advance(TTL_SECONDS * 3)
    result = asyncio.run(source.get())

    assert seen == []
    assert result.source == "fallback"


def test_demo_mode_makes_no_failed_call_so_the_log_has_no_warning(caplog):
    demo_settings = replace(LISBON_SETTINGS, demo_mode=True)
    clock = FakeClock()
    transport, _ = make_transport(answer_with_sample("rain"))
    source = make_weather_source(demo_settings, transport, clock)

    with caplog.at_level(logging.WARNING):
        asyncio.run(source.get())
        clock.advance(TTL_SECONDS)
        asyncio.run(source.get())

    assert caplog.text == ""


def test_demo_mode_says_so_once_in_the_log_when_the_source_is_built(caplog):
    demo_settings = replace(LISBON_SETTINGS, demo_mode=True)
    transport, _ = make_transport(answer_with_sample("rain"))

    with caplog.at_level(logging.INFO):
        make_weather_source(demo_settings, transport)

    assert "Demo mode" in caplog.text
    assert "recorded answer" in caplog.text


def test_demo_mode_uses_the_recorded_only_source_and_normal_mode_does_not():
    demo_settings = replace(LISBON_SETTINGS, demo_mode=True)

    demo_source = make_weather_source(demo_settings)
    normal_source = make_weather_source(LISBON_SETTINGS)

    assert isinstance(demo_source, RecordedOnlySource)
    assert not isinstance(normal_source, RecordedOnlySource)


def test_normal_mode_says_nothing_about_demo_mode_in_the_log(caplog):
    with caplog.at_level(logging.INFO):
        make_weather_source(LISBON_SETTINGS)

    assert "Demo mode" not in caplog.text


# --- the recorded fallback file ---


def write_recorded(folder: Path, **changes) -> None:
    """Write a recorded-fallback.json into `folder`: the real one, with some parts changed."""
    saved = {**load_recorded_file(), **changes}
    (folder / RECORDED_FILE_NAME).write_text(json.dumps(saved), encoding="utf-8")


def test_the_recorded_file_loads_with_its_time_and_place():
    recorded = load_recorded_weather()

    assert recorded is not None
    assert recorded.recorded_at == RECORDED_AT
    assert recorded.recorded_at.tzinfo is not None
    assert recorded.data.place == "Torshavn, Faroe Islands"
    assert recorded.data.reading.wind_speed_kmh == 13.7


def test_the_recorded_file_is_inside_backend_so_it_ships_with_the_api():
    assert BACKEND_ROOT in CONTENT_FOLDER.parents
    assert CONTENT_FOLDER == WEATHER_CONTENT
    assert (CONTENT_FOLDER / RECORDED_FILE_NAME).is_file()


def test_a_missing_recorded_file_gives_no_fallback_and_a_warning(tmp_path, caplog):
    with caplog.at_level(logging.WARNING):
        recorded = load_recorded_weather(tmp_path)

    assert recorded is None
    assert "recorded weather" in caplog.text


def test_a_recorded_file_that_is_not_json_gives_no_fallback(tmp_path):
    (tmp_path / RECORDED_FILE_NAME).write_text("{ not json", encoding="utf-8")

    assert load_recorded_weather(tmp_path) is None


@pytest.mark.parametrize(
    "changes",
    [
        {"answer": {"current": {}}},
        {"answer": None},
        {"recordedAt": "yesterday"},
        {"recordedAt": "2026-11-05T17:14:33"},  # no timezone: we would have to guess
        {"recordedAt": 12345},
        {"place": ""},
        {"place": 42},
    ],
)
def test_a_recorded_file_with_a_bad_part_gives_no_fallback(tmp_path, changes):
    write_recorded(tmp_path, **changes)

    assert load_recorded_weather(tmp_path) is None


def test_a_recorded_file_with_a_part_missing_gives_no_fallback(tmp_path):
    saved = load_recorded_file()
    del saved["recordedAt"]
    (tmp_path / RECORDED_FILE_NAME).write_text(json.dumps(saved), encoding="utf-8")

    assert load_recorded_weather(tmp_path) is None


def test_a_good_copy_of_the_recorded_file_loads(tmp_path):
    write_recorded(tmp_path)

    assert load_recorded_weather(tmp_path) is not None


# --- credit and safety of the saved files ---


def test_the_credit_line_is_the_exact_text_the_api_sends():
    assert ATTRIBUTION == "Weather data by Open-Meteo.com, adapted for the game"


def test_the_credit_line_gives_credit_to_open_meteo():
    assert "Weather data by Open-Meteo.com" in ATTRIBUTION


def test_the_credit_line_says_the_data_was_changed_because_the_licence_asks_for_it():
    assert "adapted" in ATTRIBUTION


@pytest.mark.parametrize("path", sorted(WEATHER_CONTENT.rglob("*.json")), ids=lambda p: p.name)
def test_the_saved_files_hold_no_keys_tokens_or_passwords(path):
    text = path.read_text(encoding="utf-8")

    assert find_secret_looking_words(text) == []


def test_the_recorded_file_carries_its_own_credit_with_both_licence_addresses():
    credit = load_recorded_file()["credit"]

    assert "Open-Meteo.com" in credit
    assert "https://open-meteo.com/" in credit
    assert "CC BY 4.0" in credit
    assert "https://creativecommons.org/licenses/by/4.0/" in credit
