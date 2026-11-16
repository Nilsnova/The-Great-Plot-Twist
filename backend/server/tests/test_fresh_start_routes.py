"""Reset my island (T53): POST /api/island/fresh-start.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py) with the
one new function, island_fresh_start, answered from a queue. The real rules are tested in
island_sql/test_island_fresh_start_sql.py; here: what the route sends, how it reads the typed code
and how each refusal reaches the browser.
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests.helpers import assert_error
from server.tests.island_helpers import (
    GUEST,
    GUEST_ID,
    ISLAND_SETTINGS,
    PLAYER,
    PLAYER_ID,
    FakeIslandDatabase,
    World,
)

COUNTS = {
    "coins": -800,
    "saves": 1,
    "buildings": 6,
    "research": 1,
    "layout": 0,
    "arsenalMoves": 0,
    "arsenalCopies": 0,
    "wallRecords": 3,
    "waveRules": 3,
    "waves": 3,
    "membersKept": 2,
}
DONE = {"status": "done", "repeat": False, "balance": 200, "counts": COUNTS}


class ResetDatabase(FakeIslandDatabase):
    """FakeIslandDatabase plus island_fresh_start: the next queued answer, else DONE."""

    replies: list[dict | httpx.Response]

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/rpc/island_fresh_start"):
            self.requests.append(request)
            reply = self.replies.pop(0) if self.replies else DONE
            return self.answer(reply)
        return super().__call__(request)


def world(settings=ISLAND_SETTINGS, *replies) -> World:
    made = World(settings=settings)
    made.database.__class__ = ResetDatabase
    made.database.replies = list(replies)
    return made


def reset(made: World, code="ISLE-K7Q2M", uid="reset-0001", headers=PLAYER, **extra):
    body = {"confirmCode": code, "actionUid": uid, **extra}
    return made.client.post("/api/island/fresh-start", json=body, headers=headers)


def test_the_owner_resets_and_gets_the_counts():
    made = world()
    answer = reset(made)

    assert answer.status_code == 200
    assert answer.headers["cache-control"] == "private, no-store"
    assert answer.json() == {"reset": True, "repeat": False, "balance": 200, "counts": COUNTS}
    # The starting coins are the catalogue's (islands.json startingCoins), as for a new player.
    assert made.app.state.island.starting_coins == 200
    assert made.database.calls("island_fresh_start") == [
        {
            "p_player_id": PLAYER_ID,
            "p_action_uid": "reset-0001",
            "p_confirm_code": "K7Q2M",
            "p_starting_coins": made.app.state.island.starting_coins,
        }
    ]


@pytest.mark.parametrize("typed", ["k7q2m", "isle-k7q2m", " ISLE K7Q-2M "])
def test_the_code_is_read_like_every_typed_code(typed):
    made = world()
    assert reset(made, code=typed).status_code == 200
    assert made.database.calls("island_fresh_start")[0]["p_confirm_code"] == "K7Q2M"


@pytest.mark.parametrize("typed", ["", "nope", "K7Q20", "ISLE-K7Q2MX"])
def test_a_code_that_cannot_be_one_is_wrong_without_asking_the_database(typed):
    made = world()
    assert_error(reset(made, code=typed), 400, "wrong_code")
    assert made.database.calls("island_fresh_start") == []


@pytest.mark.parametrize(
    ("reason", "status"),
    [
        ("wrong_code", 400),
        ("not_owner", 403),
        ("wave_running", 409),
        ("player_not_set_up", 404),
    ],
)
def test_each_refusal_reaches_the_browser_with_its_own_status(reason, status):
    made = world(ISLAND_SETTINGS, {"status": "refused", "reason": reason})
    refused = reset(made)
    assert_error(refused, status, reason)


def test_the_refusal_messages_say_what_to_do():
    made = world(
        ISLAND_SETTINGS,
        {"status": "refused", "reason": "not_owner"},
        {"status": "refused", "reason": "wave_running"},
        {"status": "refused", "reason": "wrong_code"},
    )
    messages = [reset(made).json()["error"]["message"] for _ in range(3)]
    assert messages == [
        "Only the host can reset this game's island.",
        "A wave is under way. Reset your island between waves.",
        "That is not your island's code. Type the code shown.",
    ]


def test_a_repeat_is_answered_as_a_repeat():
    made = world(ISLAND_SETTINGS, {**DONE, "repeat": True, "balance": 90})
    assert reset(made).json() == {"reset": True, "repeat": True, "balance": 90, "counts": COUNTS}


def test_an_answer_the_server_cannot_read_is_a_502():
    made = world(ISLAND_SETTINGS, {"status": "done", "repeat": False})
    assert reset(made).status_code == 502


@pytest.mark.parametrize(
    "body",
    [
        {"confirmCode": "K7Q2M"},
        {"actionUid": "reset-0001"},
        {"confirmCode": "K7Q2M", "actionUid": "short"},
        {"confirmCode": "K" * 40, "actionUid": "reset-0001"},
        {"confirmCode": "K7Q2M", "actionUid": "reset-0001", "code": "ISLE-FR3ND"},
    ],
)
def test_a_bad_body_is_refused_before_the_database(body):
    made = world()
    answer = made.client.post("/api/island/fresh-start", json=body, headers=PLAYER)
    assert_error(answer, 422, "validation_error")
    assert made.database.calls("island_fresh_start") == []


def test_a_signed_out_player_and_the_islands_flag_off_are_refused():
    made = world()
    assert made.client.post(
        "/api/island/fresh-start", json={"confirmCode": "K7Q2M", "actionUid": "reset-0001"}
    ).status_code in (401, 403)
    off = world(replace(ISLAND_SETTINGS, flags=parse_flags("")))
    assert_error(reset(off), 404, "feature_off")
    assert off.database.calls("island_fresh_start") == []


def test_a_guest_who_owns_an_island_may_reset_it():
    made = world(replace(ISLAND_SETTINGS, flags=parse_flags("islands,demo")))
    assert reset(made, headers=GUEST).status_code == 200
    (call,) = made.database.calls("island_fresh_start")
    assert call["p_player_id"] == GUEST_ID
    assert call["p_action_uid"] == "reset-0001"
