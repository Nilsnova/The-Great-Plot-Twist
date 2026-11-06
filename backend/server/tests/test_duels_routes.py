"""Tests for routes/duels.py and duels/service.py: the five Lantern Duels URLs.

Nothing here uses the network. The database is a FakeDuelDatabase (tests/duels_helpers.py): a
pretend Supabase with the four tables and the three functions duel_create, duel_answer and
duel_void, which follow the SQL step by step. The sign-in check answers from a fake transport,
and the clock only moves when a test says so.

Fixed numbers used again and again (the worked example of specs/A7-lantern-duels.md):
  * the clock starts on Friday 6 Nov 2026 at 10:00 UTC, and every captain has 1000 coins,
  * Alice ("Brave Puffin 17") challenges Bob ("Captain-3fa85f"), 5 rounds, 100 coins each,
  * Alice seals Flash, Shade, Shade, Mirror, Shade and Bob answers Mirror, Flash, Shade, Shade,
    Mirror. Bob wins 3 to 1: Alice ends with 900 coins and Bob with 1000 - 100 + 190 = 1090,
    because the winner takes 190 of the pot of 200 and the 10 coin cut is not paid out.
  * Carol ("Captain-7c41d2") is a third captain who only looks.

Money races (two answers at the same moment) cannot be shown with a fake database. These tests
prove that the server sends ONE function call per action and maps every refusal. The race itself
is proven on a real Postgres (supabase/README.md, steps D1 to D12).
"""

from datetime import timedelta
from typing import get_args

import pytest

from server.app import create_app
from server.duels import rules
from server.duels.service import DuelService
from server.duels.views import UNKNOWN_CAPTAIN
from server.routes.duels import AnswerRequest, ChallengeRequest, DetailOut, SignalName, SummaryOut
from server.supabase_admin import SupabaseAdmin
from server.tests.duels_helpers import (
    ALICE,
    ALICE_SIGNALS,
    BOB,
    BOB_SIGNALS,
    CAROL,
    NEW_CHALLENGE,
    PLAYERS,
    RpcFailure,
    World,
)
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error

NO_STORE = "private, no-store"
SOME_DUEL = "00000000-0000-4000-8000-000000000001"

ROUTES = [
    ("GET", "/api/duels"),
    ("POST", "/api/duels"),
    ("GET", f"/api/duels/{SOME_DUEL}"),
    ("POST", f"/api/duels/{SOME_DUEL}/move"),
    ("POST", f"/api/duels/{SOME_DUEL}/cancel"),
]

ROUTE_BODIES = {
    "/api/duels": NEW_CHALLENGE,
    f"/api/duels/{SOME_DUEL}/move": {"signals": BOB_SIGNALS, "actionUid": "answer-0001"},
}

WORKED_EXAMPLE_REVEAL = [
    {"round": 1, "yours": "mirror", "theirs": "flash", "point": "you"},
    {"round": 2, "yours": "flash", "theirs": "shade", "point": "you"},
    {"round": 3, "yours": "shade", "theirs": "shade", "point": "even"},
    {"round": 4, "yours": "shade", "theirs": "mirror", "point": "you"},
    {"round": 5, "yours": "mirror", "theirs": "shade", "point": "them"},
]

# Against Alice's Flash, Shade, Shade, Mirror, Shade this loses 1 to 4 (oil 3 of 5).
BOB_LOSES = ["shade", "mirror", "mirror", "shade", "mirror"]

# A draw in 3 rounds: Flash, Shade, Shade against Shade, Flash, Shade (1 round each).
DRAW_ALICE = ["flash", "shade", "shade"]
DRAW_BOB = ["shade", "flash", "shade"]


def send(world: World, method: str, path: str, **kwargs):
    """Send one request to the app with the right body for the route, if it has one."""
    body = ROUTE_BODIES.get(path)
    if method == "POST" and body is not None:
        kwargs["json"] = body
    return world.client.request(method, path, **kwargs)


def signal_words_in(text: str) -> list[str]:
    return [word for word in rules.SIGNALS if word in text]


def lists_of(body: dict) -> dict:
    """The four lists of a GET /api/duels answer (its rules name the signals, so leave them out)."""
    return {name: body[name] for name in ("incoming", "openChallenges", "yours", "recent")}


def play_a_whole_duel(world: World, **changes) -> str:
    """Alice challenges Bob and Bob answers. Returns the id of the finished duel."""
    duel_id = world.start_duel(**changes)
    response = world.answer("bob", duel_id)
    assert response.status_code == 200, response.text
    return duel_id


def add_more_captains(world: World, count: int) -> list[str]:
    """Extra captains with their own names, for the tests of the short lists."""
    ids = []
    for number in range(count):
        player_id = f"00000000-0000-4000-9000-{number:012d}"
        world.database.add_player(player_id, f"Fake Captain {number:02d}")
        ids.append(player_id)
    return ids


# --- every route: who may call it, and what the answer says about caching ---


@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_every_route_needs_a_sign_in(method, path):
    world = World()

    response = send(world, method, path)

    assert_error(response, 401, "unauthorized")
    assert world.database.requests == []


@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_every_route_answers_feature_off_while_the_flag_is_off_and_calls_no_database(method, path):
    world = World(settings=CONFIGURED_SETTINGS)  # every flag off

    response = send(world, method, path, headers=world.headers("alice"))

    assert_error(response, 404, "feature_off")
    assert world.database.requests == []


def test_the_sign_in_is_checked_before_the_flag():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.client.get("/api/duels")

    assert_error(response, 401, "unauthorized")


def test_the_flag_is_checked_before_the_body():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.client.post("/api/duels", json={"nonsense": 1}, headers=world.headers("alice"))

    assert_error(response, 404, "feature_off")


def test_the_sign_in_is_checked_before_the_body():
    world = World()

    response = world.client.post("/api/duels", json={"nonsense": 1})

    assert_error(response, 401, "unauthorized")


def test_a_token_that_is_not_ours_is_a_401():
    world = World()

    response = world.client.get("/api/duels", headers={"Authorization": "Bearer token-mallory"})

    assert_error(response, 401, "unauthorized")


def cache_headers_of_all_five_routes(world: World) -> list[str]:
    """The Cache-Control header of one good answer from each of the five routes."""
    created = world.challenge("alice")
    duel_id = created.json()["duel"]["id"]
    answered = world.answer("bob", duel_id)
    second_id = world.start_duel(actionUid="challenge-0002")
    answers = [
        created,
        world.listing("alice"),
        world.detail("alice", duel_id),
        answered,
        world.cancel("alice", second_id),
    ]
    return [answer.headers["cache-control"] for answer in answers]


