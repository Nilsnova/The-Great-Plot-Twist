"""Tests for routes/islet.py and game/islet_service.py: GET /api/islet and POST /api/islet/build.

Nothing here uses the network. The database is a FakeIsletDatabase (an httpx.MockTransport that
behaves like the parts of Supabase the islet uses and remembers every request), the sign-in check
answers from a fake transport, and the buildings come from the real buildings.json unless a test
passes its own catalogue.

Fixed numbers used again and again:
  * a new player has 1,000 coins and no islets row, so GET shows the starter pack of 20 timber,
  * every level 1 building costs 300 coins and 10 timber (backend/content/buildings.json),
  * the signal station stands on the plot islet_signal_station, the workshop on plot_2.

Used by: pytest (cd backend && uv run pytest).
"""

import json
import logging
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.game import building_catalogue, islet_service
from server.game.building_catalogue import Cost, PriceStep, load_buildings
from server.routes.islet import ACTION_UID_MAX_LENGTH
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_SECRET_KEY,
    FAKE_URL,
    FakeClock,
    assert_error,
)
from server.wallet import MAX_DELTA

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
TOKEN = "token-of-the-test-player"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

STATION_ROW = {
    "plot": "islet_signal_station",
    "building_type": "signal_station",
    "level": 1,
    "built_at": "2026-11-16T10:00:00+00:00",
}
WORKSHOP_ROW = {
    "plot": "plot_2",
    "building_type": "workshop",
    "level": 1,
    "built_at": "2026-11-16T10:05:00+00:00",
}

WINDMILL_ROW = {
    "plot": "plot_3",
    "building_type": "windmill",
    "level": 1,
    "built_at": "2026-11-16T10:10:00+00:00",
}

DONE_BUILDING_THE_STATION = {"status": "done", "balance": 700, "timber": 10, "level": 1}

SPOT_KEYS = {
    "plot",
    "plotName",
    "type",
    "name",
    "about",
    "state",
    "level",
    "builtAt",
    "cost",
    "missing",
    "canBuild",
    "lockedNote",
}


class FakeIsletDatabase:
    """A pretend Supabase with the parts the home islet uses.

    balance      the player's coins (has_wallet False: the player has no wallet row)
    timber       the timber in the islets row, or None when the player has no row yet
    buildings    the rows of islet_buildings, as Supabase would send them
    known_refs   refs of builds that were made already (what the repeat check finds)
    build_reply  what islet_build answers: a dict (JSON) or a ready-made httpx.Response
    requests     every request the server sent, in order
    """

    def __init__(self) -> None:
        self.balance = 1000
        self.has_wallet = True
        self.timber: int | None = None
        self.buildings: list[dict] = []
        self.known_refs: set[str] = set()
        self.build_reply: dict | httpx.Response | None = DONE_BUILDING_THE_STATION
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = f"{request.method} {request.url.path.removeprefix('/rest/v1')}"
        handlers = {
            "GET /wallets": self.read_wallet,
            "GET /islets": self.read_islet,
            "GET /islet_buildings": self.read_buildings,
            "POST /rpc/islet_build": self.build,
        }
        return handlers[route](request)

    def read_wallet(self, request: httpx.Request) -> httpx.Response:
        rows = [{"balance": self.balance}] if self.has_wallet else []
        return httpx.Response(200, json=rows)

    def read_islet(self, request: httpx.Request) -> httpx.Response:
        rows = [] if self.timber is None else [{"timber": self.timber}]
        return httpx.Response(200, json=rows)

    def read_buildings(self, request: httpx.Request) -> httpx.Response:
        """The repeat check (a query with a ref) or the list of buildings that stand."""
        ref = request.url.params.get("ref")
        if ref is not None:
            known = ref.removeprefix("eq.") in self.known_refs
            return httpx.Response(200, json=[{"plot": "plot_2"}] if known else [])
        return httpx.Response(200, json=self.buildings)

    def build(self, request: httpx.Request) -> httpx.Response:
        if isinstance(self.build_reply, httpx.Response):
            return self.build_reply
        return httpx.Response(200, json=self.build_reply)

    def calls(self, name: str) -> list[dict]:
        """The JSON arguments of every call to the database function `name`."""
        return [
            json.loads(request.content)
            for request in self.requests
            if request.url.path.endswith(f"/rpc/{name}")
        ]

    def reads(self, table: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == "GET" and r.url.path.endswith(f"/{table}")]


