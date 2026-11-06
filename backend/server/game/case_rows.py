"""Validate database rows before they become the pure case snapshot.

Used by: case_store.py. Invalid rows produce a generic database error, never row contents.
"""

from dataclasses import fields
from datetime import UTC, datetime
from typing import Literal, Self

from pydantic import (
    BaseModel,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    ValidationError,
    model_validator,
)

from server.crews.store import CrewRow, read_row, seat_from_row
from server.game.case_snapshot import (
    Accusation,
    CaseSnapshot,
    Find,
    Formed,
    Pin,
    Post,
    SeatState,
    Signal,
    Solver,
)
from server.supabase_admin import SupabaseRejected


class StateRow(BaseModel):
    started_at: StrictStr
    revision: int = Field(strict=True, ge=1)
    pair_wait_until: int = Field(strict=True, ge=0)
    accuse_wait_until: int = Field(strict=True, ge=0)
    schooner_found_second: int | None = Field(strict=True, ge=0)
    solved_second: int | None = Field(strict=True, ge=0)
    solved_by: StrictStr | None
    world_outcome: StrictStr | None
    night_no: int = Field(default=0, strict=True, ge=0)
    night_started_second: int | None = Field(default=None, strict=True, ge=0)

    @model_validator(mode="after")
    def complete_night(self) -> Self:
        if (self.night_no == 0) != (self.night_started_second is None):
            raise ValueError("A night needs both its number and start.")
        return self


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

    @model_validator(mode="after")
    def ready_after_start(self) -> Self:
        if self.ready_second < self.started_second:
            raise ValueError("A find cannot arrive before it starts.")
        return self


class PinRow(BaseModel):
    seat_no: int = Field(strict=True, ge=1, le=4)
    card_id: str = Field(strict=True, pattern=r"^C[1-8]$")
    ordered_second: int = Field(strict=True, ge=0)
    pinned_second: int = Field(strict=True, ge=0)
    pinned_by: StrictStr | None = None
    by_partner: StrictBool = False
    order_no: int | None = Field(default=None, strict=True, ge=1)
    coins_rewarded: int = Field(default=0, strict=True, ge=0)

    @model_validator(mode="after")
    def pin_follows_order(self) -> Self:
        if self.pinned_second < self.ordered_second:
            raise ValueError("A pin cannot arrive before its order.")
        if self.by_partner != (self.order_no is not None):
            raise ValueError("A partner pin needs its order.")
        if not self.by_partner and self.pinned_second != self.ordered_second:
            raise ValueError("A player pin takes effect at once.")
        return self


LightId = Literal["keepers_lamp", "harbor_light", "islet_signal_station", "ruin_light"]

# Recent history alone may omit a quiet light's live lock or an older lock marked parted.
# Every supplement is bounded and embedded under the same crew as the recent forty rows.
SIGNAL_SUMMARIES = (
    ("finale_parted_signals", {"parted": "eq.true"}, 4),
    *(
        (f"finale_{kind}_{light}", {"light_id": f"eq.{light}", **filters}, 1)
        for light in ("keepers_lamp", "harbor_light", "islet_signal_station", "ruin_light")
        for kind, filters in (
            ("latest", {}),
            ("lock", {"on_target": "eq.true", "ended_second": "is.null"}),
            ("miss", {"on_target": "eq.false"}),
        )
    ),
)


class PostRow(BaseModel):
    id: int = Field(strict=True, ge=1)
    light_id: LightId
    seat_no: int = Field(strict=True, ge=1, le=4)
    player_id: StrictStr | None = None
    npc_id: StrictStr | None = None
    taken_second: int = Field(strict=True, ge=0)
    on_post_second: int = Field(strict=True, ge=0)
    ended_second: int | None = Field(default=None, strict=True, ge=0)
    order_no: int | None = Field(default=None, strict=True, ge=1)

    @model_validator(mode="after")
    def valid_holder_and_times(self) -> Self:
        if (self.player_id is None) == (self.npc_id is None):
            raise ValueError("A post needs exactly one holder.")
        if self.on_post_second < self.taken_second or (
            self.ended_second is not None and self.ended_second < self.taken_second
        ):
            raise ValueError("A post cannot arrive or end before it starts.")
        return self


