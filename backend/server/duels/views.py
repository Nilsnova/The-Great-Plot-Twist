"""Duel views: what one captain may see of one duel. This file is the ONLY place that decides it.

Pure Python: no network, no database. The service reads the rows and the envelopes it is allowed
to read and hands them to the functions below. They build the JSON-ready dictionaries that the
routes send (the exact keys of specs/A7-lantern-duels.md, sections 8.2 and 8.3).

Sealed means sealed. A captain's signals reach the other captain only after BOTH envelopes are
in, and only as part of the reveal of a finished duel. So:
  * can_see() says who may look at a duel at all: the two captains, and anyone while an open
    challenge is still open. A named duel is hidden from every other captain, and so is an
    answered or closed open challenge.
  * A view refuses (raises ViewRefused) to be built for someone who may not see the duel, and
    when it is handed the other captain's signals for a duel that is not finished. Even a bug in
    the service cannot leak a sealed signal through here. It fails closed instead.
  * Nothing is derived from a sealed envelope: no oil spent, no count of signals and no time. The
    summary of a duel carries no signal at all. Only the detail has "yourSignals", the viewer's own
    signals, and "reveal", which exists once the duel is finished.

Used by: service.py and the tests.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from server.duels import rules
from server.duels.store import DuelRow

VISITOR = "visitor"  # someone looking at an open challenge that is not theirs

# Shown when the name of the challenger cannot be found (their profile was deleted a moment ago).
UNKNOWN_CAPTAIN = "A captain who has left"


class ViewRefused(ValueError):
    """A view that would show a captain something they must not see. It is a bug, never a 4xx."""


@dataclass(frozen=True)
class MyDuels:
    """A captain's own duels, split into the three lists of GET /api/duels."""

    incoming: list[DuelRow]  # named challenges to me, still open and not expired
    yours: list[DuelRow]  # my challenges that are still waiting
    recent: list[DuelRow]  # my duels that ended, newest first


def role_of(duel: DuelRow, viewer_id: str) -> str:
    """challenger, opponent (named, or the one who answered), or visitor."""
    if viewer_id == duel.challenger_id:
        return rules.CHALLENGER
    if viewer_id == duel.opponent_id:
        return rules.OPPONENT
    return VISITOR


def other_role(role: str) -> str:
    return rules.OPPONENT if role == rules.CHALLENGER else rules.CHALLENGER


def can_see(duel: DuelRow, viewer_id: str) -> bool:
    """The two captains may always look. Anyone else only while an open challenge is still open."""
    if role_of(duel, viewer_id) != VISITOR:
        return True
    return duel.is_open and duel.status == rules.OPEN


def window_has_passed(duel: DuelRow, now: datetime) -> bool:
    """True once the answer window is over. The database agrees: expires_at <= now()."""
    return now >= duel.expires_at


def whole_seconds(moment: datetime | None) -> datetime | None:
    """A time in UTC without microseconds, so the JSON reads 2026-11-06T10:00:00Z."""
    return None if moment is None else moment.astimezone(UTC).replace(microsecond=0)


def score_of(duel: DuelRow, role: str) -> dict[str, int] | None:
    """Finished only: the rounds I took against the rounds the other captain took."""
    if duel.status != rules.FINISHED or duel.round_results is None or role == VISITOR:
        return None
    return {
        "you": duel.round_results.count(role),
        "them": duel.round_results.count(other_role(role)),
    }


def result_of(duel: DuelRow, role: str) -> str | None:
    """Finished only: won, lost or draw."""
    if duel.status != rules.FINISHED or duel.outcome is None or role == VISITOR:
        return None
    if duel.outcome == rules.DRAW:
        return "draw"
    return "won" if duel.outcome == role else "lost"


def coins_change_of(duel: DuelRow, role: str) -> int | None:
    """My net coins from the duel once it ended. None while it is open (or for a visitor)."""
    if role == VISITOR or duel.status == rules.OPEN:
        return None
    if duel.status != rules.FINISHED or duel.outcome is None:
        return 0  # withdrawn, declined or expired: the challenger's stake came back
    return rules.coins_change(duel.stake, duel.cut_percent, duel.outcome, role)


def held_stake_of(duel: DuelRow, role: str) -> int:
    """My coins held in this duel right now: only the challenger of a waiting duel has any."""
    return duel.stake if role == rules.CHALLENGER and duel.status == rules.OPEN else 0


def buttons_of(duel: DuelRow, role: str, now: datetime) -> tuple[bool, bool, bool]:
    """(canAnswer, canWithdraw, canDecline). The server checks again when a button is pressed.

    Nobody can answer or decline once the answer window has passed. The challenger can still
    withdraw a challenge that is waiting, which gives the stake back.
    """
    is_waiting = duel.status == rules.OPEN
    in_window = is_waiting and not window_has_passed(duel, now)
    can_answer = in_window and role != rules.CHALLENGER and (duel.is_open or role == rules.OPPONENT)
    can_withdraw = is_waiting and role == rules.CHALLENGER
    can_decline = in_window and role == rules.OPPONENT and not duel.is_open
    return can_answer, can_withdraw, can_decline


