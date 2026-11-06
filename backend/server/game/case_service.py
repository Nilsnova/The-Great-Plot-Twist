"""Coordinate the case rules, scoped store and safe retries for the case and board intents.

The database clock and locked crew state make the final decision. No background job is needed.
"""

import logging
from typing import Annotated

from fastapi import Depends, Request

from server.clock import Clock, utc_now
from server.errors import ApiError
from server.game.board_rules import decide_pair, decide_pin
from server.game.case_accusation import decide_accusation
from server.game.case_answers import (
    PHASE2_WRITE_STATUSES,
    http_refusal,
    phase2_answer,
    refusal_answer,
    repeat_answer,
)
from server.game.case_clock import case_second
from server.game.case_data import CaseData, load_case
from server.game.case_limits import ActionLimiter
from server.game.case_messages import UI_MESSAGES
from server.game.case_nudges import nudge
from server.game.case_routes import decide_route
from server.game.case_snapshot import CaseSnapshot
from server.game.case_store import CaseStore, solve_payments
from server.game.case_view import build_case_view
from server.game.finale_rules import decide_nightfall, decide_post, decide_signal
from server.game.npc_lines import load_lines
from server.game.station_lookup import IsletStations, NoStations
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
        self.stations = stations if stations is not None else NoStations()
        self.lines = lines

    def store_for(self, admin: SupabaseAdmin) -> CaseStore:
        return CaseStore(admin, stations=self.stations)

    def now(self, snapshot: CaseSnapshot) -> int:
        return case_second(snapshot.state_started_at or snapshot.started_at, self.clock())

    def view(self, snapshot: CaseSnapshot | None, player_id: str):
        return (
            None
            if snapshot is None
            else build_case_view(
                self.data, snapshot, player_id, self.now(snapshot), lines=self.lines
            )
        )

    async def opened_snapshot(self, store, player_id, *, write=False, crew_id=None):
        snapshot = await store.snapshot(player_id, crew_id)
        if snapshot is None:
            if write:
                raise ApiError(404, "no_crew", "Join a crew before working on the case.")
            return None
        if snapshot.status != "active":
            if write:
                http_refusal({"reason": "crew_not_active", "crewStatus": snapshot.status})
            return snapshot if snapshot.status == "finished" and snapshot.write_revision else None
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
        return snapshot

    async def read(self, admin: SupabaseAdmin, player_id: str) -> dict:
        self.limiter.check(player_id, write=False)
        snapshot = await self.opened_snapshot(self.store_for(admin), player_id)
        return {"case": self.view(snapshot, player_id)}

    async def remembered(self, store, player_id: str, action: dict) -> dict:
        if action["kind"] == "order":
            from server.game.npc_service import remembered_order

            return await remembered_order(self, store, player_id, action)
        snapshot = await store.snapshot(player_id, action["crewId"])
        return {**repeat_answer(self.data, action), "case": self.view(snapshot, player_id)}

    async def order(self, admin, player_id, seat_no, kind, target, allow_paid, action_uid):
        from server.game.npc_service import order

        return await order(self, admin, player_id, seat_no, kind, target, allow_paid, action_uid)

    async def search(
        self, admin, player_id, route_id, action_uid, paid_confirmed=False, expected_price=None
    ):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action)
        snapshot = await self.opened_snapshot(store, player_id, write=True)
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
            return await self.remembered(store, player_id, reply)
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
        if reply["status"] == "done":
            await nudge(self.broadcaster, snapshot.crew_id, "search", reply["revision"])
        fresh = await store.snapshot(player_id, snapshot.crew_id)
        return {**answer, "case": self.view(fresh, player_id)}

    async def pin(self, admin, player_id, card_id, action_uid):
        return await self.phase2_intent(admin, player_id, action_uid, "pin", (card_id,))

    async def pair(self, admin, player_id, card_a, card_b, action_uid):
        return await self.phase2_intent(admin, player_id, action_uid, "pair", (card_a, card_b))

    async def nightfall(self, admin, player_id, action_uid):
        return await self.phase2_intent(admin, player_id, action_uid, "nightfall", ())

    async def post(self, admin, player_id, light_id, action_uid):
        return await self.phase2_intent(admin, player_id, action_uid, "post", (light_id,))

    async def signal(self, admin, player_id, light_id, bearing, action_uid):
        return await self.phase2_intent(admin, player_id, action_uid, "signal", (light_id, bearing))

    def phase2_decision(self, kind, snapshot, player_id, targets):
        now = self.now(snapshot)
        seat = snapshot.seat_for_player(player_id)
        if seat is None:
            http_refusal({"reason": "not_in_crew"})
        if kind in ("pin", "pair"):
            if any(card not in {item.id for item in self.data.cards} for card in targets):
                raise ApiError(404, "no_such_card", "That card is not in the case.")
        if kind == "pin":
            return decide_pin(self.data, snapshot, seat, targets[0], now)
        if kind == "pair":
            if targets[0] == targets[1]:
                raise ApiError(422, "validation_error", "Choose two different cards.")
            return decide_pair(self.data, snapshot, *targets, now)
        if kind == "nightfall":
            return decide_nightfall(self.data, snapshot, now)
        if kind == "post":
            return decide_post(self.data, snapshot, seat, targets[0], now)
        decision = decide_signal(self.data, snapshot, seat, *targets, now)
        if decision.reason == "post_not_ready" and targets[0] not in {
            light.id for light in self.data.night.lights
        }:
            raise ApiError(404, "no_such_light", "That light is not in the case.")
        return decision

    async def phase2_intent(self, admin, player_id, action_uid, kind, targets):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action)
        snapshot = await self.opened_snapshot(store, player_id, write=True)
        decision = self.phase2_decision(kind, snapshot, player_id, targets)
        if not decision.accepted and decision.reason not in ("wrong_pair", "off_target"):
            answer = {"accepted": False, "reason": decision.reason, "message": decision.message}
            if decision.seconds:
                answer["seconds"] = decision.seconds
            return {**answer, "case": self.view(snapshot, player_id)}

        async def write(fresh):
            arguments = targets
            if kind == "signal":
                arguments = (targets[0], decision.bearing)
            return await getattr(store, kind)(fresh, self.data, player_id, action_uid, *arguments)

        reply, _ = await self.write_with_open_retry(store, snapshot, player_id, write)
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply)
        if reply["status"] == "refused":
            http_refusal(reply)
            answer = refusal_answer(self.data, kind, targets[0] if targets else None, reply)
        else:
            if (
                reply["status"] not in PHASE2_WRITE_STATUSES[kind]
                or type(reply.get("revision")) is not int
                or reply["revision"] < 1
            ):
                raise SupabaseRejected("The case intent result could not be read.")
            await nudge(self.broadcaster, snapshot.crew_id, kind, reply["revision"])
            fresh = await store.snapshot(player_id, snapshot.crew_id)
            answer = phase2_answer(self.data, kind, targets, reply, player_id, fresh)
            return {**answer, "case": self.view(fresh, player_id)}
        fresh = await store.snapshot(player_id, snapshot.crew_id)
        return {**answer, "case": self.view(fresh, player_id)}

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
            return await self.remembered(store, player_id, action)
        may_reopen = True
        for attempt in range(2):
            snapshot = await self.opened_snapshot(store, player_id, write=True)
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
                    store, snapshot, player_id, suspect, decision, reply
                )
            if attempt:
                http_refusal(reply)
        raise AssertionError("The accusation retry loop must return or refuse.")

    async def accuse_answer(self, store, snapshot, player_id, suspect, decision, reply):
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply)
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
        if reply["status"] in ("wrong", "solved"):
            await nudge(self.broadcaster, snapshot.crew_id, "accuse", reply["revision"])
        fresh = await store.snapshot(player_id, snapshot.crew_id)
        return {**answer, "case": self.view(fresh, player_id)}

    async def clock_forward(self, admin, player_id, seconds, action_uid):
        self.limiter.check(player_id, write=True)
        store = self.store_for(admin)
        action = await store.action_lookup(player_id, action_uid)
        if action is not None:
            return await self.remembered(store, player_id, action)
        snapshot = await self.opened_snapshot(store, player_id, write=True)
        reply, _ = await self.write_with_open_retry(
            store,
            snapshot,
            player_id,
            lambda fresh: store.clock_forward(fresh, player_id, action_uid, seconds),
        )
        if reply["status"] == "repeat":
            return await self.remembered(store, player_id, reply)
        if reply["status"] == "refused":
            http_refusal(reply)
            raise SupabaseRejected("The clock move was refused.")
        if reply["status"] != "done" or type(reply.get("now")) is not int:
            raise SupabaseRejected("The clock move could not be read.")
        await nudge(self.broadcaster, snapshot.crew_id, "clock", reply["revision"])
        fresh = await store.snapshot(player_id, snapshot.crew_id)
        return {
            "accepted": True,
            "reason": None,
            "message": UI_MESSAGES["moved"].format(minutes=f"{seconds / 60:g}"),
            "now": reply["now"],
            "case": self.view(fresh, player_id),
        }


def case_or_none(
    settings: Settings, *, broadcaster=None, clock: Clock = utc_now
) -> CaseService | None:
    try:
        return CaseService(
            load_case(),
            clock=clock,
            relight_open=settings.relight_open,
            broadcaster=broadcaster,
            stations=IsletStations(),
            lines=load_lines(),
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
