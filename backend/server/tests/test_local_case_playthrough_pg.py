"""Actual solo HTTP case proof over the complete disposable PostgreSQL migration chain.

All game writes use normal API routes. Planning reads the real CaseStore snapshot and calls
production decisions; it never applies a parallel game model or prints protected story values.
"""

import asyncio
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.clock import utc_now
from server.game.board_rules import decide_pair, decide_pin
from server.game.building import level_one_cost
from server.game.building_catalogue import SIGNAL_STATION, SIGNAL_STATION_PLOT
from server.game.case_accusation import decide_accusation
from server.game.case_rewards import solve_shares
from server.game.case_routes import decide_route
from server.game.finale_geometry import bearing_to, normalize_bearing, schooner_position
from server.game.finale_rules import decide_nightfall, decide_post, decide_signal
from server.game.npc_orders import decide_order
from server.game.npc_service import receipt_line
from server.tests.test_local_server_pg import INTRO
from tools.local_players import HOST_ID, PLAYERS
from tools.local_server import create_local_app

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in disposable PostgreSQL proof"
)


def require(condition, message):
    if not condition:
        pytest.fail(message, pytrace=False)


class ProofBudget:
    """Disable only the in-process request budget, leaving both actual case clocks intact."""

    def check(self, player_id, *, write):
        return None