def make_client(
    database, settings: Settings = CONFIGURED_SETTINGS, admin=None, **services
) -> TestClient:
    """An app whose database and sign-in check are fakes. `services` go to create_app."""
    if admin is None:
        admin = SupabaseAdmin(FAKE_URL, FAKE_SECRET_KEY, httpx.MockTransport(database))
    verifier = PlayerVerifier(
        settings,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"id": PLAYER_ID})),
        clock=FakeClock(),
    )
    return TestClient(create_app(settings, verifier, admin, **services))


class World:
    """One test world: the app, a client, and the fake database behind it."""

    def __init__(self, catalogue=None) -> None:
        self.database = FakeIsletDatabase()
        self.client = make_client(self.database, islet_catalogue=catalogue or load_buildings())

    def islet(self) -> httpx.Response:
        return self.client.get("/api/islet", headers=AUTH)

    def build(self, **body) -> httpx.Response:
        request = {
            "plot": "islet_signal_station",
            "type": "signal_station",
            "actionUid": "click-0001",
        }
        request.update(body)
        return self.client.post("/api/islet/build", json=request, headers=AUTH)

    def spots(self) -> dict[str, dict]:
        """The spots of GET /api/islet by plot."""
        return {spot["plot"]: spot for spot in self.islet().json()["spots"]}


def catalogue_with_the_windmill_open():
    """The windmill opened the way the team will do it: buildable is set to true in the file.

    The old locked note stays in the file on purpose, because nobody has to remove it.
    """
    catalogue = load_buildings()
    spots = tuple(
        replace(spot, buildable=True) if spot.plot == "plot_3" else spot for spot in catalogue.spots
    )
    return replace(catalogue, spots=spots)


# --- GET /api/islet ---


def test_the_islet_needs_a_sign_in():
    world = World()

    response = world.client.get("/api/islet")

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert world.database.requests == []


def test_a_new_player_sees_the_starter_pack_the_cabin_and_their_coins():
    body = World().islet().json()

    assert body["coins"] == 1000
    assert body["timber"] == 20
    assert body["signalStationBuilt"] is False
    assert body["playMoneyNote"] == "Play money. No cash value. It cannot be bought or cashed out."


def test_a_new_player_sees_five_spots_in_the_order_of_the_file():
    spots = World().islet().json()["spots"]

    assert [(spot["plot"], spot["type"], spot["state"], spot["canBuild"]) for spot in spots] == [
        ("plot_1", "cabin", "built", False),
        ("plot_2", "workshop", "empty", True),
        ("plot_3", "windmill", "locked", False),
        ("plot_4", "greenhouse", "locked", False),
        ("islet_signal_station", "signal_station", "empty", True),
    ]


def test_the_cabin_stands_with_no_level_time_or_cost():
    cabin = World().spots()["plot_1"]

    assert cabin == {
        "plot": "plot_1",
        "plotName": "Cabin plot",
        "type": "cabin",
        "name": "Cabin",
        "about": "Your home on the islet. It stands from the start and costs nothing.",
        "state": "built",
        "level": None,
        "builtAt": None,
        "cost": None,
        "missing": [],
        "canBuild": False,
        "lockedNote": None,
    }


def test_an_empty_spot_shows_its_cost_and_can_be_built():
    station = World().spots()["islet_signal_station"]

    assert station["plotName"] == "Islet signal station"
    assert station["name"] == "Signal station"
    assert station["cost"] == {"coins": 300, "timber": 10}
    assert station["missing"] == []
    assert station["lockedNote"] is None


def test_a_locked_spot_shows_its_cost_and_the_reason():
    windmill = World().spots()["plot_3"]

    assert windmill["state"] == "locked"
    assert windmill["cost"] == {"coins": 300, "timber": 10}
    assert windmill["lockedNote"].startswith("Opens when timber starts washing up")


def test_a_locked_note_is_shown_only_while_the_spot_is_locked():
    world = World(catalogue=catalogue_with_the_windmill_open())

    empty = world.spots()["plot_3"]
    world.database.buildings = [WINDMILL_ROW]
    built = world.spots()["plot_3"]

    assert (empty["state"], empty["canBuild"], empty["lockedNote"]) == ("empty", True, None)
    assert (built["state"], built["lockedNote"]) == ("built", None)


