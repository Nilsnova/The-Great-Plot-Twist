"""Build a crew's earned case view without revealing unearned cards or the solution.

Used by: CaseService for reads and intent replies. All timestamps are integer case seconds.
"""

from datetime import UTC

from server.game.case_data import Card, CaseData, Route
from server.game.case_reveal import reveal_lines
from server.game.case_routes import card_is_open, decide_route
from server.game.case_snapshot import CaseSnapshot, Find, SeatState
from server.game.finale_view import credits_view, finale_view

CLOCK_KEYS = frozenset(
    {
        "now",
        "minute",
        "remaining",
        "dawnRemaining",
        "cooldown",
        "pairWait",
        "waitMinutes",
        "statusText",
    }
)


def holds(find: Find, now: int) -> bool:
    """A find grants its card only when its ready second has arrived."""
    return find.ready_second <= now


def _seat_label(snapshot: CaseSnapshot, seat_no: int) -> str:
    return next(
        (seat.name for seat in snapshot.seats if seat.seat_no == seat_no), f"Seat {seat_no}"
    )


def _seats(data: CaseData, snapshot: CaseSnapshot, viewer: str) -> list[dict]:
    return [
        {
            "seatNo": seat.seat_no,
            "holder": "player" if seat.player_id is not None else "partner",
            "name": seat.name,
            "kit": seat.kit,
            "kitName": data.kit(seat.kit).name,
            "isMe": seat.player_id == viewer,
        }
        for seat in sorted(snapshot.seats, key=lambda item: item.seat_no)
    ]


def _card_pins(snapshot: CaseSnapshot, card_id: str, now: int) -> list[dict]:
    return [
        {
            "seat": pin.seat_no,
            "label": _seat_label(snapshot, pin.seat_no),
            "byPartner": pin.by_partner,
        }
        for pin in snapshot.pins
        if pin.card_id == card_id and pin.pinned_second <= now
    ]


def _card_view(data: CaseData, snapshot: CaseSnapshot, card: Card, me: SeatState, now: int) -> dict:
    found = sorted(
        (find for find in snapshot.finds if find.card_id == card.id and holds(find, now)),
        key=lambda find: (find.ready_second, find.seat_no),
    )
    first = found[0]
    pinned = _card_pins(snapshot, card.id, now)
    used = any(card.id in data.deduction(row.deduction_id).cards for row in snapshot.formed)
    my_pin = any(pin.card_id == card.id and pin.seat_no == me.seat_no for pin in snapshot.pins)
    route = data.route(first.route_id)
    return {
        "id": card.id,
        "title": card.title,
        "text": card.text,
        "state": "used" if used else "pinned" if pinned else "new",
        "holders": [
            {"seat": find.seat_no, "label": _seat_label(snapshot, find.seat_no)} for find in found
        ],
        "pinnedBy": pinned,
        "foundLine": route.found_line,
        "foundSecond": first.ready_second,
        "routeId": route.id,
        "hotspot": f"{route.place}.{route.hotspot}",
        "canPin": snapshot.status == "active"
        and not my_pin
        and any(find.seat_no == me.seat_no for find in found),
    }


def _deductions(data: CaseData, snapshot: CaseSnapshot) -> list[dict]:
    formed = {row.deduction_id for row in snapshot.formed}
    result = []
    for deduction in data.deductions:
        row = {"id": deduction.id, "name": deduction.name, "complete": deduction.id in formed}
        if row["complete"]:
            row.update(
                {
                    "cards": list(deduction.cards),
                    "finding": deduction.finding,
                    "clears": deduction.clears,
                    "clearLine": deduction.clear_line,
                    "opens": list(deduction.opens),
                    "opensLine": deduction.opens_line,
                }
            )
        result.append(row)
    return result


def _suspects(data: CaseData, snapshot: CaseSnapshot) -> list[dict]:
    cleared = {
        data.deduction(row.deduction_id).clears: row.deduction_id
        for row in snapshot.formed
        if data.deduction(row.deduction_id).clears is not None
    }
    return [
        {
            "id": suspect.id,
            "title": suspect.title,
            "cleared": suspect.id in cleared,
            "clearedBy": cleared.get(suspect.id),
        }
        for suspect in data.suspects
    ]


def _board(data: CaseData, snapshot: CaseSnapshot, me: SeatState, now: int) -> dict:
    held = {find.card_id for find in snapshot.finds if holds(find, now)}
    formed = {row.deduction_id for row in snapshot.formed}
    wait = max(0, snapshot.pair_wait_until - now)
    return {
        "cards": [
            _card_view(data, snapshot, card, me, now) for card in data.cards if card.id in held
        ],
        "leads": [
            {"cardId": card.id, "title": card.title, "lead": card.lead}
            for card in data.cards
            if card.id not in held and card_is_open(card, formed)
        ],
        "logLead": data.raw["log_card"]["board_lead"] if me.read_log else None,
        "deductions": _deductions(data, snapshot),
        "suspects": _suspects(data, snapshot),
        "canPair": snapshot.status == "active" and wait == 0,
        "pairWait": wait,
    }


def _route_view(
    data: CaseData, snapshot: CaseSnapshot, me: SeatState, route: Route, now: int
) -> dict:
    decision = decide_route(data, snapshot, me, route.id, now)
    return {
        "id": route.id,
        "kind": route.kind,
        "cardId": route.card_id,
        "title": data.card(route.card_id).title,
        "label": route.label or data.card(route.card_id).title,
        "timerSeconds": route.timer_minutes * 60,
        "price": route.coins,
        "kitName": data.kit(route.kit).name if route.kit else None,
        "canStart": snapshot.status == "active" and decision.accepted,
        "reason": decision.reason,
        # Eligibility is not a completed find. Discovery prose belongs after a write or landing.
        "statusText": "Ready to search." if decision.accepted else decision.message,
        "waitMinutes": decision.minutes or 0,
    }