class Playthrough:
    def __init__(self, client, app, headers):
        self.client, self.app, self.headers = client, app, headers
        self.service = app.state.case
        self.data = self.service.data
        self.counter = 0
        self.first_order = None

    def uid(self):
        self.counter += 1
        return f"solo{self.counter:06}"

    def request(self, method, path, body=None, *, status=200, public=False):
        options = {"headers": {} if public else self.headers}
        if body is not None:
            options["json"] = body
        response = self.client.request(method, path, **options)
        require(
            response.status_code == status, f"HTTP {method} {path} returned {response.status_code}."
        )
        if not public:
            cache = response.headers.get("cache-control", "")
            require("no-store" in cache, "An authenticated API answer was cacheable.")
            case_path = (
                path == "/api/case"
                or path == "/api/crews/me/orders"
                or path.startswith(("/api/case/", "/api/board/", "/api/finale/", "/api/host/case/"))
            )
            if case_path:
                require(
                    cache == "private, no-store", "A case API answer was not private and uncached."
                )
        else:
            require(
                response.headers.get("cache-control") == "public, max-age=30, s-maxage=30",
                "The public world did not keep its thirty-second cache contract.",
            )
        return response.json()

    def intent(self, path, **body):
        body.setdefault("actionUid", self.uid())
        answer = self.request("POST", path, body)
        require(answer.get("accepted") is True, f"The production intent at {path} was refused.")
        return answer

    def snapshot(self):
        record = asyncio.run(self.service.store_for(self.app.state.admin).snapshot(HOST_ID))
        require(record is not None, "The real case snapshot was missing.")
        return record

    def wait_until(self, second):
        for _ in range(20):
            now = self.service.now(self.snapshot())
            if now >= second:
                return
            self.intent("/api/host/case/clock", seconds=min(3600, second - now))
        require(False, "The HTTP host clock did not reach the stored deadline.")

    def player_card(self, card):
        for _ in range(12):
            snapshot = self.snapshot()
            now = self.service.now(snapshot)
            actor = snapshot.seat_for_player(HOST_ID)
            pinned = next(
                (
                    pin
                    for pin in snapshot.pins
                    if pin.seat_no == actor.seat_no and pin.card_id == card
                ),
                None,
            )
            if pinned is not None:
                self.wait_until(pinned.pinned_second)
                return
            found = next(
                (find for find in snapshot.finds_for_seat(actor.seat_no) if find.card_id == card),
                None,
            )
            if found is not None:
                if found.ready_second > now:
                    self.wait_until(found.ready_second)
                    continue
                decision = decide_pin(self.data, snapshot, actor, card, now)
                require(decision.accepted, "The production pin decision refused a landed card.")
                self.intent("/api/board/pin", cardId=card)
                return
            choices, waits = [], []
            for route in self.data.active_routes:
                if route.card_id != card or route.coins:
                    continue
                decision = decide_route(self.data, snapshot, actor, route.id, now)
                if decision.accepted:
                    choices.append((decision.ready_in, route.id))
                elif decision.reason == "locked_window":
                    waits.append(decision.minutes)
            if choices:
                self.intent("/api/case/search", routeId=min(choices)[1])
            else:
                require(bool(waits), "No production free search reaches the required card.")
                self.wait_until((now // 60 + min(waits)) * 60)
        require(False, "The player card plan did not reach its stored pin.")

    def partner_card(self, card):
        current = self.snapshot()
        partners = [seat for seat in current.seats if seat.npc_id is not None]
        partner = min(
            partners,
            key=lambda seat: (
                not any(find.card_id == card for find in current.finds_for_seat(seat.seat_no)),
                seat.seat_no,
            ),
        )
        for _ in range(12):
            snapshot = self.snapshot()
            now = self.service.now(snapshot)
            pinned = next(
                (
                    pin
                    for pin in snapshot.pins
                    if pin.seat_no == partner.seat_no and pin.card_id == card
                ),
                None,
            )
            if pinned is not None:
                self.wait_until(pinned.pinned_second)
                return
            decision = decide_order(
                self.data, snapshot, snapshot.seat_for_player(HOST_ID), partner, "fetch", card, now
            )
            if decision.accepted:
                payload = {
                    "seat": partner.seat_no,
                    "order": "fetch",
                    "target": card,
                    "actionUid": self.uid(),
                }
                answer = self.intent("/api/crews/me/orders", **payload)
                if self.first_order is None:
                    self.remember_first_order(payload, answer)
                self.wait_until(answer["order"]["readyAt"])
            else:
                require(
                    decision.reason in ("busy", "locked_window") and decision.minutes > 0,
                    "A production partner fetch had no available free path.",
                )
                self.wait_until(now + decision.minutes * 60)
        require(False, "The partner card plan did not reach its stored pin.")

    def remember_first_order(self, payload, answer):
        require(
            answer.get("coinsPaid") == self.data.rewards.coin("first_card").amount,
            "The accepted first partner pin did not pay its immediate reward.",
        )
        store = self.service.store_for(self.app.state.admin)
        record = asyncio.run(
            store.order_lookup(HOST_ID, self.snapshot().crew_id, answer["order"]["number"])
        )
        require(record is not None, "The accepted partner receipt was missing.")
        require(
            answer.get("line") == receipt_line(self.service, record),
            "The accepted line did not use its stored bank variant and salt.",
        )
        self.first_order = (payload, answer)
        unknown = {**payload, "target": "missing_card", "actionUid": self.uid()}
        denied = self.request("POST", "/api/crews/me/orders", unknown, status=404)
        require(
            denied.get("error", {}).get("code") == "no_such_card",
            "An unknown active target did not give the scoped 404.",
        )
        self.repeat_original_order()

    def repeat_original_order(self):
        payload, original = self.first_order
        repeated = self.intent(
            "/api/crews/me/orders", **{**payload, "seat": 1, "target": "missing_card"}
        )
        require(
            repeated.get("repeat") is True, "The remembered order did not repeat before new rules."
        )
        require(
            repeated.get("line") == original.get("line") == repeated.get("message"),
            "The replay lost its original partner bank line.",
        )
        require("coinsPaid" not in repeated, "A repeated partner order reported a second reward.")

    def deductions(self):
        for deduction in self.data.deductions:
            self.player_card(deduction.cards[0])
            self.partner_card(deduction.cards[1])
            snapshot = self.snapshot()
            decision = decide_pair(
                self.data, snapshot, *deduction.cards, self.service.now(snapshot)
            )
            require(
                decision.accepted and decision.deduction_id == deduction.id,
                "The production two-seat pair decision refused.",
            )
            self.intent("/api/board/pair", cards=list(deduction.cards))
        require(
            len(self.snapshot().formed) == len(self.data.deductions),
            "The real crew did not form all four deductions.",
        )

    def station(self):
        before = self.request("GET", "/api/islet")
        catalogue = self.app.state.islet_catalogue
        cost = level_one_cost(catalogue)
        built = self.request(
            "POST",
            "/api/islet/build",
            {
                "plot": SIGNAL_STATION_PLOT,
                "type": SIGNAL_STATION,
                "actionUid": self.uid(),
            },
        )
        require(
            (built["coinsPaid"], built["timberPaid"]) == (cost.coins, cost.timber),
            "The station did not charge canonical L2 costs.",
        )
        require(
            built["coins"] == before["coins"] - cost.coins
            and built["timber"] == catalogue.starter_timber - cost.timber,
            "The station charge or starter timber was wrong.",
        )
        require(
            HOST_ID in self.snapshot().station_players,
            "The real L2 station lookup did not ready the crew light.",
        )
        return cost.coins

    def finale(self):
        snapshot = self.snapshot()
        require(
            decide_nightfall(self.data, snapshot, self.service.now(snapshot)).accepted,
            "The production nightfall decision refused.",
        )
        self.intent("/api/finale/nightfall")
        lights = self.data.active_lights
        public = [light for light in lights if light.partners_may_man]
        partners = [seat for seat in self.snapshot().seats if seat.npc_id is not None]
        for light, partner in zip(public, partners, strict=False):
            snapshot = self.snapshot()
            decision = decide_order(
                self.data,
                snapshot,
                snapshot.seat_for_player(HOST_ID),
                partner,
                "man_light",
                light.id,
                self.service.now(snapshot),
            )
            require(decision.accepted, "The production partner light decision refused.")
            self.intent(
                "/api/crews/me/orders", seat=partner.seat_no, order="man_light", target=light.id
            )
        home = next(light for light in lights if not light.partners_may_man)
        snapshot = self.snapshot()
        require(
            decide_post(
                self.data,
                snapshot,
                snapshot.seat_for_player(HOST_ID),
                home.id,
                self.service.now(snapshot),
            ).accepted,
            "The production home post decision refused.",
        )
        self.intent("/api/finale/post", light=home.id)
        self.wait_until(max(post.on_post_second for post in self.snapshot().posts))
        target = schooner_position(self.snapshot().crew_id, self.data.night.chart)
        for index, light in enumerate(lights):
            if index:
                self.intent("/api/host/case/clock", seconds=10)
            snapshot = self.snapshot()
            bearing = normalize_bearing(bearing_to(light.chart_xy, target))
            decision = decide_signal(
                self.data,
                snapshot,
                snapshot.seat_for_player(HOST_ID),
                light.id,
                bearing,
                self.service.now(snapshot),
            )
            require(decision.accepted, "The production exact-bearing signal decision refused.")
            self.intent("/api/finale/signal", light=light.id, bearing=bearing)
        snapshot = self.snapshot()
        locks = [row for row in snapshot.signals if row.parted]
        require(
            len({row.light_id for row in locks}) == len({row.post_seat_no for row in locks}) == 3,
            "The actual SQL fog parting did not use three seats at three lights.",
        )
        require(
            {row.aimed_by for row in locks} == {HOST_ID},
            "The solo aiming player was not credited for the three beams.",
        )


def test_real_solo_http_case_with_three_partners_station_lights_and_locked_world():
    pytest.importorskip("pgserver")
    pytest.importorskip("psycopg")
    app = create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})
    require(
        app.state.settings.flags["case"]
        and not app.state.settings.flags["sign_in"]
        and not app.state.settings.relight_open,
        "The proof must preserve the local factory flag and relight defaults.",
    )
    require(app.state.case.clock is utc_now, "The proof must preserve the actual case clock.")
    app.state.case.limiter = ProofBudget()
    database = app.state.local_database
    with TestClient(app) as client:
        directory = Path(database.directory.name)
        with database.connect() as connection:
            original_wallets = connection.execute("select count(*) from public.wallets").fetchone()[
                0
            ]
        login = client.post("/api/local/sign-in", json={"player": "host"})
        require(login.status_code == 200, "The guarded local fixture login failed.")
        proof = Playthrough(client, app, {"Authorization": f"Bearer {login.json()['accessToken']}"})
        intro = proof.request("POST", "/api/intro/complete", {"actions": INTRO})
        require(intro["coinsPaid"] > 0, "The actual intro did not grant its starting kit.")
        initial_coins = proof.request("GET", "/api/islet")["coins"]
        proof.request("POST", "/api/crews")
        active = proof.request("POST", "/api/crews/me/start")["crew"]
        require(
            sum(seat["holder"] == "partner" for seat in active["seats"]) == 3,
            "A6 did not muster three solo partners.",
        )
        proof.request("GET", "/api/case")
        proof.deductions()
        station_cost = proof.station()
        proof.finale()
        before = proof.snapshot()
        require(
            decide_accusation(
                proof.data, before, proof.data.accusation.culprit, proof.service.now(before)
            ).accepted,
            "The production accusation rule refused the completed proof.",
        )
        expected_share = solve_shares(proof.data, before, HOST_ID)[0].share
        solved = proof.intent("/api/case/accuse", suspect=proof.data.accusation.culprit)
        require(
            solved["case"]["reveal"]["world"] == "locked",
            "A default local solve did not keep the world locked.",
        )
        require(
            proof.snapshot().status == "finished",
            "The accepted accusation did not finish its real crew.",
        )
        proof.repeat_original_order()
        world = proof.request("GET", "/api/world", public=True)
        require(
            world["stage"] == "dark" and world["wall"] == [],
            "A locked solve changed the public coast or Wall.",
        )
        encoded = json.dumps(world)
        require(
            all(player.id not in encoded for player in PLAYERS) and before.crew_id not in encoded,
            "A public world answer exposed a player or crew id.",
        )
        with database.connect() as connection:
            reward_rows = connection.execute(
                "select player_id, reason, ref, delta from public.wallet_transactions "
                "where ref like %s",
                (proof.data.case_id + ":%",),
            ).fetchall()
            require(
                {str(row[0]) for row in reward_rows} == {HOST_ID},
                "Case money reached a nonplayer or unrelated wallet.",
            )
            require(
                len({row[2] for row in reward_rows}) == len(reward_rows),
                "A case reward reference paid twice.",
            )
            card_reward = proof.data.rewards.coin("first_card")
            deduction_reward = proof.data.rewards.coin("deduction")
            expected_rewards = {
                **{
                    card_reward.ref.format(card_id=card.id): card_reward.amount
                    for card in proof.data.cards
                },
                **{
                    deduction_reward.ref.format(deduction_id=item.id): deduction_reward.amount
                    for item in proof.data.deductions
                },
                proof.data.rewards.coin("solve_share").ref: expected_share,
            }
            require(
                {row[2]: row[3] for row in reward_rows} == expected_rewards,
                "The actual card, deduction and solve rewards did not each pay exactly once.",
            )
            require(
                not any(row[1] == "clue_purchase" for row in reward_rows),
                "The free case bought a clue.",
            )
            require(
                sum(
                    row[3]
                    for row in reward_rows
                    if row[2] == proof.data.rewards.coin("solve_share").ref
                )
                == expected_share,
                "The real solve reward differs from the production contribution model.",
            )
            require(
                connection.execute("select count(*) from public.wallets").fetchone()[0]
                == original_wallets,
                "A partner created an additional wallet.",
            )
            balance = connection.execute(
                "select balance from public.wallets where player_id = %s", (HOST_ID,)
            ).fetchone()[0]
            require(
                balance == initial_coins - station_cost + sum(row[3] for row in reward_rows),
                "The final wallet differs from its real station charge and reward ledger.",
            )
            require(
                connection.execute("select count(*) from public.world_solves").fetchone() == (0,),
                "The locked crew reached world solve history.",
            )
        proof.request("DELETE", "/api/me", {"confirm": True})
        proof.request("GET", "/api/case", status=401)
        with database.connect() as connection:
            for table in (
                "case_state",
                "case_finds",
                "case_deductions",
                "case_accusations",
                "board_pins",
                "npc_orders",
                "finale_posts",
                "finale_signals",
                "case_solvers",
                "case_actions",
            ):
                require(
                    connection.execute(
                        f"select count(*) from public.{table} where crew_id = %s", (before.crew_id,)
                    ).fetchone()
                    == (0,),
                    "Solo account deletion left crew-owned case history behind.",
                )
    require(
        database.uri is None and database.directory is None and not directory.exists(),
        "The disposable database was not fully removed.",
    )
