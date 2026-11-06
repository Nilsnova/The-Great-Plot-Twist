"""Coordinate minimum NPC orders, immutable receipts and bank-only dialogue.

CaseService delegates orders here. The store owns SQL guards and exact, player-scoped receipts;
only the shared case nudge helper sends a hint after a committed acceptance.
"""

from math import ceil

from server.errors import ApiError
from server.game.case_answers import http_refusal
from server.game.case_clock import minutes_until_open
from server.game.case_nudges import nudge
from server.game.npc_lines import LineBank, pick_line
from server.game.npc_orders import ARRIVE_AFTER_MINUTES, ORDER_KINDS, decide_order, order_refusal
from server.supabase_admin import SupabaseRejected


def bank(service) -> LineBank:
    if not isinstance(service.lines, LineBank):
        raise ApiError(503, "case_unavailable", "Partner dialogue is not available right now.")
    return service.lines


def partner(snapshot, seat_no):
    return next((seat for seat in snapshot.seats if seat.seat_no == seat_no), None)


def decide(service, snapshot, player_id, seat_no, kind, target):
    return decide_order(
        service.data,
        snapshot,
        snapshot.seat_for_player(player_id),
        partner(snapshot, seat_no),
        kind,
        target,
        service.now(snapshot),
    )


def line(service, event, variant, salt, minutes, price, kind, target):
    values = {"minutes": minutes, "price": price}
    if kind == "man_light":
        try:
            values["light"] = service.data.light(target).name
        except StopIteration:
            raise SupabaseRejected("The partner light could not be read.") from None
    try:
        return pick_line(bank(service), event, variant, salt, values)
    except ValueError:
        raise SupabaseRejected("The partner response could not be read.") from None


def receipt_line(service, record):
    if record.kind == "fetch":
        pin_only = record.found_second is None
        variant = "pin" if pin_only else "fetch"
        end = record.ready_second if pin_only else record.found_second
    elif record.kind == "man_light":
        variant, end = "man_light", record.ready_second
    else:
        raise SupabaseRejected("The partner order could not be read.")
    minutes = ceil((end - record.ordered_second) / 60)
    return line(
        service,
        "order_accepted",
        variant,
        record.order_no,
        minutes,
        record.price,
        record.kind,
        record.target,
    )


async def receipt(store, player_id, crew_id, number):
    if type(number) is not int or not 1 <= number <= 2_147_483_647:
        raise SupabaseRejected("The partner receipt could not be read.")
    record = await store.order_lookup(player_id, crew_id, number)
    if record is None or record.order_no != number or record.ordered_by != player_id:
        raise SupabaseRejected("The partner receipt could not be read.")
    return record


async def remembered_order(service, store, player_id, action):
    target = action.get("target")
    if (
        not isinstance(target, str)
        or not 1 <= len(target) <= 10
        or not target.isascii()
        or not target.isdecimal()
    ):
        raise SupabaseRejected("The remembered partner receipt could not be read.")
    number = int(target)
    if str(number) != target:
        raise SupabaseRejected("The remembered partner receipt could not be read.")
    record = await receipt(store, player_id, action["crewId"], number)
    if record.kind != action["outcome"]:
        raise SupabaseRejected("The remembered partner outcome could not be read.")
    text = receipt_line(service, record)
    fresh = await store.snapshot(player_id, action["crewId"])
    return {
        "accepted": True,
        "reason": None,
        "repeat": True,
        "message": text,
        "line": text,
        "case": service.view(fresh, player_id),
    }


def refusal_decision(service, decision, reply):
    reason = reply.get("reason")
    if not isinstance(reason, str):
        raise SupabaseRejected("The partner refusal could not be read.")
    minutes = reply.get("minutes", 0)
    if type(minutes) is not int or minutes < 0:
        raise SupabaseRejected("The partner wait could not be read.")
    if reason == "busy" and "seconds" in reply:
        seconds = reply["seconds"]
        if type(seconds) is not int or seconds < 0:
            raise SupabaseRejected("The partner wait could not be read.")
        minutes = ceil(seconds / 60)
    if reason == "locked_window" and "minutes" not in reply:
        minute = reply.get("minute")
        if type(minute) is not int or minute < 0 or decision.route_id is None:
            raise SupabaseRejected("The partner arrival minute could not be read.")
        route = service.data.route(decision.route_id)
        if route.open_when == "always":
            raise SupabaseRejected("The partner window refusal could not be read.")
        minutes = minutes_until_open(
            service.data.window(route.open_when), minute + ARRIVE_AFTER_MINUTES
        )
    return order_refusal(reason, minutes)


