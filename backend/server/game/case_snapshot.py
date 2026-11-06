"""Frozen records of a crew's stored case state, separate from secret content.

Used by: the case store, pure decisions, views and deterministic tests.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class SeatState:
    seat_no: int
    kit: str
    player_id: str | None = None
    npc_id: str | None = None
    name: str = ""
    read_log: bool = False


@dataclass(frozen=True)
class Find:
    seat_no: int
    card_id: str
    route_id: str
    started_second: int
    ready_second: int
    started_by: str | None = None
    by_partner: bool = False
    order_no: int | None = None
    coins_paid: int = 0


@dataclass(frozen=True)
class Pin:
    seat_no: int
    card_id: str
    pinned_second: int
    ordered_second: int
    pinned_by: str | None = None
    by_partner: bool = False


@dataclass(frozen=True)
class Formed:
    deduction_id: str
    formed_second: int
    formed_by: str | None = None
    formed_seat: int = 1


@dataclass(frozen=True, repr=False)
class Accusation:
    suspect: str
    correct: bool
    case_second: int
    player_id: str | None = None
    seat_no: int = 1
    id: int = 0


@dataclass(frozen=True)
class Solver:
    player_id: str
    seat_no: int
    kit: str
    contributor: bool
    share: int
    share_paid: int
    solved_second: int


@dataclass(frozen=True)
class Post:
    light_id: str
    seat_no: int
    taken_second: int
    on_post_second: int
    player_id: str | None = None
    npc_id: str | None = None
    ended_second: int | None = None
    order_no: int | None = None
    id: int = 0


@dataclass(frozen=True)
class Signal:
    light_id: str
    post_seat_no: int
    aimed_by: str | None
    aimed_seat_no: int
    bearing: float
    on_target: bool
    case_second: int
    holds_until_second: int | None
    ended_second: int | None = None
    parted: bool = False
    night_no: int = 1
    id: int = 0


@dataclass(frozen=True)
class CaseSnapshot:
    crew_id: str
    status: str
    mode: str
    started_at: datetime
    seats: tuple[SeatState, ...]
    state_started_at: datetime | None = None
    write_revision: int = 1
    crew_version: int = 1
    finds: tuple[Find, ...] = ()
    pins: tuple[Pin, ...] = ()
    formed: tuple[Formed, ...] = ()
    accusations: tuple[Accusation, ...] = ()
    solvers: tuple[Solver, ...] = ()
    pair_wait_until: int = 0
    accuse_wait_until: int = 0
    schooner_found_second: int | None = None
    solved_second: int | None = None
    solved_by: str | None = None
    world_outcome: str | None = None
    coins: int = 0
    timber: int | None = 0
    parted_players: frozenset[str] = frozenset()
    night_no: int = 0
    night_started_second: int | None = None
    night_called_by: str | None = None
    posts: tuple[Post, ...] = ()
    signals: tuple[Signal, ...] = ()
    station_players: frozenset[str] = frozenset()

    def seat_for_player(self, player_id: str) -> SeatState | None:
        return next((seat for seat in self.seats if seat.player_id == player_id), None)

    def finds_for_seat(self, seat_no: int) -> tuple[Find, ...]:
        return tuple(find for find in self.finds if find.seat_no == seat_no)
