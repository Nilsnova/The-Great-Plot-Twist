"""Coordinate case rules, scoped stores, safe retries and post-commit change hints.

The database clock and locked crew state make the final decision. No background job is needed.
"""

import logging
from dataclasses import replace
from typing import Annotated

from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.game import board_service
from server.game.case_accusation import decide_accusation
from server.game.case_answers import http_refusal, refusal_answer, repeat_answer
from server.game.case_clock import case_second
from server.game.case_data import CaseData, load_case
from server.game.case_limits import ActionLimiter
from server.game.case_messages import UI_MESSAGES
from server.game.case_nudges import nudge
from server.game.case_routes import decide_route
from server.game.case_snapshot import CaseSnapshot
from server.game.case_store import CaseStore, solve_payments
from server.game.case_view import build_case_view
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)


class CaseService:
    def __init__(
        self,
        data: CaseData,
        *,
        clock: Clock = utc_now,
        relight_open: bool = False,
        limiter=None,
        broadcaster=None,
        stations=None,
        lines=None,
    ) -> None:
        self.data = data
        self.clock = clock
        self.relight_open = relight_open
        self.limiter = limiter or ActionLimiter(clock=clock)
        self.broadcaster = broadcaster
        self.stations = stations
        self.lines = lines

    def store_for(self, admin: SupabaseAdmin) -> CaseStore:
        return CaseStore(admin)

    def now(self, snapshot: CaseSnapshot) -> int:
        return case_second(snapshot.state_started_at or snapshot.started_at, self.clock())

    def view(self, snapshot: CaseSnapshot | None, player_id: str):
        return (
            None
            if snapshot is None
            else build_case_view(self.data, snapshot, player_id, self.now(snapshot))
        )

    async def enrich(
        self, snapshot: CaseSnapshot | None, player_id: str, admin: SupabaseAdmin | None = None
    ) -> CaseSnapshot | None:
        if snapshot is None or self.stations is None:
            return snapshot
        players = [seat.player_id for seat in snapshot.seats if seat.player_id is not None]
        owners = await self.stations.players_with_signal_station(admin, players)
        timber = await self.stations.timber(admin, player_id)
        return replace(snapshot, station_ready=bool(owners), timber=timber)

    async def fresh_view(
        self, store: CaseStore, player_id: str, crew_id: str, *, admin: SupabaseAdmin | None = None
    ) -> dict | None:
        snapshot = await store.snapshot(player_id, crew_id)
        return self.view(await self.enrich(snapshot, player_id, admin), player_id)

    async def opened_snapshot(self, store, player_id, *, write=False, crew_id=None, admin=None):
        snapshot = await store.snapshot(player_id, crew_id)
        if snapshot is None:
            if write:
                raise ApiError(404, "no_crew", "Join a crew before working on the case.")
            return None
        if snapshot.status != "active":
            if write:
                http_refusal({"reason": "crew_not_active", "crewStatus": snapshot.status})
            return (
                await self.enrich(snapshot, player_id, admin)
                if snapshot.status == "finished" and snapshot.write_revision
                else None
            )
        starts = [
            (seat.seat_no, route.card_id)
            for seat in snapshot.seats
            for route in self.data.routes
            if route.starts_in_journal and route.kit == seat.kit
        ]
        held = {(find.seat_no, find.card_id) for find in snapshot.finds}
        if snapshot.write_revision == 0 or any(start not in held for start in starts):
            reply = await store.open(snapshot, self.data)
            if reply["status"] != "opened":
                http_refusal(reply)
                raise SupabaseRejected("The case could not be opened.")
            snapshot = await store.snapshot(player_id, snapshot.crew_id)
            if snapshot is None or not snapshot.write_revision:
                raise SupabaseRejected("The opened case could not be read.")
        return await self.enrich(snapshot, player_id, admin)

    async def read(self, admin: SupabaseAdmin, player_id: str) -> dict:
        self.limiter.check(player_id, write=False)
        snapshot = await self.opened_snapshot(self.store_for(admin), player_id, admin=admin)
        return {"case": self.view(snapshot, player_id)}

    async def remembered(self, store, player_id: str, action: dict, *, admin=None) -> dict:
        view = await self.fresh_view(store, player_id, action["crewId"], admin=admin)
        return {**repeat_answer(self.data, action), "case": view}

    async def search(
        self, admin, player_id, route_id, action_uid, paid_confirmed=False, expected_price=None
    ):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action, admin=admin)
        snapshot = await self.opened_snapshot(store, player_id, write=True, admin=admin)
        seat = snapshot.seat_for_player(player_id)
        decision = decide_route(
            self.data,
            snapshot,
            seat,
            route_id,
            self.now(snapshot),
            paid_confirmed=paid_confirmed,
            expected_price=expected_price,
        )
        if not decision.accepted:
            answer = {"accepted": False, "reason": decision.reason, "message": decision.message}
            if decision.reason == "locked_window":
                answer["minutes"] = decision.minutes
            return {**answer, "case": self.view(snapshot, player_id)}
        reply, _ = await self.write_with_open_retry(
            store,
            snapshot,
            player_id,
            lambda fresh: store.start_route(fresh, self.data, player_id, action_uid, route_id),
        )
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply, admin=admin)
        if reply["status"] == "refused":
            http_refusal(reply)
            answer = refusal_answer(self.data, "search", route_id, reply)
        elif reply["status"] == "done":
            answer = {
                "accepted": True,
                "reason": None,
                "message": decision.message,
                "readyIn": decision.ready_in,
                "coinsSpent": 0,
            }
        else:
            raise SupabaseRejected("The search result could not be read.")
        if reply["status"] != "refused":
            await nudge(self.broadcaster, snapshot.crew_id, "search", reply["revision"])
        view = await self.fresh_view(store, player_id, snapshot.crew_id, admin=admin)
        return {**answer, "case": view}

    async def write_with_open_retry(
        self, store, snapshot, player_id, operation, *, may_reopen=True
    ):
        reply = await operation(snapshot)
        reopened = False
        if reply.get("reason") == "case_not_open":
            if not may_reopen:
                raise SupabaseRejected("The request already used its case-open retry.")
            reopened = True
            opened = await store.open(snapshot, self.data)
            if opened["status"] != "opened":
                http_refusal(opened)
                raise SupabaseRejected("The case could not be reopened.")
            fresh = await store.snapshot(player_id, snapshot.crew_id)
            if fresh is None:
                raise SupabaseRejected("The reopened case could not be read.")
            reply = await operation(fresh)
            if reply.get("reason") == "case_not_open":
                raise SupabaseRejected("The case stayed closed after one retry.")
        return reply, reopened

    async def accuse(self, admin, player_id, suspect, action_uid):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action, admin=admin)
        may_reopen = True
        for attempt in range(2):
            snapshot = await self.opened_snapshot(store, player_id, write=True, admin=admin)
            decision = decide_accusation(self.data, snapshot, suspect, self.now(snapshot))
            if not decision.accepted and decision.reason != "accusation_refused":
                answer = {"accepted": False, "reason": decision.reason, "message": decision.message}
                if decision.seconds:
                    answer["seconds"] = decision.seconds
                return {**answer, "case": self.view(snapshot, player_id)}
            reply, reopened = await self.write_with_open_retry(
                store,
                snapshot,
                player_id,
                lambda fresh: store.accuse(
                    fresh, self.data, player_id, action_uid, suspect, self.relight_open
                ),
                may_reopen=may_reopen,
            )
            may_reopen = may_reopen and not reopened
            if reply.get("reason") != "state_changed":
                return await self.accuse_answer(
                    store, snapshot, player_id, suspect, decision, reply, admin=admin
                )
            if attempt:
                http_refusal(reply)
        raise AssertionError("The accusation retry loop must return or refuse.")

    async def accuse_answer(
        self, store, snapshot, player_id, suspect, decision, reply, *, admin=None
    ):
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply, admin=admin)
        if reply["status"] == "refused":
            http_refusal(reply)
            answer = refusal_answer(self.data, "accuse", suspect, reply)
        elif reply["status"] == "wrong":
            answer = {
                "accepted": False,
                "reason": "accusation_refused",
                "message": decision.message,
                "seconds": reply.get("seconds", self.data.accusation.wrong_wait_seconds),
            }
        elif reply["status"] == "solved":
            world = reply.get("world")
            if not isinstance(world, dict) or world.get("world") not in (
                "unchanged",
                "locked",
                "relit",
                "added",
                "already_recorded",
            ):
                raise SupabaseRejected("The solve's world result could not be read.")
            paid = next(
                (item["paid"] for item in solve_payments(reply) if item["playerId"] == player_id),
                0,
            )
            if type(paid) is not int or paid < 0:
                raise SupabaseRejected("The solve payment could not be read.")
            answer = {
                "accepted": True,
                "reason": None,
                "message": UI_MESSAGES["solved"],
                "solved": True,
                "world": world["world"],
                "coinsPaid": paid,
            }
        else:
            raise SupabaseRejected("The accusation result could not be read.")
        if reply["status"] != "refused":
            await nudge(self.broadcaster, snapshot.crew_id, "accuse", reply["revision"])
        view = await self.fresh_view(store, player_id, snapshot.crew_id, admin=admin)
        return {**answer, "case": view}

    async def clock_forward(self, admin, player_id, seconds, action_uid):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action, admin=admin)
        snapshot = await self.opened_snapshot(store, player_id, write=True, admin=admin)
        reply, _ = await self.write_with_open_retry(
            store,
            snapshot,
            player_id,
            lambda fresh: store.clock_forward(fresh, player_id, action_uid, seconds),
        )
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply, admin=admin)
        if reply["status"] == "refused":
            http_refusal(reply)
            raise SupabaseRejected("The clock move was refused.")
        if reply["status"] != "done" or type(reply.get("now")) is not int:
            raise SupabaseRejected("The clock move could not be read.")
        await nudge(self.broadcaster, snapshot.crew_id, "clock", reply["revision"])
        view = await self.fresh_view(store, player_id, snapshot.crew_id, admin=admin)
        return {
            "accepted": True,
            "reason": None,
            "message": UI_MESSAGES["moved"].format(minutes=f"{seconds / 60:g}"),
            "now": reply["now"],
            "case": view,
        }

    async def pin(
        self, admin: SupabaseAdmin, player_id: str, card_id: str, action_uid: str
    ) -> dict:
        return await board_service.pin(self, admin, player_id, card_id, action_uid)

    async def pair(
        self, admin: SupabaseAdmin, player_id: str, a: str, b: str, action_uid: str
    ) -> dict:
        return await board_service.pair(self, admin, player_id, a, b, action_uid)

    async def nightfall(self, admin: SupabaseAdmin, player_id: str, action_uid: str) -> dict:
        return await board_service.nightfall(self, admin, player_id, action_uid)

    async def take_post(
        self, admin: SupabaseAdmin, player_id: str, light_id: str, action_uid: str
    ) -> dict:
        return await board_service.take_post(self, admin, player_id, light_id, action_uid)

    async def signal(
        self, admin: SupabaseAdmin, player_id: str, light_id: str, bearing: float, action_uid: str
    ) -> dict:
        return await board_service.signal(self, admin, player_id, light_id, bearing, action_uid)


def case_or_none(settings: Settings, *, broadcaster=None, stations=None) -> CaseService | None:
    try:
        return CaseService(
            load_case(),
            relight_open=settings.relight_open,
            broadcaster=broadcaster,
            stations=stations,
        )
    except (OSError, ValueError, TypeError, KeyError):
        logger.warning("The case content is unavailable; case routes are disabled.")
        return None


def get_case_service(request: Request) -> CaseService:
    if not request.app.state.settings.flags.get("case", False):
        raise ApiError(404, "feature_off", "The case is not available yet.")
    service = request.app.state.case
    if service is None:
        raise ApiError(503, "case_unavailable", "The case content is not available right now.")
    return service


CaseDep = Annotated[CaseService, Depends(get_case_service)]