def test_every_good_answer_is_private_and_not_cached():
    world = World()

    assert cache_headers_of_all_five_routes(world) == [NO_STORE] * 5


def test_every_good_answer_has_the_server_time():
    world = World()
    duel_id = world.start_duel()

    bodies = [
        world.listing("alice").json(),
        world.detail("alice", duel_id).json(),
        world.cancel("alice", duel_id).json(),
    ]

    assert [body["serverTime"] for body in bodies] == ["2026-11-06T10:00:00Z"] * 3


# --- the models of the contract ---


def test_the_signals_the_requests_accept_are_the_signals_of_the_rules():
    assert get_args(SignalName) == rules.SIGNALS


def test_the_models_of_the_summary_and_the_detail_have_the_fields_of_the_contract():
    assert list(SummaryOut.model_fields) == [
        "id",
        "status",
        "isOpen",
        "you",
        "challengerName",
        "opponentName",
        "rounds",
        "oil",
        "stake",
        "cutPercent",
        "winnerTakes",
        "createdAt",
        "expiresAt",
        "closedAt",
        "score",
        "yourResult",
        "coinsChange",
        "heldStake",
        "canAnswer",
        "canWithdraw",
        "canDecline",
    ]
    assert list(DetailOut.model_fields)[-2:] == ["yourSignals", "reveal"]


def test_both_request_models_refuse_extra_fields():
    assert ChallengeRequest.model_config["extra"] == "forbid"
    assert AnswerRequest.model_config["extra"] == "forbid"


def test_create_app_keeps_the_duel_service_it_is_given():
    service = DuelService()

    app = create_app(CONFIGURED_SETTINGS, duel_service=service)

    assert app.state.duels is service


def test_create_app_makes_a_duel_service_when_none_is_given():
    assert isinstance(create_app(CONFIGURED_SETTINGS).state.duels, DuelService)


# --- POST /api/duels: sending a challenge ---


def test_a_named_staked_challenge_holds_the_stake_and_answers_the_detail():
    world = World()

    response = world.challenge("alice")

    assert response.status_code == 200
    body = response.json()
    assert body["coins"] == 900
    assert body["serverTime"] == "2026-11-06T10:00:00Z"
    assert body["duel"] == {
        "id": "00000000-0000-4000-8000-000000000001",
        "status": "open",
        "isOpen": False,
        "you": "challenger",
        "challengerName": "Brave Puffin 17",
        "opponentName": "Captain-3fa85f",
        "rounds": 5,
        "oil": 5,
        "stake": 100,
        "cutPercent": 5,
        "winnerTakes": 190,
        "createdAt": "2026-11-06T10:00:00Z",
        "expiresAt": "2026-11-07T10:00:00Z",
        "closedAt": None,
        "score": None,
        "yourResult": None,
        "coinsChange": None,
        "heldStake": 100,
        "canAnswer": False,
        "canWithdraw": True,
        "canDecline": False,
        "yourSignals": ALICE_SIGNALS,
        "reveal": None,
    }


def test_the_stake_is_held_once_in_the_ledger_with_the_duel_id_in_the_ref():
    world = World()

    duel_id = world.start_duel()

    assert world.coins("alice") == 900
    assert world.database.ledger == [
        {"player_id": ALICE, "delta": -100, "reason": "arena_stake", "ref": f"duel:{duel_id}"}
    ]


def test_the_challenge_sends_the_checked_numbers_and_the_verified_player_to_the_database():
    world = World()

    world.challenge("alice")

    assert world.database.calls("duel_create") == [
        {
            "p_challenger_id": ALICE,
            "p_opponent_name": "Captain-3fa85f",
            "p_rounds": 5,
            "p_stake": 100,
            "p_cut_percent": 5,
            "p_signals": ALICE_SIGNALS,
            "p_create_uid": "challenge-0001",
            "p_answer_hours": 24,
            "p_max_waiting": 3,
        }
    ]


def test_an_open_challenge_needs_no_name():
    world = World()

    response = world.challenge("alice", drop=("opponentName",))

    assert response.status_code == 200
    duel = response.json()["duel"]
    assert duel["isOpen"] is True
    assert duel["opponentName"] is None
    assert world.database.calls("duel_create")[0]["p_opponent_name"] is None


def test_a_name_of_null_makes_an_open_challenge_too():
    world = World()

    response = world.challenge("alice", opponentName=None)

    assert response.status_code == 200
    assert response.json()["duel"]["isOpen"] is True


def test_a_friendly_challenge_holds_no_coins_and_touches_no_ledger():
    world = World()

    response = world.challenge("alice", stake=0)

    assert response.status_code == 200
    assert response.json()["coins"] == 1000
    assert response.json()["duel"]["heldStake"] == 0
    assert world.database.ledger == []


def test_the_name_is_found_in_any_letter_case_and_the_answer_shows_the_profile_name():
    world = World()

    response = world.challenge("alice", opponentName="CAPTAIN-3fa85F")

    assert response.status_code == 200
    assert response.json()["duel"]["opponentName"] == "Captain-3fa85f"


def test_the_same_challenge_sent_twice_is_created_once():
    world = World()
    world.challenge("alice")

    response = world.challenge("alice")

    assert_error(response, 409, "already_applied")
    assert len(world.database.calls("duel_create")) == 1  # the repeat check stops it
    assert len(world.database.duels) == 1
    assert world.coins("alice") == 900


def test_a_repeat_is_already_applied_whatever_else_has_changed():
    world = World()
    world.challenge("alice")
    world.challenge("alice", actionUid="challenge-0002")
    world.challenge("alice", actionUid="challenge-0003")  # now Alice has 3 waiting

    response = world.challenge("alice")  # the first click again

    assert_error(response, 409, "already_applied")


def test_the_same_action_uid_from_another_captain_is_a_new_challenge():
    world = World()
    world.challenge("alice")

    response = world.challenge("bob", opponentName="Brave Puffin 17")

    assert response.status_code == 200


def test_no_such_captain_is_a_404():
    world = World()

    response = world.challenge("alice", opponentName="Nobody Here")

    assert_error(response, 404, "no_such_captain")
    assert world.coins("alice") == 1000


def test_a_name_shared_by_several_captains_is_a_409():
    world = World()
    world.database.add_player("00000000-0000-4000-9000-000000000099", "captain-3FA85F")

    response = world.challenge("alice")

    assert_error(response, 409, "name_not_unique")