def test_opening_the_windmill_in_the_file_is_enough_to_let_a_player_build_it():
    world = World(catalogue=catalogue_with_the_windmill_open())
    world.database.build_reply = {"status": "done", "balance": 700, "timber": 10, "level": 1}

    response = world.build(plot="plot_3", type="windmill", actionUid="click-0003")

    assert response.status_code == 200
    assert response.json()["name"] == "Windmill"
    assert world.database.calls("islet_build")[0]["p_plot"] == "plot_3"


def test_every_spot_has_exactly_the_documented_fields():
    spots = World().islet().json()["spots"]

    assert [set(spot) for spot in spots] == [SPOT_KEYS] * 5
    assert set(World().islet().json()) == {
        "coins",
        "timber",
        "signalStationBuilt",
        "playMoneyNote",
        "spots",
    }


def test_a_spot_that_costs_more_than_the_player_has_names_what_is_missing():
    world = World()
    world.database.balance = 120
    world.database.timber = 4

    spots = world.spots()

    assert spots["plot_2"]["missing"] == ["coins", "timber"]
    assert spots["plot_2"]["canBuild"] is False


def test_the_timber_in_the_islet_row_is_shown_instead_of_the_starter_pack():
    world = World()
    world.database.timber = 10

    assert world.islet().json()["timber"] == 10


def test_the_answer_is_never_cached():
    response = World().islet()

    assert response.headers["cache-control"] == "private, no-store"


def test_the_answer_says_whether_the_signal_station_stands():
    world = World()
    world.database.timber = 10
    world.database.buildings = [STATION_ROW]

    body = world.islet().json()
    station = {spot["plot"]: spot for spot in body["spots"]}["islet_signal_station"]

    assert body["signalStationBuilt"] is True
    assert (station["state"], station["level"], station["cost"]) == ("built", 1, None)
    assert station["canBuild"] is False
    assert station["builtAt"] == "2026-11-16T10:00:00Z"


def test_built_at_has_whole_seconds_in_utc():
    world = World()
    world.database.buildings = [{**WORKSHOP_ROW, "built_at": "2026-11-16T11:05:07.123456+01:00"}]

    assert world.spots()["plot_2"]["builtAt"] == "2026-11-16T10:05:07Z"


def test_a_player_without_a_wallet_is_404_player_not_set_up():
    world = World()
    world.database.has_wallet = False

    assert_error(world.islet(), 404, "player_not_set_up")


def test_an_unconfigured_database_is_503():
    client = make_client(None, admin=SupabaseAdmin("", ""), islet_catalogue=load_buildings())

    assert_error(client.get("/api/islet", headers=AUTH), 503, "database_not_configured")


def test_a_database_that_fails_a_read_is_502():
    world = World()
    world.database.read_islet = lambda request: httpx.Response(400, json={})

    assert_error(world.islet(), 502, "database_error")


def test_a_database_that_cannot_be_reached_is_503():
    world = World()

    def times_out(request):
        raise httpx.ReadTimeout("slow", request=request)

    world.database.read_wallet = times_out

    assert_error(world.islet(), 503, "database_unavailable")


def test_a_database_row_in_the_wrong_shape_is_502():
    world = World()
    world.database.timber = "lots"

    assert_error(world.islet(), 502, "database_error")


def test_the_islet_reads_only_the_rows_of_the_signed_in_player():
    world = World()

    world.islet()

    assert [request.url.path.rsplit("/", 1)[-1] for request in world.database.requests] == [
        "wallets",
        "islets",
        "islet_buildings",
    ]
    filters = [request.url.params["player_id"] for request in world.database.requests]
    assert filters == [f"eq.{PLAYER_ID}"] * 3
    assert all("limit" in request.url.params for request in world.database.requests)


def test_the_answer_holds_no_secret_and_no_other_player():
    world = World()
    world.database.buildings = [STATION_ROW]

    text = world.islet().text

    assert FAKE_SECRET_KEY not in text
    assert TOKEN not in text
    assert PLAYER_ID not in text


def test_a_broken_buildings_file_makes_the_islet_503_and_health_still_works(monkeypatch, caplog):
    def broken(path=building_catalogue.CONTENT_FILE):
        raise building_catalogue.BuildingsFileError("spots[0]: 'plot' must be text.")

    monkeypatch.setattr(building_catalogue, "load_buildings", broken)
    database = FakeIsletDatabase()

    with caplog.at_level(logging.ERROR):
        client = make_client(database)

    assert client.get("/api/health").status_code == 200
    assert_error(client.get("/api/islet", headers=AUTH), 503, "islet_unavailable")
    assert_error(client.post("/api/islet/build", json={}, headers=AUTH), 503, "islet_unavailable")
    assert database.requests == []
    assert "spots[0]" in caplog.text


