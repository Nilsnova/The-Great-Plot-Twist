"""Play the complete case over real HTTP services and disposable PostgreSQL RPCs.

Opt in with CASE_PG_SCRATCH=1 and uv --with pgserver --with 'psycopg[binary]'.
Run with --tb=no so an unexpected story assertion never prints protected case prose.
Only scratch case timestamps are controlled; every earned game record is written by its API.
"""

import asyncio
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.game.building_catalogue import SIGNAL_STATION, SIGNAL_STATION_PLOT
from server.game.case_limits import ActionLimiter
from server.game.case_store import CaseStore
from server.game.finale_geometry import bearing_to, normalize_bearing, schooner_position
from server.game.npc_orders import decide_fetch
from server.tests.case_playthrough import _route_choices, _start_second
from server.tests.helpers import FakeClock
from server.tests.npc_playthrough import build_station, man_lights, pin_all_cards
from server.tests.story_states import ROUTES
from tools.local_players import PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL proof"
)


class ApiPlaythrough:
    """Translate a production-rule plan into requests; never mirror its state into SQL."""

    def __init__(self, app, client, count):
        self.app, self.client, self.count = app, client, count
        self.database = app.state.local_database
        self.data = app.state.case.data
        self.headers = {}
        self.crew_id = None
        self.nonce = 0
        self.first_order = None
        self.first_order_line = None
        # Rate-limit time is an injected port, independent of the SQL-authoritative case clock.
        self.rate_clock = FakeClock()
        app.state.case.limiter = ActionLimiter(clock=self.rate_clock)

    def request(self, method, url, *, player=0, body=None):
        self.rate_clock.advance(11)
        response = self.client.request(method, url, headers=self.headers.get(player, {}), json=body)
        assert response.status_code == 200, f"Unexpected HTTP status at {url}."
        if url != "/api/local/sign-in":
            assert "private" in response.headers.get("cache-control", "")
        return response.json()

    def action(self, url, body=None, *, player=0, repeat=False):
        self.nonce += 1
        payload = {**(body or {}), "actionUid": f"caseproof{self.nonce:05}"}
        answer = self.request("POST", url, player=player, body=payload)
        assert answer.get("accepted") is True, f"Production refusal: {answer.get('reason')}."
        if repeat:
            counts = self.counts()
            replay = self.request("POST", url, player=player, body=payload)
            assert replay["accepted"] and replay["repeat"]
            assert replay["message"] == answer["message"]
            assert self.counts() == counts
        return answer, payload

    def counts(self):
        with self.database.connect() as database:
            return tuple(
                database.execute(f"select count(*) from public.{table}").fetchone()[0]
                for table in ("case_actions", "npc_orders", "wallet_transactions")
            )

    def snapshot(self, player=0):
        return asyncio.run(
            CaseStore(self.app.state.admin).snapshot(PLAYERS[player].id, self.crew_id)
        )

    def view(self, player=0):
        return self.request("GET", "/api/case", player=player)["case"]

    def advance_to(self, second):
        # The URI comes only from ScratchDatabase, which rejects non-Unix-socket connections.
        # Preserve monotonic crew time and move no other crew or shared-world row.
        with self.database.connect() as database:
            elapsed = database.execute(
                "select greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)))) "
                "from public.case_state where crew_id = %s",
                (self.crew_id,),
            ).fetchone()[0]
            target = max(second, int(elapsed))
            database.execute(
                "update public.case_state set started_at = clock_timestamp() "
                "- make_interval(secs => %s) where crew_id = %s",
                (target + 0.1, self.crew_id),
            )

    def start(self, kits):
        for index, player in enumerate(PLAYERS):
            login = self.request("POST", "/api/local/sign-in", body={"player": player.name})
            self.headers[index] = {"Authorization": f"Bearer {login['accessToken']}"}
            kit = kits[index] if index < len(kits) else kits[0]
            route = next(route for route in ROUTES if route.kit == kit and not route.read_log)
            grant = self.request(
                "POST", "/api/intro/complete", player=index, body={"actions": route.moves}
            )
            assert grant["kit"]["id"] == kit and grant["coinsPaid"] > 0
            again = self.request(
                "POST", "/api/intro/complete", player=index, body={"actions": route.moves}
            )
            assert again["alreadyGranted"] and again["coinsPaid"] == 0
        crew = self.request("POST", "/api/crews")["crew"]
        self.crew_id = crew["id"]
        for player in range(1, self.count):
            joined = self.request(
                "POST", "/api/crews/join", player=player, body={"code": crew["code"]}
            )["crew"]
            assert joined["id"] == self.crew_id
        active = self.request("POST", "/api/crews/me/start")["crew"]
        assert active["status"] == "active"
        assert sum(seat["holder"] == "partner" for seat in active["seats"]) == 4 - self.count
        assert self.view()["reveal"] == {"available": False}
        # Build before any card reward: the real starting grant and starter timber fund it.
        before = self.request("GET", "/api/islet")
        built = self.request(
            "POST",
            "/api/islet/build",
            body={
                "plot": SIGNAL_STATION_PLOT,
                "type": SIGNAL_STATION,
                "actionUid": "proofstation1",
            },
        )
        assert built["coins"] == before["coins"] - built["coinsPaid"]
        assert built["timber"] == before["timber"] - built["timberPaid"]
        assert self.request("GET", "/api/islet")["signalStationBuilt"]

    def acquire(self, seat_no, card_id):
        state = self.snapshot()
        seat = next(seat for seat in state.seats if seat.seat_no == seat_no)
        if any(pin.seat_no == seat_no and pin.card_id == card_id for pin in state.pins):
            return
        if seat.npc_id is not None:
            return self.fetch(seat_no, card_id)
        player = next(
            index for index, fixture in enumerate(PLAYERS) if fixture.id == seat.player_id
        )
        found = next(
            (find for find in state.finds_for_seat(seat_no) if find.card_id == card_id), None
        )
        if found is None:
            now = self.view(player)["now"]
            route = min(
                _route_choices(self.data, seat, card_id),
                key=lambda route: (
                    _start_second(self.data, route, now) + route.timer_minutes * 60,
                    route.id,
                ),
            )
            self.advance_to(_start_second(self.data, route, now))
            self.action("/api/case/search", {"routeId": route.id}, player=player, repeat=True)
            found = next(
                find for find in self.snapshot().finds_for_seat(seat_no) if find.card_id == card_id
            )
        self.advance_to(found.ready_second)
        self.action("/api/board/pin", {"cardId": card_id}, player=player, repeat=True)

    def fetch(self, seat_no, card_id):
        for _ in range(4):
            state, now = self.snapshot(), self.view()["now"]
            seat = next(seat for seat in state.seats if seat.seat_no == seat_no)
            decision = decide_fetch(self.data, state, seat, card_id, now, orders=state.npc_orders)
            if decision.accepted:
                break
            assert decision.reason in ("busy", "locked_window") and decision.minutes > 0
            self.advance_to(now + decision.minutes * 60)
        else:
            pytest.fail("The production partner rule could not execute its bounded plan.")
        answer, payload = self.action(
            "/api/crews/me/orders",
            {
                "seat": seat_no,
                "order": "fetch",
                "target": card_id,
            },
            repeat=True,
        )
        if self.first_order is None:
            self.first_order, self.first_order_line = payload, answer["line"]
        order = answer["order"]
        assert order["price"] == 0
        self.advance_to(order["readyAt"])
        assert any(
            pin.seat_no == seat_no and pin.card_id == card_id for pin in self.snapshot().pins
        )
        partner = next(row for row in self.view()["partners"] if row["seat"] == seat_no)
        assert any(card["id"] == card_id and card["pinned"] for card in partner["satchel"])

    def cards(self, plan):
        for deduction_id, left, right in plan.pairs:
            deduction = self.data.deduction(deduction_id)
            self.acquire(left, deduction.cards[0])
            self.acquire(right, deduction.cards[1])
            self.action("/api/board/pair", {"cards": list(deduction.cards)}, repeat=True)
        state = self.snapshot()
        assert {find.card_id for find in state.finds} == {card.id for card in self.data.cards}
        assert {formed.deduction_id for formed in state.formed} == {
            item.id for item in self.data.deductions
        }

    def finale(self, plan):
        self.action("/api/finale/nightfall", repeat=True)
        duties = man_lights(self.data, build_station(self.data, plan)).state.posts
        for post in duties:
            if post.npc_id is not None:
                self.action(
                    "/api/crews/me/orders",
                    {
                        "seat": post.seat_no,
                        "order": "man_light",
                        "target": post.light_id,
                    },
                    repeat=True,
                )
            else:
                player = next(
                    index for index, fixture in enumerate(PLAYERS) if fixture.id == post.player_id
                )
                self.action(
                    "/api/finale/post", {"light": post.light_id}, player=player, repeat=True
                )
        state = self.snapshot()
        assert len(state.posts) == self.data.night.lights_needed
        self.advance_to(max(post.on_post_second for post in state.posts))
        target = schooner_position(self.crew_id, self.data.night.chart)
        for index, post in enumerate(state.posts):
            player = (
                0
                if post.npc_id
                else next(
                    index for index, fixture in enumerate(PLAYERS) if fixture.id == post.player_id
                )
            )
            bearing = normalize_bearing(bearing_to(self.data.light(post.light_id).chart_xy, target))
            answer, _ = self.action(
                "/api/finale/signal",
                {
                    "light": post.light_id,
                    "bearing": bearing,
                },
                player=player,
                repeat=True,
            )
            assert (answer["case"]["finale"]["parted"] is not None) is (
                index == self.data.night.lights_needed - 1
            )
        assert self.view()["finale"]["phase"] == "success"
        assert len(self.view()["finale"]["parted"]["lights"]) == self.data.night.lights_needed

    def solve_and_isolate(self):
        solved, payload = self.action(
            "/api/case/accuse",
            {
                "suspect": self.data.accusation.culprit,
            },
            repeat=True,
        )
        assert solved["solved"] and solved["world"] == "locked" and solved["coinsPaid"] > 0
        for player in range(self.count):
            reveal = self.view(player)["reveal"]
            assert reveal["available"] and reveal["world"] == "locked" and reveal["lines"]
        if self.first_order is not None:
            counts = self.counts()
            replay = self.request("POST", "/api/crews/me/orders", body=self.first_order)
            assert (
                replay["accepted"] and replay["repeat"] and replay["line"] == self.first_order_line
            )
            assert self.counts() == counts
        with self.database.connect() as database:
            assert (
                database.execute(
                    "select count(*) from public.case_solvers where crew_id = %s",
                    (self.crew_id,),
                ).fetchone()[0]
                == self.count
            )
            assert database.execute(
                "select count(*) from public.wallet_transactions where reason = 'kit_grant'"
            ).fetchone()[0] == len(PLAYERS)
            solve_ref = self.data.rewards.coin("solve_share").ref
            assert (
                database.execute(
                    "select count(*) from public.wallet_transactions where ref = %s",
                    (solve_ref,),
                ).fetchone()[0]
                == database.execute(
                    "select count(*) from public.case_solvers where crew_id = %s and contributor",
                    (self.crew_id,),
                ).fetchone()[0]
            )
            assert (
                database.execute(
                    "select sum(share_paid) from public.case_solvers where crew_id = %s",
                    (self.crew_id,),
                ).fetchone()[0]
                == database.execute(
                    "select sum(delta) from public.wallet_transactions where ref = %s",
                    (solve_ref,),
                ).fetchone()[0]
            )
            assert database.execute(
                "select stage, solves from public.world_state where id = 1"
            ).fetchone() == ("dark", 0)
            assert database.execute("select count(*) from public.world_solves").fetchone() == (0,)
            assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (0,)
        # In the four-player run this player has solved before: their new unsolved crew still
        # cannot read the earlier crew's reveal, even with its id or another player's action uid.
        outsider = self.request("POST", "/api/crews", player=1)["crew"]
        self.request("POST", "/api/crews/me/start", player=1)
        isolated = self.request("GET", f"/api/case?crew={self.crew_id}", player=1)["case"]
        assert isolated["crew"]["id"] == outsider["id"]
        assert isolated["reveal"] == {"available": False}
        denied = self.request("POST", "/api/case/accuse", player=1, body=payload)
        assert not denied["accepted"] and denied["case"]["reveal"] == {"available": False}


@pytest.mark.parametrize(
    "kits",
    [("informant",), ("true_keeper", "witness", "informant", "stranger")],
    ids=("solo-with-partners", "four-players"),
)
def test_complete_case_from_intro_through_reveal_over_real_http_and_sql(kits):
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    database = app.state.local_database
    with TestClient(app) as client:
        directory = Path(database.directory.name)
        play = ApiPlaythrough(app, client, len(kits))
        play.start(kits)
        plan = pin_all_cards(play.data, kits)
        play.cards(plan)
        play.finale(plan)
        play.solve_and_isolate()
    assert database.uri is None and not directory.exists()
