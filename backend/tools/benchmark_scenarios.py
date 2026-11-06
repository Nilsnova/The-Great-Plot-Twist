"""Current route scenarios using repository test ports, never ambient credentials.

These measure Python/TestClient orchestration, not PostgreSQL or provider performance.
Every mutable fake is restored before each call; caches retain their warm readings.
"""

from copy import deepcopy
from dataclasses import replace


def restore_fake(fake, *, exclude=("clock", "requests"), after=lambda: None):
    """Keep transport list identity while restoring a fixture outside the timed request."""
    state = deepcopy({key: value for key, value in vars(fake).items() if key not in exclude})

    def reset():
        for key in list(vars(fake)):
            if key not in exclude:
                delattr(fake, key)
        for key, value in deepcopy(state).items():
            setattr(fake, key, value)
        if hasattr(fake, "requests"):
            fake.requests.clear()
        after()

    return reset


def core_scenarios(S):
    from fastapi.testclient import TestClient

    from server.app import create_app
    from server.tests import account_helpers as accounts
    from server.tests import test_auth_exchange as exchange
    from server.tests import test_intro_route as intro
    from server.tests import test_keepalive as keepalive
    from server.tests import test_me as me
    from server.tests import test_weather_route as weather
    from server.tests.helpers import CONFIGURED_SETTINGS
    from server.tests.story_states import WARNED_RESCUE
    from server.tests.weather_helpers import answer_with_sample

    client = TestClient(create_app(CONFIGURED_SETTINGS))
    for path in ("health", "config"):
        yield S(
            "GET", "/api/" + path, client, notes="Public local configuration; no external port."
        )
    yield S(
        "GET",
        "/api/content/{name}",
        client,
        path="/api/content/intro-story",
        notes="Warm immutable intro content.",
    )
    client, seen, *_ = weather.make_client(answer_with_sample("rain"))
    yield S("GET", "/api/weather", client, requests=seen, notes="Warm mocked weather reading.")
    client, seen = keepalive.make_client()
    yield S("GET", "/api/keepalive", client, headers=keepalive.RIGHT_HEADER, requests=seen)
    client, seen = exchange.make_client()
    yield S(
        "POST",
        "/api/auth/exchange",
        client,
        body=exchange.BODY,
        requests=seen,
        notes="Synthetic code exchange; no external authentication.",
    )
    client, seen = me.make_client()
    yield S("GET", "/api/me", client, headers=me.RIGHT_HEADER, requests=seen)
    database = accounts.AccountsDatabase()
    database.add_player(accounts.PLAYER_ID, display_name="Brave Puffin 17")
    client, seen = accounts.make_client(database)
    reset = restore_fake(database)
    for method, path, body in (
        ("POST", "/api/me/name", None),
        ("POST", "/api/me/name/reroll", {"actionUid": "benchmark-click"}),
        ("GET", "/api/save", None),
        ("PUT", "/api/save", {"version": 1, "data": {"intro": {"scene": "shore"}}}),
        ("DELETE", "/api/me", {"confirm": True}),
    ):
        yield S(
            method,
            path,
            client,
            headers=accounts.RIGHT_HEADER,
            body=body,
            reset=reset,
            requests=seen,
            notes="Account fake; name route reads an existing name.",
        )
    database = intro.EntryDatabase()
    client, seen = accounts.make_client(database)
    yield S(
        "POST",
        "/api/intro/complete",
        client,
        headers=accounts.RIGHT_HEADER,
        body={"actions": WARNED_RESCUE},
        reset=restore_fake(database),
        requests=seen,
        notes="Fresh entry grant on a reset fake ledger.",
    )


def exchange_and_crew_scenarios(S):
    from server.tests import crew_helpers as crews
    from server.tests import market_world as market
    from server.tests import test_crew_routes as crew_routes
    from server.tests import test_islet_routes as islet

    for path in ("/api/market", "/api/market/portfolio", "/api/market/open", "/api/market/close"):
        world = market.World()
        if path.endswith(("portfolio", "close")):
            world.database.positions = [market.position_row()]
        body = None
        if path.endswith("open"):
            body = {
                "companyId": "harbor-trust",
                "side": "rising",
                "stake": 100,
                "actionUid": "benchmark-click",
            }
        if path.endswith("close"):
            body = {"positionId": market.POSITION_ID, "actionUid": "benchmark-click"}
        reset = restore_fake(world.database, after=world.service.limiter.recent_trades.clear)
        yield S(
            "POST" if body else "GET",
            path,
            world.client,
            headers=market.AUTH,
            body=body,
            reset=reset,
            requests=world.database.requests,
            notes="Exchange v2; warm mocked prices, reset scripted database.",
        )
    for method, path, body in (
        ("POST", "/api/crews", {}),
        ("POST", "/api/crews/join", {"code": crews.CODE}),
        ("POST", "/api/crews/me/start", {}),
        ("GET", "/api/crews/me", None),
    ):
        database = crews.FakeCrewDatabase()
        database.seat_rows = [crews.seat_of_player()]
        database.set_crew(crews.CREW_ID, crews.crew_row([crew_routes.ME]))
        database.script("crew_create", {"status": "created", "crewId": crews.CREW_ID})
        database.script("crew_find_by_code", crews.found_reply([]))
        database.script(
            "crew_take_seat", {"status": "joined", "seatNo": 1, "replacedPartner": None}
        )
        database.script("crew_start", {"status": "started"})
        if path.endswith("start"):
            database.set_crew(
                crews.CREW_ID, crews.crew_row([crew_routes.ME]), crew_routes.sailed_crew()
            )
        if path.endswith("join"):
            database.seat_rows = []
        yield S(
            method,
            path,
            crews.make_crew_client(database),
            headers=crews.AUTH,
            body=body,
            reset=restore_fake(database),
            requests=database.requests,
            notes="Scripted crew RPC and read replies; no SQL or realtime network.",
        )
    for method, path, body in (
        ("GET", "/api/islet", None),
        (
            "POST",
            "/api/islet/build",
            {
                "plot": "islet_signal_station",
                "type": "signal_station",
                "actionUid": "benchmark-build",
            },
        ),
    ):
        database = islet.FakeIsletDatabase()
        yield S(
            method,
            path,
            islet.make_client(database),
            headers=islet.AUTH,
            body=body,
            reset=restore_fake(database),
            requests=database.requests,
        )


