"""Build the earned public night view from a validated crew snapshot.

Used by: case_view.py. Exact schooner coordinates are sent only after the fog parts.
"""

from server.game.case_data import CaseData, Light
from server.game.case_snapshot import CaseSnapshot, Post, Signal
from server.game.finale_geometry import glow_position, schooner_position
from server.game.finale_rules import active_locks, decide_nightfall, live_post, night_phase


def post_view(state: CaseSnapshot, post: Post | None, now: int) -> dict | None:
    if post is None:
        return None
    seat = next(seat for seat in state.seats if seat.seat_no == post.seat_no)
    return {
        "seat": post.seat_no,
        "label": seat.name,
        "holder": "player" if post.player_id is not None else "partner",
        "onPost": post.on_post_second <= now,
        "remaining": max(0, post.on_post_second - now),
    }


def light_view(
    data: CaseData, state: CaseSnapshot, light: Light, viewer: str, now: int, phase: str
) -> dict:
    post = live_post(state, light.id)
    signals = [
        signal
        for signal in state.signals
        if signal.light_id == light.id and signal.night_no == state.night_no
    ]
    last = max(signals, key=lambda signal: (signal.case_second, signal.id), default=None)
    lock = (
        max(
            (signal for signal in active_locks(state, now) if signal.light_id == light.id),
            key=lambda signal: (signal.case_second, signal.id),
            default=None,
        )
        if phase == "night"
        else None
    )
    ready = light.id != "islet_signal_station" or state.station_ready
    player = state.seat_for_player(viewer)
    playing = phase == "night" and state.status == "active" and player is not None
    misses = [signal.case_second for signal in signals if not signal.on_target]
    aim_ready = (
        now >= max(misses, default=-data.night.relock_wait_seconds) + data.night.relock_wait_seconds
    )
    return {
        "id": light.id,
        "name": light.name,
        "x": light.chart_xy[0],
        "y": light.chart_xy[1],
        "ready": ready,
        "partnersMayMan": light.partners_may_man,
        "post": post_view(state, post, now),
        "lock": lock_view(lock, now),
        "lastBearing": None if last is None else last.bearing,
        "canTake": playing and ready and post is None,
        "canAim": playing
        and aim_ready
        and post is not None
        and post.on_post_second <= now
        and (post.player_id is None or post.player_id == viewer),
    }


def lock_view(signal: Signal | None, now: int) -> dict | None:
    if signal is None:
        return None
    return {"remaining": signal.holds_until_second - now, "aimedBySeat": signal.aimed_seat_no}


def parted_view(data: CaseData, state: CaseSnapshot) -> dict | None:
    if state.schooner_found_second is None:
        return None
    target = schooner_position(state.crew_id, data.night.chart)
    lights = {signal.light_id for signal in state.signals if signal.parted}
    return {
        "second": state.schooner_found_second,
        "lights": [light.id for light in data.active_lights if light.id in lights],
        "target": {"x": target[0], "y": target[1]},
    }


def phase_status(data: CaseData, state: CaseSnapshot, phase: str, now: int) -> str:
    if phase == "night":
        return data.night.lines["nightfall"]
    if phase == "dawn":
        return data.night.lines["dawn"]
    if phase == "success":
        return data.night.lines["parted"]
    decision = decide_nightfall(data, state, now)
    return "Your crew can call nightfall." if decision.accepted else decision.message


def build_finale_view(data: CaseData, state: CaseSnapshot, viewer: str, now: int) -> dict:
    phase = night_phase(data, state, now)
    ends = (state.night_started_second or 0) + data.night.night_minutes * 60
    glow = glow_position(state.crew_id, data.night.chart) if phase == "night" else None
    return {
        "phase": phase,
        "nightNo": state.night_no,
        "canCall": state.status == "active"
        and state.seat_for_player(viewer) is not None
        and decide_nightfall(data, state, now).accepted,
        "remaining": max(0, ends - now) if phase == "night" else 0,
        "dawnRemaining": max(0, ends + data.night.dawn_wait_minutes * 60 - now)
        if phase == "dawn"
        else 0,
        "status": phase_status(data, state, phase, now),
        "glow": None if glow is None else {"x": glow[0], "y": glow[1]},
        "parted": parted_view(data, state),
        "lights": [
            light_view(data, state, light, viewer, now, phase) for light in data.active_lights
        ],
    }
