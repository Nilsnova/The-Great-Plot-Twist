"""Tests for routes/intro.py: POST /api/intro/complete, the referee route.

No test uses the network. Two fakes stand in for Supabase: a fake login check that knows one token,
and a fake database. The fake database (EntryDatabase below) keeps the entry profiles and the wallet
in memory and runs the same steps as the SQL function grant_entry_kit in
supabase/migrations/20261106030000_entry_profiles.sql, so a test can send two requests in a row and
see how the second one is answered. A second flavour, scripted_database, answers with exactly the
reply a test writes down, for the cases where the database must say something odd or fail.

The thing to look for in every test of a forged log: the database is never called. That is what
"stores nothing" means.

Used by: pytest (cd backend && uv run pytest).
"""

import dataclasses
import hashlib
from dataclasses import replace
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from plot_twist.engine import STORY_PATH
from server.game.entry_kits import kit_by_id, kit_for, load_entry_kits
from server.routes import intro
from server.tests.account_helpers import (
    OTHER_PLAYER_ID,
    PLAYER_ID,
    RIGHT_HEADER,
    answer_request,
    database_error,
    make_client,
    scripted_database,
    sent_arguments,
)
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error, fail_with
from server.tests.story_states import (
    ROUTES,
    SILENT_TRAPPED,
    SILENT_TRAPPED_WITH_LOG,
    TO_LAMP,
    TO_SHORE,
    TRUSTED_TRAPPED,
    WARNED_RESCUE,
    WARNED_TRAPPED,
)

URL = "/api/intro/complete"
KITS = load_entry_kits()
STORY_SHA256 = hashlib.sha256(STORY_PATH.read_bytes()).hexdigest()


