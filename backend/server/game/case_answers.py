"""Rebuild remembered case answers and map database refusals without changing their outcome.

Used by: case_service.py. Repeats contain the fresh view but omit unstored extra numbers.
"""

from server.errors import ApiError
from server.game.case_clock import minutes_until_open
from server.game.case_data import CaseData
from server.game.case_messages import UI_MESSAGES
from server.game.finale_geometry import schooner_position
from server.supabase_admin import SupabaseRejected

ACCEPTED_OUTCOMES = frozenset(
    {
        "started",
        "pinned",
        "formed",
        "night",
        "climbing",
        "locked",
        "parted",
        "solved",
        "fetch",
        "man_light",
        "moved",
    }
)
REFUSAL_OUTCOMES = {
    "wrong_pair": "wrong_pair",
    "wrong_suspect": "accusation_refused",
    "off_target": "off_target",
}
PHASE2_WRITE_STATUSES = {
    "pin": ("done",),
    "pair": ("wrong_pair", "formed"),
    "nightfall": ("done",),
    "post": ("done",),
    "signal": ("off_target", "locked"),
}


def http_refusal(reply: dict) -> None:
    reason = reply.get("reason")
    if reason == "no_crew":
        raise ApiError(404, "no_crew", "Join a crew before working on the case.")
    if reason == "crew_not_active":
        if reply.get("crewStatus") == "forming":
            raise ApiError(409, "crew_not_started", "Your crew must sail before starting the case.")
        if reply.get("crewStatus") == "finished":
            raise ApiError(409, "crew_finished", "That crew has finished the case.")
        raise SupabaseRejected("The crew status could not be read.")
    if reason in ("not_in_crew", "seat_changed", "state_changed"):
        raise ApiError(409, "crew_busy", "Your crew changed. Try the request again.")


def refusal_answer(data: CaseData, kind: str, target: str | None, reply: dict) -> dict:
    reason = reply["reason"]
    answer = {"accepted": False, "reason": reason}
    timed = ("pair_cooldown", "wrong_pair", "dawn_wait", "aim_cooldown", "off_target")
    if reason in timed or "seconds" in reply:
        seconds = reply.get("seconds")
        if type(seconds) is not int or seconds < 0:
            raise SupabaseRejected("The case wait could not be read.")
        answer["seconds"] = seconds
    if reason in UI_MESSAGES:
        message = UI_MESSAGES[reason]
        if reason in ("dawn_wait", "aim_cooldown"):
            message = message.format(seconds=reply["seconds"])
        if reason == "light_not_ready" and target is not None:
            if data.light(target).ready.get("building") == "signal_station":
                message = UI_MESSAGES["station_not_ready"]
        answer["message"] = message
    elif reason in ("pair_cooldown", "not_pinned", "different_seats_required", "wrong_pair"):
        answer["message"] = board_refusal_message(data, reason, reply.get("seconds", 0))
    elif reason in ("deduction_required", "post_not_ready", "off_target"):
        key = {
            "deduction_required": "not_yet",
            "post_not_ready": "not_manned",
            "off_target": "off_target",
        }[reason]
        answer["message"] = data.night.lines[key]
    elif reason in ("schooner_required", "evidence_required", "accusation_cooldown"):
        key = {
            "schooner_required": "needs_schooner",
            "evidence_required": "needs_deductions",
            "accusation_cooldown": "wait",
        }[reason]
        seconds = reply.get("seconds", 0)
        answer["message"] = data.accusation.lines[key].format(seconds=seconds)
        if reason == "accusation_cooldown":
            answer["seconds"] = seconds
    elif kind == "search" and target is not None and reason in ("lead_locked", "locked_window"):
        route = data.route(target)
        if reason == "lead_locked":
            answer["message"] = data.card(route.card_id).closed_line or ""
        else:
            window = data.window(route.open_when)
            minute = reply.get("minute")
            if type(minute) is not int or minute < 0:
                raise SupabaseRejected("The refused search minute could not be read.")
            answer["minutes"] = minutes_until_open(window, minute)
            answer["message"] = window.closed_line.format(minutes=answer["minutes"])
    else:
        raise SupabaseRejected("The case refusal is not recognised.")
    return answer


def board_refusal_message(data: CaseData, reason: str, seconds: int) -> str:
    lines = data.board.lines
    if reason == "pair_cooldown":
        return lines["wait"].format(seconds=seconds)
    if reason == "wrong_pair":
        return f"{lines['wrong_pair']} {lines['wait'].format(seconds=seconds)}"
    return lines["same_seat" if reason == "different_seats_required" else "not_pinned"]