@pytest.mark.parametrize("name", ["Brave Puffin 17", "brave puffin 17", "  BRAVE PUFFIN 17 "])
def test_challenging_yourself_is_a_422(name):
    world = World()

    response = world.challenge("alice", opponentName=name)

    assert_error(response, 422, "cannot_duel_yourself")
    assert world.coins("alice") == 1000


def test_the_fourth_waiting_challenge_is_a_409():
    world = World()
    world.challenge("alice", actionUid="challenge-0001")
    world.challenge("alice", actionUid="challenge-0002")
    world.challenge("alice", actionUid="challenge-0003")

    response = world.challenge("alice", actionUid="challenge-0004")

    assert_error(response, 409, "too_many_waiting")
    assert world.coins("alice") == 700  # only three stakes are held


def test_a_withdrawn_challenge_makes_room_for_another_one():
    world = World()
    first = world.start_duel(actionUid="challenge-0001")
    world.challenge("alice", actionUid="challenge-0002")
    world.challenge("alice", actionUid="challenge-0003")
    world.cancel("alice", first)

    response = world.challenge("alice", actionUid="challenge-0004")

    assert response.status_code == 200


def test_a_captain_who_cannot_pay_the_stake_creates_nothing():
    world = World()
    world.database.wallets[ALICE] = 50

    response = world.challenge("alice")

    assert_error(response, 409, "insufficient_funds")
    assert world.database.duels == []
    assert world.database.moves == []  # no envelope was left behind
    assert world.coins("alice") == 50


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"rounds": 4}, "bad_rounds"),
        ({"rounds": 7}, "bad_rounds"),
        ({"stake": 30}, "bad_stake"),
        ({"stake": 101}, "bad_stake"),
        ({"signals": ["shade", "shade", "shade"]}, "wrong_signal_count"),
        ({"rounds": 3}, "wrong_signal_count"),
        ({"signals": ["flash", "flash", "mirror", "mirror", "shade"]}, "not_enough_oil"),
    ],
)
def test_a_choice_or_a_sequence_that_breaks_the_rules_is_a_422_and_reaches_no_function(
    changes, code
):
    world = World()

    response = world.challenge("alice", **changes)

    assert_error(response, 422, code)
    assert world.database.calls("duel_create") == []
    assert world.coins("alice") == 1000


@pytest.mark.parametrize(
    "changes",
    [
        {"playerId": ALICE},
        {"signals": ["flash", "shade", "shade", "mirror", "sparkle"]},
        {"signals": ["flash", "shade"]},
        {"signals": ["shade"] * 6},
        {"signals": "flash"},
        {"rounds": "5"},
        {"rounds": 5.5},
        {"stake": "100"},
        {"stake": True},
        {"actionUid": "short"},
        {"actionUid": "x" * 65},
        {"actionUid": "has spaces in it"},
        {"actionUid": "semi;colon-uid"},
        {"opponentName": "x"},
        {"opponentName": "y" * 25},
        {"opponentName": "Captain<script>"},
        {"opponentName": 7},
    ],
)
def test_a_body_that_does_not_fit_is_a_422_validation_error(changes):
    world = World()

    response = world.challenge("alice", **changes)

    assert_error(response, 422, "validation_error")
    assert world.database.requests == []
    assert "sparkle" not in response.text  # the message never repeats what was sent


@pytest.mark.parametrize("missing", ["rounds", "stake", "signals", "actionUid"])
def test_a_missing_field_is_a_422_validation_error(missing):
    world = World()

    response = world.challenge("alice", drop=(missing,))

    assert_error(response, 422, "validation_error")


def test_a_database_timeout_on_a_challenge_is_a_503_and_nothing_is_retried():
    world = World()
    world.database.timeouts.add("duel_create")

    response = world.challenge("alice")

    assert_error(response, 503, "database_unavailable")
    assert len(world.database.calls("duel_create")) == 1


def test_an_unconfigured_database_is_a_503():
    world = World(admin=SupabaseAdmin("", ""))

    assert_error(world.listing("alice"), 503, "database_not_configured")
    assert_error(world.challenge("alice"), 503, "database_not_configured")


# --- what the database can answer to a function, and what the route makes of it ---


def world_with_a_waiting_duel() -> World:
    """A world with one waiting named challenge from Alice to Bob (the id is SOME_DUEL)."""
    world = World()
    world.database.insert_duel(id=SOME_DUEL)
    return world


def call_the_function(world: World, function: str):
    """Make the route that runs `function` work: Alice challenges, Bob answers, Alice cancels."""
    if function == "duel_create":
        return world.challenge("alice")
    if function == "duel_answer":
        return world.answer("bob", SOME_DUEL)
    return world.cancel("alice", SOME_DUEL)


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
def test_a_repeat_raised_by_the_database_is_a_409_already_applied(function):
    world = world_with_a_waiting_duel()
    world.database.failures[function] = RpcFailure("23505", "already_applied", 409)

    assert_error(call_the_function(world, function), 409, "already_applied")


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
def test_not_enough_coins_raised_by_the_database_is_a_409_insufficient_funds(function):
    world = world_with_a_waiting_duel()
    world.database.failures[function] = RpcFailure("P0001", "insufficient_funds")

    assert_error(call_the_function(world, function), 409, "insufficient_funds")


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
@pytest.mark.parametrize("message", ["bad_duel", "wallet_not_found", "unknown_reason"])
def test_an_error_that_means_the_server_and_the_database_disagree_is_a_502(function, message):
    world = world_with_a_waiting_duel()
    world.database.failures[function] = RpcFailure("P0001", message)

    response = call_the_function(world, function)

    assert_error(response, 502, "database_error")
    assert message not in response.text  # the database's own words are never repeated


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
def test_a_database_that_fails_inside_is_a_503_with_an_unknown_outcome(function):
    world = world_with_a_waiting_duel()
    world.database.failures[function] = RpcFailure("XX000", "internal", 500)

    assert_error(call_the_function(world, function), 503, "database_unavailable")


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
def test_a_refusal_the_server_does_not_know_is_a_502(function):
    world = world_with_a_waiting_duel()
    world.database.refusals[function] = "made_up_reason"

    assert_error(call_the_function(world, function), 502, "database_error")