class EntryDatabase:
    """The entry profiles and the wallet, kept in memory, with the steps of grant_entry_kit.

    It is a FakeReply, so pass it to make_client. After a request, a test reads `profiles`,
    `balances`, `ledger` and `calls` to see what the request changed.
    """

    def __init__(self, known_players: tuple[str, ...] = (PLAYER_ID,)) -> None:
        self.known_players = set(known_players)  # the players who have a profile row
        self.profiles: dict[str, dict[str, Any]] = {}  # player id -> the stored answer values
        self.balances: dict[str, int] = {}
        self.ledger: list[tuple[str, int, str, str]] = []  # player, delta, reason, ref
        self.calls: list[dict[str, Any]] = []  # the arguments of every grant_entry_kit call

    def __call__(self, request: httpx.Request) -> httpx.Response:
        return answer_request(request, {}, {"grant_entry_kit": self.grant_entry_kit})

    def grant_entry_kit(self, arguments: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(arguments)
        player_id = arguments["p_player_id"]
        if player_id not in self.known_players:
            return {"status": "missing"}
        status, paid = "stored", 0
        if player_id not in self.profiles:  # the first time: store the profile and pay
            status, paid = "granted", arguments["p_kit_coins"]
            self.profiles[player_id] = {
                "ending": arguments["p_ending"],
                "decision": arguments["p_decision"],
                "readLog": arguments["p_read_log"],
                "kit": arguments["p_kit"],
                "startPlace": arguments["p_start_place"],
                "kitCoins": arguments["p_kit_coins"],
            }
            self.balances[player_id] = self.balances.get(player_id, 0) + paid
            self.ledger.append((player_id, paid, "kit_grant", "kit"))
        return {"status": status, "paid": paid, **self.profiles[player_id]}


def complete(client, actions: Any, headers=RIGHT_HEADER, **extra_fields):
    """Send POST /api/intro/complete with these actions (and any extra field in the body)."""
    return client.post(URL, json={"actions": actions, **extra_fields}, headers=headers)


def expected_answer(route_kit_id: str, *, paid: int, already: bool, **changes) -> dict[str, Any]:
    """The answer for a kit as the kits file describes it. `changes` overrides top-level values."""
    kit = kit_by_id(KITS, route_kit_id)
    answer = {
        "kit": {
            "id": kit.id,
            "name": kit.name,
            "startPlace": kit.start_place,
            "coins": kit.coins,
            "item": {"id": kit.item.id, "name": kit.item.name, "text": kit.item.text},
            "cheapCard": kit.cheap_card,
        },
        "coinsPaid": paid,
        "alreadyGranted": already,
    }
    return {**answer, **changes}


# --- the route is plugged in ---


def test_the_route_is_registered_under_api_and_only_for_post():
    client, _ = make_client(EntryDatabase())

    paths = client.get("/api/openapi.json").json()["paths"]

    assert list(paths["/api/intro/complete"]) == ["post"]


# --- the normal answer ---


def test_a_complete_log_grants_the_kit():
    database = EntryDatabase()
    client, seen = make_client(database)

    response = complete(client, WARNED_TRAPPED)

    assert response.status_code == 200
    assert response.json() == expected_answer(
        "witness",
        paid=1000,
        already=False,
        ending="ending_trapped",
        decision="warned",
        readLog=False,
    )
    assert response.headers["cache-control"] == "private, no-store"
    assert [request.url.path for request in seen] == ["/rest/v1/rpc/grant_entry_kit"]
    assert sent_arguments(seen[0]) == {
        "p_player_id": PLAYER_ID,
        "p_ending": "ending_trapped",
        "p_decision": "warned",
        "p_read_log": False,
        "p_kit": "witness",
        "p_start_place": "saltreach_harbor",
        "p_kit_coins": 1000,
        "p_move_count": len(WARNED_TRAPPED),
        "p_story_sha256": STORY_SHA256,
    }


def test_the_answer_shows_the_kit_the_way_the_spec_describes_it():
    client, _ = make_client(EntryDatabase())

    body = complete(client, WARNED_TRAPPED).json()

    assert list(body) == ["ending", "decision", "readLog", "kit", "coinsPaid", "alreadyGranted"]
    assert list(body["kit"]) == ["id", "name", "startPlace", "coins", "item", "cheapCard"]
    assert list(body["kit"]["item"]) == ["id", "name", "text"]
    assert body["kit"]["name"] == "Witness"
    assert body["kit"]["item"]["name"] == "Words through the door"


@pytest.mark.parametrize("route", ROUTES, ids=[route.name for route in ROUTES])
def test_each_of_the_eight_end_states_gets_its_kit_through_the_route(route):
    database = EntryDatabase()
    client, _ = make_client(database)

    response = complete(client, route.moves)

    assert response.status_code == 200
    body = response.json()
    assert (body["ending"], body["decision"], body["readLog"]) == (
        route.ending,
        route.decision,
        route.read_log,
    )
    assert body["kit"]["id"] == route.kit
    assert body["coinsPaid"] == kit_by_id(KITS, route.kit).coins
    assert database.balances[PLAYER_ID] == body["coinsPaid"]


def test_the_stranger_gets_1600_coins_and_the_others_1000():
    # PENDING Nils' decision (N5): the amounts come from the S0 drafts.
    paid = {}
    for route in ROUTES:
        client, _ = make_client(EntryDatabase())
        paid[route.kit] = complete(client, route.moves).json()["coinsPaid"]

    assert paid == {"true_keeper": 1000, "witness": 1000, "informant": 1000, "stranger": 1600}


# --- the coins are paid once, and only by the database function ---


def test_the_coins_move_only_inside_grant_entry_kit():
    # One call to the one function that stores the profile and pays together. A route that paid
    # from Python would also send a call to apply_wallet_transaction.
    client, seen = make_client(EntryDatabase())

    complete(client, WARNED_RESCUE)

    assert len(seen) == 1
    assert seen[0].method == "POST"
    assert seen[0].url.path == "/rest/v1/rpc/grant_entry_kit"
    assert not any("apply_wallet_transaction" in str(request.url) for request in seen)


def test_a_resubmission_returns_the_stored_profile_and_pays_nothing():
    # The first ending counts (PENDING Nils' decision N6). The second log would be an Informant,
    # but the player is a Witness, because the database holds the first profile.
    database = EntryDatabase()
    client, seen = make_client(database)
    complete(client, WARNED_TRAPPED)

    response = complete(client, TRUSTED_TRAPPED)

    assert response.status_code == 200
    assert response.json() == expected_answer(
        "witness", paid=0, already=True, ending="ending_trapped", decision="warned", readLog=False
    )
    assert sent_arguments(seen[1])["p_kit"] == "informant"  # what the new log would have given
    assert database.ledger == [(PLAYER_ID, 1000, "kit_grant", "kit")]
    assert database.balances[PLAYER_ID] == 1000


def test_the_same_log_sent_twice_pays_once():
    database = EntryDatabase()
    client, _ = make_client(database)

    first = complete(client, WARNED_RESCUE).json()
    second = complete(client, WARNED_RESCUE).json()

    assert (first["coinsPaid"], first["alreadyGranted"]) == (1000, False)
    assert (second["coinsPaid"], second["alreadyGranted"]) == (0, True)
    assert second["kit"] == first["kit"]
    assert database.balances[PLAYER_ID] == 1000


def stored_reply(**changes) -> dict[str, Any]:
    """What grant_entry_kit answers when the profile exists already, with some values changed."""
    reply = {
        "status": "stored",
        "paid": 0,
        "ending": "ending_trapped",
        "decision": "none",
        "readLog": True,
        "kit": "stranger",
        "startPlace": "saltreach_harbor",
        "kitCoins": 800,
    }
    return {**reply, **changes}


def test_the_answer_is_built_from_the_stored_values_and_not_from_the_new_log():
    # The stored profile paid 800 coins and starts on the island, though the kits file says 1600
    # coins and the harbor for a Stranger today. The answer says what the player really got. The
    # texts come from the kits file.
    stored = stored_reply(startPlace="lighthouse_isle")
    client, _ = make_client(scripted_database({"grant_entry_kit": lambda arguments: stored}))

    body = complete(client, WARNED_RESCUE).json()  # a log that would give a True Keeper

    stranger = kit_by_id(KITS, "stranger")
    assert (body["ending"], body["decision"], body["readLog"]) == ("ending_trapped", "none", True)
    assert (body["coinsPaid"], body["alreadyGranted"]) == (0, True)
    assert body["kit"]["id"] == "stranger"
    assert body["kit"]["coins"] == 800
    assert body["kit"]["startPlace"] == "lighthouse_isle"
    assert body["kit"]["item"]["name"] == stranger.item.name
    assert body["kit"]["cheapCard"] == stranger.cheap_card


# --- forged logs ---

FORGED_LOGS = {
    "an unknown action id": (["to_desk", "fly_away"], "move_refused", "Move 2"),
    "a blocked action": (["to_tower", "unlock_door"], "move_refused", "Move 2"),
    "an action of another scene": (["take_key"], "move_refused", "Move 1"),
    "a move after the ending": (WARNED_RESCUE + ["to_desk"], "move_refused", "Move 12"),
    "the rescue without the warning": (TO_SHORE + TO_LAMP + ["signal"], "move_refused", "Move 10"),
    "moves that stop before an ending": (["to_desk"], "no_ending", "stop before an ending"),
    "moves that stop one move before the ending": (
        WARNED_RESCUE[:-1],
        "no_ending",
        "stop before an ending",
    ),
}


@pytest.mark.parametrize(("actions", "code", "text"), FORGED_LOGS.values(), ids=FORGED_LOGS.keys())
def test_a_forged_log_is_422_and_stores_nothing(actions, code, text):
    database = EntryDatabase()
    client, seen = make_client(database)

    response = complete(client, actions)

    assert_error(response, 422, code)
    assert text in response.json()["error"]["message"]
    assert seen == []  # the database was never called
    assert database.profiles == {}


def test_more_than_300_moves_is_422_validation_error_and_stores_nothing():
    client, seen = make_client(EntryDatabase())
    log = ["to_desk", "desk_back"] * 150 + SILENT_TRAPPED  # 310 moves that would end the story

    response = complete(client, log)

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_exactly_300_moves_are_accepted():
    client, _ = make_client(EntryDatabase())
    log = ["to_desk", "desk_back"] * 145 + SILENT_TRAPPED

    response = complete(client, log)

    assert len(log) == 300
    assert response.status_code == 200
    assert response.json()["kit"]["id"] == "stranger"


@pytest.mark.parametrize(
    "odd_move",
    [
        "To Desk",
        "TO_DESK",
        "../x",
        "a" * 41,
        "",
        "to_desk\n",
        "to-desk",
        "\u00fcn\u00ef",
        42,
        None,
        ["to_desk"],
    ],
    ids=lambda value: repr(value)[:20],
)
def test_odd_move_ids_are_422_and_nothing_is_called(odd_move):
    client, seen = make_client(EntryDatabase())

    response = complete(client, ["to_desk", odd_move])

    assert_error(response, 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"actions": []},
        {"actions": "to_desk"},
        {"actions": None},
        {"actions": {"0": "to_desk"}},
        ["to_desk"],
        "to_desk",
    ],
    ids=lambda value: repr(value)[:30],
)
def test_a_body_that_is_not_a_list_of_actions_is_422(body):
    client, seen = make_client(EntryDatabase())

    response = client.post(URL, json=body, headers=RIGHT_HEADER)

    assert_error(response, 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize(
    "extra_field",
    [
        {"kit": "true_keeper"},
        {"ending": "ending_rescue"},
        {"decision": "warned"},
        {"coins": 99999},
        {"playerId": OTHER_PLAYER_ID},
        {"player_id": OTHER_PLAYER_ID},
    ],
    ids=lambda value: next(iter(value)),
)
def test_a_kit_or_a_player_in_the_request_is_refused(extra_field):
    # The server works out the kit itself. A field the route does not know is an error, so a
    # client cannot even try to send one.
    client, seen = make_client(EntryDatabase())

    response = complete(client, WARNED_TRAPPED, **extra_field)

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_the_player_id_comes_from_the_login_and_never_from_the_request():
    database = EntryDatabase(known_players=(PLAYER_ID, OTHER_PLAYER_ID))
    client, seen = make_client(database)

    client.post(
        f"{URL}?playerId={OTHER_PLAYER_ID}&player_id={OTHER_PLAYER_ID}",
        json={"actions": WARNED_TRAPPED},
        headers={**RIGHT_HEADER, "X-Player-Id": OTHER_PLAYER_ID},
    )

    assert [call["p_player_id"] for call in database.calls] == [PLAYER_ID]
    assert all(OTHER_PLAYER_ID not in str(request.url) for request in seen)
    assert OTHER_PLAYER_ID not in database.profiles


# --- who may call it ---


def test_without_a_token_it_is_401_and_stores_nothing():
    database = EntryDatabase()
    client, seen = make_client(database)

    response = client.post(URL, json={"actions": WARNED_TRAPPED})

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []


def test_a_token_nobody_issued_is_401_and_stores_nothing():
    client, seen = make_client(EntryDatabase())

    response = complete(client, WARNED_TRAPPED, headers={"Authorization": "Bearer made-up"})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_without_a_token_the_login_is_checked_before_the_log():
    client, seen = make_client(EntryDatabase())

    response = client.post(URL, json={"actions": ["fly_away"]})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_without_a_token_even_a_bad_body_is_401_and_not_422():
    client, seen = make_client(EntryDatabase())

    response = client.post(URL, json={"actions": [], "kit": "true_keeper"})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_get_is_not_allowed():
    client, seen = make_client(EntryDatabase())

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


def test_a_login_check_that_is_down_gives_503_and_stores_nothing():
    client, seen = make_client(EntryDatabase(), login_reply=fail_with(httpx.ConnectError))

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 503, "auth_unavailable")
    assert seen == []


