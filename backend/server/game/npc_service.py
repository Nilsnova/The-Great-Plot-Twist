"""Coordinate free partner errands, exact receipts and acceptance-only crew hints.

Every repeat is resolved before game rules. Dialogue and fill values come only from the server.
"""

from typing import TYPE_CHECKING

from server.errors import ApiError
from server.game.case_answers import http_refusal, partner_order_line
from server.game.case_clock import minutes_until_open
from server.game.case_nudges import nudge
from server.game.case_snapshot import CaseSnapshot
from server.game.npc_lines import pick_line
from server.game.npc_orders import (
    ARRIVE_AFTER_MINUTES,
    OrderDecision,
    decide_fetch,
    decide_man_light,
    minimum_reason,
)
from server.game.npc_view import order_view
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

if TYPE_CHECKING:
    from server.game.case_service import CaseService


def refused_answer(case: "CaseService", state: CaseSnapshot, reason: str, minutes: int = 0) -> dict:
    group = minimum_reason(reason)
    line = pick_line(
        case.lines, "cannot_do_it", group, state.orders_count, {"minutes": minutes, "price": 0}
    )
    answer = {"accepted": False, "reason": group, "message": line, "line": line}
    if group in ("busy", "locked_window"):
        answer["minutes"] = minutes
    return answer


def race_minutes(case: "CaseService", decision: OrderDecision, reply: dict) -> int:
    if reply["reason"] == "busy":
        seconds = reply.get("seconds")
        if type(seconds) is not int or seconds < 0:
            raise SupabaseRejected("The partner's busy time could not be read.")
        return (seconds + 59) // 60
    if reply["reason"] != "locked_window":
        return 0
    minute = reply.get("minute")
    route = decision.route
    if type(minute) is not int or minute < 0 or route is None or route.open_when == "always":
        raise SupabaseRejected("The partner's refused window could not be read.")
    return minutes_until_open(case.data.window(route.open_when), minute, ARRIVE_AFTER_MINUTES)


async def order_partner(
    case: "CaseService",
    admin: SupabaseAdmin,
    player_id: str,
    seat_no: int,
    kind: str,
    target: str,
    action_uid: str,
    allow_paid: bool = False,
) -> dict:
    case.limiter.check(player_id, write=True)
    store = case.store_for(admin)
    action = await store.action_lookup(player_id, action_uid)
    if action is not None:
        return await case.remembered(store, player_id, action, admin=admin)
    if allow_paid:
        raise ApiError(422, "paid_errands_off", "Paid partner errands are not available.")
    state = await case.opened_snapshot(store, player_id, write=True, admin=admin)
    if state.seat_for_player(player_id) is None:
        raise ApiError(409, "crew_busy", "Your crew changed. Try the request again.")
    seat = next((seat for seat in state.seats if seat.seat_no == seat_no), None)
    if seat is None:
        raise ApiError(409, "not_a_partner", "That seat is not held by a partner.")
    if kind == "fetch":
        decision = decide_fetch(
            case.data, state, seat, target, case.now(state), orders=state.npc_orders
        )
    elif kind == "man_light":
        decision = decide_man_light(
            case.data, state, seat, target, case.now(state), orders=state.npc_orders
        )
    else:
        raise ApiError(422, "validation_error", "That partner order is not available.")
    if not decision.accepted:
        answer = refused_answer(case, state, decision.reason, decision.minutes)
        return {**answer, "case": case.view(state, player_id)}

    async def operation(fresh: CaseSnapshot) -> dict:
        if kind == "fetch":
            return await store.npc_fetch(
                fresh, case.data, player_id, action_uid, seat_no, target, decision
            )
        return await store.npc_man_light(fresh, case.data, player_id, action_uid, seat_no, target)

    reply, _ = await case.write_with_open_retry(store, state, player_id, operation)
    if reply["status"] == "repeat":
        return await case.remembered(store, player_id, reply, admin=admin)
    if reply["status"] == "refused":
        http_refusal(reply)
        fresh = await store.snapshot(player_id, state.crew_id)
        fresh = await case.enrich(fresh, player_id, admin)
        answer = refused_answer(
            case, fresh or state, reply["reason"], race_minutes(case, decision, reply)
        )
        return {**answer, "case": case.view(fresh, player_id)}
    else:
        if reply["status"] != "done":
            raise SupabaseRejected("The partner order result could not be read.")
        await nudge(case.broadcaster, state.crew_id, "order", reply["revision"])
        receipt = await store.npc_order_for_action(player_id, action_uid, state.crew_id)
        if (
            receipt is None
            or receipt.order_no != reply.get("orderNo")
            or receipt.kind != kind
            or receipt.target != target
            or receipt.seat_no != seat_no
        ):
            raise SupabaseRejected("The partner order receipt could not be read.")
        line = partner_order_line(case.data, case.lines, receipt)
        answer = {
            "accepted": True,
            "reason": None,
            "message": line,
            "line": line,
            "order": order_view(receipt),
        }
        if kind == "fetch":
            answer["coinsPaid"] = reply["coinsPaid"]
    view = await case.fresh_view(store, player_id, state.crew_id, admin=admin)
    return {**answer, "case": view}