@pytest.mark.parametrize("function", ["duel_create", "duel_answer", "duel_void"])
def test_an_odd_reply_from_a_function_is_a_502(function):
    world = world_with_a_waiting_duel()
    world.database.odd_replies.add(function)

    assert_error(call_the_function(world, function), 502, "database_error")


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("no_such_duel", 404, "no_such_duel"),
        ("duel_taken", 409, "duel_taken"),
        ("duel_closed", 409, "duel_closed"),
        ("daily_pair_limit", 409, "daily_pair_limit"),
    ],
)
def test_a_refusal_of_duel_answer_becomes_its_error(reason, status, code):
    world = world_with_a_waiting_duel()
    world.database.refusals["duel_answer"] = reason

    assert_error(call_the_function(world, "duel_answer"), status, code)


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("no_such_captain", 404, "no_such_captain"),
        ("name_not_unique", 409, "name_not_unique"),
        ("cannot_duel_yourself", 422, "cannot_duel_yourself"),
        ("too_many_waiting", 409, "too_many_waiting"),
    ],
)
def test_a_refusal_of_duel_create_becomes_its_error(reason, status, code):
    world = world_with_a_waiting_duel()
    world.database.refusals["duel_create"] = reason

    assert_error(call_the_function(world, "duel_create"), status, code)


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("not_your_duel", 403, "not_your_duel"),
        ("duel_closed", 409, "duel_closed"),
        ("no_such_duel", 404, "no_such_duel"),
    ],
)
def test_a_refusal_of_duel_void_becomes_its_error(reason, status, code):
    world = world_with_a_waiting_duel()
    world.database.refusals["duel_void"] = reason

    assert_error(call_the_function(world, "duel_void"), status, code)


# --- GET /api/duels/{id}: one duel ---


def test_the_challenger_sees_their_waiting_duel_with_their_own_signals():
    world = World()
    duel_id = world.start_duel()

    body = world.detail("alice", duel_id).json()

    assert body["duel"]["yourSignals"] == ALICE_SIGNALS
    assert body["duel"]["reveal"] is None
    assert body["duel"]["heldStake"] == 100
    assert "coins" not in body


def test_the_named_captain_sees_the_waiting_duel_and_no_signal_at_all():
    world = World()
    duel_id = world.start_duel()

    response = world.detail("bob", duel_id)

    duel = response.json()["duel"]
    assert (duel["you"], duel["status"], duel["canAnswer"], duel["canDecline"]) == (
        "opponent",
        "open",
        True,
        True,
    )
    assert duel["yourSignals"] is None
    assert duel["reveal"] is None
    assert signal_words_in(response.text) == []


def test_a_third_captain_sees_an_open_challenge_as_a_visitor():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    response = world.detail("carol", duel_id)

    duel = response.json()["duel"]
    assert (duel["you"], duel["canAnswer"], duel["yourSignals"]) == ("visitor", True, None)
    assert signal_words_in(response.text) == []


def test_a_named_duel_is_a_404_for_a_third_captain():
    world = World()
    duel_id = world.start_duel()

    assert_error(world.detail("carol", duel_id), 404, "no_such_duel")


def test_an_unknown_duel_is_a_404():
    world = World()

    assert_error(world.detail("alice", SOME_DUEL), 404, "no_such_duel")


@pytest.mark.parametrize("duel_id", ["not-a-uuid", "12345", "00000000-0000-4000-8000-00000000000"])
def test_an_id_that_is_not_a_uuid_is_a_422_and_reaches_no_database(duel_id):
    world = World()

    response = world.detail("alice", duel_id)

    assert_error(response, 422, "validation_error")
    assert world.database.requests == []


def test_a_finished_duel_shows_the_reveal_to_both_captains():
    world = World()
    duel_id = play_a_whole_duel(world)

    for_bob = world.detail("bob", duel_id).json()["duel"]
    for_alice = world.detail("alice", duel_id).json()["duel"]

    assert for_bob["reveal"] == WORKED_EXAMPLE_REVEAL
    assert for_bob["yourSignals"] == BOB_SIGNALS
    assert (for_bob["score"], for_bob["yourResult"], for_bob["coinsChange"]) == (
        {"you": 3, "them": 1},
        "won",
        90,
    )
    assert for_alice["yourSignals"] == ALICE_SIGNALS
    assert [entry["theirs"] for entry in for_alice["reveal"]] == BOB_SIGNALS
    assert (for_alice["score"], for_alice["yourResult"], for_alice["coinsChange"]) == (
        {"you": 1, "them": 3},
        "lost",
        -100,
    )


def test_the_detail_of_a_waiting_duel_reads_only_the_callers_own_envelope():
    world = World()
    duel_id = world.start_duel()
    world.database.requests.clear()

    world.detail("bob", duel_id)
    bob_reads = [r.url.params["player_id"] for r in world.database.reads("duel_moves")]
    world.database.requests.clear()
    world.detail("alice", duel_id)
    alice_reads = [r.url.params["player_id"] for r in world.database.reads("duel_moves")]

    assert bob_reads == [f"eq.{BOB}"]
    assert alice_reads == [f"eq.{ALICE}"]


def test_the_detail_reads_the_other_envelope_only_once_the_duel_is_finished():
    world = World()
    duel_id = play_a_whole_duel(world)
    world.database.requests.clear()

    world.detail("alice", duel_id)

    reads = [r.url.params["player_id"] for r in world.database.reads("duel_moves")]
    assert reads == [f"eq.{ALICE}", f"eq.{BOB}"]


def test_a_visitor_reads_no_envelope_at_all():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    world.database.requests.clear()

    world.detail("carol", duel_id)

    assert world.database.reads("duel_moves") == []


@pytest.mark.parametrize("who", ["alice", "bob"])
def test_an_expired_challenge_is_refunded_when_either_captain_looks_at_it(who):
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)

    response = world.detail(who, duel_id)

    assert response.json()["duel"]["status"] == "expired"
    assert response.json()["duel"]["heldStake"] == 0
    assert world.coins("alice") == 1000
    assert world.database.calls("duel_void") == [
        {"p_duel_id": duel_id, "p_player_id": PLAYERS[who][0], "p_new_status": "expired"}
    ]


def test_an_expired_challenge_is_refunded_only_once():
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)
    world.detail("bob", duel_id)

    world.detail("alice", duel_id)
    world.detail("bob", duel_id)

    assert len(world.database.calls("duel_void")) == 1
    assert world.coins("alice") == 1000


def test_a_visitor_who_finds_an_expired_open_challenge_hears_it_is_gone():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    world.clock.advance(25 * 3600)

    response = world.detail("carol", duel_id)

    assert_error(response, 404, "no_such_duel")
    assert world.coins("alice") == 1000  # the refund happened all the same


