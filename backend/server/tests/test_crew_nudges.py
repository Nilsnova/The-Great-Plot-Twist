"""Crew notifications follow completed writes, and never change their successful HTTP answer."""

import asyncio

import httpx
import pytest

from server.crew_broadcast import CrewBroadcaster
from server.tests.crew_helpers import (
    AUTH,
    CODE,
    CREW_ID,
    FRIEND_ID,
    PLAYER_ID,
    STARTED_AT_IN_DATABASE,
    FakeCrewDatabase,
    crew_row,
    found_reply,
    found_seat,
    make_crew_client,
    partner_seat,
    player_seat,
    refused,
    seat_of_player,
)

ME = player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness")
JOIN = "/api/crews/join"
START = "/api/crews/me/start"


class Sender:
    def __init__(self, database, behavior="ok"):
        self.database = database
        self.behavior = behavior
        self.events = []

    async def send(self, crew_id, kind, data):
        assert self.database.calls("crew_take_seat") or self.database.calls("crew_start")
        self.events.append((crew_id, kind, data))
        if self.behavior == "error":
            raise RuntimeError("private transport detail")
        if self.behavior == "timeout":
            await asyncio.Event().wait()
        return self.behavior != "refused"


def joining(*, retry=False):
    database = FakeCrewDatabase()
    seats = [found_seat(1, FRIEND_ID, None, "stranger")]
    database.script(
        "crew_find_by_code", found_reply(seats, version=2), found_reply(seats, version=3)
    )
    replies = [{"status": "joined", "seatNo": 2, "replacedPartner": None}]
    if retry:
        replies.insert(0, refused("changed"))
    database.script("crew_take_seat", *replies)
    database.set_crew(
        CREW_ID,
        crew_row(
            [
                player_seat(1, FRIEND_ID, "Calm Gannet 42", "stranger"),
                player_seat(2, PLAYER_ID, "Brave Puffin 17", "witness"),
            ],
            mode="crew",
            version=4,
        ),
    )
    return database


def mustering():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(
        CREW_ID,
        crew_row([ME]),
        crew_row(
            [
                ME,
                partner_seat(2, "deckhand", "informant"),
                partner_seat(3, "bosun", "stranger"),
                partner_seat(4, "cook", "true_keeper"),
            ],
            status="active",
            version=2,
            started_at=STARTED_AT_IN_DATABASE,
        ),
    )
    database.script("crew_start", {"status": "started"})
    return database


@pytest.mark.parametrize("operation", ["join", "muster"])
def test_success_sends_one_version_only_hint_after_commit(operation):
    database = joining() if operation == "join" else mustering()
    sender = Sender(database)
    client = make_crew_client(database, broadcaster=sender)
    path = JOIN if operation == "join" else START
    response = client.post(path, headers=AUTH, **({"json": {"code": CODE}} if path == JOIN else {}))
    assert response.status_code == 200
    assert sender.events == [(CREW_ID, "crew_changed", {"version": 4 if path == JOIN else 2})]
    assert response.headers["cache-control"] == "private, no-store"


def test_changed_retry_sends_only_the_final_success():
    database = joining(retry=True)
    sender = Sender(database)
    response = make_crew_client(database, broadcaster=sender).post(
        JOIN, headers=AUTH, json={"code": CODE}
    )
    assert response.status_code == 200
    assert len(database.calls("crew_take_seat")) == 2
    assert sender.events == [(CREW_ID, "crew_changed", {"version": 4})]


@pytest.mark.parametrize("behavior", ["refused", "error", "timeout"])
def test_failed_hint_keeps_the_successful_write_and_is_quiet(behavior, monkeypatch, caplog):
    monkeypatch.setattr("server.crew_nudges.TIMEOUT_SECONDS", 0.01)
    database = joining()
    sender = Sender(database, behavior)
    response = make_crew_client(database, broadcaster=sender).post(
        JOIN, headers=AUTH, json={"code": CODE}
    )
    assert response.status_code == 200
    assert len(database.calls("crew_take_seat")) == 1
    assert len(sender.events) == 1
    assert "private transport detail" not in caplog.text


def test_reads_and_refused_repeated_intents_send_nothing():
    database = FakeCrewDatabase()
    sender = Sender(database)
    client = make_crew_client(database, broadcaster=sender)
    assert client.get("/api/crews/me", headers=AUTH).status_code == 200
    database.script("crew_find_by_code", found_reply([found_seat(1, PLAYER_ID, None, "witness")]))
    assert client.post(JOIN, headers=AUTH, json={"code": CODE}).status_code == 409
    database.seat_rows = [seat_of_player(CREW_ID, 1, "active")]
    database.set_crew(CREW_ID, crew_row([ME], status="active"))
    assert client.post(START, headers=AUTH).status_code == 409
    assert sender.events == []


def test_disabled_shared_broadcaster_never_uses_transport():
    def no_request(request):
        pytest.fail("Flag-off broadcaster must not use a transport")

    broadcaster = CrewBroadcaster(
        "https://fixture.supabase.co", "fixture-key", False, httpx.MockTransport(no_request)
    )
    response = make_crew_client(joining(), broadcaster=broadcaster).post(
        JOIN, headers=AUTH, json={"code": CODE}
    )
    assert response.status_code == 200
