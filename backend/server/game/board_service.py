"""Coordinate board and finale intents after a player-scoped repeat lookup.

Pure refusals do not write. Wrong pairs and missed aims commit their cooldowns in SQL.
"""

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from server.errors import ApiError
from server.game.board_rules import decide_pair, decide_pin
from server.game.case_answers import http_refusal, refusal_answer
from server.game.case_decisions import IntentDecision
from server.game.case_nudges import nudge
from server.game.case_snapshot import CaseSnapshot
from server.game.case_store import CaseStore, solve_payments
from server.game.finale_geometry import normalize_bearing, schooner_position
from server.game.finale_rules import decide_nightfall, decide_post, decide_signal
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

if TYPE_CHECKING:
    from server.game.case_service import CaseService


def decision_answer(decision: IntentDecision) -> dict:
    answer = {"accepted": decision.accepted, "reason": decision.reason, "message": decision.message}
    if decision.seconds:
        answer["seconds"] = decision.seconds
    return answer


async def prepare(
    case: "CaseService", admin: SupabaseAdmin, player_id: str, action_uid: str
) -> tuple[CaseStore, CaseSnapshot | None, dict | None]:
    case.limiter.check(player_id, write=True)
    store = case.store_for(admin)
    action = await store.action_lookup(player_id, action_uid)
    if action is not None:
        return store, None, await case.remembered(store, player_id, action, admin=admin)
    snapshot = await case.opened_snapshot(store, player_id, write=True, admin=admin)
    if snapshot.seat_for_player(player_id) is None:
        raise ApiError(409, "crew_busy", "Your crew changed. Try the request again.")
    return store, snapshot, None


async def commit(
    case: "CaseService",
    admin: SupabaseAdmin,
    store: CaseStore,
    snapshot: CaseSnapshot,
    player_id: str,
    kind: str,
    target: str | None,
    operation: Callable[[CaseSnapshot], Awaitable[dict]],
    accepted: Callable[[dict], dict],
) -> dict:
    reply, _ = await case.write_with_open_retry(store, snapshot, player_id, operation)
    if reply["status"] == "repeat":
        return await case.remembered(store, player_id, reply, admin=admin)
    if reply["status"] == "refused":
        http_refusal(reply)
        answer = refusal_answer(case.data, kind, target, reply)
    else:
        answer = accepted(reply)
        await nudge(case.broadcaster, snapshot.crew_id, kind, reply["revision"])
    view = await case.fresh_view(store, player_id, snapshot.crew_id, admin=admin)
    return {**answer, "case": view}


async def pin(
    case: "CaseService", admin: SupabaseAdmin, player_id: str, card_id: str, action_uid: str
) -> dict:
    store, state, remembered = await prepare(case, admin, player_id, action_uid)
    if remembered is not None:
        return remembered
    decision = decide_pin(
        case.data, state, state.seat_for_player(player_id), card_id, case.now(state)
    )
    if not decision.accepted:
        return {**decision_answer(decision), "case": case.view(state, player_id)}

    def accepted(reply: dict) -> dict:
        if reply["status"] != "done":
            raise SupabaseRejected("The pin result could not be read.")
        return {**decision_answer(decision), "coinsPaid": reply["coinsPaid"]}

    return await commit(
        case,
        admin,
        store,
        state,
        player_id,
        "pin",
        card_id,
        lambda fresh: store.pin(fresh, case.data, player_id, action_uid, card_id),
        accepted,
    )


async def pair(
    case: "CaseService", admin: SupabaseAdmin, player_id: str, a: str, b: str, action_uid: str
) -> dict:
    store, state, remembered = await prepare(case, admin, player_id, action_uid)
    if remembered is not None:
        return remembered
    decision = decide_pair(
        case.data, state, state.seat_for_player(player_id), a, b, case.now(state)
    )
    if not decision.accepted and decision.reason != "wrong_pair":
        return {**decision_answer(decision), "case": case.view(state, player_id)}

    def accepted(reply: dict) -> dict:
        if reply["status"] == "wrong_pair":
            return refusal_answer(
                case.data, "pair", None, {"reason": "wrong_pair", "seconds": reply["seconds"]}
            )
        if reply["status"] != "formed" or decision.target is None:
            raise SupabaseRejected("The pair result could not be read.")
        deduction = case.data.deduction(decision.target)
        paid = next(
            (row["paid"] for row in solve_payments(reply) if row["playerId"] == player_id), 0
        )
        return {
            "accepted": True,
            "reason": None,
            "message": deduction.finding,
            "deduction": {
                "id": deduction.id,
                "name": deduction.name,
                "finding": deduction.finding,
                "clearLine": deduction.clear_line,
                "opens": list(deduction.opens),
                "opensLine": deduction.opens_line,
            },
            "coinsPaid": paid,
        }

    return await commit(
        case,
        admin,
        store,
        state,
        player_id,
        "pair",
        None,
        lambda fresh: store.pair(fresh, case.data, player_id, action_uid, a, b),
        accepted,
    )


