"""Frozen case content records, read only by the server's case rules.

Used by: case_data.py and the pure case rules. Protected prose is never included in repr.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Kit:
    id: str
    name: str
    starts_at: str
    home: str
    start_coins: int
    cheap_card: str
    act1_end: Mapping[str, str]
    kit_item: Mapping[str, str] = field(repr=False)


@dataclass(frozen=True)
class EntryProfile:
    id: str
    kit: str
    read_log: bool


@dataclass(frozen=True)
class Hotspot:
    id: str
    name: str
    card: str | None
    light: str | None


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    hotspots: tuple[Hotspot, ...]


@dataclass(frozen=True, repr=False)
class Suspect:
    id: str
    title: str
    on_the_surface: str
    cleared_by: str | None
    refused_line: str | None


@dataclass(frozen=True, repr=False)
class Route:
    card_id: str
    id: str
    kind: str
    place: str
    hotspot: str
    kit: str | None
    players_only: bool
    coins: int
    open_when: str
    timer_minutes: int
    estimate_minutes: int
    found_line: str
    label: str | None = None
    needs_share: str | None = None
    needs_profile: str | None = None
    needs_world: str | None = None
    starts_in_journal: bool = False
    needs_flag: str | None = None


@dataclass(frozen=True, repr=False)
class Card:
    id: str
    title: str
    deduction: str
    kind: str
    cheap_for_kit: str | None
    opens_after: tuple[str, ...]
    lead: str
    text: str
    routes: tuple[Route, ...]
    closed_line: str | None = None


@dataclass(frozen=True, repr=False)
class Deduction:
    id: str
    name: str
    cards: tuple[str, ...]
    finding: str
    clears: str | None
    clear_line: str | None
    opens: tuple[str, ...]
    opens_line: str | None


@dataclass(frozen=True, repr=False)
class Window:
    id: str
    every_minutes: int
    from_minute: int
    open_minutes: int
    closed_line: str


@dataclass(frozen=True, repr=False)
class Board:
    player_pin_minutes: int
    wrong_pair_wait_seconds: int
    pair_needs_two_seats: bool
    lines: Mapping[str, str]


@dataclass(frozen=True)
class Chart:
    size: tuple[float, float]
    fog_center: tuple[float, float]
    fog_radius: float
    max_offset_from_fog_center: float
    min_degrees_between_fixed_lights: float


@dataclass(frozen=True)
class Light:
    id: str
    name: str
    tier: str
    place: str
    hotspot: str
    chart_xy: tuple[float, float]
    ready: Mapping[str, Any]
    partners_may_man: bool
    planning_price_coins: int


@dataclass(frozen=True, repr=False)
class Night:
    opens_after: tuple[str, ...]
    night_minutes: int
    dawn_wait_minutes: int
    lights_needed: int
    lock_seconds: int
    tolerance_degrees: float
    relock_wait_seconds: int
    climb_minutes: int
    chart: Chart
    lights: tuple[Light, ...]
    lines: Mapping[str, str]


@dataclass(frozen=True, repr=False)
class Accusation:
    needs_deductions: tuple[str, ...]
    needs_schooner_found: bool
    suspects: tuple[str, ...]
    culprit: str
    wrong_wait_seconds: int
    lines: Mapping[str, str]


@dataclass(frozen=True, repr=False)
class RevealLine:
    id: str
    text: str
    cites: tuple[str, ...]


@dataclass(frozen=True, repr=False)
class Reveal:
    lines: tuple[RevealLine, ...]
    closing_lines: Mapping[str, RevealLine]
    log_reader_line: RevealLine
    last_beat: RevealLine
    order: tuple[str, ...]


@dataclass(frozen=True)
class CoinReward:
    id: str
    reason: str
    ref: str
    amount: int = 0
    base: int = 0
    per_deduction_part: int = 0
    finale_role: int = 0
    maximum: int = 0
    max_per_player: int = 1

    @property
    def per_part(self) -> int:
        return self.per_deduction_part


@dataclass(frozen=True)
class PaidRoutes:
    reason: str
    player_ref: str
    partner_ref: str


@dataclass(frozen=True)
class Rewards:
    coins: tuple[CoinReward, ...]
    paid_routes: PaidRoutes

    def coin(self, reward_id: str) -> CoinReward:
        return next(reward for reward in self.coins if reward.id == reward_id)


@dataclass(frozen=True)
class Partners:
    kit_order: tuple[str, ...]
    may_use_route_kinds: tuple[str, ...]
    never_use_route_kinds: tuple[str, ...]
    may_man_lights: tuple[str, ...]


@dataclass(frozen=True, repr=False)
class CaseData:
    format_version: int
    case_id: str
    kits: tuple[Kit, ...]
    entry_profiles: tuple[EntryProfile, ...]
    places: tuple[Place, ...]
    suspects: tuple[Suspect, ...]
    cards: tuple[Card, ...]
    deductions: tuple[Deduction, ...]
    windows: tuple[Window, ...]
    board: Board
    night: Night
    accusation: Accusation
    reveal: Reveal
    rewards: Rewards
    partners: Partners
    raw: Mapping[str, Any]

    @property
    def routes(self) -> tuple[Route, ...]:
        return tuple(route for card in self.cards for route in card.routes)

    @property
    def active_routes(self) -> tuple[Route, ...]:
        return tuple(route for route in self.routes if route.kind in ("kit", "open", "timed"))

    @property
    def active_lights(self) -> tuple[Light, ...]:
        return tuple(light for light in self.night.lights if light.tier == "must")

    def kit(self, value: str) -> Kit:
        return next(item for item in self.kits if item.id == value)

    def card(self, value: str) -> Card:
        return next(item for item in self.cards if item.id == value)

    def route(self, value: str) -> Route:
        return next(item for item in self.routes if item.id == value)

    def deduction(self, value: str) -> Deduction:
        return next(item for item in self.deductions if item.id == value)

    def suspect(self, value: str) -> Suspect:
        return next(item for item in self.suspects if item.id == value)

    def light(self, value: str) -> Light:
        return next(item for item in self.night.lights if item.id == value)

    def window(self, value: str) -> Window:
        return next(item for item in self.windows if item.id == value)