def test_a_captain_who_left_shows_no_name_and_no_signals_in_the_detail():
    world = World()
    duel_id = play_a_whole_duel(world, drop=("opponentName",))
    row = world.database.duel()
    row["opponent_id"] = None  # Bob's profile was deleted: set null
    world.database.moves[:] = [m for m in world.database.moves if m["player_id"] != BOB]
    del world.database.profiles[BOB]

    duel = world.detail("alice", duel_id).json()["duel"]

    assert duel["opponentName"] is None
    assert [entry["theirs"] for entry in duel["reveal"]] == [None] * 5
    assert [entry["yours"] for entry in duel["reveal"]] == ALICE_SIGNALS


def test_a_challenger_whose_profile_is_missing_still_gets_an_answer():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    del world.database.profiles[ALICE]

    duel = world.detail("carol", duel_id).json()["duel"]

    assert duel["challengerName"] == UNKNOWN_CAPTAIN


# --- POST /api/duels/{id}/move: answering ---


def test_the_named_captain_answers_and_both_captains_see_the_reveal():
    world = World()
    duel_id = world.start_duel()

    response = world.answer("bob", duel_id)

    assert response.status_code == 200
    body = response.json()
    assert body["coins"] == 1090
    duel = body["duel"]
    assert duel["status"] == "finished"
    assert duel["reveal"] == WORKED_EXAMPLE_REVEAL
    assert duel["score"] == {"you": 3, "them": 1}
    assert (duel["yourResult"], duel["coinsChange"]) == ("won", 90)
    assert (duel["canAnswer"], duel["canWithdraw"], duel["canDecline"]) == (False, False, False)
    assert duel["closedAt"] == "2026-11-06T10:00:00Z"
    assert world.detail("alice", duel_id).json()["duel"]["reveal"][0]["theirs"] == "mirror"


def test_the_coins_follow_the_worked_example_and_the_cut_is_the_only_sink():
    world = World()
    duel_id = play_a_whole_duel(world)

    assert (world.coins("alice"), world.coins("bob")) == (900, 1090)
    assert world.database.ledger_sum(duel_id) == -10
    assert world.database.ledger == [
        {"player_id": ALICE, "delta": -100, "reason": "arena_stake", "ref": f"duel:{duel_id}"},
        {"player_id": BOB, "delta": -100, "reason": "arena_stake", "ref": f"duel:{duel_id}"},
        {"player_id": BOB, "delta": 190, "reason": "arena_payout", "ref": f"duel:{duel_id}"},
    ]


def test_a_challenger_who_wins_is_paid_the_payout():
    world = World()
    duel_id = world.start_duel()

    response = world.answer("bob", duel_id, signals=BOB_LOSES)

    assert response.json()["duel"]["score"] == {"you": 1, "them": 4}
    assert response.json()["duel"]["yourResult"] == "lost"
    assert response.json()["coins"] == 900
    assert (world.coins("alice"), world.coins("bob")) == (1090, 900)
    assert world.database.ledger_sum(duel_id) == -10


def test_the_answer_sends_the_results_worked_out_in_python_and_the_lisbon_day():
    world = World()
    duel_id = world.start_duel()

    world.answer("bob", duel_id)

    assert world.database.calls("duel_answer") == [
        {
            "p_duel_id": duel_id,
            "p_player_id": BOB,
            "p_signals": BOB_SIGNALS,
            "p_action_uid": "answer-0001",
            "p_round_results": ["opponent", "opponent", "even", "opponent", "challenger"],
            "p_outcome": "opponent",
            "p_day_start": "2026-11-06T00:00:00+00:00",
            "p_pair_daily_limit": 3,
        }
    ]


def test_a_draw_returns_both_stakes():
    world = World()
    duel_id = world.start_duel(rounds=3, stake=50, signals=DRAW_ALICE)

    response = world.answer("bob", duel_id, signals=DRAW_BOB)

    duel = response.json()["duel"]
    assert (duel["yourResult"], duel["coinsChange"]) == ("draw", 0)
    assert (world.coins("alice"), world.coins("bob")) == (1000, 1000)
    assert world.database.ledger_sum(duel_id) == 0
    assert response.json()["coins"] == 1000


def test_a_friendly_duel_moves_no_coins_at_all():
    world = World()
    duel_id = world.start_duel(stake=0)

    response = world.answer("bob", duel_id)

    assert response.json()["duel"]["coinsChange"] == 0
    assert (world.coins("alice"), world.coins("bob")) == (1000, 1000)
    assert world.database.ledger == []


def test_a_repeated_answer_is_already_applied_and_sends_no_second_call():
    world = World()
    duel_id = world.start_duel()
    world.answer("bob", duel_id)

    response = world.answer("bob", duel_id)

    assert_error(response, 409, "already_applied")
    assert len(world.database.calls("duel_answer")) == 1
    assert world.coins("bob") == 1090


def test_a_second_answer_with_a_new_action_uid_is_already_sealed():
    world = World()
    duel_id = world.start_duel()
    world.answer("bob", duel_id)

    response = world.answer("bob", duel_id, actionUid="answer-0002")

    assert_error(response, 409, "already_sealed")
    assert len(world.database.calls("duel_answer")) == 1


def test_the_challenger_cannot_answer_their_own_challenge():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    response = world.answer("alice", duel_id, actionUid="answer-0001")

    assert_error(response, 409, "already_sealed")
    assert world.database.calls("duel_answer") == []


def test_the_challenger_sending_the_challenge_uid_again_is_a_repeat():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    response = world.answer("alice", duel_id, actionUid="challenge-0001")

    assert_error(response, 409, "already_applied")


def test_another_captain_cannot_answer_a_named_duel():
    world = World()
    duel_id = world.start_duel()

    response = world.answer("carol", duel_id)

    assert_error(response, 404, "no_such_duel")
    assert world.database.calls("duel_answer") == []


def test_an_unknown_duel_cannot_be_answered():
    world = World()

    assert_error(world.answer("bob", SOME_DUEL), 404, "no_such_duel")


def test_any_captain_but_the_challenger_can_answer_an_open_challenge():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    response = world.answer("carol", duel_id)

    assert response.status_code == 200
    assert response.json()["duel"]["you"] == "opponent"
    assert world.database.duel()["opponent_id"] == CAROL


def test_an_open_challenge_answered_first_by_someone_else_is_duel_taken():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    world.answer("bob", duel_id)

    response = world.answer("carol", duel_id, actionUid="answer-0002")

    assert_error(response, 409, "duel_taken")
    assert world.coins("carol") == 1000  # none of Carol's coins moved
    assert len(world.database.calls("duel_answer")) == 1