async def nightfall(
    case: "CaseService", admin: SupabaseAdmin, player_id: str, action_uid: str
) -> dict:
    store, state, remembered = await prepare(case, admin, player_id, action_uid)
    if remembered is not None:
        return remembered
    decision = decide_nightfall(case.data, state, case.now(state))
    if not decision.accepted:
        return {**decision_answer(decision), "case": case.view(state, player_id)}

    def accepted(reply: dict) -> dict:
        if reply["status"] != "done":
            raise SupabaseRejected("The nightfall result could not be read.")
        return {**decision_answer(decision), "endsIn": case.data.night.night_minutes * 60}

    return await commit(
        case,
        admin,
        store,
        state,
        player_id,
        "nightfall",
        None,
        lambda fresh: store.nightfall(fresh, case.data, player_id, action_uid),
        accepted,
    )


async def take_post(
    case: "CaseService", admin: SupabaseAdmin, player_id: str, light_id: str, action_uid: str
) -> dict:
    store, state, remembered = await prepare(case, admin, player_id, action_uid)
    if remembered is not None:
        return remembered
    ready = light_id != "islet_signal_station" or state.station_ready
    decision = decide_post(
        case.data,
        state,
        state.seat_for_player(player_id),
        light_id,
        case.now(state),
        station_ready=state.station_ready,
    )
    if not decision.accepted:
        answer = decision_answer(decision)
        if decision.reason == "light_not_ready" and light_id == "islet_signal_station":
            answer = refusal_answer(case.data, "post", light_id, {"reason": "light_not_ready"})
        return {**answer, "case": case.view(state, player_id)}

    def accepted(reply: dict) -> dict:
        if reply["status"] != "done":
            raise SupabaseRejected("The light post result could not be read.")
        return {**decision_answer(decision), "onPostIn": case.data.night.climb_minutes * 60}

    return await commit(
        case,
        admin,
        store,
        state,
        player_id,
        "post",
        light_id,
        lambda fresh: store.take_post(fresh, case.data, player_id, action_uid, light_id, ready),
        accepted,
    )


async def signal(
    case: "CaseService",
    admin: SupabaseAdmin,
    player_id: str,
    light_id: str,
    bearing: float,
    action_uid: str,
) -> dict:
    store, state, remembered = await prepare(case, admin, player_id, action_uid)
    if remembered is not None:
        return remembered
    bearing = normalize_bearing(bearing)
    decision = decide_signal(
        case.data, state, state.seat_for_player(player_id), light_id, bearing, case.now(state)
    )
    if not decision.accepted and decision.reason != "off_target":
        return {**decision_answer(decision), "case": case.view(state, player_id)}

    def accepted(reply: dict) -> dict:
        if reply["status"] == "off_target":
            return refusal_answer(
                case.data, "signal", light_id, {"reason": "off_target", "seconds": reply["seconds"]}
            )
        if reply["status"] != "locked" or type(reply.get("parted")) is not bool:
            raise SupabaseRejected("The signal result could not be read.")
        parted = reply["parted"]
        answer = {
            "accepted": True,
            "reason": None,
            "message": case.data.night.lines["parted" if parted else "locked"],
            "holdsFor": case.data.night.lock_seconds,
            "parted": parted,
        }
        if parted:
            point = schooner_position(state.crew_id, case.data.night.chart)
            answer["target"] = {"x": point[0], "y": point[1]}
        return answer

    answer = await commit(
        case,
        admin,
        store,
        state,
        player_id,
        "signal",
        light_id,
        lambda fresh: store.signal(
            fresh, case.data, player_id, action_uid, light_id, bearing, decision.accepted
        ),
        accepted,
    )
    if answer.get("parted") and not answer.get("repeat"):
        answer["lights"] = answer["case"]["finale"]["parted"]["lights"]
    return answer
