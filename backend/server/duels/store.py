"""Lantern Duels database access: the reads, the three database functions and their replies.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on
the server only. Reads use select_rows. The three writes are database functions, run with
call_function (supabase/migrations/20261106110000_lantern_duels.sql explains them):
  * duel_create   sends a challenge: the duel, the challenger's envelope and the stake, in one step
  * duel_answer   answers it: the answerer's envelope and stake, the reveal and the payout, in one
                  step
  * duel_void     withdraws, declines or expires a challenge and gives the stake back

A function either does its work ({"status": "done", ...}) or REFUSES because a rule says no
({"status": "refused", "reason": "..."}). A refusal comes before any write, so nothing needs
undoing. Real failures are raised as errors by SupabaseAdmin (see supabase_admin.py).

Sealed means sealed: the table duel_moves holds the signals, and only the server may read it. The
reads of an envelope here ask for one duel and ONE captain. service.py decides whose envelope may
be read, and views.py decides what a captain may see.

Numbers: the database sends whole numbers as JSON numbers and times as text such as
2026-11-06T10:00:00+00:00. The two tiny readers to_time and to_whole_number are copies of the
ones in market/store.py on purpose, so the two packages do not depend on each other.

Used by: service.py.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from server.duels import rules
from server.duels.rules import Resolution
from server.supabase_admin import SupabaseAdmin, SupabaseRejected

# Only the columns the views use. The table duels holds no signal, and create_uid is never read
# back (the repeat check asks for the id only).
DUEL_COLUMNS = (
    "id,challenger_id,opponent_id,is_open,rounds,stake,cut_percent,status,"
    "outcome,round_results,created_at,expires_at,answered_at,closed_at"
)
ENVELOPE_COLUMNS = "round_no,signal,action_uid"

MAX_ROUNDS = max(rules.ROUND_CHOICES)


@dataclass(frozen=True)
class DuelRow:
    """One row of the table duels. It holds no signal."""

    id: str
    challenger_id: str
    opponent_id: str | None  # the named captain, or whoever answered; None if nobody or left
    is_open: bool  # True: anyone may answer
    rounds: int
    stake: int
    cut_percent: int
    status: str
    outcome: str | None  # only when finished
    round_results: tuple[str, ...] | None  # only when finished
    created_at: datetime
    expires_at: datetime
    answered_at: datetime | None
    closed_at: datetime | None


@dataclass(frozen=True)
class Envelope:
    """The signals one captain sealed in one duel, in round order. Empty if none are sealed."""

    signals: tuple[str, ...]
    action_uid: str | None  # the actionUid of the click that sealed them

    @property
    def is_sealed(self) -> bool:
        return len(self.signals) > 0


@dataclass(frozen=True)
class CreateOutcome:
    """The answer of duel_create: done, or refused with a reason."""

    done: bool
    reason: str = ""  # refused: no_such_captain, name_not_unique, cannot_duel_yourself, ...
    duel_id: str = ""  # done: the new duel
    balance: int = 0  # done: the challenger's coins after the stake was held


@dataclass(frozen=True)
class AnswerOutcome:
    """The answer of duel_answer: done, or refused with a reason."""

    done: bool
    reason: str = ""  # refused: duel_taken, duel_closed, duel_expired, daily_pair_limit, ...
    balance: int = 0  # done: the answerer's coins after everything
    winner_takes: int = 0  # done: the payout of the winner (0 for a friendly duel or a draw)


@dataclass(frozen=True)
class VoidOutcome:
    """The answer of duel_void: done, or refused with a reason."""

    done: bool
    reason: str = ""  # refused: not_your_duel, not_expired, duel_closed, no_such_duel
    refunded: int = 0  # done: the stake that went back to the challenger
    challenger_balance: int = 0  # done: the challenger's coins after the refund


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def to_whole_number(value: object) -> int:
    """A whole number from the database (a count, or whole coins)."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise unreadable()
    if int(value) != value:
        raise unreadable()
    return int(value)


def to_time(value: object) -> datetime:
    """A time from the database, text such as 2026-11-06T10:00:00+00:00. It needs a timezone."""
    if not isinstance(value, str):
        raise unreadable()
    try:
        moment = datetime.fromisoformat(value)
    except ValueError as error:
        raise unreadable() from error
    if moment.tzinfo is None:
        raise unreadable()
    return moment


def to_text(value: object) -> str:
    if not isinstance(value, str):
        raise unreadable()
    return value


def to_optional_text(value: object) -> str | None:
    return None if value is None else to_text(value)


def to_optional_time(value: object) -> datetime | None:
    return None if value is None else to_time(value)


def to_flag(value: object) -> bool:
    if not isinstance(value, bool):
        raise unreadable()
    return value