def phase2_answer(data, kind, targets, reply, player_id, snapshot):
    """Build only the current writer's extras; repeats use the smaller remembered shape."""
    status = reply["status"]
    if status in ("wrong_pair", "off_target"):
        return refusal_answer(
            data,
            kind,
            targets[0] if targets else None,
            {"reason": status, "seconds": reply["seconds"]},
        )
    answer = {"accepted": True, "reason": None}
    if kind == "pin" and status == "done":
        answer.update(message=UI_MESSAGES["pinned"], coinsPaid=reply["coinsPaid"])
    elif kind == "pair" and status == "formed":
        from server.game.case_board import deduction_for_pair
        from server.game.case_store import solve_payments

        deduction = deduction_for_pair(data, *targets)
        if deduction is None:
            raise SupabaseRejected("The formed deduction could not be read.")
        answer.update(
            message=deduction.finding,
            deduction={
                "id": deduction.id,
                "name": deduction.name,
                "finding": deduction.finding,
                "clearLine": deduction.clear_line,
                "opens": list(deduction.opens),
                "opensLine": deduction.opens_line,
            },
            coinsPaid=next(
                (row["paid"] for row in solve_payments(reply) if row["playerId"] == player_id), 0
            ),
        )
    elif kind == "nightfall" and status == "done":
        answer.update(message=data.night.lines["nightfall"], endsIn=data.night.night_minutes * 60)
    elif kind == "post" and status == "done":
        answer.update(
            message=data.night.lines["on_post"].format(light=data.light(targets[0]).name),
            onPostIn=data.night.climb_minutes * 60,
        )
    elif kind == "signal" and status == "locked":
        parted = reply["parted"]
        answer.update(
            message=data.night.lines["parted" if parted else "locked"],
            holdsFor=data.night.lock_seconds,
            parted=parted,
        )
        if parted:
            if snapshot is None:
                raise SupabaseRejected("The parted case could not be read.")
            held = {signal.light_id for signal in snapshot.signals if signal.parted}
            x, y = schooner_position(snapshot.crew_id, data.night.chart)
            answer.update(
                lights=[light.id for light in data.night.lights if light.id in held],
                target={"x": x, "y": y},
            )
    else:
        raise SupabaseRejected("The case intent result could not be read.")
    return answer


def repeat_answer(data: CaseData, action: dict) -> dict:
    outcome = action["outcome"]
    if outcome not in ACCEPTED_OUTCOMES and outcome not in REFUSAL_OUTCOMES:
        raise SupabaseRejected("The remembered case outcome is not recognised.")
    answer = {
        "accepted": outcome in ACCEPTED_OUTCOMES,
        "reason": REFUSAL_OUTCOMES.get(outcome),
        "repeat": True,
    }
    target = action.get("target")
    try:
        if action["kind"] == "search" and outcome == "started":
            route = data.route(target)
            answer["message"] = (
                route.found_line
                if route.timer_minutes == 0
                else UI_MESSAGES["started"].format(minutes=route.timer_minutes)
            )
        elif outcome == "wrong_suspect":
            line = data.suspect(target).refused_line
            if line is None:
                raise SupabaseRejected("The remembered accusation is not a refusal.")
            wait = data.accusation.lines["wait"].format(seconds=data.accusation.wrong_wait_seconds)
            answer["message"] = f"{line} {wait}"
        elif outcome == "moved":
            answer["message"] = "The case clock moved forward."
        elif outcome == "solved":
            answer["message"] = UI_MESSAGES["solved"]
        elif action["kind"] == "pin" and outcome == "pinned":
            answer["message"] = UI_MESSAGES["pinned"]
        elif action["kind"] == "pair" and outcome == "formed":
            answer["message"] = data.deduction(target).finding
        elif action["kind"] == "pair" and outcome == "wrong_pair":
            answer["message"] = board_refusal_message(
                data, "wrong_pair", data.board.wrong_pair_wait_seconds
            )
        elif action["kind"] == "nightfall" and outcome == "night":
            answer["message"] = data.night.lines["nightfall"]
        elif action["kind"] == "post" and outcome == "climbing":
            answer["message"] = data.night.lines["on_post"].format(light=data.light(target).name)
        elif action["kind"] == "signal" and outcome in ("locked", "parted", "off_target"):
            answer["message"] = data.night.lines[outcome]
        else:
            raise SupabaseRejected("That remembered intent is not available in this case phase.")
    except StopIteration:
        raise SupabaseRejected("The remembered case target could not be read.") from None
    return answer