# --- a player the database does not know ---


def test_a_player_without_a_profile_is_404_player_not_set_up():
    database = EntryDatabase(known_players=())
    client, _ = make_client(database)

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 404, "player_not_set_up")
    assert database.profiles == {}


# --- content that cannot be read ---


@pytest.mark.parametrize(
    ("name", "text"),
    [
        ("ENTRY_KITS_PATH", None),  # the file is missing
        ("ENTRY_KITS_PATH", "this is not json"),
        ("ENTRY_KITS_PATH", '{"kits": []}'),  # json, but not a kits file
        ("STORY_PATH", None),
        ("STORY_PATH", "this is not json"),
    ],
    ids=["no kits file", "kits not json", "kits wrong", "no story file", "story not json"],
)
def test_unreadable_content_is_503_intro_unavailable(name, text, tmp_path, monkeypatch):
    broken_file = tmp_path / "content.json"
    if text is not None:
        broken_file.write_text(text, encoding="utf-8")
    monkeypatch.setattr(intro, name, broken_file)
    client, seen = make_client(EntryDatabase())

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 503, "intro_unavailable")
    assert seen == []
    assert str(tmp_path) not in response.text  # no path in the answer


# --- the wallet rules are checked before the database is called ---


def test_a_kit_amount_the_wallet_refuses_is_422_and_the_database_is_not_called(monkeypatch):
    too_rich = dataclasses.replace(kit_for(KITS, "ending_trapped", "warned"), coins=2_000_000)
    monkeypatch.setattr(intro, "kit_for", lambda kits, ending, decision: too_rich)
    client, seen = make_client(EntryDatabase())

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 422, "invalid_transaction")
    assert seen == []