def prediction_and_duel_scenarios(S):
    from server.tests import duels_helpers as duels
    from server.tests import prediction_helpers as predictions

    for path in (
        "/api/predictions",
        "/api/predictions/mine",
        "/api/predictions/stake",
        "/api/predictions/settle",
    ):
        world = predictions.DeskWorld()
        body, headers = None, predictions.AUTH_1
        if path.endswith("stake"):
            body = {
                "questionId": "groundhog-2027",
                "side": "yes",
                "amount": 20,
                "stakeId": "benchmark-stake",
            }
        if path.endswith("settle"):
            assert world.stake().status_code == 200
            world.close_question("groundhog-2027")
            body, headers = (
                {"questionId": "groundhog-2027", "outcome": "yes"},
                predictions.AUTH_HOST,
            )
        reset = restore_fake(world.database, after=world.desk.limiter.recent_stakes.clear)
        yield S(
            "POST" if body else "GET",
            path,
            world.client,
            headers=headers,
            body=body,
            reset=reset,
            requests=world.database.requests,
            notes="Prediction production rules; warm mock source; reset in-memory ledger.",
        )
    for operation in ("list", "challenge", "detail", "move", "cancel"):
        world = duels.World()
        duel_id = world.start_duel() if operation in ("detail", "move", "cancel") else None
        method, template, path, body = "GET", "/api/duels", None, None
        headers = world.headers("alice")
        if operation == "challenge":
            method, body = "POST", duels.NEW_CHALLENGE
        if duel_id:
            suffix = "" if operation == "detail" else "/" + operation
            template, path = "/api/duels/{duel_id}" + suffix, "/api/duels/" + duel_id + suffix
            method = "GET" if operation == "detail" else "POST"
        if operation == "move":
            headers, body = world.headers("bob"), duels.NEW_ANSWER
        yield S(
            method,
            template,
            world.client,
            path=path,
            headers=headers,
            body=body,
            reset=restore_fake(world.database),
            requests=world.database.requests,
            notes="Real duel orchestration over reset database transport fake.",
        )


def case_scenarios(S):
    from server.game.case_snapshot import Formed
    from server.tests import case_api_helpers as cases
    from server.tests import test_board_routes_api as board
    from server.tests import test_npc_routes_api as npc

    for path in ("/api/case", "/api/case/search", "/api/case/accuse", "/api/host/case/clock"):
        client, store, service, _ = cases.client_and_store()
        body = None
        if path.endswith("search"):
            body = {"routeId": "C1.notice_board", "actionUid": "benchmark-search"}
        if path.endswith("accuse"):
            store.current = replace(
                store.current,
                schooner_found_second=0,
                formed=tuple(
                    Formed(value, 0) for value in service.data.accusation.needs_deductions
                ),
            )
            body = {"suspect": service.data.accusation.culprit, "actionUid": "benchmark-accuse"}
        if path.endswith("clock"):
            body = {"seconds": 60, "actionUid": "benchmark-clock"}
        yield S(
            "POST" if body else "GET",
            path,
            client,
            headers=cases.HEADER,
            body=body,
            reset=restore_fake(store, after=service.limiter.recent.clear),
            success_key="accepted" if body else None,
            notes="Actual case rules and projection, function-level fake store; no SQL timing.",
        )
    for intent in ("pin", "pair", "nightfall", "post", "signal"):
        client, store, service, _, _ = board.phase2_client()
        body = {"actionUid": "benchmark-intent"}
        if intent == "pin":
            board.held_card(store)
            body["cardId"] = "C1"
        if intent == "pair":
            body["cards"] = board.pinned_pair(store, service, True)
        if intent == "nightfall":
            store.current = replace(
                store.current,
                formed=tuple(Formed(value, 0) for value in service.data.night.opens_after),
            )
        if intent == "post":
            store.current = replace(store.current, night_no=1, night_started_second=0)
            body["light"] = next(
                light.id
                for light in service.data.active_lights
                if light.id != "islet_signal_station"
            )
        if intent == "signal":
            light, bearing = board.signal_ready(store, service)
            body.update(light=light.id, bearing=bearing)
        prefix = "board" if intent in ("pin", "pair") else "finale"
        # The helper attaches closures bound to this store: preserve those callable identities.
        reset = restore_fake(
            store,
            exclude=("clock", "pin", "pair", "nightfall", "take_post", "signal"),
            after=service.limiter.recent.clear,
        )
        yield S(
            "POST",
            f"/api/{prefix}/{intent}",
            client,
            headers=cases.HEADER,
            body=body,
            reset=reset,
            success_key="accepted",
            notes="Production rules/view; scripted function-level intent reply; no SQL timing.",
        )
    client, store, service, _ = npc.npc_client(real_view=True)
    yield S(
        "POST",
        "/api/crews/me/orders",
        client,
        headers=cases.HEADER,
        body=npc.ORDER,
        reset=restore_fake(
            store,
            exclude=("clock", "npc_fetch", "npc_man_light", "npc_order_for_action"),
            after=service.limiter.recent.clear,
        ),
        success_key="accepted",
        notes="Full production NPC view and rules; function-level order store fake.",
    )