# --- POST /api/islet/build: who may build, and the shape of the request ---


def test_building_needs_a_sign_in():
    world = World()

    response = world.client.post("/api/islet/build", json={})

    assert_error(response, 401, "unauthorized")
    assert world.database.requests == []


@pytest.mark.parametrize(
    "extra", [{"coins": 1}, {"price": 1}, {"playerId": "someone-else"}, {"timber": 0}]
)
def test_an_extra_field_such_as_coins_or_player_id_is_422(extra):
    world = World()

    response = world.build(**extra)

    assert_error(response, 422, "validation_error")
    assert world.database.requests == []


@pytest.mark.parametrize(
    "change",
    [
        {"plot": "Plot_2"},
        {"plot": "plot 2"},
        {"plot": "x"},
        {"plot": "p" * 41},
        {"plot": 5},
        {"plot": None},
        {"type": "Workshop"},
        {"type": "x"},
        {"type": "w" * 41},
        {"type": 7},
        {"actionUid": "short"},
        {"actionUid": "has spaces in it"},
        {"actionUid": "x" * (ACTION_UID_MAX_LENGTH + 1)},
        {"actionUid": 12345678},
        {"actionUid": None},
    ],
)
def test_bad_shapes_are_422(change):
    world = World()

    response = world.build(**change)

    assert_error(response, 422, "validation_error")
    assert world.database.requests == []


@pytest.mark.parametrize("missing", ["plot", "type", "actionUid"])
def test_a_missing_field_is_422_and_the_message_names_it(missing):
    world = World()
    body = {"plot": "plot_2", "type": "workshop", "actionUid": "click-0001"}
    del body[missing]

    response = world.client.post("/api/islet/build", json=body, headers=AUTH)

    assert_error(response, 422, "validation_error")
    assert missing in response.json()["error"]["message"]


def test_the_longest_action_uid_is_allowed():
    world = World()

    response = world.build(actionUid="a" * ACTION_UID_MAX_LENGTH)

    assert response.status_code == 200


# --- POST /api/islet/build: the rules of the server ---


def test_an_unknown_plot_is_404_and_the_database_is_not_asked_to_build():
    world = World()

    response = world.build(plot="plot_9", type="workshop")

    assert_error(response, 404, "no_such_plot")
    assert world.database.calls("islet_build") == []


def test_an_unknown_type_is_404_no_such_building():
    world = World()

    response = world.build(plot="plot_2", type="castle")

    assert_error(response, 404, "no_such_building")
    assert world.database.calls("islet_build") == []


def test_a_type_on_another_plot_is_422_wrong_plot():
    world = World()

    response = world.build(plot="plot_2", type="signal_station")

    assert_error(response, 422, "wrong_plot")
    assert world.database.calls("islet_build") == []


def test_the_cabin_plot_is_409_plot_occupied():
    world = World()

    response = world.build(plot="plot_1", type="cabin")

    assert_error(response, 409, "plot_occupied")
    assert response.json()["error"]["message"] == "Your cabin already stands here."
    assert world.database.calls("islet_build") == []


def test_the_windmill_is_409_not_buildable_yet():
    world = World()

    response = world.build(plot="plot_3", type="windmill")

    assert_error(response, 409, "not_buildable_yet")
    assert "timber starts washing up" in response.json()["error"]["message"]
    assert world.database.calls("islet_build") == []


# --- POST /api/islet/build: building ---


def test_building_the_station_charges_300_coins_and_10_timber_once():
    world = World()

    response = world.build()

    assert response.status_code == 200
    assert response.json() == {
        "plot": "islet_signal_station",
        "type": "signal_station",
        "name": "Signal station",
        "level": 1,
        "coinsPaid": 300,
        "timberPaid": 10,
        "coins": 700,
        "timber": 10,
    }
    assert len(world.database.calls("islet_build")) == 1


def test_the_answer_of_a_build_is_never_cached():
    assert World().build().headers["cache-control"] == "private, no-store"


def test_the_server_sends_the_verified_player_and_the_catalogue_prices():
    world = World()

    world.build(plot="plot_2", type="workshop", actionUid="click-0001")

    assert world.database.calls("islet_build") == [
        {
            "p_player_id": PLAYER_ID,
            "p_plot": "plot_2",
            "p_building_type": "workshop",
            "p_coins": 300,
            "p_timber": 10,
            "p_starter_timber": 20,
            "p_ref": "islet:click-0001",
        }
    ]