def test_a_withdrawn_duel_is_duel_closed():
    world = World()
    duel_id = world.start_duel()
    world.cancel("alice", duel_id)

    response = world.answer("bob", duel_id)

    assert_error(response, 409, "duel_closed")
    assert world.database.calls("duel_answer") == []


def test_a_declined_duel_is_duel_closed():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    world.cancel("alice", duel_id)

    assert_error(world.answer("carol", duel_id), 409, "duel_closed")


def test_the_state_is_checked_before_the_sequence():
    world = World()
    duel_id = world.start_duel()
    world.cancel("alice", duel_id)

    response = world.answer("bob", duel_id, signals=["flash"] * 5)  # too much oil as well

    assert_error(response, 409, "duel_closed")


def test_an_expired_challenge_is_refused_and_its_stake_goes_back():
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)

    response = world.answer("bob", duel_id)

    assert_error(response, 409, "duel_expired")
    assert world.database.calls("duel_answer") == []
    assert world.database.calls("duel_void") == [
        {"p_duel_id": duel_id, "p_player_id": BOB, "p_new_status": "expired"}
    ]
    assert world.coins("alice") == 1000
    assert world.database.duel()["status"] == "expired"


def test_a_challenge_that_expires_while_the_answer_is_on_its_way_is_refunded_too():
    # The server's clock still says "open" but the database already says "expired".
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)
    behind = world.clock.now - timedelta(hours=30)
    world.service.clock = lambda: behind

    response = world.answer("bob", duel_id)

    assert_error(response, 409, "duel_expired")
    assert len(world.database.calls("duel_answer")) == 1
    assert len(world.database.calls("duel_void")) == 1
    assert world.coins("alice") == 1000


def test_the_third_staked_duel_of_a_day_is_fine_and_the_fourth_is_a_409():
    world = World()
    for number in range(3):
        play_a_whole_duel(world, stake=10, actionUid=f"challenge-{number:04d}")
    fourth = world.start_duel(stake=10, actionUid="challenge-0004")

    response = world.answer("bob", fourth, actionUid="answer-0004")

    assert_error(response, 409, "daily_pair_limit")
    assert world.database.duel(3)["status"] == "open"


def test_the_pair_limit_counts_both_ways_round():
    world = World()
    for number in range(3):
        play_a_whole_duel(world, stake=10, actionUid=f"challenge-{number:04d}")
    fourth = world.challenge("bob", opponentName="Brave Puffin 17", stake=10).json()["duel"]["id"]

    response = world.answer("alice", fourth, actionUid="answer-0004")

    assert_error(response, 409, "daily_pair_limit")


def test_a_friendly_duel_does_not_count_for_the_pair_limit_and_is_not_blocked_by_it():
    world = World()
    for number in range(3):
        play_a_whole_duel(world, stake=10, actionUid=f"challenge-{number:04d}")
    friendly = world.start_duel(stake=0, actionUid="challenge-0004")

    assert world.answer("bob", friendly, actionUid="answer-0004").status_code == 200


def test_the_pair_limit_starts_again_at_midnight_lisbon_time():
    world = World()
    for number in range(3):
        play_a_whole_duel(world, stake=10, actionUid=f"challenge-{number:04d}")
    world.clock.advance(15 * 3600)  # 01:00 UTC on 7 Nov
    next_day = world.start_duel(stake=10, actionUid="challenge-0004")

    response = world.answer("bob", next_day, actionUid="answer-0004")

    assert response.status_code == 200
    assert world.database.calls("duel_answer")[-1]["p_day_start"] == "2026-11-07T00:00:00+00:00"


def test_an_answerer_who_cannot_pay_the_stake_changes_nothing():
    world = World()
    duel_id = world.start_duel()
    world.database.wallets[BOB] = 50

    response = world.answer("bob", duel_id)

    assert_error(response, 409, "insufficient_funds")
    assert world.coins("bob") == 50
    assert world.coins("alice") == 900
    assert not world.database.has_envelope(duel_id, BOB)
    assert world.database.duel()["status"] == "open"


def test_a_database_timeout_on_the_answer_is_a_503_and_nothing_is_retried():
    world = World()
    duel_id = world.start_duel()
    world.database.timeouts.add("duel_answer")

    response = world.answer("bob", duel_id)

    assert_error(response, 503, "database_unavailable")
    assert len(world.database.calls("duel_answer")) == 1


@pytest.mark.parametrize(
    ("signals", "code"),
    [
        (["shade", "shade", "shade"], "wrong_signal_count"),
        (["flash", "flash", "mirror", "mirror", "shade"], "not_enough_oil"),
    ],
)
def test_an_answer_that_breaks_the_oil_rules_is_a_422_and_reaches_no_function(signals, code):
    world = World()
    duel_id = world.start_duel()

    response = world.answer("bob", duel_id, signals=signals)

    assert_error(response, 422, code)
    assert world.database.calls("duel_answer") == []


@pytest.mark.parametrize(
    "changes",
    [
        {"playerId": BOB},
        {"signals": ["flash", "shade", "shade", "mirror", "sparkle"]},
        {"signals": ["flash", "shade"]},
        {"actionUid": "short"},
        {"opponentName": "Captain-3fa85f"},
    ],
)
def test_an_answer_body_that_does_not_fit_is_a_422_validation_error(changes):
    world = World()
    duel_id = world.start_duel()

    response = world.answer("bob", duel_id, **changes)

    assert_error(response, 422, "validation_error")


def test_the_answer_reads_the_challengers_envelope_for_the_server_only():
    world = World()
    duel_id = world.start_duel()
    world.database.requests.clear()

    response = world.answer("bob", duel_id)

    envelope_reads = [r.url.params["player_id"] for r in world.database.reads("duel_moves")]
    assert f"eq.{ALICE}" in envelope_reads  # needed to work out the results
    assert signal_words_in(response.text) != []  # and now they are revealed, after the answer


# --- POST /api/duels/{id}/cancel: withdrawing and declining ---


def test_the_challenger_withdraws_and_the_stake_comes_back():
    world = World()
    duel_id = world.start_duel()

    response = world.cancel("alice", duel_id)

    assert response.status_code == 200
    body = response.json()
    assert body["coins"] == 1000
    assert body["duel"]["status"] == "withdrawn"
    assert (body["duel"]["heldStake"], body["duel"]["coinsChange"]) == (0, 0)
    assert world.database.ledger_sum(duel_id) == 0
    assert world.database.calls("duel_void") == [
        {"p_duel_id": duel_id, "p_player_id": ALICE, "p_new_status": "withdrawn"}
    ]