# --- the database in trouble ---


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_that_cannot_be_reached_gives_503(error_class):
    client, _ = make_client(fail_with(error_class))

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 503, "database_unavailable")


def test_a_database_timeout_is_503_and_a_retry_finds_the_stored_profile():
    # The call may have been saved before it timed out ("outcome unknown"). The route is safe to
    # repeat: the retry gets the stored profile and pays nothing again.
    database = EntryDatabase()
    timeouts = {"left": 1}

    def times_out_once_after_saving(request: httpx.Request) -> httpx.Response:
        reply = database(request)
        if timeouts["left"]:
            timeouts["left"] -= 1
            raise httpx.ReadTimeout("pretend timeout", request=request)
        return reply

    client, _ = make_client(times_out_once_after_saving)

    first = complete(client, WARNED_TRAPPED)
    second = complete(client, WARNED_TRAPPED)

    assert_error(first, 503, "database_unavailable")
    assert second.status_code == 200
    assert (second.json()["coinsPaid"], second.json()["alreadyGranted"]) == (0, True)
    assert database.balances[PLAYER_ID] == 1000


def test_a_server_without_the_database_key_gives_503_database_not_configured():
    settings = replace(CONFIGURED_SETTINGS, supabase_secret_key=SecretStr(""))
    client, seen = make_client(EntryDatabase(), settings=settings)

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 503, "database_not_configured")
    assert seen == []


