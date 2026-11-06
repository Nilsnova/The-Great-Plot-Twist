"""Pure night timing, post ownership and overlapping-light decisions."""

from server.errors import ApiError
from server.game.case_data import CaseData, Light
from server.game.case_decisions import IntentDecision
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot, Post, SeatState, Signal
from server.game.finale_geometry import bearing_to, normalize_bearing, on_target, schooner_position


def night_phase(data: CaseData, state: CaseSnapshot, now: int) -> str:
    if state.schooner_found_second is not None:
        return "success"
    if state.night_started_second is None:
        return "waiting"
    end = state.night_started_second + data.night.night_minutes * 60
    if now < end:
        return "night"
    return "dawn" if now < end + data.night.dawn_wait_minutes * 60 else "waiting"


def decide_nightfall(data: CaseData, state: CaseSnapshot, now: int) -> IntentDecision:
    if state.schooner_found_second is not None:
        return IntentDecision(False, "schooner_found", UI_MESSAGES["schooner_found"])
    if not set(data.night.opens_after).issubset(item.deduction_id for item in state.formed):
        return IntentDecision(False, "deduction_required", data.night.lines["not_yet"])
    phase = night_phase(data, state, now)
    if phase == "night":
        return IntentDecision(False, "night_in_progress", UI_MESSAGES["night_in_progress"])
    if phase == "dawn":
        wait = (
            state.night_started_second
            + (data.night.night_minutes + data.night.dawn_wait_minutes) * 60
            - now
        )
        return IntentDecision(
            False, "dawn_wait", UI_MESSAGES["dawn_wait"].format(seconds=wait), wait
        )
    return IntentDecision(True, message=data.night.lines["nightfall"])


def light_for(data: CaseData, light_id: str) -> Light:
    light = next((light for light in data.active_lights if light.id == light_id), None)
    if light is None:
        raise ApiError(404, "no_such_light", "That light is not available.")
    return light


def post_holds(state: CaseSnapshot, post: Post) -> bool:
    seat = next((seat for seat in state.seats if seat.seat_no == post.seat_no), None)
    return (
        post.ended_second is None
        and seat is not None
        and (
            (post.player_id is not None and post.player_id == seat.player_id)
            or (post.npc_id is not None and post.npc_id == seat.npc_id)
        )
    )


def live_post(state: CaseSnapshot, light_id: str) -> Post | None:
    return next(
        (post for post in state.posts if post.light_id == light_id and post_holds(state, post)),
        None,
    )


def decide_post(
    data: CaseData,
    state: CaseSnapshot,
    seat: SeatState,
    light_id: str,
    now: int,
    *,
    station_ready: bool = False,
) -> IntentDecision:
    if night_phase(data, state, now) != "night":
        return IntentDecision(False, "night_required", UI_MESSAGES["night_required"])
    light = light_for(data, light_id)
    if (light.id == "islet_signal_station" and not station_ready) or (
        seat.npc_id is not None and not light.partners_may_man
    ):
        return IntentDecision(False, "light_not_ready", UI_MESSAGES["light_not_ready"])
    post = live_post(state, light_id)
    if post is not None:
        reason = "already_on_post" if post.seat_no == seat.seat_no else "post_taken"
        return IntentDecision(False, reason, UI_MESSAGES[reason])
    return IntentDecision(True, message=data.night.lines["on_post"].format(light=light.name))


def decide_signal(
    data: CaseData, state: CaseSnapshot, seat: SeatState, light_id: str, bearing: float, now: int
) -> IntentDecision:
    if state.schooner_found_second is not None:
        return IntentDecision(False, "schooner_found", UI_MESSAGES["schooner_found"])
    if night_phase(data, state, now) != "night":
        return IntentDecision(False, "night_required", UI_MESSAGES["night_required"])
    light = light_for(data, light_id)
    post = live_post(state, light_id)
    if post is None or post.on_post_second > now:
        return IntentDecision(False, "post_not_ready", data.night.lines["not_manned"])
    if post.player_id is not None and post.player_id != seat.player_id:
        return IntentDecision(False, "post_not_owned", UI_MESSAGES["post_not_owned"])
    misses = [
        signal.case_second
        for signal in state.signals
        if signal.night_no == state.night_no
        and signal.light_id == light_id
        and not signal.on_target
    ]
    wait = (
        max(misses, default=-data.night.relock_wait_seconds) + data.night.relock_wait_seconds - now
    )
    if wait > 0:
        return IntentDecision(
            False, "aim_cooldown", UI_MESSAGES["aim_cooldown"].format(seconds=wait), wait
        )
    target = schooner_position(state.crew_id, data.night.chart)
    if not on_target(
        normalize_bearing(bearing), bearing_to(light.chart_xy, target), data.night.tolerance_degrees
    ):
        return IntentDecision(
            False, "off_target", data.night.lines["off_target"], data.night.relock_wait_seconds
        )
    return IntentDecision(True, message=data.night.lines["locked"])


def active_locks(state: CaseSnapshot, now: int) -> tuple[Signal, ...]:
    return tuple(
        signal
        for signal in state.signals
        if signal.night_no == state.night_no
        and signal.on_target
        and signal.ended_second is None
        and signal.holds_until_second is not None
        and signal.holds_until_second > now
        and (post := live_post(state, signal.light_id)) is not None
        and post.seat_no == signal.post_seat_no
        and post.on_post_second <= now
    )


def parting_locks(data: CaseData, state: CaseSnapshot, now: int) -> tuple[Signal, ...]:
    locks = active_locks(state, now)
    needed = data.night.lights_needed
    if (
        len({signal.post_seat_no for signal in locks}) < needed
        or len({signal.light_id for signal in locks}) < needed
    ):
        return ()
    return locks