def festival_sports_host_scenarios(S):
    from server.tests import bulletin_helpers as bulletin
    from server.tests import test_festival_routes as festival
    from server.tests import test_host_console as host
    from server.tests import test_sports_api as sports
    from server.tests import test_world_routes as world

    bulletin_world = bulletin.World()
    yield S(
        "GET",
        "/api/bulletin",
        bulletin_world.client,
        requests=bulletin_world.seen,
        notes="Warm mocked weather and fixed world stage.",
    )
    yield S(
        "GET",
        "/api/world",
        world.client_for(),
        notes="World/wall projection over uninstrumented mock admin transport.",
    )
    for path in (
        "/api/festival",
        "/api/festival/claim",
        "/api/festival/ring/join",
        "/api/festival/ring/leave",
    ):
        client, database, _, _ = festival.setup()
        body = None if path == "/api/festival" else {"actionUid": "benchmark-festival"}
        if path.endswith("claim"):
            body["lampId"] = festival.LAMP_IDS[0]
        if path.endswith("join"):
            body["signals"] = ["flash", "shade", "shade"]
        if path.endswith("leave"):
            database.mine[festival.PLAYER] = {
                "id": festival.QUEUE,
                "player_id": festival.PLAYER,
                "state": "queued",
                "duel_id": None,
            }
        yield S(
            "POST" if body else "GET",
            path,
            client,
            headers=festival.AUTH,
            body=body,
            reset=restore_fake(database),
            success_key="accepted" if body else None,
            notes="Active festival; direct database fake; ring join exercises unpaired queue.",
        )
    for path in ("/api/sports", "/api/sports/mine", "/api/sports/stake", "/api/sports/settle"):
        database = sports.ScriptedDatabase()
        body = None
        if path.endswith("stake"):
            body = {"fixtureId": "fd-101", "pick": "home", "amount": 30, "stakeId": "sportsuid01"}
        if path.endswith("settle"):
            database.fixtures = [sports.fixture_row()]
            database.stakes = [
                sports.stake_row(),
                sports.stake_row(2, pick="away", amount=20, player="other"),
                sports.stake_row(3, pick="draw", amount=10, player="third"),
            ]
            database.reply = {
                "status": "done",
                "settlement": "winners",
                "paidPlayers": 1,
                "paidCoins": 59,
                "cutCoins": 1,
                "settledAt": "2026-11-07T18:00:00Z",
            }
            body = {"fixtureId": "fd-101"}
        client, _, seen = sports.make_client(final=path.endswith("settle"), database=database)
        source = client.app.state.sports.source
        yield S(
            "POST" if body else "GET",
            path,
            client,
            headers=sports.HEADER,
            body=body,
            reset=restore_fake(database, after=source.calls.clear),
            requests=seen,
            success_key="settled" if path.endswith("settle") else "accepted" if body else None,
            notes=(
                "Provider transport metrics only; direct database fake. Warm board/empty mine; "
                "fresh final result for settle; fake source request budget reset."
            ),
        )
    client, seen = host.client_for()
    for method, template, path, body in (
        ("GET", "/api/host/overview", None, None),
        ("GET", "/api/host/crews", None, None),
        (
            "POST",
            "/api/host/crews/{crew_id}/close",
            f"/api/host/crews/{host.CREW_ID}/close",
            {"actionUid": "99999999-1111-4111-8111-111111111111"},
        ),
    ):
        yield S(
            method,
            template,
            client,
            path=path,
            headers=host.HOST_HEADER,
            body=body,
            requests=seen,
            notes="Scripted host RPC reply; recorded weather.",
        )


def scenarios(scenario_class):
    for group in (
        core_scenarios,
        exchange_and_crew_scenarios,
        prediction_and_duel_scenarios,
        case_scenarios,
        festival_sports_host_scenarios,
    ):
        yield from group(scenario_class)