def refusal_fields(service, decision, salt, kind, target):
    text = line(
        service,
        decision.event,
        decision.variant,
        salt,
        decision.minutes,
        decision.price,
        kind,
        target,
    )
    answer = {"accepted": False, "reason": decision.reason, "message": text, "line": text}
    if decision.minutes:
        answer["minutes"] = decision.minutes
    return answer


def order_view(record):
    return {
        "number": record.order_no,
        "seat": record.seat_no,
        "order": record.kind,
        "target": record.target,
        "orderedAt": record.ordered_second,
        "arriveAt": record.arrive_second,
        "foundAt": record.found_second,
        "pinAt": record.pin_second,
        "readyAt": record.ready_second,
        "price": record.price,
    }


async def order(service, admin, player_id, seat_no, kind, target, allow_paid, action_uid):
    service.limiter.check(player_id, write=True)
    store = service.store_for(admin)
    action = await store.action_lookup(player_id, action_uid)
    if action is not None:
        return await service.remembered(store, player_id, action)
    bank(service)
    if allow_paid:
        raise ApiError(422, "paid_errands_off", "Paid partner errands are not available.")
    if kind not in ORDER_KINDS:
        raise ApiError(422, "bad_order", "That partner order is not available.")
    snapshot = await service.opened_snapshot(store, player_id, write=True)
    decision = decide(service, snapshot, player_id, seat_no, kind, target)
    if not decision.accepted:
        return {
            **refusal_fields(service, decision, snapshot.orders_count, kind, target),
            "case": service.view(snapshot, player_id),
        }
    original = partner(snapshot, seat_no)
    actor = snapshot.seat_for_player(player_id)

    async def write(fresh):
        nonlocal decision
        current = partner(fresh, seat_no)
        current_actor = fresh.seat_for_player(player_id)
        if current_actor is None or current_actor.seat_no != actor.seat_no:
            http_refusal({"reason": "not_in_crew"})
        if current is None or current.npc_id != original.npc_id or current.player_id is not None:
            http_refusal({"reason": "seat_changed"})
        decision = decide(service, fresh, player_id, seat_no, kind, target)
        if not decision.accepted:
            return {"status": "refused", "reason": decision.raw_reason, "minutes": decision.minutes}
        return await store.order(
            fresh, service.data, player_id, action_uid, seat_no, kind, target, decision
        )

    reply, _ = await service.write_with_open_retry(store, snapshot, player_id, write)
    if reply["status"] == "repeat":
        return await service.remembered(store, player_id, reply)
    if reply["status"] == "refused":
        http_refusal(reply)
        decision = refusal_decision(service, decision, reply)
        fresh = await store.snapshot(player_id, snapshot.crew_id)
        salt = (fresh or snapshot).orders_count
        return {
            **refusal_fields(service, decision, salt, kind, target),
            "case": service.view(fresh, player_id),
        }
    if reply["status"] != "done" or type(reply.get("revision")) is not int or reply["revision"] < 1:
        raise SupabaseRejected("The partner acceptance could not be read.")
    await nudge(service.broadcaster, snapshot.crew_id, "order", reply["revision"])
    record = await receipt(store, player_id, snapshot.crew_id, reply.get("orderNo"))
    if record.kind != kind or record.target != target or record.seat_no != seat_no:
        raise SupabaseRejected("The partner acceptance receipt could not be read.")
    text = receipt_line(service, record)
    fresh = await store.snapshot(player_id, snapshot.crew_id)
    answer = {
        "accepted": True,
        "reason": None,
        "message": text,
        "line": text,
        "order": order_view(record),
        "case": service.view(fresh, player_id),
    }
    if "coinsPaid" in reply:
        if type(reply["coinsPaid"]) is not int or reply["coinsPaid"] < 0:
            raise SupabaseRejected("The partner reward could not be read.")
        answer["coinsPaid"] = reply["coinsPaid"]
    return answer
