"""Validate database rows before they become the pure case snapshot.

Used by: case_store.py. Invalid rows produce a generic database error, never row contents.
"""

from datetime import UTC, datetime

from pydantic import BaseModel, Field, StrictBool, StrictInt, StrictStr, ValidationError

from server.crews.store import CrewRow, read_row, seat_from_row
from server.game.case_snapshot import Accusation, CaseSnapshot, Find, Formed, SeatState, Solver
from server.supabase_admin import SupabaseRejected


class StateRow(BaseModel):
    started_at: StrictStr
    revision: int = Field(strict=True, ge=1)
    pair_wait_until: int = Field(strict=True, ge=0)
    accuse_wait_until: int = Field(strict=True, ge=0)
    schooner_found_second: StrictInt | None
    solved_second: StrictInt | None
    solved_by: StrictStr | None
    world_outcome: StrictStr | None


class FindRow(BaseModel):
    seat_no: int = Field(strict=True, ge=1, le=4)
    card_id: StrictStr
    route_id: StrictStr
    started_second: int = Field(strict=True, ge=0)
    ready_second: int = Field(strict=True, ge=0)
    started_by: StrictStr | None = None
    by_partner: StrictBool = False
    order_no: StrictInt | None = None
    coins_paid: int = Field(default=0, strict=True, ge=0)


class FormedRow(BaseModel):
    deduction_id: StrictStr
    formed_second: int = Field(strict=True, ge=0)
    formed_by: StrictStr | None = None
    formed_seat: int = Field(strict=True, ge=1, le=4)


class AccusationRow(BaseModel):
    suspect: StrictStr
    correct: StrictBool
    case_second: int = Field(strict=True, ge=0)
    player_id: StrictStr | None
    seat_no: int = Field(strict=True, ge=1, le=4)
    id: int = Field(strict=True, ge=1)


class SolverRow(BaseModel):
    player_id: StrictStr
    seat_no: int = Field(strict=True, ge=1, le=4)
    kit: StrictStr
    contributor: StrictBool
    share: int = Field(strict=True, ge=0)
    share_paid: int = Field(strict=True, ge=0)
    solved_second: int = Field(strict=True, ge=0)


def moment(text: str) -> datetime:
    try:
        value = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        raise SupabaseRejected("The case clock could not be read.") from None
    if value.tzinfo is None:
        raise SupabaseRejected("The case clock needs a timezone.")
    return value.astimezone(UTC)


def records(raw: dict, key: str, model: type[BaseModel], record: type) -> tuple:
    values = raw.get(key, [])
    if not isinstance(values, list):
        raise SupabaseRejected("The case history could not be read.")
    if any(
        not isinstance(value, dict) or value.get("crew_id", raw["id"]) != raw["id"]
        for value in values
    ):
        raise SupabaseRejected("The case history belongs to another crew.")
    try:
        return tuple(record(**model.model_validate(value).model_dump()) for value in values)
    except (TypeError, ValidationError):
        raise SupabaseRejected("The case history could not be read.") from None


def snapshot_from_row(raw: dict, *, read_log: bool, coins: int, viewer: str) -> CaseSnapshot:
    crew = read_row(CrewRow, raw)
    seats = []
    for row in crew.crew_seats:
        seat = seat_from_row(row)
        if seat.kit is None:
            raise SupabaseRejected("A case seat has no entry kit.")
        seats.append(
            SeatState(
                seat.seat_no,
                seat.kit,
                seat.player_id,
                seat.npc_id,
                seat.name or "",
                read_log and seat.player_id == viewer,
            )
        )
    state_raw = raw.get("case_state")
    if state_raw is not None and not isinstance(state_raw, dict):
        raise SupabaseRejected("The case state could not be read.")
    if state_raw is not None and state_raw.get("crew_id", raw["id"]) != raw["id"]:
        raise SupabaseRejected("The case state belongs to another crew.")
    state = None if state_raw is None else read_row(StateRow, state_raw)
    return CaseSnapshot(
        crew.id,
        crew.status,
        crew.mode,
        moment(crew.started_at) if crew.started_at else datetime(1970, 1, 1, tzinfo=UTC),
        tuple(sorted(seats, key=lambda item: item.seat_no)),
        state_started_at=None if state is None else moment(state.started_at),
        write_revision=0 if state is None else state.revision,
        crew_version=crew.version,
        finds=records(raw, "case_finds", FindRow, Find),
        formed=records(raw, "case_deductions", FormedRow, Formed),
        accusations=records(raw, "case_accusations", AccusationRow, Accusation),
        solvers=records(raw, "case_solvers", SolverRow, Solver),
        pair_wait_until=0 if state is None else state.pair_wait_until,
        accuse_wait_until=0 if state is None else state.accuse_wait_until,
        schooner_found_second=None if state is None else state.schooner_found_second,
        solved_second=None if state is None else state.solved_second,
        solved_by=None if state is None else state.solved_by,
        world_outcome=None if state is None else state.world_outcome,
        coins=coins,
    )