def test_the_named_captain_declines_and_the_stake_goes_back_to_the_challenger():
    world = World()
    duel_id = world.start_duel()

    response = world.cancel("bob", duel_id)

    body = response.json()
    assert body["duel"]["status"] == "declined"
    assert body["coins"] is None  # Bob's balance did not change and is not part of this answer
    assert world.coins("alice") == 1000
    assert world.database.calls("duel_void")[0]["p_new_status"] == "declined"


def test_a_visitor_cannot_cancel_an_open_challenge_of_another_captain():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    response = world.cancel("carol", duel_id)

    assert_error(response, 403, "not_your_duel")
    assert world.database.calls("duel_void") == []
    assert world.coins("alice") == 900


def test_a_named_duel_is_a_404_for_a_third_captain_who_tries_to_cancel_it():
    world = World()
    duel_id = world.start_duel()

    assert_error(world.cancel("carol", duel_id), 404, "no_such_duel")


def test_cancelling_an_unknown_duel_is_a_404():
    world = World()

    assert_error(world.cancel("alice", SOME_DUEL), 404, "no_such_duel")


def test_cancelling_twice_is_already_applied():
    world = World()
    duel_id = world.start_duel()
    world.cancel("alice", duel_id)

    response = world.cancel("alice", duel_id)

    assert_error(response, 409, "already_applied")
    assert world.coins("alice") == 1000  # the stake came back once


def test_declining_twice_is_already_applied():
    world = World()
    duel_id = world.start_duel()
    world.cancel("bob", duel_id)

    assert_error(world.cancel("bob", duel_id), 409, "already_applied")


def test_cancelling_a_finished_duel_is_duel_closed():
    world = World()
    duel_id = play_a_whole_duel(world)

    assert_error(world.cancel("alice", duel_id), 409, "duel_closed")
    assert_error(world.cancel("bob", duel_id), 409, "duel_closed")
    assert world.coins("alice") == 900


def test_withdrawing_something_the_other_captain_declined_is_duel_closed():
    world = World()
    duel_id = world.start_duel()
    world.cancel("bob", duel_id)

    assert_error(world.cancel("alice", duel_id), 409, "duel_closed")


@pytest.mark.parametrize("who", ["alice", "bob"])
def test_cancelling_an_expired_challenge_twice_is_already_applied(who):
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)
    world.cancel(who, duel_id)

    response = world.cancel(who, duel_id)

    assert_error(response, 409, "already_applied")
    assert world.coins("alice") == 1000  # the stake came back once
    assert len(world.database.calls("duel_void")) == 1  # the repeat never reached the database


def test_cancelling_a_challenge_that_a_list_read_has_expired_already_is_already_applied():
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)
    world.listing("alice")  # the clean-up closes it as expired and gives the stake back

    response = world.cancel("alice", duel_id)

    assert_error(response, 409, "already_applied")
    assert world.coins("alice") == 1000
    assert len(world.database.calls("duel_void")) == 1  # the clean-up, and nothing after it


@pytest.mark.parametrize("who", ["alice", "bob"])
def test_cancelling_an_expired_challenge_closes_it_as_expired_and_refunds_it(who):
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)

    response = world.cancel(who, duel_id)

    assert response.json()["duel"]["status"] == "expired"
    assert world.coins("alice") == 1000
    assert world.database.calls("duel_void")[0]["p_new_status"] == "expired"


def test_a_withdraw_that_the_clocks_disagree_about_still_works():
    # The server thinks the window has passed, the database does not (not_expired). Withdraw.
    world = World()
    duel_id = world.start_duel()
    ahead = world.clock.now + timedelta(hours=25)
    world.service.clock = lambda: ahead

    response = world.cancel("alice", duel_id)

    assert response.json()["duel"]["status"] == "withdrawn"
    assert [call["p_new_status"] for call in world.database.calls("duel_void")] == [
        "expired",
        "withdrawn",
    ]
    assert world.coins("alice") == 1000


def test_a_database_timeout_on_a_cancel_is_a_503():
    world = World()
    duel_id = world.start_duel()
    world.database.timeouts.add("duel_void")

    assert_error(world.cancel("alice", duel_id), 503, "database_unavailable")


# --- GET /api/duels: the list ---


def test_a_new_captain_sees_empty_lists_and_the_rules():
    world = World()

    body = world.listing("alice").json()

    assert body["coins"] == 1000
    assert body["heldCoins"] == 0
    assert lists_of(body) == {"incoming": [], "openChallenges": [], "yours": [], "recent": []}
    assert body["serverTime"] == "2026-11-06T10:00:00Z"


def test_the_list_carries_the_rules_the_screen_shows():
    rules_out = World().listing("alice").json()["rules"]

    assert rules_out == {
        "signals": [
            {"id": "flash", "cost": 2, "beats": "shade"},
            {"id": "shade", "cost": 0, "beats": "mirror"},
            {"id": "mirror", "cost": 1, "beats": "flash"},
        ],
        "roundChoices": [3, 5],
        "oilPerRound": 1,
        "stakeChoices": [0, 10, 25, 50, 100],
        "cutPercent": 5,
        "answerHours": 24,
        "maxWaiting": 3,
        "pairDailyLimit": 3,
        "dayStarts": "00:00 Europe/Lisbon",
    }


def test_the_list_shows_my_waiting_challenge_and_the_coins_held_for_it():
    world = World()
    duel_id = world.start_duel()

    body = world.listing("alice").json()

    assert body["coins"] == 900
    assert body["heldCoins"] == 100
    assert [duel["id"] for duel in body["yours"]] == [duel_id]
    assert body["yours"][0]["heldStake"] == 100
    assert body["incoming"] == []


def test_the_named_captain_sees_the_challenge_under_incoming():
    world = World()
    duel_id = world.start_duel()

    body = world.listing("bob").json()

    assert [duel["id"] for duel in body["incoming"]] == [duel_id]
    assert (body["incoming"][0]["canAnswer"], body["incoming"][0]["canDecline"]) == (True, True)
    assert body["heldCoins"] == 0
    assert body["openChallenges"] == []


def test_a_third_captain_does_not_see_a_named_challenge_anywhere():
    world = World()
    world.start_duel()

    body = world.listing("carol").json()

    assert lists_of(body) == {"incoming": [], "openChallenges": [], "yours": [], "recent": []}


