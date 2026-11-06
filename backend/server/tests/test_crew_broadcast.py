"""Tests for crew_broadcast.py: the server tells a crew's browsers that something changed.

No network: a fake transport stands in for the Broadcast REST API of Supabase Realtime, and a
fake clock stands in for the time. Specs: specs/A4-live-presence.md, section 5.
"""

import asyncio
import json
import logging
import re
import uuid
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server import crew_broadcast
from server.app import create_app
from server.clock import Clock
from server.crew_broadcast import (
    CREW_EVENT_KINDS,
    BroadcasterDep,
    CrewBroadcaster,
    broadcaster_from_settings,
)
from server.flags import default_flags
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_SECRET_KEY,
    FAKE_URL,
    REPO_ROOT,
    FakeClock,
    FakeReply,
    fail_with,
)

CREW_ID = "11111111-1111-4111-8111-111111111111"
OTHER_CREW_ID = "22222222-2222-4222-8222-222222222222"
# A crew id with letters in it, to show that capitals are turned into lowercase.
CREW_ID_WITH_LETTERS = "abcdefab-abcd-4abc-8abc-abcdefabcdef"

# An old-style key is a long JWT. This one is obviously fake.
LEGACY_KEY = "legacy-service-role-token-for-tests"

# Numbers that no other text in a log line can contain by accident.
DATA_WITH_A_RARE_NUMBER = {"version": 424242}

BROADCAST_URL = f"{FAKE_URL}/realtime/v1/api/broadcast"


def accepted(request: httpx.Request) -> httpx.Response:
    """What Supabase answers when it takes a broadcast: 202 Accepted with no body."""
    return httpx.Response(202)


