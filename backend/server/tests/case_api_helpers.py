"""A deterministic case store for route tests, with a real service and pure rules.

SQL correctness is tested separately on disposable PostgreSQL. This fake records every intent.
"""

from dataclasses import replace
from datetime import timedelta

from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import Player
from server.game.case_clock import case_second
from server.game.case_data import load_case
from server.game.case_rewards import solve_shares
from server.game.case_service import CaseService
from server.game.case_snapshot import Accusation, Find, Solver
from server.tests.case_rule_helpers import FRIEND, PLAYER, START, snapshot
from server.tests.helpers import FakeClock

HEADER = {"Authorization": "Bearer local.player.fixture"}
FRIEND_HEADER = {"Authorization": "Bearer local.friend.fixture"}


class TestVerifier:
    __test__ = False

    async def verify(self, token):
        if token == "local.player.fixture":
            return Player(PLAYER)
        if token == "local.friend.fixture":
            return Player(FRIEND)
        from server.auth import unauthorized

        raise unauthorized("Unknown test player.")


class MemoryCaseStore:
    def __init__(self, clock):
        self.clock = clock
        self.current = snapshot()
        self.actions = {}
        self.calls = []
        self.scripted = {}
        self.open_count = 0
        self.paid = None

    def now(self):
        return case_second(self.current.state_started_at or self.current.started_at, self.clock())

    async def snapshot(self, player_id, crew_id=None):
        if self.current is None or (crew_id is not None and crew_id != self.current.crew_id):
            return None
        return self.current

    async def action_lookup(self, player_id, action_uid):
        return self.actions.get((player_id, action_uid))

    async def open(self, current, data):
        self.open_count += 1
        finds = list(current.finds)
        for seat in current.seats:
            for route in data.routes:
                if (
                    route.starts_in_journal
                    and route.kit == seat.kit
                    and not any(
                        find.seat_no == seat.seat_no and find.card_id == route.card_id
                        for find in finds
                    )
                ):
                    finds.append(
                        Find(
                            seat.seat_no,
                            route.card_id,
                            route.id,
                            0,
                            0,
                            by_partner=seat.npc_id is not None,
                        )
                    )
        self.current = replace(
            current, write_revision=max(1, current.write_revision), finds=tuple(finds)
        )
        return {"status": "opened"}

    def scripted_reply(self, kind):
        self.calls.append(kind)
        values = self.scripted.get(kind, [])
        if values:
            reply = values.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply
        return None

    def remember(self, player_id, uid, kind, target, outcome):
        self.actions[(player_id, uid)] = {
            "status": "repeat",
            "crewId": self.current.crew_id,
            "kind": kind,
            "target": target,
            "outcome": outcome,
        }

    async def start_route(self, current, data, player_id, uid, route_id):
        scripted = self.scripted_reply("search")
        if scripted is not None:
            return scripted
        route = data.route(route_id)
        now = self.now()
        seat = current.seat_for_player(player_id)
        find = Find(
            seat.seat_no, route.card_id, route_id, now, now + route.timer_minutes * 60, player_id
        )
        self.current = replace(
            self.current, finds=(*current.finds, find), write_revision=current.write_revision + 1
        )
        self.remember(player_id, uid, "search", route_id, "started")
        return {
            "status": "done",
            "now": now,
            "readySecond": find.ready_second,
            "revision": self.current.write_revision,
        }

    async def accuse(self, current, data, player_id, uid, suspect, relight_open):
        scripted = self.scripted_reply("accuse")
        if scripted is not None:
            return scripted
        correct = suspect == data.accusation.culprit
        now = self.now()
        accusation = Accusation(
            suspect, correct, now, player_id, current.seat_for_player(player_id).seat_no
        )
        self.current = replace(
            current,
            accusations=(*current.accusations, accusation),
            write_revision=current.write_revision + 1,
        )
        self.remember(player_id, uid, "accuse", suspect, "solved" if correct else "wrong_suspect")
        if not correct:
            self.current = replace(
                self.current, accuse_wait_until=now + data.accusation.wrong_wait_seconds
            )
            return {
                "status": "wrong",
                "seconds": data.accusation.wrong_wait_seconds,
                "revision": self.current.write_revision,
            }
        payouts = solve_shares(data, self.current, player_id)
        solvers = tuple(
            Solver(
                p.player_id,
                p.seat_no,
                p.kit,
                p.contributor,
                p.share,
                p.share if self.paid is None else self.paid,
                now,
            )
            for p in payouts
        )
        self.current = replace(
            self.current,
            status="finished",
            solved_second=now,
            solved_by=player_id,
            solvers=solvers,
            world_outcome="unchanged",
        )
        return {
            "status": "solved",
            "world": {"world": "unchanged"},
            "payouts": [{"playerId": s.player_id, "paid": s.share_paid} for s in solvers],
            "revision": self.current.write_revision,
        }

    async def clock_forward(self, current, player_id, uid, seconds):
        scripted = self.scripted_reply("clock")
        if scripted is not None:
            return scripted
        start = current.state_started_at or current.started_at
        self.current = replace(
            current,
            state_started_at=start - timedelta(seconds=seconds),
            write_revision=current.write_revision + 1,
        )
        self.remember(player_id, uid, "clock", None, "moved")
        return {"status": "done", "now": self.now(), "revision": self.current.write_revision}


def client_and_store(*, enabled=True, host=True):
    from server.flags import parse_flags
    from server.settings import Settings

    clock = FakeClock()
    clock.now = START
    store = MemoryCaseStore(clock)
    data = load_case()
    service = CaseService(data, clock=clock)
    service.store_for = lambda admin: store
    settings = Settings(
        flags=parse_flags("case" if enabled else ""),
        host_player_ids=frozenset({PLAYER}) if host else frozenset(),
        demo_mode=True,
    )
    app = create_app(settings, verifier=TestVerifier(), case_service=service)
    return TestClient(app), store, service, clock