def test_a_different_catalogue_changes_the_numbers_the_database_is_given():
    cheaper = replace(
        load_buildings(),
        starter_timber=5,
        price_list=(PriceStep(level=1, cost=Cost(coins=7, timber=3)),),
    )
    world = World(catalogue=cheaper)

    response = world.build()

    call = world.database.calls("islet_build")[0]
    assert (call["p_coins"], call["p_timber"], call["p_starter_timber"]) == (7, 3, 5)
    assert (response.json()["coinsPaid"], response.json()["timberPaid"]) == (7, 3)


def test_spending_exactly_the_whole_balance_works():
    world = World()
    world.database.balance = 300
    world.database.build_reply = {"status": "done", "balance": 0, "timber": 10, "level": 1}

    response = world.build()

    assert response.status_code == 200
    assert response.json()["coins"] == 0


def test_the_workshop_is_built_like_the_station():
    world = World()
    world.database.build_reply = {"status": "done", "balance": 400, "timber": 0, "level": 1}

    body = world.build(plot="plot_2", type="workshop", actionUid="click-0002").json()

    assert (body["name"], body["coins"], body["timber"]) == ("Workshop", 400, 0)


# --- POST /api/islet/build: what the database refuses ---


def test_an_occupied_plot_is_409_and_names_what_stands_there():
    world = World()
    world.database.build_reply = {
        "status": "refused",
        "reason": "plot_occupied",
        "standing": "signal_station",
    }

    response = world.build()

    assert_error(response, 409, "plot_occupied")
    assert response.json()["error"]["message"] == (
        "A signal station already stands on Islet signal station."
    )


def test_an_occupied_plot_with_a_building_we_do_not_know_still_says_no():
    world = World()
    world.database.build_reply = {
        "status": "refused",
        "reason": "plot_occupied",
        "standing": "lighthouse",
    }

    response = world.build()

    assert_error(response, 409, "plot_occupied")
    assert "Islet signal station" in response.json()["error"]["message"]


def test_not_enough_timber_is_409_with_the_timber_held():
    world = World()
    world.database.build_reply = {
        "status": "refused",
        "reason": "not_enough_timber",
        "timberHeld": 0,
    }

    response = world.build()

    assert_error(response, 409, "not_enough_timber")
    assert response.json()["error"]["message"] == "The signal station needs 10 timber. You have 0."


def test_not_enough_coins_is_409_insufficient_funds_with_the_price():
    world = World()
    world.database.build_reply = httpx.Response(
        400, json={"code": "P0001", "message": "insufficient_funds", "details": None}
    )

    response = world.build()

    assert_error(response, 409, "insufficient_funds")
    assert response.json()["error"]["message"] == (
        "The signal station costs 300 coins. You do not have enough coins."
    )


def test_a_player_without_a_wallet_is_404_player_not_set_up_when_building():
    world = World()
    world.database.build_reply = {"status": "refused", "reason": "player_not_set_up"}

    assert_error(world.build(), 404, "player_not_set_up")


def test_a_refusal_we_do_not_know_is_a_502_and_not_a_success():
    world = World()
    world.database.build_reply = {"status": "refused", "reason": "something_new"}

    assert_error(world.build(), 502, "database_error")


@pytest.mark.parametrize("reply", [None, [], "done", {"status": "maybe"}, {"balance": 5}])
def test_an_answer_the_server_cannot_read_is_a_502(reply):
    world = World()
    world.database.build_reply = reply

    assert_error(world.build(), 502, "database_error")


def test_a_database_that_refuses_the_call_is_a_502():
    world = World()
    world.database.build_reply = httpx.Response(
        400, json={"code": "P0001", "message": "bad_build", "details": None}
    )

    assert_error(world.build(), 502, "database_error")


def test_an_unconfigured_database_is_503_for_building_too():
    client = make_client(None, admin=SupabaseAdmin("", ""), islet_catalogue=load_buildings())
    body = {"plot": "plot_2", "type": "workshop", "actionUid": "click-0001"}

    response = client.post("/api/islet/build", json=body, headers=AUTH)

    assert_error(response, 503, "database_not_configured")


# --- POST /api/islet/build: the same click again ---