def summary(
    duel: DuelRow, viewer_id: str, names: Mapping[str, str], now: datetime
) -> dict[str, Any]:
    """One duel in a list, from the point of view of `viewer_id`. It never carries a signal."""
    if not can_see(duel, viewer_id):
        raise ViewRefused("This captain may not see this duel.")
    role = role_of(duel, viewer_id)
    can_answer, can_withdraw, can_decline = buttons_of(duel, role, now)
    opponent_name = None if duel.opponent_id is None else names.get(duel.opponent_id)
    return {
        "id": duel.id,
        "status": duel.status,
        "isOpen": duel.is_open,
        "you": role,
        "challengerName": names.get(duel.challenger_id, UNKNOWN_CAPTAIN),
        "opponentName": opponent_name,
        "rounds": duel.rounds,
        "oil": rules.oil_for(duel.rounds),
        "stake": duel.stake,
        "cutPercent": duel.cut_percent,
        "winnerTakes": rules.winner_takes(duel.stake, duel.cut_percent),
        "createdAt": whole_seconds(duel.created_at),
        "expiresAt": whole_seconds(duel.expires_at),
        "closedAt": whole_seconds(duel.closed_at),
        "score": score_of(duel, role),
        "yourResult": result_of(duel, role),
        "coinsChange": coins_change_of(duel, role),
        "heldStake": held_stake_of(duel, role),
        "canAnswer": can_answer,
        "canWithdraw": can_withdraw,
        "canDecline": can_decline,
    }


def signal_in_round(signals: Sequence[str] | None, round_number: int) -> str | None:
    """The signal sealed for a round (counted from 1), or None if there is none."""
    if not signals or len(signals) < round_number:
        return None
    return signals[round_number - 1]


def point_for(round_result: str, role: str) -> str:
    """One round's result from my side: you, them or even."""
    if round_result == rules.EVEN:
        return "even"
    return "you" if round_result == role else "them"


def reveal_of(
    duel: DuelRow,
    role: str,
    own_signals: Sequence[str] | None,
    other_signals: Sequence[str] | None,
) -> list[dict[str, Any]] | None:
    """The opened envelopes, one entry per round from my side. None unless the duel is finished."""
    if duel.status != rules.FINISHED or duel.round_results is None or role == VISITOR:
        return None
    return [
        {
            "round": round_number,
            "yours": signal_in_round(own_signals, round_number),
            "theirs": signal_in_round(other_signals, round_number),
            "point": point_for(round_result, role),
        }
        for round_number, round_result in enumerate(duel.round_results, start=1)
    ]


def check_signals_may_be_shown(
    duel: DuelRow,
    role: str,
    own_signals: Sequence[str] | None,
    other_signals: Sequence[str] | None,
) -> None:
    """Refuse (fail closed) to show signals that nobody may see yet."""
    if other_signals and duel.status != rules.FINISHED:
        raise ViewRefused("The other captain's signals are sealed until the duel is finished.")
    if role == VISITOR and (own_signals or other_signals):
        raise ViewRefused("A visitor has no signals to see.")


def detail(
    duel: DuelRow,
    viewer_id: str,
    names: Mapping[str, str],
    now: datetime,
    own_signals: Sequence[str] | None,
    other_signals: Sequence[str] | None,
) -> dict[str, Any]:
    """One duel in full: the summary plus my own signals and, once finished, the reveal.

    `own_signals` are the viewer's own sealed signals (None if they sealed none). `other_signals`
    are the other captain's, and may be handed in ONLY for a finished duel (None if that captain
    has left).
    """
    view = summary(duel, viewer_id, names, now)
    role = role_of(duel, viewer_id)
    check_signals_may_be_shown(duel, role, own_signals, other_signals)
    view["yourSignals"] = list(own_signals) if own_signals else None
    view["reveal"] = reveal_of(duel, role, own_signals, other_signals)
    return view


def split_my_duels(duels: Sequence[DuelRow], viewer_id: str, now: datetime) -> MyDuels:
    """Split the duels a captain takes part in into incoming, yours and recent (each short)."""
    incoming = [
        duel
        for duel in duels
        if duel.status == rules.OPEN
        and not duel.is_open
        and duel.opponent_id == viewer_id
        and not window_has_passed(duel, now)
    ]
    yours = [
        duel for duel in duels if duel.status == rules.OPEN and duel.challenger_id == viewer_id
    ]
    ended = [duel for duel in duels if duel.status != rules.OPEN]
    ended.sort(key=lambda duel: duel.closed_at or duel.created_at, reverse=True)
    return MyDuels(
        incoming=incoming[: rules.OPEN_CHALLENGES_LIMIT],
        yours=yours[: rules.MAX_WAITING],
        recent=ended[: rules.RECENT_LIMIT],
    )


def held_coins(duels: Sequence[DuelRow], viewer_id: str) -> int:
    """The coins a captain has held in challenges that are still waiting."""
    return sum(
        duel.stake
        for duel in duels
        if duel.status == rules.OPEN and duel.challenger_id == viewer_id
    )