class SignalRow(BaseModel):
    id: int = Field(strict=True, ge=1)
    night_no: int = Field(strict=True, ge=1)
    light_id: LightId
    post_seat_no: int = Field(strict=True, ge=1, le=4)
    aimed_seat_no: int = Field(strict=True, ge=1, le=4)
    aimed_by: StrictStr | None = None
    bearing: float = Field(strict=True, allow_inf_nan=False, ge=0, lt=360)
    on_target: StrictBool
    case_second: int = Field(strict=True, ge=0)
    holds_until_second: int | None = Field(default=None, strict=True, ge=0)
    ended_second: int | None = Field(default=None, strict=True, ge=0)
    parted: StrictBool = False

    @model_validator(mode="after")
    def valid_lock(self) -> Self:
        if self.on_target != (self.holds_until_second is not None):
            raise ValueError("Only an on-target signal has a lock.")
        if self.parted and not self.on_target:
            raise ValueError("Only a lock can part the fog.")
        if self.holds_until_second is not None and self.holds_until_second <= self.case_second:
            raise ValueError("A lock must last beyond its signal.")
        if self.ended_second is not None and self.ended_second < self.case_second:
            raise ValueError("A lock cannot end before its signal.")
        if round(self.bearing, 1) != self.bearing:
            raise ValueError("A bearing needs one decimal place.")
        return self


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
        columns = {field.name for field in fields(record)}
        return tuple(
            record(**model.model_validate(value).model_dump(include=columns)) for value in values
        )
    except (TypeError, ValidationError):
        raise SupabaseRejected("The case history could not be read.") from None


def validate_finale_history(snapshot: CaseSnapshot) -> None:
    """Reject duplicate duties or impossible signal history before public-view decisions."""
    open_posts = [post for post in snapshot.posts if post.ended_second is None]
    if (
        len({post.light_id for post in open_posts}) != len(open_posts)
        or len({post.seat_no for post in open_posts}) != len(open_posts)
        or len({post.id for post in snapshot.posts}) != len(snapshot.posts)
        or len({signal.id for signal in snapshot.signals}) != len(snapshot.signals)
        or len({(pin.card_id, pin.seat_no) for pin in snapshot.pins}) != len(snapshot.pins)
        or any(signal.night_no > snapshot.night_no for signal in snapshot.signals)
        or any(
            signal.parted and snapshot.schooner_found_second is None for signal in snapshot.signals
        )
    ):
        raise SupabaseRejected("The case history is inconsistent.")


def signal_history(raw: dict) -> tuple[Signal, ...]:
    recent = records(raw, "finale_signals", SignalRow, Signal)
    if len(recent) > 40 or len({signal.id for signal in recent}) != len(recent):
        raise SupabaseRejected("The recent signal history could not be read.")
    signals = {signal.id: signal for signal in recent}
    for key, _, limit in SIGNAL_SUMMARIES:
        summary = records(raw, key, SignalRow, Signal)
        if len(summary) > limit:
            raise SupabaseRejected("The signal summary could not be read.")
        for signal in summary:
            if signal.id in signals and signals[signal.id] != signal:
                raise SupabaseRejected("The signal summary is inconsistent.")
            signals[signal.id] = signal
    return tuple(sorted(signals.values(), key=lambda signal: signal.id, reverse=True))


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
    pins = records(raw, "board_pins", PinRow, Pin)
    posts = records(raw, "finale_posts", PostRow, Post)
    signals = signal_history(raw)
    snapshot = CaseSnapshot(
        crew.id,
        crew.status,
        crew.mode,
        moment(crew.started_at) if crew.started_at else datetime(1970, 1, 1, tzinfo=UTC),
        tuple(sorted(seats, key=lambda item: item.seat_no)),
        state_started_at=None if state is None else moment(state.started_at),
        write_revision=0 if state is None else state.revision,
        crew_version=crew.version,
        finds=records(raw, "case_finds", FindRow, Find),
        pins=pins,
        posts=posts,
        signals=signals,
        parted_players=frozenset(
            signal.aimed_by for signal in signals if signal.parted and signal.aimed_by is not None
        ),
        formed=records(raw, "case_deductions", FormedRow, Formed),
        accusations=records(raw, "case_accusations", AccusationRow, Accusation),
        solvers=records(raw, "case_solvers", SolverRow, Solver),
        pair_wait_until=0 if state is None else state.pair_wait_until,
        accuse_wait_until=0 if state is None else state.accuse_wait_until,
        schooner_found_second=None if state is None else state.schooner_found_second,
        solved_second=None if state is None else state.solved_second,
        solved_by=None if state is None else state.solved_by,
        world_outcome=None if state is None else state.world_outcome,
        night_no=0 if state is None else state.night_no,
        night_started_second=None if state is None else state.night_started_second,
        coins=coins,
    )
    validate_finale_history(snapshot)
    return snapshot
