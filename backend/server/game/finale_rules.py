"""Pure night, post and signal decisions with current seat identity checks.

Used by: the case service, finale view and deterministic case planner.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.game.case_data import CaseData, Light
from server.game.case_messages import UI_MESSAGES
from server.game.case_snapshot import CaseSnapshot, Post, SeatState, Signal
from server.game.finale_geometry import bearing_to, normalize_bearing, on_target, schooner_position


@dataclass(frozen=True, repr=False)
class NightDecision:
    accepted: bool
    reason: str | None = None
    message: str = ""
    seconds: int = 0
    status: str = "refused"
    bearing: float | None = None
    on_target: bool | None = None


def night_phase(data: CaseData, snapshot: CaseSnapshot, now: int) -> str:
    if snapshot.schooner_found_second is not None:
        return "success"
    if snapshot.night_no == 0 or snapshot.night_started_second is None:
        return "waiting"
    end = snapshot.night_started_second + data.night.night_minutes * 60
    if now < end:
        return "night"
    if now < end + data.night.dawn_wait_minutes * 60:
        return "dawn"
    return "waiting"


def decide_nightfall(data: CaseData, snapshot: CaseSnapshot, now: int) -> NightDecision:
    if snapshot.schooner_found_second is not None:
        return NightDecision(False, "schooner_found", UI_MESSAGES["schooner_found"])
    formed = {item.deduction_id for item in snapshot.formed}
    if not set(data.night.opens_after).issubset(formed):
        return NightDecision(False, "deduction_required", data.night.lines["not_yet"])
    phase = night_phase(data, snapshot, now)
    if phase == "night":
        return NightDecision(False, "night_in_progress", UI_MESSAGES["night_in_progress"])
    if phase == "dawn":
        end = snapshot.night_started_second + data.night.night_minutes * 60
        wait = end + data.night.dawn_wait_minutes * 60 - now
        return NightDecision(
            False, "dawn_wait", UI_MESSAGES["dawn_wait"].format(seconds=wait), wait
        )
    return NightDecision(
        True,
        message=data.night.lines["nightfall"],
        seconds=data.night.night_minutes * 60,
        status="night",
    )


def valid_posts(snapshot: CaseSnapshot, now: int | None = None) -> tuple[Post, ...]:
    result = []
    for post in snapshot.posts:
        if post.ended_second is not None or (now is not None and post.taken_second > now):
            continue
        seat = next((seat for seat in snapshot.seats if seat.seat_no == post.seat_no), None)
        if seat is None:
            continue
        same_player = post.player_id is not None and post.player_id == seat.player_id
        same_partner = post.npc_id is not None and post.npc_id == seat.npc_id
        if same_player or same_partner:
            result.append(post)
    return tuple(result)


def light_is_ready(data: CaseData, snapshot: CaseSnapshot, light: Light) -> bool:
    if light.ready.get("from_start"):
        return True
    if light.ready.get("building") == "signal_station":
        players = {seat.player_id for seat in snapshot.seats if seat.player_id is not None}
        return bool(snapshot.station_players.intersection(players))
    return False


def decide_post(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, light_id: str, now: int
) -> NightDecision:
    if night_phase(data, snapshot, now) != "night":
        return NightDecision(False, "night_required", UI_MESSAGES["night_required"])
    light = next((light for light in data.night.lights if light.id == light_id), None)
    if light is None:
        raise ApiError(404, "no_such_light", "That light is not in the case.")
    if seat.player_id is None or not light_is_ready(data, snapshot, light):
        message = (
            UI_MESSAGES["station_not_ready"]
            if light.ready.get("building")
            else UI_MESSAGES["light_not_ready"]
        )
        return NightDecision(False, "light_not_ready", message)
    post = next((post for post in valid_posts(snapshot, now) if post.light_id == light_id), None)
    if post is not None:
        reason = "already_on_post" if post.seat_no == seat.seat_no else "post_taken"
        return NightDecision(False, reason, UI_MESSAGES[reason])
    return NightDecision(
        True,
        message=data.night.lines["on_post"].format(light=light.name),
        seconds=data.night.climb_minutes * 60,
        status="climbing",
    )


def signal_post(data: CaseData, snapshot: CaseSnapshot, light_id: str, now: int) -> Post | None:
    light = next((light for light in data.night.lights if light.id == light_id), None)
    if light is None:
        return None
    return next(
        (
            post
            for post in valid_posts(snapshot, now)
            if post.light_id == light_id
            and post.on_post_second <= now
            and (post.npc_id is None or light.partners_may_man)
        ),
        None,
    )


def decide_signal(
    data: CaseData, snapshot: CaseSnapshot, seat: SeatState, light_id: str, bearing: float, now: int
) -> NightDecision:
    if snapshot.schooner_found_second is not None:
        return NightDecision(False, "schooner_found", UI_MESSAGES["schooner_found"])
    if night_phase(data, snapshot, now) != "night":
        return NightDecision(False, "night_required", UI_MESSAGES["night_required"])
    post = signal_post(data, snapshot, light_id, now)
    if post is None:
        return NightDecision(False, "post_not_ready", data.night.lines["not_manned"])
    if post.player_id is not None and post.player_id != seat.player_id:
        return NightDecision(False, "post_not_owned", UI_MESSAGES["post_not_owned"])
    misses = [
        signal.case_second
        for signal in snapshot.signals
        if signal.night_no == snapshot.night_no
        and signal.light_id == light_id
        and not signal.on_target
        and signal.case_second <= now
    ]
    wait = max(
        0,
        max(misses, default=-data.night.relock_wait_seconds) + data.night.relock_wait_seconds - now,
    )
    if wait:
        return NightDecision(
            False, "aim_cooldown", UI_MESSAGES["aim_cooldown"].format(seconds=wait), wait
        )
    return aimed_decision(data, snapshot, light_id, bearing)


def aimed_decision(
    data: CaseData, snapshot: CaseSnapshot, light_id: str, bearing: float
) -> NightDecision:
    bearing = normalize_bearing(bearing)
    target = schooner_position(snapshot.crew_id, data.night.chart)
    true_bearing = bearing_to(data.light(light_id).chart_xy, target)
    aimed = on_target(bearing, true_bearing, data.night.tolerance_degrees)
    if not aimed:
        return NightDecision(
            False,
            "off_target",
            data.night.lines["off_target"],
            data.night.relock_wait_seconds,
            status="off_target",
            bearing=bearing,
            on_target=False,
        )
    return NightDecision(
        True,
        message=data.night.lines["locked"],
        seconds=data.night.lock_seconds,
        status="locked",
        bearing=bearing,
        on_target=True,
    )


def parting_locks(data: CaseData, snapshot: CaseSnapshot, now: int) -> tuple[Signal, ...]:
    if night_phase(data, snapshot, now) != "night":
        return ()
    latest = {}
    for signal in snapshot.signals:
        if not lock_is_valid(data, snapshot, signal, now):
            continue
        previous = latest.get(signal.light_id)
        if previous is None or (signal.case_second, signal.id) > (
            previous.case_second,
            previous.id,
        ):
            latest[signal.light_id] = signal
    locks = tuple(latest.values())
    if len(locks) < data.night.lights_needed:
        return ()
    if len({signal.post_seat_no for signal in locks}) < data.night.lights_needed:
        return ()
    return locks


def lock_is_valid(data: CaseData, snapshot: CaseSnapshot, signal: Signal, now: int) -> bool:
    if (
        signal.night_no != snapshot.night_no
        or not signal.on_target
        or signal.ended_second is not None
        or signal.case_second > now
        or signal.holds_until_second is None
        or signal.holds_until_second <= now
    ):
        return False
    post = signal_post(data, snapshot, signal.light_id, now)
    return (
        post is not None
        and post.seat_no == signal.post_seat_no
        and post.taken_second <= signal.case_second
    )