def test_a_unique_violation_from_the_database_is_502_and_not_already_applied():
    # supabase_admin turns every unique violation (23505) into 409 already_applied, because for
    # the wallet that means "this was paid before". grant_entry_kit locks the player first, so a
    # repeat is answered with a normal reply. A 23505 here can only be a bug, and the browser must
    # not read it as "this was already done".
    duplicate = database_error(409, "23505", "duplicate key value violates unique constraint")
    client, _ = make_client(scripted_database({"grant_entry_kit": lambda arguments: duplicate}))

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 502, "database_error")
    assert "already_applied" not in response.text
    assert "duplicate key" not in response.text


def test_a_refusal_of_the_database_is_502_and_hides_its_text():
    refusal = database_error(400, "23514", 'violates check constraint "entry_profiles_kit_allowed"')
    client, _ = make_client(scripted_database({"grant_entry_kit": lambda arguments: refusal}))

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 502, "database_error")
    assert "entry_profiles" not in response.text


def good_reply() -> dict[str, Any]:
    return {
        "status": "granted",
        "paid": 1000,
        "ending": "ending_trapped",
        "decision": "warned",
        "readLog": False,
        "kit": "witness",
        "startPlace": "saltreach_harbor",
        "kitCoins": 1000,
    }


def without(key: str) -> dict[str, Any]:
    reply = good_reply()
    del reply[key]
    return reply