def make_broadcaster(
    reply: FakeReply = accepted,
    enabled: bool = True,
    base_url: str = FAKE_URL,
    secret_key: str = FAKE_SECRET_KEY,
    clock: Clock | None = None,
) -> tuple[CrewBroadcaster, list[httpx.Request]]:
    """A broadcaster that talks to a fake Supabase. Returns it and the requests it sent."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply(request)

    transport = httpx.MockTransport(handler)
    if clock is None:
        return CrewBroadcaster(base_url, secret_key, enabled, transport), seen
    return CrewBroadcaster(base_url, secret_key, enabled, transport, clock), seen


def send(
    broadcaster: CrewBroadcaster,
    crew_id: str = CREW_ID,
    kind: str = "board_changed",
    data: dict | None = DATA_WITH_A_RARE_NUMBER,
) -> bool:
    """Run broadcaster.send from a normal (not async) test."""
    return asyncio.run(broadcaster.send(crew_id, kind, data))


def crew(number: int) -> str:
    """The id of the nth made-up crew: a valid UUID that no other test uses."""
    return str(uuid.UUID(int=number))


def send_to_crews(broadcaster: CrewBroadcaster, numbers) -> list[bool]:
    """Send one event to each of these crews, all at the same moment."""
    return [send(broadcaster, crew_id=crew(number)) for number in numbers]


def send_many(
    broadcaster: CrewBroadcaster, count: int, clock: FakeClock, gap_seconds: float
) -> list[bool]:
    """Send `count` events to one crew. The fake clock moves on by `gap_seconds` after each."""
    results = []
    for _ in range(count):
        results.append(send(broadcaster))
        clock.advance(gap_seconds)
    return results


# --- what is sent ---


def test_sends_one_private_message_to_the_crew_room():
    broadcaster, seen = make_broadcaster()

    sent = send(broadcaster, CREW_ID, "board_changed", {"version": 7})

    assert sent is True
    assert len(seen) == 1
    request = seen[0]
    assert request.method == "POST"
    assert str(request.url) == BROADCAST_URL
    assert json.loads(request.content) == {
        "messages": [
            {
                "topic": f"live:crew:{CREW_ID}",
                "event": "crew_event",
                "payload": {"v": 1, "kind": "board_changed", "data": {"version": 7}},
                "private": True,
            }
        ]
    }


@pytest.mark.parametrize("kind", CREW_EVENT_KINDS)
def test_every_known_kind_can_be_sent(kind):
    broadcaster, seen = make_broadcaster()

    assert send(broadcaster, kind=kind) is True

    assert json.loads(seen[0].content)["messages"][0]["payload"]["kind"] == kind


def test_data_that_is_left_out_is_sent_as_an_empty_object():
    broadcaster, seen = make_broadcaster()

    assert send(broadcaster, data=None) is True

    assert json.loads(seen[0].content)["messages"][0]["payload"]["data"] == {}


def test_a_crew_id_in_capitals_is_sent_as_lowercase_text():
    broadcaster, seen = make_broadcaster()

    assert send(broadcaster, crew_id=CREW_ID_WITH_LETTERS.upper()) is True

    topic = json.loads(seen[0].content)["messages"][0]["topic"]
    assert topic == f"live:crew:{CREW_ID_WITH_LETTERS}"


def test_a_crew_id_object_from_the_uuid_module_works_too():
    broadcaster, seen = make_broadcaster()

    assert send(broadcaster, crew_id=uuid.UUID(CREW_ID_WITH_LETTERS)) is True

    topic = json.loads(seen[0].content)["messages"][0]["topic"]
    assert topic == f"live:crew:{CREW_ID_WITH_LETTERS}"


def test_an_address_with_a_slash_at_the_end_still_gives_the_right_url():
    broadcaster, seen = make_broadcaster(base_url=f"{FAKE_URL}/")

    assert send(broadcaster) is True

    assert str(seen[0].url) == BROADCAST_URL


def test_any_2xx_answer_counts_as_sent():
    broadcaster, _ = make_broadcaster(lambda request: httpx.Response(200, json={}))

    assert send(broadcaster) is True


def test_a_request_waits_at_most_two_seconds():
    broadcaster, seen = make_broadcaster()

    send(broadcaster)

    assert seen[0].extensions["timeout"] == {
        "connect": 2.0,
        "read": 2.0,
        "write": 2.0,
        "pool": 2.0,
    }


def test_a_slow_supabase_cannot_hold_the_call_longer_than_the_time_limit(monkeypatch, caplog):
    # httpx counts its two seconds for each phase. The whole call has its own limit on top.
    monkeypatch.setattr(crew_broadcast, "TIMEOUT_SECONDS", 0.05)

    async def answers_much_too_late(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(1)
        return httpx.Response(202)

    transport = httpx.MockTransport(answers_much_too_late)
    broadcaster = CrewBroadcaster(FAKE_URL, FAKE_SECRET_KEY, True, transport)

    with caplog.at_level(logging.DEBUG):
        sent = send(broadcaster)

    assert sent is False
    assert "TimeoutError" in caplog.text  # only the name of the error
    assert FAKE_SECRET_KEY not in caplog.text
    assert CREW_ID not in caplog.text


# --- the secret key ---


def test_sends_the_secret_key_as_apikey_and_never_in_the_body():
    broadcaster, seen = make_broadcaster()

    send(broadcaster)

    request = seen[0]
    assert request.headers["apikey"] == FAKE_SECRET_KEY
    assert "authorization" not in request.headers  # a new-style key is not a login token
    assert FAKE_SECRET_KEY not in request.content.decode()
    assert FAKE_SECRET_KEY not in str(request.url)


def test_old_style_secret_key_also_goes_in_the_bearer_header():
    broadcaster, seen = make_broadcaster(secret_key=LEGACY_KEY)

    send(broadcaster)

    assert seen[0].headers["apikey"] == LEGACY_KEY
    assert seen[0].headers["authorization"] == f"Bearer {LEGACY_KEY}"


# --- when nothing is sent ---


def test_sends_nothing_while_the_flag_is_off():
    broadcaster, seen = make_broadcaster(enabled=False)

    assert send(broadcaster) is False

    assert seen == []


@pytest.mark.parametrize(
    ("base_url", "secret_key"),
    [("", FAKE_SECRET_KEY), (FAKE_URL, ""), ("", "")],
    ids=["no address", "no key", "neither"],
)
def test_sends_nothing_when_supabase_is_not_set_up(base_url, secret_key, caplog):
    broadcaster, seen = make_broadcaster(base_url=base_url, secret_key=secret_key)

    with caplog.at_level(logging.DEBUG):
        sent = send(broadcaster)

    assert sent is False
    assert seen == []
    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert CREW_ID not in caplog.text


def test_a_bad_argument_is_reported_even_while_the_flag_is_off():
    # The caller has a bug whatever the flag says, so the mistake must show up in development.
    broadcaster, seen = make_broadcaster(enabled=False)

    with pytest.raises(ValueError):
        send(broadcaster, kind="no_such_kind")

    assert seen == []


# --- bad arguments are bugs in the caller ---


@pytest.mark.parametrize(
    "crew_id",
    ["", "not-a-uuid", "1234", f"live:crew:{CREW_ID}", f"{CREW_ID}x", f"{CREW_ID}\n", "../etc"],
)
def test_refuses_a_crew_id_that_is_not_a_uuid(crew_id):
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, crew_id=crew_id)

    assert seen == []


def test_refuses_an_unknown_kind():
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, kind="board_changd")  # a typo

    assert seen == []


def test_refuses_data_over_one_kilobyte():
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, data={"x": "a" * 1017})  # compact JSON of 1025 bytes

    assert seen == []


def test_data_of_exactly_one_kilobyte_is_fine():
    broadcaster, _ = make_broadcaster()

    assert send(broadcaster, data={"x": "a" * 1016}) is True  # compact JSON of 1024 bytes


def test_the_size_limit_counts_bytes_and_not_characters():
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, data={"note": "\u00e9" * 600})  # 600 characters, 1200 bytes

    assert seen == []


@pytest.mark.parametrize("data", [["version", 1], "version", 5, ("version", 1)])
def test_refuses_data_that_is_not_a_json_object(data):
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, data=data)

    assert seen == []


@pytest.mark.parametrize(
    "data",
    [{"when": object()}, {"version": float("nan")}, {"version": float("inf")}],
    ids=["an object", "not a number", "infinity"],
)
def test_refuses_data_that_cannot_be_written_as_json(data):
    broadcaster, seen = make_broadcaster()

    with pytest.raises(ValueError):
        send(broadcaster, data=data)

    assert seen == []


# --- Supabase refuses or is away ---


@pytest.mark.parametrize("status", [400, 401, 403, 429, 500, 503])
def test_returns_false_and_logs_only_the_status_when_supabase_refuses(status, caplog):
    answer = {"message": "answer-text-from-supabase", "hint": FAKE_SECRET_KEY}
    broadcaster, _ = make_broadcaster(lambda request: httpx.Response(status, json=answer))

    with caplog.at_level(logging.DEBUG):
        sent = send(broadcaster)

    assert sent is False
    assert str(status) in caplog.text  # the server's own log line was captured
    assert FAKE_SECRET_KEY not in caplog.text
    assert CREW_ID not in caplog.text
    assert "424242" not in caplog.text  # the payload
    assert "board_changed" not in caplog.text
    assert "answer-text-from-supabase" not in caplog.text


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_returns_false_on_a_network_error_or_a_timeout(error_class, caplog):
    broadcaster, seen = make_broadcaster(fail_with(error_class))

    with caplog.at_level(logging.DEBUG):
        sent = send(broadcaster)

    assert sent is False
    assert len(seen) == 1
    assert error_class.__name__ in caplog.text  # only the name of the error
    assert FAKE_SECRET_KEY not in caplog.text
    assert CREW_ID not in caplog.text
    assert "pretend network failure" not in caplog.text


def test_nothing_secret_appears_in_the_logs_when_everything_works(caplog):
    broadcaster, _ = make_broadcaster()

    with caplog.at_level(logging.DEBUG):
        assert send(broadcaster) is True

    for private in (FAKE_SECRET_KEY, CREW_ID, "424242", "board_changed"):
        assert private not in caplog.text


# --- the limit for one crew ---


def test_skips_events_beyond_20_in_10_seconds_for_one_crew(caplog):
    clock = FakeClock()
    broadcaster, seen = make_broadcaster(clock=clock)

    results = send_many(broadcaster, 20, clock, 0.4)  # from 0.0 s to 7.6 s, and now it is 8.0 s
    with caplog.at_level(logging.DEBUG):
        twenty_first = send(broadcaster)

    assert results == [True] * 20
    assert twenty_first is False
    assert len(seen) == 20
    assert CREW_ID not in caplog.text
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 1

    # Another crew has its own count.
    assert send(broadcaster, crew_id=OTHER_CREW_ID) is True

    # The count only forgets an event after the full ten seconds (the oldest one is from 0.0 s).
    clock.advance(1.9)
    assert send(broadcaster) is False
    clock.advance(0.1)
    assert send(broadcaster) is True
    assert len(seen) == 22


def test_events_spread_over_time_are_never_skipped():
    clock = FakeClock()
    broadcaster, seen = make_broadcaster(clock=clock)

    results = send_many(broadcaster, 60, clock, 1)  # one event every second for a minute

    assert all(results)
    assert len(seen) == 60


def test_events_that_fail_count_towards_the_limit_too():
    # A loop that keeps sending during an outage must not hammer Supabase.
    clock = FakeClock()
    broadcaster, seen = make_broadcaster(lambda request: httpx.Response(503), clock=clock)

    results = send_many(broadcaster, 25, clock, 0.4)  # 25 attempts in 10 seconds

    assert results == [False] * 25
    assert len(seen) == 20


def test_events_that_are_skipped_do_not_extend_the_wait():
    clock = FakeClock()
    broadcaster, _ = make_broadcaster(clock=clock)
    send_many(broadcaster, 20, clock, 0.4)  # the first twenty, from 0.0 s to 7.6 s: now 8.0 s

    skipped = send_many(broadcaster, 30, clock, 0)  # a loop that keeps trying: none is counted
    clock.advance(2)

    assert skipped == [False] * 30
    assert send(broadcaster) is True  # ten seconds after the first of the twenty


# --- the limit for all crews together ---


def test_sends_at_most_five_events_a_second_over_all_crews(caplog):
    # A loop bug that walks over every crew: ten crews in the same second.
    broadcaster, seen = make_broadcaster(clock=FakeClock())

    with caplog.at_level(logging.DEBUG):
        results = send_to_crews(broadcaster, range(10))

    assert results == [True] * 5 + [False] * 5
    assert len(seen) == 5
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 5
    assert crew(7) not in caplog.text  # the warning never names the crew


def test_the_all_crews_limit_frees_up_one_second_after_the_events():
    clock = FakeClock()
    broadcaster, seen = make_broadcaster(clock=clock)
    send_to_crews(broadcaster, range(5))

    clock.advance(0.9)
    assert send(broadcaster, crew_id=crew(9)) is False  # still the same second
    clock.advance(0.1)
    assert send(broadcaster, crew_id=crew(9)) is True  # one second after the first five
    assert len(seen) == 6


def test_events_skipped_by_the_all_crews_limit_are_not_counted():
    clock = FakeClock()
    broadcaster, seen = make_broadcaster(clock=clock)
    send_to_crews(broadcaster, range(5))
    clock.advance(0.5)

    skipped = send_to_crews(broadcaster, range(5, 10))  # a loop that keeps trying
    clock.advance(0.5)

    assert skipped == [False] * 5
    assert (
        send_to_crews(broadcaster, range(10, 15)) == [True] * 5
    )  # one second after the first five
    assert len(seen) == 10


def test_an_event_refused_for_one_crew_does_not_use_up_the_all_crews_allowance():
    clock = FakeClock()
    broadcaster, _ = make_broadcaster(clock=clock)
    send_many(broadcaster, 20, clock, 0.4)  # this crew is full for ten seconds
    clock.advance(1)  # but the second of all crews is quiet again

    refused = send_many(broadcaster, 30, clock, 0)

    assert refused == [False] * 30
    assert send_to_crews(broadcaster, range(1, 6)) == [True] * 5  # other crews are not held back


# --- wiring: settings and create_app ---


def test_broadcaster_from_settings_uses_the_address_the_key_and_the_flag():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(202)

    settings = replace(CONFIGURED_SETTINGS, flags={**default_flags(), "live_presence": True})

    broadcaster = broadcaster_from_settings(settings, httpx.MockTransport(handler))

    assert send(broadcaster) is True
    assert str(seen[0].url) == BROADCAST_URL
    assert seen[0].headers["apikey"] == FAKE_SECRET_KEY


def test_broadcaster_from_settings_is_off_while_the_flag_is_off():
    broadcaster = broadcaster_from_settings(CONFIGURED_SETTINGS)

    assert broadcaster.enabled is False
    assert send(broadcaster) is False  # no network is touched: the flag is off


def test_create_app_builds_a_broadcaster_from_the_settings():
    settings = replace(CONFIGURED_SETTINGS, flags={**default_flags(), "live_presence": True})

    app = create_app(settings)

    assert isinstance(app.state.broadcaster, CrewBroadcaster)
    assert app.state.broadcaster.enabled is True
    assert app.state.broadcaster.base_url == FAKE_URL


def test_create_app_uses_the_broadcaster_it_is_given():
    broadcaster, seen = make_broadcaster()
    app = create_app(CONFIGURED_SETTINGS, broadcaster=broadcaster)

    @app.get("/api/test/announce")
    async def announce(crew_broadcaster: BroadcasterDep) -> dict[str, bool]:
        return {"sent": await crew_broadcaster.send(CREW_ID, "crew_changed")}

    response = TestClient(app).get("/api/test/announce")

    assert app.state.broadcaster is broadcaster
    assert response.json() == {"sent": True}
    assert len(seen) == 1


def test_the_broadcaster_must_be_passed_to_create_app_by_keyword():
    broadcaster, _ = make_broadcaster()

    with pytest.raises(TypeError):
        create_app(CONFIGURED_SETTINGS, None, None, broadcaster)


# --- the list of kinds is the same in Python and in the browser ---


def read_browser_event_kinds() -> tuple[str, ...]:
    """CREW_EVENT_KINDS from frontend/src/net/live-rules.js, read as text (no Node.js needed)."""
    text = (REPO_ROOT / "frontend" / "src" / "net" / "live-rules.js").read_text()
    found = re.search(r"export const CREW_EVENT_KINDS\s*=\s*\[(.*?)\]", text, re.DOTALL)
    assert found, "live-rules.js must define: export const CREW_EVENT_KINDS = [...]"
    return tuple(re.findall(r"'([a-z_]+)'", found.group(1)))


def test_the_event_kinds_match_the_browser_list():
    assert read_browser_event_kinds() == CREW_EVENT_KINDS