def test_a_repeated_action_uid_is_409_already_applied_and_nothing_else_is_asked():
    world = World()
    world.database.known_refs = {"islet:click-0001"}

    response = world.build(actionUid="click-0001")

    assert_error(response, 409, "already_applied")
    asked = [request.url.path.rsplit("/", 1)[-1] for request in world.database.requests]
    assert asked == ["islet_buildings"]  # only the look for the ref, nothing else


def test_the_repeat_check_looks_for_this_player_and_this_ref():
    world = World()

    world.build(actionUid="click-0001")

    lookups = [r for r in world.database.reads("islet_buildings") if "ref" in r.url.params]
    assert len(lookups) == 1
    assert lookups[0].url.params["player_id"] == f"eq.{PLAYER_ID}"
    assert lookups[0].url.params["ref"] == "eq.islet:click-0001"


def test_a_repeat_is_already_applied_even_when_the_plot_is_occupied_now():
    world = World()
    world.database.known_refs = {"islet:click-0001"}
    world.database.buildings = [STATION_ROW]

    assert_error(world.build(actionUid="click-0001"), 409, "already_applied")


def test_a_repeat_is_already_applied_even_when_the_rules_would_refuse_it_now():
    world = World()
    world.database.known_refs = {"islet:click-0001"}

    response = world.build(actionUid="click-0001", plot="plot_1", type="cabin")

    assert_error(response, 409, "already_applied")


def test_a_repeat_that_raced_past_the_first_check_is_409_already_applied():
    world = World()
    world.database.build_reply = httpx.Response(
        409, json={"code": "23505", "message": "already_applied", "details": None}
    )

    response = world.build()

    assert_error(response, 409, "already_applied")
    assert len(world.database.calls("islet_build")) == 1


def test_a_new_click_is_not_a_repeat():
    world = World()
    world.database.known_refs = {"islet:click-0001"}

    assert world.build(actionUid="click-0002").status_code == 200


def test_the_same_click_twice_uses_the_same_ref():
    world = World()

    world.build(actionUid="click-same-1")
    world.build(actionUid="click-same-1")

    refs = [call["p_ref"] for call in world.database.calls("islet_build")]
    assert refs == ["islet:click-same-1", "islet:click-same-1"]


def test_two_clicks_use_two_refs():
    world = World()

    world.build(actionUid="click-aaaa-1")
    world.build(actionUid="click-bbbb-2")

    refs = {call["p_ref"] for call in world.database.calls("islet_build")}
    assert refs == {"islet:click-aaaa-1", "islet:click-bbbb-2"}


# --- POST /api/islet/build: money safety ---


def test_the_wallet_rules_check_the_charge_before_the_database_is_asked():
    too_dear = replace(
        load_buildings(),
        price_list=(PriceStep(level=1, cost=Cost(coins=MAX_DELTA + 1, timber=10)),),
    )
    world = World(catalogue=too_dear)

    response = world.build()

    assert_error(response, 422, "invalid_transaction")
    assert world.database.calls("islet_build") == []


def test_the_charge_is_checked_as_a_building_purchase_with_the_ref_of_the_click(monkeypatch):
    checked = []
    real_check = islet_service.validate_transaction

    def spy(delta, reason, ref):
        checked.append((delta, reason, ref))
        real_check(delta, reason, ref)

    monkeypatch.setattr(islet_service, "validate_transaction", spy)

    World().build(actionUid="click-0001")

    assert checked == [(-300, "building_purchase", "islet:click-0001")]


def test_a_database_that_times_out_is_503_and_the_outcome_is_unknown():
    world = World()

    def times_out(request):
        raise httpx.ReadTimeout("slow", request=request)

    world.database.build = times_out

    assert_error(world.build(), 503, "database_unavailable")


def test_the_ref_of_the_longest_action_uid_fits_into_a_wallet_ref():
    world = World()

    world.build(actionUid="a" * ACTION_UID_MAX_LENGTH)

    ref = world.database.calls("islet_build")[0]["p_ref"]
    assert ref == "islet:" + "a" * ACTION_UID_MAX_LENGTH
    assert len(ref) <= 70


# --- the wiring ---


def test_both_islet_urls_are_listed_under_api_in_the_documented_routes():
    paths = World().client.get("/api/openapi.json").json()["paths"]

    assert "/api/islet" in paths
    assert "/api/islet/build" in paths
    assert list(paths["/api/islet"]) == ["get"]
    assert list(paths["/api/islet/build"]) == ["post"]