UNREADABLE_REPLIES = {
    "a list": [],
    "text": "granted",
    "nothing": None,
    "an unknown status": {**good_reply(), "status": "maybe"},
    "no status": without("status"),
    "no kit": without("kit"),
    "no start place": without("startPlace"),
    "no ending": without("ending"),
    "no paid": without("paid"),
    "paid as text": {**good_reply(), "paid": "1000"},
    "paid as true": {**good_reply(), "paid": True},
    "paid below zero": {**good_reply(), "paid": -5},
    "kit coins as text": {**good_reply(), "kitCoins": "1000"},
    "kit coins as a decimal": {**good_reply(), "kitCoins": 1000.5},
    "read log as text": {**good_reply(), "readLog": "no"},
    "a kit that is a number": {**good_reply(), "kit": 7},
    "an ending that is a number": {**good_reply(), "ending": 7},
    "a stored profile that paid": {**good_reply(), "status": "stored"},
}


@pytest.mark.parametrize("reply", UNREADABLE_REPLIES.values(), ids=UNREADABLE_REPLIES.keys())
def test_a_reply_the_server_cannot_read_is_502(reply):
    client, _ = make_client(scripted_database({"grant_entry_kit": lambda arguments: reply}))

    response = complete(client, WARNED_TRAPPED)

    assert_error(response, 502, "database_error")


def test_a_stored_kit_the_kits_file_does_not_know_is_a_server_error_and_not_a_kit():
    # The table rule only allows the four ids, so this cannot happen unless the file lost a kit. It
    # must never turn into a made-up kit. The test client hands the error to the test; a real
    # browser would get the standard 500 answer (test_app.py checks that part).
    unknown = stored_reply(kit="dragon")
    client, _ = make_client(scripted_database({"grant_entry_kit": lambda arguments: unknown}))

    with pytest.raises(ValueError, match="No entry kit with the id 'dragon'"):
        complete(client, WARNED_TRAPPED)


# --- personal data and secrets stay out of the logs ---


def test_nothing_secret_or_personal_appears_in_the_logs(caplog):
    client, _ = make_client(EntryDatabase())

    with caplog.at_level("DEBUG"):
        response = complete(client, WARNED_TRAPPED)

    assert response.status_code == 200
    assert PLAYER_ID not in caplog.text
    assert "token-of-octocat" not in caplog.text
    assert "octocat" not in response.text


def test_silent_players_with_and_without_the_log_are_both_strangers():
    # The log card (readLog) is separate from the kit: it does not change who the player is.
    client_a, _ = make_client(EntryDatabase())
    client_b, _ = make_client(EntryDatabase())

    plain = complete(client_a, SILENT_TRAPPED).json()
    with_log = complete(client_b, SILENT_TRAPPED_WITH_LOG).json()

    assert plain["kit"] == with_log["kit"]
    assert (plain["readLog"], with_log["readLog"]) == (False, True)


def test_keep_quiet_from_story_v2_gives_the_stranger_kit():
    # Story v2 added keep_quiet at the shore. It sets no flag, so the player ends as a Stranger.
    client, _ = make_client(EntryDatabase())

    response = complete(client, TO_SHORE + ["keep_quiet"] + TO_LAMP + ["untie"])

    assert response.status_code == 200
    body = response.json()
    assert (body["ending"], body["decision"]) == ("ending_trapped", "none")
    assert body["kit"]["id"] == "stranger"