def _spots(data: CaseData, snapshot: CaseSnapshot, me: SeatState, now: int) -> list[dict]:
    formed = {row.deduction_id for row in snapshot.formed}
    grouped: dict[str, dict] = {}
    for route in data.active_routes:
        if route.starts_in_journal:
            continue
        hotspot = f"{route.place}.{route.hotspot}"
        spot = grouped.setdefault(hotspot, {"hotspot": hotspot, "place": route.place})
        card = data.card(route.card_id)
        if card_is_open(card, formed):
            spot.setdefault("routes", []).append(_route_view(data, snapshot, me, route, now))
        else:
            spot["closedLine"] = card.closed_line
    for line in data.raw.get("continuity_lines", ()):
        hotspot = f"{line['place']}.{line['hotspot']}"
        spot = grouped.setdefault(hotspot, {"hotspot": hotspot, "place": line["place"]})
        spot["line"] = line["text"]
    return list(grouped.values())


def _jobs(data: CaseData, snapshot: CaseSnapshot, me: SeatState, now: int) -> list[dict]:
    result = []
    for find in snapshot.finds:
        if find.seat_no != me.seat_no or now >= find.ready_second + 600:
            continue
        done = holds(find, now)
        result.append(
            {
                "routeId": find.route_id,
                "cardId": find.card_id,
                "title": data.card(find.card_id).title,
                "total": find.ready_second - find.started_second,
                "remaining": max(0, find.ready_second - now),
                "done": done,
                "foundLine": data.route(find.route_id).found_line if done else None,
            }
        )
    return result


def _last_wrong(data: CaseData, snapshot: CaseSnapshot) -> dict | None:
    wrong = [row for row in snapshot.accusations if not row.correct]
    if not wrong:
        return None
    accusation = max(wrong, key=lambda row: (row.case_second, row.id))
    suspect = data.suspect(accusation.suspect)
    return {
        "suspect": suspect.id,
        "title": suspect.title,
        "line": suspect.refused_line,
        "second": accusation.case_second,
    }


def _accusation(data: CaseData, snapshot: CaseSnapshot, now: int) -> dict:
    found = snapshot.schooner_found_second is not None
    formed = {row.deduction_id for row in snapshot.formed}
    evidence = [
        data.deduction(value) for value in data.accusation.needs_deductions if value in formed
    ]
    cooldown = max(0, snapshot.accuse_wait_until - now)
    allowed = found and len(evidence) == len(data.accusation.needs_deductions) and cooldown == 0
    if not found:
        status = data.accusation.lines["needs_schooner"]
    elif len(evidence) != len(data.accusation.needs_deductions):
        status = data.accusation.lines["needs_deductions"]
    elif cooldown:
        status = data.accusation.lines["wait"]
    else:
        status = data.accusation.lines["aboard"]
    return {
        "schoonerFound": found,
        "allowed": allowed and snapshot.status == "active",
        "cooldown": cooldown,
        "status": status,
        "suspects": [
            {key: row[key] for key in ("id", "title", "cleared")}
            for row in _suspects(data, snapshot)
        ],
        "evidence": [{"id": row.id, "name": row.name} for row in evidence],
        "lastWrong": _last_wrong(data, snapshot),
    }


def _reveal(data: CaseData, snapshot: CaseSnapshot, me: SeatState) -> dict:
    solver = next((row for row in snapshot.solvers if row.player_id == me.player_id), None)
    if solver is None:
        return {"available": False}
    return {
        "available": True,
        "solvedSecond": solver.solved_second,
        "world": snapshot.world_outcome or "unchanged",
        "lines": reveal_lines(data, solver.kit, me.read_log),
        "credits": [
            {
                "seat": row.seat_no,
                "name": _seat_label(snapshot, row.seat_no),
                "share": row.share,
                "paid": row.share_paid,
            }
            for row in sorted(snapshot.solvers, key=lambda row: row.seat_no)
        ],
    }


def build_case_view(data: CaseData, snapshot: CaseSnapshot, viewer: str, now: int) -> dict | None:
    """Return only this crew's earned content, or no case for an unstarted visitor."""
    me = next((seat for seat in snapshot.seats if seat.player_id == viewer), None)
    if snapshot.status == "forming" or me is None:
        return None
    return {
        "caseId": data.case_id,
        "writeRevision": snapshot.write_revision,
        "now": now,
        "minute": now // 60,
        "crew": {
            "id": snapshot.crew_id,
            "status": snapshot.status,
            "mode": snapshot.mode,
            "mySeat": me.seat_no,
            "startedAt": snapshot.started_at.astimezone(UTC)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
        },
        "seats": _seats(data, snapshot, viewer),
        "me": {
            "seatNo": me.seat_no,
            "kit": me.kit,
            "readLog": me.read_log,
            "coins": snapshot.coins,
            "timber": snapshot.timber,
        },
        "premise": data.raw["premise"],
        "question": data.raw["question"],
        "board": _board(data, snapshot, me, now),
        "search": {
            "spots": _spots(data, snapshot, me, now),
            "jobs": _jobs(data, snapshot, me, now),
        },
        "accusation": _accusation(data, snapshot, now),
        "reveal": _reveal(data, snapshot, me),
        "credits": credits_view(data, snapshot, viewer),
        "finale": finale_view(data, snapshot, me, now),
        "partners": [],
    }