def to_texts(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise unreadable()
    return tuple(to_text(item) for item in value)


def to_status(value: object) -> str:
    status = to_text(value)
    if status not in rules.STATUSES:
        raise unreadable()
    return status


def row_to_duel(row: dict[str, Any]) -> DuelRow:
    """One row of duels as a DuelRow. Raises SupabaseRejected if the row is odd."""
    try:
        round_results = row["round_results"]
        return DuelRow(
            id=to_text(row["id"]),
            challenger_id=to_text(row["challenger_id"]),
            opponent_id=to_optional_text(row["opponent_id"]),
            is_open=to_flag(row["is_open"]),
            rounds=to_whole_number(row["rounds"]),
            stake=to_whole_number(row["stake"]),
            cut_percent=to_whole_number(row["cut_percent"]),
            status=to_status(row["status"]),
            outcome=to_optional_text(row["outcome"]),
            round_results=None if round_results is None else to_texts(round_results),
            created_at=to_time(row["created_at"]),
            expires_at=to_time(row["expires_at"]),
            answered_at=to_optional_time(row["answered_at"]),
            closed_at=to_optional_time(row["closed_at"]),
        )
    except KeyError as error:
        raise unreadable() from error


def rows_to_envelope(rows: list[dict[str, Any]]) -> Envelope:
    """The rows of duel_moves of one captain in one duel as an Envelope. Odd rows are refused."""
    signals = []
    action_uid = None
    try:
        for expected_number, row in enumerate(rows, start=1):
            if to_whole_number(row["round_no"]) != expected_number:
                raise unreadable()
            signal = to_text(row["signal"])
            if signal not in rules.SIGNALS:
                raise unreadable()
            signals.append(signal)
            uid = to_text(row["action_uid"])
            if action_uid is not None and uid != action_uid:
                raise unreadable()
            action_uid = uid
    except KeyError as error:
        raise unreadable() from error
    return Envelope(signals=tuple(signals), action_uid=action_uid)


async def read_duel(admin: SupabaseAdmin, duel_id: str) -> DuelRow | None:
    """One duel by its id, or None if there is none."""
    rows = await admin.select_rows(
        "duels", {"select": DUEL_COLUMNS, "id": f"eq.{duel_id}", "limit": "1"}
    )
    return row_to_duel(rows[0]) if rows else None


async def create_uid_exists(admin: SupabaseAdmin, player_id: str, create_uid: str) -> bool:
    """True if this challenger already sent a challenge with this actionUid (a repeated click).

    duel_create() refuses a repeat too, and that is the lock that cannot be passed. This read
    comes first, so that a repeat is always answered "already applied", whatever else changed.
    """
    rows = await admin.select_rows(
        "duels",
        {
            "select": "id",
            "challenger_id": f"eq.{player_id}",
            "create_uid": f"eq.{create_uid}",
            "limit": "1",
        },
    )
    return len(rows) > 0


async def read_my_duels(admin: SupabaseAdmin, player_id: str) -> list[DuelRow]:
    """The duels the player takes part in, as challenger or as opponent, newest first."""
    rows = await admin.select_rows(
        "duels",
        {
            "select": DUEL_COLUMNS,
            "or": f"(challenger_id.eq.{player_id},opponent_id.eq.{player_id})",
            "order": "created_at.desc",
            "limit": str(rules.MY_DUELS_LIMIT),
        },
    )
    return [row_to_duel(row) for row in rows]


async def read_open_challenges(
    admin: SupabaseAdmin, player_id: str, now: datetime
) -> list[DuelRow]:
    """Open challenges of OTHER captains that are still open and not expired, newest first."""
    rows = await admin.select_rows(
        "duels",
        {
            "select": DUEL_COLUMNS,
            "status": "eq.open",
            "is_open": "eq.true",
            "challenger_id": f"neq.{player_id}",
            "expires_at": f"gt.{now.isoformat()}",
            "order": "created_at.desc",
            "limit": str(rules.OPEN_CHALLENGES_LIMIT),
        },
    )
    return [row_to_duel(row) for row in rows]


async def read_envelope(admin: SupabaseAdmin, duel_id: str, player_id: str) -> Envelope:
    """The signals ONE captain sealed in ONE duel. The caller must be allowed to see them."""
    rows = await admin.select_rows(
        "duel_moves",
        {
            "select": ENVELOPE_COLUMNS,
            "duel_id": f"eq.{duel_id}",
            "player_id": f"eq.{player_id}",
            "order": "round_no.asc",
            "limit": str(MAX_ROUNDS),
        },
    )
    return rows_to_envelope(rows)


async def read_names(admin: SupabaseAdmin, player_ids: list[str | None]) -> dict[str, str]:
    """The display names of some captains, by player id. A captain who left has no entry."""
    wanted = sorted({player_id for player_id in player_ids if player_id is not None})
    if not wanted:
        return {}
    rows = await admin.select_rows(
        "profiles",
        {
            "select": "id,display_name",
            "id": f"in.({','.join(wanted)})",
            "limit": str(len(wanted)),
        },
    )
    try:
        return {to_text(row["id"]): to_text(row["display_name"]) for row in rows}
    except KeyError as error:
        raise unreadable() from error


async def read_balance(admin: SupabaseAdmin, player_id: str) -> int:
    """The player's coins. The wallet row exists for every player (the sign-up trigger)."""
    rows = await admin.select_rows(
        "wallets", {"select": "balance", "player_id": f"eq.{player_id}", "limit": "1"}
    )
    if not rows:
        raise SupabaseRejected("This player has no wallet.")
    return to_whole_number(rows[0]["balance"])


def create_arguments(
    player_id: str,
    opponent_name: str | None,
    rounds: int,
    stake: int,
    signals: tuple[str, ...] | list[str],
    create_uid: str,
) -> dict[str, Any]:
    """The arguments of duel_create. The names are the parameter names in the SQL.

    The numbers that the database compares against (the cut, the answer window and the number of
    waiting challenges) come from rules.py, so they live in one place.
    """
    return {
        "p_challenger_id": player_id,
        "p_opponent_name": opponent_name,
        "p_rounds": rounds,
        "p_stake": stake,
        "p_cut_percent": rules.CUT_PERCENT,
        "p_signals": list(signals),
        "p_create_uid": create_uid,
        "p_answer_hours": rules.ANSWER_HOURS,
        "p_max_waiting": rules.MAX_WAITING,
    }


def answer_arguments(
    duel_id: str,
    player_id: str,
    signals: tuple[str, ...] | list[str],
    action_uid: str,
    resolution: Resolution,
    day_start: datetime,
) -> dict[str, Any]:
    """The arguments of duel_answer. The round results and the outcome are worked out in Python.

    The database does not repeat the signal rules, but it checks everything that follows from
    the results (one per round, and an outcome that fits the counted points).
    """
    return {
        "p_duel_id": duel_id,
        "p_player_id": player_id,
        "p_signals": list(signals),
        "p_action_uid": action_uid,
        "p_round_results": list(resolution.round_results),
        "p_outcome": resolution.outcome,
        "p_day_start": day_start.isoformat(),
        "p_pair_daily_limit": rules.PAIR_DAILY_LIMIT,
    }


def void_arguments(duel_id: str, player_id: str, new_status: str) -> dict[str, Any]:
    """The arguments of duel_void. `new_status` is withdrawn, declined or expired."""
    return {"p_duel_id": duel_id, "p_player_id": player_id, "p_new_status": new_status}


def read_refusal(reply: dict[str, Any]) -> str:
    """The reason of a refused reply, or an error if there is none."""
    reason = reply.get("reason")
    if not isinstance(reason, str) or not reason:
        raise unreadable()
    return reason


def read_create_reply(reply: object) -> CreateOutcome:
    """Understand the JSON that duel_create returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return CreateOutcome(
            done=True,
            duel_id=to_text(reply.get("duelId")),
            balance=to_whole_number(reply.get("balance")),
        )
    if reply.get("status") == "refused":
        return CreateOutcome(done=False, reason=read_refusal(reply))
    raise unreadable()


def read_answer_reply(reply: object) -> AnswerOutcome:
    """Understand the JSON that duel_answer returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return AnswerOutcome(
            done=True,
            balance=to_whole_number(reply.get("balance")),
            winner_takes=to_whole_number(reply.get("winnerTakes")),
        )
    if reply.get("status") == "refused":
        return AnswerOutcome(done=False, reason=read_refusal(reply))
    raise unreadable()


def read_void_reply(reply: object) -> VoidOutcome:
    """Understand the JSON that duel_void returns."""
    if not isinstance(reply, dict):
        raise unreadable()
    if reply.get("status") == "done":
        return VoidOutcome(
            done=True,
            refunded=to_whole_number(reply.get("refunded")),
            challenger_balance=to_whole_number(reply.get("challengerBalance")),
        )
    if reply.get("status") == "refused":
        return VoidOutcome(done=False, reason=read_refusal(reply))
    raise unreadable()


async def run_create(admin: SupabaseAdmin, arguments: dict[str, Any]) -> CreateOutcome:
    """Run the atomic database function duel_create.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      InsufficientFunds (409)    the challenger cannot pay the stake; nothing was created
      AlreadyApplied (409)       this create_uid was used before; nothing changed
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; read the list before you retry
    """
    return read_create_reply(await admin.call_function("duel_create", arguments))


async def run_answer(admin: SupabaseAdmin, arguments: dict[str, Any]) -> AnswerOutcome:
    """Run the atomic database function duel_answer. It raises the same errors as run_create."""
    return read_answer_reply(await admin.call_function("duel_answer", arguments))


async def run_void(admin: SupabaseAdmin, arguments: dict[str, Any]) -> VoidOutcome:
    """Run the atomic database function duel_void. AlreadyApplied (409) means: closed this way."""
    return read_void_reply(await admin.call_function("duel_void", arguments))
