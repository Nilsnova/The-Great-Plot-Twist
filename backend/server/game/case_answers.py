"""Rebuild remembered case answers and map database refusals without changing their outcome.

Used by: case_service.py. Repeats contain the fresh view but omit unstored extra numbers.
"""

from server.errors import ApiError
from server.game.case_clock import minutes_until_open
from server.game.case_data import CaseData
from server.game.case_messages import UI_MESSAGES
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
    if reason in UI_MESSAGES:
        answer["message"] = UI_MESSAGES[reason]
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
        else:
            raise SupabaseRejected("That remembered intent is not available in this case phase.")
    except StopIteration:
        raise SupabaseRejected("The remembered case target could not be read.") from None
    return answer
