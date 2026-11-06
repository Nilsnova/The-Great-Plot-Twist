"""Build night controls and contribution credits without exposing an unearned target.

Used by: the earned case view. Pure rules decide post ownership and light eligibility.
"""

from server.game.case_board import deduction_parts
from server.game.case_data import CaseData, Light
from server.game.case_rewards import solve_shares
from server.game.case_snapshot import CaseSnapshot, SeatState
from server.game.finale_geometry import glow_position, schooner_position
from server.game.finale_rules import (
    decide_nightfall,
    decide_post,
    decide_signal,
    light_is_ready,
    lock_is_valid,
    night_phase,
    valid_posts,
)


def _point(position: tuple[float, float]) -> dict:
    return {"x": position[0], "y": position[1]}


def _post(snapshot: CaseSnapshot, light: Light, now: int) -> dict | None:
    post = next((row for row in valid_posts(snapshot, now) if row.light_id == light.id), None)
    if post is None or (post.npc_id is not None and not light.partners_may_man):
        return None
    seat = next(seat for seat in snapshot.seats if seat.seat_no == post.seat_no)
    return {
        "seat": post.seat_no,
        "label": seat.name,
        "holder": "player" if post.player_id is not None else "partner",
        "onPost": post.on_post_second <= now,
        "remaining": max(0, post.on_post_second - now),
    }


def _last_bearing(snapshot: CaseSnapshot, light_id: str, now: int) -> float:
    signals = [
        row
        for row in snapshot.signals
        if row.light_id == light_id and row.night_no == snapshot.night_no and row.case_second <= now
    ]
    latest = max(signals, key=lambda row: (row.case_second, row.id), default=None)
    return latest.bearing if latest is not None else 0


def _lock(data: CaseData, snapshot: CaseSnapshot, light_id: str, now: int) -> dict | None:
    if night_phase(data, snapshot, now) not in ("night", "success"):
        return None
    locks = [
        row
        for row in snapshot.signals
        if row.light_id == light_id and lock_is_valid(data, snapshot, row, now)
    ]
    latest = max(locks, key=lambda row: (row.case_second, row.id), default=None)
    if latest is None:
        return None
    return {"remaining": latest.holds_until_second - now, "aimedBySeat": latest.aimed_seat_no}


def _light_view(
    data: CaseData, snapshot: CaseSnapshot, me: SeatState, light: Light, now: int
) -> dict:
    aim = decide_signal(data, snapshot, me, light.id, 0, now)
    active = snapshot.status == "active"
    return {
        "id": light.id,
        "name": light.name,
        **_point(light.chart_xy),
        "ready": light_is_ready(data, snapshot, light),
        "partnersMayMan": light.partners_may_man,
        "post": _post(snapshot, light, now),
        "lock": _lock(data, snapshot, light.id, now),
        "lastBearing": _last_bearing(snapshot, light.id, now),
        "canTake": active and decide_post(data, snapshot, me, light.id, now).accepted,
        "canAim": active and (aim.accepted or aim.reason == "off_target"),
    }


def _parted(data: CaseData, snapshot: CaseSnapshot) -> dict | None:
    if snapshot.schooner_found_second is None:
        return None
    lights = {row.light_id for row in snapshot.signals if row.parted}
    return {
        "second": snapshot.schooner_found_second,
        "lights": [light.id for light in data.night.lights if light.id in lights],
        "target": _point(schooner_position(snapshot.crew_id, data.night.chart)),
    }


def finale_view(data: CaseData, snapshot: CaseSnapshot, me: SeatState, now: int) -> dict:
    phase = night_phase(data, snapshot, now)
    end = (snapshot.night_started_second or 0) + data.night.night_minutes * 60
    can_call = snapshot.status == "active" and decide_nightfall(data, snapshot, now).accepted
    statuses = {
        "waiting": "Call nightfall to begin the search."
        if can_call
        else data.night.lines["not_yet"],
        "night": "Aim toward the glow. Lock three lights from three seats at once.",
        "dawn": data.night.lines["dawn"],
        "success": data.night.lines["parted"],
    }
    return {
        "phase": phase,
        "nightNo": snapshot.night_no,
        "canCall": can_call,
        "remaining": max(0, end - now) if phase == "night" else 0,
        "dawnRemaining": end + data.night.dawn_wait_minutes * 60 - now if phase == "dawn" else 0,
        "status": statuses[phase],
        "glow": _point(glow_position(snapshot.crew_id, data.night.chart))
        if phase == "night"
        else None,
        "parted": _parted(data, snapshot),
        "lights": [
            _light_view(data, snapshot, me, light, now)
            for light in data.night.lights
            if light.tier == "must"
        ],
    }


def credits_view(data: CaseData, snapshot: CaseSnapshot, viewer: str) -> list[dict]:
    solvers = {row.player_id: row for row in snapshot.solvers}
    seats = {seat.seat_no: seat for seat in snapshot.seats}
    result = []
    for payout in solve_shares(data, snapshot):
        solver = solvers.get(payout.player_id)
        result.append(
            {
                "seat": payout.seat_no,
                "name": seats[payout.seat_no].name,
                "isMe": payout.player_id == viewer,
                "pins": payout.pins,
                "deductionParts": len(deduction_parts(data, snapshot, payout.player_id)),
                "locks": sum(
                    row.on_target and row.aimed_by == payout.player_id for row in snapshot.signals
                ),
                "accused": any(
                    row.correct and row.player_id == payout.player_id
                    for row in snapshot.accusations
                ),
                "share": solver.share if solver else None,
                "paid": solver.share_paid if solver else None,
            }
        )
    return result