def test_an_open_challenge_is_listed_for_every_captain_but_its_challenger():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))

    for_bob = world.listing("bob").json()
    for_carol = world.listing("carol").json()
    for_alice = world.listing("alice").json()

    assert [duel["id"] for duel in for_bob["openChallenges"]] == [duel_id]
    assert for_carol["openChallenges"][0]["you"] == "visitor"
    assert for_alice["openChallenges"] == []
    assert [duel["id"] for duel in for_alice["yours"]] == [duel_id]


def test_an_answered_open_challenge_leaves_the_list_of_open_challenges():
    world = World()
    duel_id = world.start_duel(drop=("opponentName",))
    world.answer("bob", duel_id)

    assert world.listing("carol").json()["openChallenges"] == []


def test_recent_shows_the_finished_duel_with_the_score_and_the_coins():
    world = World()
    duel_id = play_a_whole_duel(world)

    for_bob = world.listing("bob").json()["recent"]
    for_alice = world.listing("alice").json()["recent"]

    assert [duel["id"] for duel in for_bob] == [duel_id]
    assert (for_bob[0]["score"], for_bob[0]["yourResult"], for_bob[0]["coinsChange"]) == (
        {"you": 3, "them": 1},
        "won",
        90,
    )
    assert (for_alice[0]["yourResult"], for_alice[0]["coinsChange"]) == ("lost", -100)


def test_recent_shows_withdrawn_and_declined_duels_with_the_stake_returned():
    world = World()
    withdrawn = world.start_duel(actionUid="challenge-0001")
    declined = world.start_duel(actionUid="challenge-0002")
    world.cancel("alice", withdrawn)
    world.cancel("bob", declined)

    recent = world.listing("alice").json()["recent"]

    assert sorted((duel["status"], duel["coinsChange"]) for duel in recent) == [
        ("declined", 0),
        ("withdrawn", 0),
    ]


def test_the_list_never_carries_a_signal():
    world = World()
    play_a_whole_duel(world)
    world.start_duel(actionUid="challenge-0002")
    world.start_duel(actionUid="challenge-0003", drop=("opponentName",))

    for who in ("alice", "bob", "carol"):
        body = world.listing(who).json()
        assert signal_words_in(str(lists_of(body))) == []


def test_the_list_never_reads_the_sealed_envelopes():
    world = World()
    play_a_whole_duel(world)
    world.start_duel(actionUid="challenge-0002", drop=("opponentName",))
    world.database.requests.clear()

    world.listing("alice")
    world.listing("carol")

    assert world.database.reads("duel_moves") == []


def test_a_list_makes_at_most_five_small_reads_when_nothing_has_expired():
    world = World()
    play_a_whole_duel(world)
    world.database.requests.clear()

    world.listing("alice")

    assert len(world.database.requests) <= 5
    assert world.database.calls("duel_void") == []


def test_a_list_asks_for_the_duels_of_the_verified_player_only():
    world = World()
    world.start_duel()
    world.database.requests.clear()

    world.listing("alice")

    own = world.database.reads("duels")[0].url.params
    assert own["or"] == f"(challenger_id.eq.{ALICE},opponent_id.eq.{ALICE})"
    assert own["limit"] == "20"
    wallet = world.database.reads("wallets")[0].url.params
    assert wallet["player_id"] == f"eq.{ALICE}"


def test_incoming_challenges_are_cut_at_ten():
    world = World()
    for player_id in add_more_captains(world, 12):
        world.database.insert_duel(challenger_id=player_id, opponent_id=BOB, stake=0)

    assert len(world.listing("bob").json()["incoming"]) == 10


def test_open_challenges_of_other_captains_are_cut_at_ten():
    world = World()
    for player_id in add_more_captains(world, 12):
        world.database.insert_duel(challenger_id=player_id, opponent_id=None, is_open=True, stake=0)

    assert len(world.listing("carol").json()["openChallenges"]) == 10


def test_my_waiting_challenges_are_cut_at_three():
    world = World()
    for _ in range(5):  # more than the database allows, to see the cut of the list
        world.database.insert_duel(challenger_id=BOB, opponent_id=None, is_open=True, stake=0)

    assert len(world.listing("bob").json()["yours"]) == 3


def test_recent_duels_are_cut_at_ten():
    world = World()
    for _ in range(12):
        world.database.insert_duel(
            status="finished",
            outcome="draw",
            round_results=["even"] * 5,
            answered_at=world.clock.now.isoformat(),
            closed_at=world.clock.now.isoformat(),
        )

    assert len(world.listing("alice").json()["recent"]) == 10


def test_my_expired_challenges_are_refunded_when_the_list_is_read():
    world = World()
    duel_id = world.start_duel()
    world.clock.advance(25 * 3600)

    body = world.listing("alice").json()

    assert body["coins"] == 1000
    assert body["heldCoins"] == 0
    assert [(duel["id"], duel["status"]) for duel in body["recent"]] == [(duel_id, "expired")]
    assert body["yours"] == []


def test_the_named_captain_reading_the_list_refunds_an_expired_challenge_too():
    world = World()
    world.start_duel()
    world.clock.advance(25 * 3600)

    body = world.listing("bob").json()

    assert body["incoming"] == []
    assert world.coins("alice") == 1000


def test_my_expired_challenges_are_refunded_at_most_five_per_request():
    world = World()
    world.database.wallets[ALICE] = 0
    for _ in range(7):
        row = world.database.insert_duel(stake=10, opponent_id=None, is_open=True)
        row["created_at"] = (world.clock.now - timedelta(hours=30)).isoformat()
        row["expires_at"] = (world.clock.now - timedelta(hours=6)).isoformat()

    first = world.listing("alice").json()
    after_first = len(world.database.calls("duel_void"))
    second = world.listing("alice").json()

    assert after_first == 5
    assert first["coins"] == 50
    assert first["heldCoins"] == 20  # two expired challenges still hold their stakes
    assert len(world.database.calls("duel_void")) == 7
    assert second["coins"] == 70
    assert second["heldCoins"] == 0


def test_a_sweep_that_the_database_refuses_leaves_the_duel_open():
    # The server's clock is ahead of the database clock, so duel_void says not_expired.
    world = World()
    duel_id = world.start_duel()
    ahead = world.clock.now + timedelta(hours=25)
    world.service.clock = lambda: ahead

    body = world.listing("alice").json()

    assert len(world.database.calls("duel_void")) == 1
    assert world.database.duel()["status"] == "open"
    assert world.coins("alice") == 900
    assert [duel["id"] for duel in body["yours"]] == [duel_id]


def test_a_captain_without_a_wallet_is_a_502():
    world = World()
    del world.database.wallets[ALICE]

    response = world.listing("alice")

    assert_error(response, 502, "database_error")
