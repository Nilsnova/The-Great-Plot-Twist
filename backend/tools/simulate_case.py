"""Case timing check: does "The Light That Shouldn't Be" fit its promised minutes?

The promise: a crew of 4 players finishes the case in about 120 minutes, Act 1 included, and
one player with 3 NPC partners in about 150. This program checks that promise with arithmetic
instead of hope.

It reads backend/content/secret/case.json (routes, windows, minutes, lights, the timetable)
and backend/content/partners.json (only to count NPC errands and check each one has its words).
Then it plays the whole case on paper, for every crew:

  1. A crew is 1 to 4 players with a kit each (the kit comes from the player's Act 1 ending).
     Empty seats get NPC partners (NPC-PARTNERS.md, section 4.2). That makes 69 mixes.
  2. Card phase. The search tries who fetches which card, by which route, and keeps the
     fastest plan. Players and partners work at the same time. The two cards of a deduction
     always come from two different seats. A card behind a deduction waits for it. Travel,
     route timers, case-clock windows and partner errands all come from case.json.
  3. Finale. Three seats man three lights. The rules give a minimum for that. Act 1, the
     muster, the accusation and the Relighting come from the timetable in case.json,
     because the case data has no mechanics for them.
  4. The total is compared with the promise (planning.expected_totals_minutes), and the
     program checks coins and the NPC line bank.

Two knobs keep the answer honest. PACE says how much slower a real crew is than the planning
minutes (talk, doubts, wrong turns). Only a player's own hands-on minutes get slower. Route
timers, windows and partner errands do not. FREE ROUTES ONLY means nobody buys a shortcut.
The few numbers this program adds because case.json has none are in one block near the top.

This is a design tool, not part of the game. It is longer than the usual 200 lines because it
searches for the fastest plan, and it is outside the graded code walkthrough. A short pytest,
backend/server/tests/test_case_timing.py, checks that the program still finds its files and that
the main crews fit (see backend/tools/README.md).

Run it from the repository root:

    python3 -I backend/tools/simulate_case.py                  classes, finale, coins, checks
    python3 -I backend/tools/simulate_case.py --all            also every one of the 69 mixes
    python3 -I backend/tools/simulate_case.py --explain TK,WI  a paper playtest of one mix
    python3 -I backend/tools/simulate_case.py --tune           what moving each lever does
    python3 -I backend/tools/simulate_case.py --kit-orders     the old and the new NPC kit order
    More options: --pace 1.5  --shortcuts  --pre-position  --log-readers  --order-minutes 1
                  --aim-minutes 1  --lock-seconds 10

Python standard library only. Used by: the story and case owners, the S3 (case) and S4 (NPC
partners) packages, and anyone who changes a minute, a window or a price in case.json.
"""

from __future__ import annotations

import argparse
import copy
import itertools
import json
import math
import sys
from collections import Counter, namedtuple
from pathlib import Path

# This file is backend/tools/simulate_case.py, so the repository root is two folders up.
REPO_ROOT = Path(__file__).resolve().parents[2]
CASE_FILE = REPO_ROOT / "backend" / "content" / "secret" / "case.json"
LINES_FILE = REPO_ROOT / "backend" / "content" / "partners.json"

# ---- Assumptions: numbers this program adds because case.json has no value for them ----------
# Pace 1.5: first-time play is about 1.5 times slower than the planning minutes (CASE-FILE.md,
# section 19, point 5). Pace 1.0 is best play.
FIRST_TIME_PACE = 1.5
# A player notices a partner's line and gives the next order. The 5 Nov scratch model used 1.
# This covers the pin order too: a partner pins only after a second order (NPC-PARTNERS.md 5.2).
# Giving an order never uses the player's own hands-on time here, which is a simplification.
ORDER_MINUTES = 1.0
# One player drags one beam onto the glow. Aiming costs no request (CASE-FILE.md 10.4), and a
# player can aim while the partners sail. Only the finale check uses it.
AIM_MINUTES = 1.0
# One press of Lock and the answer on screen. A player locks every beam one after another, and
# the locks must all fall inside the hold (night.lock_seconds, 90). Only the finale check uses it.
LOCK_PRESS_SECONDS = 10.0
# -----------------------------------------------------------------------------------------------

PACE_STEP = 0.25  # the pace column moves in steps of this size, up to PACE_TOP
PACE_TOP = 3.0

# Players sit in the lowest seats, in this order. The short codes are used in every table.
KIT_ORDER = ("true_keeper", "witness", "informant", "stranger")
KIT_CODES = {"true_keeper": "TK", "witness": "WI", "informant": "IN", "stranger": "ST"}

# Which kit an empty seat gets: the first kit in the list that nobody holds yet.
# NPC-PARTNERS.md section 4.2 owns this order, and CASE-FILE.md names the same one. The old order
# (OLD_NPC_KIT_ORDER) is kept only for the --kit-orders comparison.
NPC_KIT_ORDER = ("informant", "stranger", "true_keeper", "witness")
OLD_NPC_KIT_ORDER = ("true_keeper", "informant", "stranger", "witness")

# The order a crew works through the steps of the case. Each step is appended to the timeline of
# the seat that takes it, so the order decides who has spare time for what:
#   - The lens steps ("craft" and "fit") belong to the ruin light, which has tier should. In the
#     shipped case.json every player has a home islet, so every crew builds a signal station
#     and both steps do nothing. They matter only in a trial copy whose kits have no islet.
#   - D2 comes next because it opens the money trail. C1, C2 and C7 gate nothing, so they come
#     before the gated cards C5 and C6 and use waiting time.
#   - D1 is paired after the gated cards are fetched, so a player starts a long timer before
#     doing a short pairing. The lens is fitted after C8 is fetched, during the ruin's timer.
# Tried on 5 Nov 2026: four other orders were never faster than this one in any of the 276 runs
# (69 mixes, pace 1 and 1.5, free routes and shortcuts).
WORK_ORDER = (
    ("craft", None),
    ("fetch", "C3"), ("fetch", "C4"), ("form", "D2"),
    ("fetch", "C1"), ("fetch", "C2"), ("fetch", "C7"),
    ("fetch", "C5"), ("fetch", "C6"), ("form", "D1"), ("form", "D3"),
    ("fetch", "C8"), ("fit", None), ("form", "D4"),
)  # fmt: skip

Seat = namedtuple("Seat", "index kit partner")
Settings = namedtuple("Settings", "log_readers order aim pre_position lock")
DEFAULT_SETTINGS = Settings(False, ORDER_MINUTES, AIM_MINUTES, False, LOCK_PRESS_SECONDS)


# ---- Loading the data ------------------------------------------------------------------------
def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def window_open(windows: dict, window_id: str, minute: float) -> bool:
    """A window is open when from_minute <= (minute mod every_minutes) < from + open."""
    if window_id == "always":
        return True
    window = windows[window_id]
    phase = int(minute) % window["every_minutes"]
    return window["from_minute"] <= phase < window["from_minute"] + window["open_minutes"]


def next_open(windows: dict, window_id: str, minute: float) -> float:
    """The first moment at or after `minute` when the window is open."""
    for _ in range(100):
        if window_open(windows, window_id, minute):
            return minute
        minute = math.floor(minute) + 1
    raise ValueError(f"window {window_id} never opens")


def check_route_estimates(case: dict) -> list[str]:
    """Re-derive every route's estimate_minutes from the planning constants (linter rule L9)."""
    plan = case["planning"]
    problems = []
    for card in case["cards"]:
        for route in card["routes"]:
            at_hub = route["place"] in ("saltreach_harbor", "anywhere")
            moves = 0 if at_hub else plan["crossing_minutes"]
            looking = 0 if route["place"] == "anywhere" else plan["find_spot_minutes"]
            expected = moves + looking + route["timer_minutes"] + plan["read_minutes"]
            if expected != route["estimate_minutes"]:
                problems.append(f"{route['id']}: {route['estimate_minutes']} instead of {expected}")
    return problems


# ---- Crews: mixes, seats and partners --------------------------------------------------------
def fill_partners(player_kits: tuple, npc_order: tuple) -> list[str]:
    """Kits for the empty seats: the first kits in `npc_order` that no player holds."""
    covered = set(player_kits)
    partners: list[str] = []
    for kit in npc_order:
        if len(player_kits) + len(partners) == 4:
            break
        if kit not in covered:
            partners.append(kit)
            covered.add(kit)
    return partners


def make_seats(player_kits: tuple, npc_order: tuple) -> list[Seat]:
    kits = list(player_kits) + fill_partners(player_kits, npc_order)
    return [Seat(index, kit, index >= len(player_kits)) for index, kit in enumerate(kits)]


def all_mixes() -> list[tuple]:
    """All 69 ways to pick the kits of 1 to 4 players (4 + 10 + 20 + 35)."""
    mixes: list[tuple] = []
    for players in (4, 3, 2, 1):
        mixes.extend(itertools.combinations_with_replacement(KIT_ORDER, players))
    return mixes


def mix_label(player_kits: tuple) -> str:
    return " ".join(KIT_CODES[kit] for kit in player_kits)


def class_name(player_kits: tuple) -> str:
    """The row of the class table that a mix belongs to."""
    players = len(player_kits)
    shape = tuple(sorted(Counter(player_kits).values(), reverse=True))
    if players == 4:
        names = {
            (1, 1, 1, 1): "4 players, 4 different kits",
            (2, 1, 1): "4 players, one pair",
            (2, 2): "4 players, two pairs",
            (3, 1): "4 players, three plus one",
        }
        return names.get(shape, f"4 players, all {KIT_CODES[player_kits[0]]}")
    if players == 3:
        return "3 players + 1 partner"
    if players == 2:
        return "2 players + 2 partners"
    return f"1 player + 3 partners, {KIT_CODES[player_kits[0]]}"


def mixes_by_class() -> dict:
    groups: dict = {}
    for kits in all_mixes():
        groups.setdefault(class_name(kits), []).append(kits)
    return groups


# ---- The world one run plays in --------------------------------------------------------------
class World:
    """Everything one run reads from case.json: the crew, the pace and the case data."""

    def __init__(
        self,
        case: dict,
        seats: list[Seat],
        pace: float,
        shortcuts: bool,
        settings: Settings,
        cache: dict,
    ):
        plan = case["planning"]
        errands = plan["partner_minutes_copied_from_npc_partners_md"]
        kits = {kit["id"]: kit for kit in case["kits"]}
        lights = case["night"]["lights"]
        ruin = next(light for light in lights if light["id"] == "ruin_light")["ready"]
        self.seats, self.pace, self.shortcuts, self.cache = seats, pace, shortcuts, cache
        self.log_readers, self.order, self.aim, self.pre_position, self.lock_press = settings
        self.humans = [seat.index for seat in seats if not seat.partner]
        self.has_twins = len({(seat.kit, seat.partner) for seat in seats}) < len(seats)
        self.windows = case["case_clock"]["windows"]
        self.crossing, self.find_spot = plan["crossing_minutes"], plan["find_spot_minutes"]
        self.read, self.pair = plan["read_minutes"], plan["pair_minutes"]
        self.errand, self.pin = errands["errand"], errands["pin"]
        self.arrive = errands["arrive_after"]
        self.partner_kinds = case["partners"]["may_use_route_kinds"]
        self.routes = {card["id"]: card["routes"] for card in case["cards"]}
        self.route_by_id = {r["id"]: r for routes in self.routes.values() for r in routes}
        self.opens_after = {card["id"]: card["opens_after"] for card in case["cards"]}
        self.pair_cards = {d["id"]: d["cards"] for d in case["deductions"]}
        self.mate = {}
        for first, second in self.pair_cards.values():
            self.mate[first], self.mate[second] = second, first
        human_kits = {i: kits[seats[i].kit] for i in self.humans}
        self.start_place = {i: kit["starts_at"] for i, kit in human_kits.items()}
        self.home = {i: kit["home"] for i, kit in human_kits.items()}
        self.start_coins = {i: kit["start_coins"] for i, kit in human_kits.items()}
        self.payer = max(self.humans, key=lambda i: (self.start_coins[i], -i))
        self.ferry_kits = {kit_id for kit_id, kit in kits.items() if kit["home"] == "home_islet"}
        self.station_possible = any(seats[i].kit in self.ferry_kits for i in self.humans)
        self.craft, self.fit = ruin["craft_minutes"], ruin["fit_minutes"]
        self.climb = case["night"]["climb_minutes"]
        self.lights_needed = case["night"]["lights_needed"]
        self.lock_seconds = case["night"]["lock_seconds"]
        self.building_price = max(light["planning_price_coins"] for light in lights)
        self.tail_after = chain_floor(self)
        self.after_card = {  # least time still needed after a card is pinned, until D4 forms
            card: self.pair * pace + self.tail_after[d]
            for d, cards in self.pair_cards.items()
            for card in cards
        }


def least_offset(world: World, card_id: str) -> float:
    """The least time any seat of this crew needs for a card once its gate is open."""
    least = math.inf
    for seat in world.seats:
        for route in world.routes[card_id]:
            if not route_allowed(world, route, seat):
                continue
            if seat.partner:  # a fetch order, the errand, a pin order, the pin
                minutes = 2 * world.order * world.pace + world.errand + world.pin
            else:
                far = route["place"] != "anywhere" and not world.pre_position
                looking = world.find_spot * world.pace if far else 0
                minutes = looking + route["timer_minutes"] + world.read * world.pace
            least = min(least, minutes)
    return least


def chain_floor(world: World) -> dict:
    """For each deduction: the least time still needed after it forms, until D4 forms.

    Only the gated chain counts (D2 opens C5 and C6, D3 opens C8). The search uses this floor
    to drop plans that cannot win, so it must never be too high.
    """
    pair = world.pair * world.pace
    after_d3 = least_offset(world, "C8") + pair
    after_d2 = max(least_offset(world, "C5"), least_offset(world, "C6")) + pair + after_d3
    return {"D1": 0.0, "D2": after_d2, "D3": after_d3, "D4": 0.0}


class State:
    """One crew's progress. A search step copies it, changes the copy and hands it on."""

    __slots__ = (
        "free",
        "place",
        "pinned",
        "holder",
        "formed",
        "spent",
        "events",
        "progress",
        "coins",
        "work",
        "lens_maker",
    )

    def __init__(self, world: World):
        self.free = [0.0] * len(world.seats)  # when each seat's hands are free
        self.place = [world.start_place.get(seat.index, "berth") for seat in world.seats]
        self.pinned, self.holder, self.formed = {}, {}, {}  # card -> time, card -> seat, D -> time
        self.spent = [0] * len(world.seats)  # coins each seat pays for shortcuts
        self.events: list[tuple] = []
        self.progress, self.coins, self.work, self.lens_maker = 0.0, 0, 0, None

    def clone(self) -> State:
        other = State.__new__(State)
        other.free, other.place, other.spent = list(self.free), list(self.place), list(self.spent)
        other.pinned, other.holder = dict(self.pinned), dict(self.holder)
        other.formed, other.events = dict(self.formed), list(self.events)
        other.progress, other.coins = self.progress, self.coins
        other.work, other.lens_maker = self.work, self.lens_maker
        return other


# ---- Taking a route: one player, one partner -------------------------------------------------
def route_allowed(world: World, route: dict, seat: Seat) -> bool:
    kind = route["kind"]
    if kind in ("share", "world"):
        return False  # these need the market flag or a weather event; the check keeps them off
    if kind == "paid" and not world.shortcuts:
        return False
    if kind == "kit" and route["kit"] != seat.kit:
        return False
    if kind == "log_reader" and not (world.log_readers and not seat.partner):
        return False
    return not (seat.partner and (route["players_only"] or kind not in world.partner_kinds))


def player_route(world: World, route: dict, free: float, place: str, gate: float) -> tuple:
    """A player travels, finds the spot, waits for the window, starts the timer, reads.

    Returns (card in hand, pinned, hands free again, new place). The player pins at once.
    A timer runs on its own, so the player may leave while it counts (CASE-FILE.md 5.3).
    Normally nobody walks to a place before its card opens, because a first-time crew does not
    know where to go. With world.pre_position (best play) travel and search may happen before.
    """
    there = route["place"]
    moves = 0 if there in (place, "anywhere") else world.crossing
    looking = 0 if there == "anywhere" else world.find_spot
    wait_for_gate = not world.pre_position
    arrive = (max(free, gate) if wait_for_gate else free) + (moves + looking) * world.pace
    start = next_open(world.windows, route["open_when"], max(arrive, gate))
    reading = world.read * world.pace
    ready = start + route["timer_minutes"] + reading
    free_after = start + reading if route["timer_minutes"] == 0 else start
    return ready, ready, free_after, (place if there == "anywhere" else there)


def partner_route(world: World, route: dict, free: float, gate: float) -> tuple:
    """A partner takes an order, sails (10 minutes whatever the route), takes a second order to
    pin the card, and pins it (5). In NPC-PARTNERS.md a pin is an order of its own, so the player
    spends a second order minute once the found line appears."""
    start = max(free, gate) + world.order * world.pace
    if route.get("starts_in_journal"):
        ready = start  # a Witness partner starts with C2 in its satchel: one order, the pin
        pinned = ready + world.pin
    else:
        order_at = next_open(world.windows, route["open_when"], start + world.arrive) - world.arrive
        ready = order_at + world.errand
        pinned = ready + world.order * world.pace + world.pin
    return ready, pinned, pinned, "berth"


def best_route(world: World, card_id: str, seat: Seat, free: float, place: str, gate: float):
    """The seat's fastest allowed route to the card: (route, ready, pinned, free, place).

    The answer depends only on the seat's kit and state, so runs of one pace share it.
    """
    key = (card_id, seat.kit, seat.partner, free, place, gate)
    if key in world.cache:
        return world.cache[key]
    best = None
    for route in world.routes[card_id]:
        if not route_allowed(world, route, seat):
            continue
        if seat.partner:
            result = partner_route(world, route, free, gate)
        else:
            result = player_route(world, route, free, place, gate)
        rank = (result[0], route["coins"], result[2])
        if best is None or rank < best[0]:
            best = (rank, (route,) + result)
    world.cache[key] = None if best is None else best[1]
    return world.cache[key]


# ---- The steps of a plan ---------------------------------------------------------------------
def fetch_card(world: World, state: State, card_id: str, seat: Seat, cut):
    """The seat takes its fastest allowed route to the card. None if it has no route, or if
    the plan can no longer beat the best one (`cut` says so)."""
    gate = max((state.formed[d] for d in world.opens_after[card_id]), default=0.0)
    found = best_route(world, card_id, seat, state.free[seat.index], state.place[seat.index], gate)
    if found is None:
        return None
    route, ready, pinned, free_after, new_place = found
    coins = state.coins + route["coins"]
    if cut(max(state.progress, pinned + world.after_card[card_id]), coins):
        return None
    nxt = state.clone()
    nxt.free[seat.index], nxt.place[seat.index] = free_after, new_place
    nxt.pinned[card_id], nxt.holder[card_id] = pinned, seat.index
    nxt.spent[world.payer if seat.partner else seat.index] += route["coins"]
    nxt.coins = coins
    if seat.partner:
        nxt.work += world.pin + (0 if route.get("starts_in_journal") else world.errand)
    nxt.progress = max(nxt.progress, pinned)
    nxt.events.append(("fetch", seat.index, card_id, route["id"], ready, pinned))
    return nxt


def form_deduction(world: World, state: State, deduction_id: str, cut):
    """A player pairs the two cards. The player who can start soonest does it."""
    first, second = world.pair_cards[deduction_id]
    ready = max(state.pinned[first], state.pinned[second])
    partner_cards = sum(world.seats[state.holder[c]].partner for c in (first, second))
    minutes = (world.pair + world.read * partner_cards) * world.pace
    human = min(world.humans, key=lambda i: (max(state.free[i], ready), i))
    done = max(state.free[human], ready) + minutes
    if cut(done + world.tail_after[deduction_id], state.coins):
        return None
    nxt = state.clone()
    nxt.free[human], nxt.formed[deduction_id] = done, done
    nxt.progress = max(nxt.progress, done)
    nxt.events.append(("form", deduction_id, human, done))
    return nxt


def craft_lens(world: World, state: State, human: int) -> State:
    """A player goes home and makes the lens. It can wait for the fit, so it fills spare time."""
    moves = 0 if state.place[human] == world.home[human] else world.crossing
    done = state.free[human] + (moves + world.craft) * world.pace
    nxt = state.clone()
    nxt.free[human], nxt.place[human], nxt.lens_maker = done, world.home[human], human
    nxt.progress = max(nxt.progress, done)
    nxt.events.append(("craft", human, done))
    return nxt


def fit_lens(world: World, state: State) -> State:
    """The same player sails to the ruin once D3 has formed and fits the lens."""
    maker = state.lens_maker
    moves = 0 if state.place[maker] == "the_teeth" else world.crossing
    done = max(state.free[maker], state.formed["D3"]) + (moves + world.fit) * world.pace
    nxt = state.clone()
    nxt.free[maker], nxt.place[maker] = done, "the_teeth"
    nxt.progress = max(nxt.progress, done)
    nxt.events.append(("fit", maker, done))
    return nxt


# ---- The search: try every assignment, keep the fastest --------------------------------------
def seat_signature(state: State, seat: Seat) -> tuple:
    """Two seats with the same signature are interchangeable, so the search tries only one."""
    held = tuple(sorted(card for card, holder in state.holder.items() if holder == seat.index))
    return (
        seat.kit,
        seat.partner,
        state.free[seat.index],
        state.place[seat.index],
        state.spent[seat.index],
        held,
        state.lens_maker == seat.index,
    )


def fetch_options(world: World, state: State, card_id: str, cut) -> list:
    """The card taken by each seat that may take it (twins count once)."""
    mate_seat = state.holder.get(world.mate[card_id])
    options, seen = [], set()
    for seat in world.seats:
        signature = seat_signature(state, seat) if world.has_twins else seat.index
        if seat.index == mate_seat or signature in seen:
            continue
        seen.add(signature)
        options.append(fetch_card(world, state, card_id, seat, cut))
    return options


def next_states(world: World, state: State, kind: str, name: str | None, cut) -> list[State]:
    """Every way to do the next step, the fastest first."""
    if kind in ("craft", "fit") and world.station_possible:
        return [state]  # a signal station needs no lens
    if kind == "form":
        options = [form_deduction(world, state, name, cut)]
    elif kind == "fit":
        options = [fit_lens(world, state)]
    elif kind == "craft":
        options = [craft_lens(world, state, human) for human in world.humans]
    else:
        options = fetch_options(world, state, name, cut)
    options = [option for option in options if option is not None]
    if kind == "fetch":
        return sorted(options, key=lambda s: (s.pinned[name], s.coins))
    return sorted(options, key=lambda s: s.progress)


def search_cards(world: World, goal: str = "time") -> State | None:
    """Depth-first search over who fetches what. Two cards of a deduction never share a seat.

    goal "time": finish first, then fewest coins (this is best play).
    goal "tidy": the same, then the least partner work, then the earliest deductions. It reads
                 better in a paper playtest.
    goal "work": the least partner work first, then the earliest finish. It shows the cheapest
                 plan for the partners.
    """
    best: list = [None]

    def rank(state: State) -> tuple:
        if goal == "work":
            return (state.work, state.progress, state.coins)
        if goal == "tidy":
            return (state.progress, state.coins, state.work, sum(state.formed.values()))
        return (state.progress, state.coins)

    def cut(finish: float, coins: int) -> bool:
        """True when a plan that finishes at `finish` for `coins` cannot win."""
        if best[0] is None or goal == "work":
            return False
        limit = (best[0].progress, best[0].coins)
        return (finish, coins) > limit if goal == "tidy" else (finish, coins) >= limit

    def go(state: State, index: int) -> None:
        if best[0] is not None and rank(state) >= rank(best[0]):
            return
        if index == len(WORK_ORDER):
            best[0] = state
            return
        kind, name = WORK_ORDER[index]
        for nxt in next_states(world, state, kind, name, cut):
            go(nxt, index + 1)

    go(State(world), 0)
    return best[0]


# ---- The finale, the totals and the budget ---------------------------------------------------
def lock_presses(world: World) -> int:
    """How many times the busiest player presses Lock: their own light, plus an equal share of
    the lights that partners man (only players aim and lock, CASE-FILE.md 10.4)."""
    humans = len(world.humans)
    partner_lights = max(0, world.lights_needed - humans)
    return 1 + math.ceil(partner_lights / humans)


def lock_seconds_needed(world: World) -> float:
    """Seconds the busiest player needs to press all their Lock buttons. The three locks must all
    fall inside the hold (night.lock_seconds), so this has to stay below it."""
    return lock_presses(world) * world.lock_press * world.pace


def night_minutes(world: World) -> float:
    """The least the Night of Three Lights needs after someone calls nightfall.

    Players climb to their own light. A partner needs an order and a 10 minute trip. Only players
    aim and lock. Aiming costs no request and a player can aim while the partners sail, so it
    overlaps their trip: a player gives the orders, climbs, aims every beam, and locks them one
    after another as soon as the last partner is on post (CASE-FILE.md 10.3 to 10.5)."""
    humans = len(world.humans)
    presses = lock_presses(world)
    lock_time = lock_seconds_needed(world) / 60
    ready_to_lock = (world.climb + presses * world.aim) * world.pace
    partner_lights = max(0, world.lights_needed - humans)
    if partner_lights == 0:
        return ready_to_lock + lock_time
    orders = partner_lights * world.order * world.pace
    partners_on_post = orders + world.errand
    return max(partners_on_post, orders + ready_to_lock) + lock_time


def timetable_minutes(case: dict, column: str, phases: tuple) -> int:
    rows = case["planning"]["timetables"][column]
    return sum(row["minutes"] for row in rows if row["phase"] in phases)


def timetable_total(case: dict, column: str) -> int:
    return sum(row["minutes"] for row in case["planning"]["timetables"][column])


def timetable_for(case: dict, phases: tuple, partners: int) -> float:
    """A timetable number for a crew with `partners` partners. 0 partners is the crew-of-four
    column and 3 partners the solo column. 1 and 2 partners lie in between, because CASE-FILE.md
    15.4 says two or three players with partners take 120 to 150 minutes."""
    crew = timetable_minutes(case, "crew_of_four", phases)
    solo = timetable_minutes(case, "solo_with_three_partners", phases)
    return crew + (solo - crew) * partners / 3


def budget_minutes(case: dict, player_kits: tuple, shortcuts: bool) -> float:
    """The promised total for this crew, from planning.expected_totals_minutes.

    Four identical kits have their own two numbers. Every other crew lies between the crew of
    four (120) and solo (150) by the number of partners: 120, 130, 140, 150."""
    totals = case["planning"]["expected_totals_minutes"]
    if len(player_kits) == 4 and len(set(player_kits)) == 1:
        key = "four_identical_endings_free_routes_only"
        if shortcuts:
            key = "four_identical_endings_buying_shortcuts"
        return totals[key]
    crew, solo = totals["crew_of_four_mixed_endings"], totals["solo_with_three_partners"]
    return crew + (solo - crew) * (4 - len(player_kits)) / 3


def wallets_left(world: World, state: State) -> dict:
    """Coins each player has left after the plan's shortcuts and the one building."""
    left = {i: world.start_coins[i] - state.spent[i] for i in world.humans}
    builders = [i for i in world.humans if world.seats[i].kit in world.ferry_kits]
    builder = max(builders or world.humans, key=lambda i: (left[i], -i))
    left[builder] -= world.building_price
    return left


def partner_errands(world: World, state: State) -> dict:
    """Count what a plan asks of its partners, and which line each errand needs."""
    fetches = pins = 0
    lines: set = set()
    for event in state.events:
        if event[0] != "fetch" or not world.seats[event[1]].partner:
            continue
        pins += 1
        lines |= {("order_accepted", "pin"), ("pinned_card", event[2])}
        if not world.route_by_id[event[3]].get("starts_in_journal"):
            fetches += 1
            lines |= {("order_accepted", "go"), ("arrived", "any"), ("found_card", event[2])}
    trips = max(0, world.lights_needed - len(world.humans))
    if trips:
        lines |= {("order_accepted", "man_light"), ("manning_light", "any")}
    minutes = world.errand * (fetches + trips) + world.pin * pins
    return {"fetches": fetches, "pins": pins, "trips": trips, "minutes": minutes, "lines": lines}


class Study:
    """Plays crews against one case file and remembers every answer."""

    def __init__(
        self, case: dict, settings: Settings = DEFAULT_SETTINGS, npc_order: tuple = NPC_KIT_ORDER
    ):
        self.case, self.settings, self.npc_order = case, settings, npc_order
        self.caches: dict = {}
        self.memo: dict = {}

    def run(self, kits: tuple, pace: float, shortcuts: bool, goal: str = "time") -> dict:
        key = (kits, pace, shortcuts, goal)
        if key not in self.memo:
            self.memo[key] = self.play(kits, pace, shortcuts, goal)
        return self.memo[key]

    def play(self, kits: tuple, pace: float, shortcuts: bool, goal: str) -> dict | None:
        """Play one crew from minute 0 to the Relighting. None if a card cannot be found."""
        case = self.case
        cache = self.caches.setdefault((pace, shortcuts), {})
        seats = make_seats(kits, self.npc_order)
        world = World(case, seats, pace, shortcuts, self.settings, cache)
        state = search_cards(world, goal)
        if state is None:
            return None
        left = wallets_left(world, state)
        if min(left.values()) < 0:  # the shortcuts do not fit the wallets: use free routes
            return self.play(kits, pace, False, goal)
        partners = 4 - len(kits)
        rules = night_minutes(world)
        allowance = timetable_for(case, ("night",), partners)
        fixed = timetable_for(case, ("act1", "muster", "accuse", "relighting"), partners)
        return {
            "kits": kits,
            "seats": seats,
            "world": world,
            "state": state,
            "call": state.progress,
            "night_rules": rules,
            "night_allowance": allowance,
            "wallets": left,
            "lock_seconds_needed": lock_seconds_needed(world),
            "total": fixed + state.progress + max(rules, allowance),
            "fixed": fixed,
            "budget": budget_minutes(case, kits, shortcuts),
            "shortcuts": shortcuts,
            "errands": partner_errands(world, state),
        }


def whole(minutes: float) -> int:
    """Round up to a whole case minute: a total is never rounded down."""
    return math.ceil(minutes - 1e-9)


# ---- Reports ---------------------------------------------------------------------------------
def render(header: list, rows: list, align: str) -> list[str]:
    """A plain-text table with automatic column widths. align: one l or r per column."""
    cells = [[str(c) for c in header]] + [[str(c) for c in row] for row in rows]
    widths = [max(len(row[i]) for row in cells) for i in range(len(header))]

    def line(row: list) -> str:
        pieces = [
            row[i].ljust(widths[i]) if align[i] == "l" else row[i].rjust(widths[i])
            for i in range(len(row))
        ]
        return "  ".join(pieces).rstrip()

    return [line(cells[0]), "  ".join("-" * w for w in widths)] + [line(r) for r in cells[1:]]


def show(header: list, rows: list, align: str) -> None:
    print("\n".join(render(header, rows, align)))


def spare_minutes(result: dict) -> int:
    return int(result["budget"] - whole(result["total"]))


def pace_limit(study: Study, kits: tuple, shortcuts: bool, first_time: float) -> float:
    """The slowest pace (steps of PACE_STEP, up to PACE_TOP) at which this crew still fits.

    0.0 means that not even best play (pace 1.0) fits."""

    def fits(pace: float) -> bool:
        result = study.run(kits, pace, shortcuts)
        return result["total"] <= result["budget"]

    pace = first_time
    if fits(pace):
        while pace + PACE_STEP <= PACE_TOP + 1e-9 and fits(pace + PACE_STEP):
            pace += PACE_STEP
        return pace
    while pace > 1.0 + 1e-9:
        pace = max(1.0, pace - PACE_STEP)
        if fits(pace):
            return pace
    return 0.0


def verdict_text(limit: float, first_time: float) -> str:
    if limit >= first_time:
        return "HOLDS"
    return "TIGHT" if limit >= 1.0 else "BREAKS"


def pace_text(limit: float) -> str:
    if limit == 0:
        return "none"
    return f"x{limit:.2f}" + ("+" if limit >= PACE_TOP else "")


def class_row(study: Study, name: str, mixes: list, pace: float) -> list:
    """One row of the class table: the fastest and the worst mix, and how much pace is spare."""
    free = {kits: study.run(kits, pace, False) for kits in mixes}
    quick = {kits: study.run(kits, pace, True) for kits in mixes}
    worst = max(mixes, key=lambda k: free[k]["total"])
    worst_quick = max(mixes, key=lambda k: quick[k]["total"])
    limit = pace_limit(study, worst, False, pace)
    if len(mixes) == 1 and len(set(mixes[0])) == 1 and len(mixes[0]) == 4:  # four identical kits
        limit = min(limit, pace_limit(study, worst_quick, True, pace))
    budgets = {free[worst]["budget"], quick[worst_quick]["budget"]}
    return [
        name,
        len(mixes),
        whole(min(r["total"] for r in free.values())),
        whole(free[worst]["total"]),
        whole(quick[worst_quick]["total"]),
        "/".join(str(whole(b)) for b in sorted(budgets, reverse=True)),
        f"{spare_minutes(free[worst]):+d}",
        pace_text(limit),
        verdict_text(limit, pace),
        mix_label(worst),
    ]


def print_class_table(study: Study, pace: float) -> None:
    header = [
        "Class",
        "Mixes",
        "Fastest",
        "Worst",
        "Shortcuts",
        "Budget",
        "Spare",
        "Pace",
        "Verdict",
        "Worst mix",
    ]
    rows = [class_row(study, n, m, pace) for n, m in mixes_by_class().items()]
    show(header, rows, "lrrrrrrrll")
    counts = Counter(row[8] for row in rows)
    print(f"""
Fastest, Worst: total minutes at pace {pace:g} (free routes) of the fastest and slowest mix.
Shortcuts: the slowest mix when players may buy shortcuts. Spare: Budget minus Worst.
Budget: the promise. Four identical kits show two numbers: free routes / with shortcuts.
Pace: how many times slower than the planning minutes the worst mix may play and still fit.
HOLDS fits at pace {pace:g}. TIGHT fits only at a pace from 1 up to {pace:g}. BREAKS: not even at 1.
Result: {counts["HOLDS"]} classes HOLD, {counts["TIGHT"]} are TIGHT, {counts["BREAKS"]} BREAK.""")


def print_night_table(study: Study, pace: float) -> None:
    header = [
        "Players",
        "Partners",
        "Rules need (best)",
        "Rules need (first-time)",
        "Timetable gives",
        "Night lasts at most",
        "Lock presses",
        "Seconds to press them",
        "Hold",
    ]
    rows = []
    for players in (4, 3, 2, 1):
        kits = KIT_ORDER[:players]
        best, first = study.run(kits, 1.0, False), study.run(kits, pace, False)
        rows.append(
            [
                players,
                4 - players,
                whole(best["night_rules"]),
                whole(first["night_rules"]),
                whole(first["night_allowance"]),
                study.case["night"]["night_minutes"],
                lock_presses(first["world"]),
                f"{first['lock_seconds_needed']:g}",
                f"{study.case['night']['lock_seconds']} s",
            ]
        )
    show(header, rows, "rrrrrrrrr")


def print_coin_table(study: Study, pace: float) -> None:
    header = [
        "Players",
        "Most spent on shortcuts (crew)",
        "Most by one player",
        "Lowest wallet left (shortcuts)",
        "Lowest wallet left (free)",
    ]
    rows = []
    for players in (1, 2, 3, 4):
        crews = [k for k in all_mixes() if len(k) == players]
        quick = [study.run(k, pace, True) for k in crews]
        free = [study.run(k, pace, False) for k in crews]
        rows.append(
            [
                players,
                max(r["state"].coins for r in quick),
                max(max(r["state"].spent) for r in quick),
                min(min(r["wallets"].values()) for r in quick),
                min(min(r["wallets"].values()) for r in free),
            ]
        )
    show(header, rows, "rrrrr")


def print_workload_table(study: Study, pace: float) -> None:
    """What a solo run asks of its 3 partners: the fastest plan and the cheapest plan."""
    header = [
        "Crew",
        "Fastest: orders",
        "partner min",
        "cards done",
        "Cheapest: orders",
        "partner min",
        "cards done",
    ]
    rows = []
    for kits in [k for k in all_mixes() if len(k) == 1]:
        row = [f"solo {mix_label(kits)}"]
        for goal in ("tidy", "work"):
            result = study.run(kits, pace, False, goal)
            e = result["errands"]
            row += [e["fetches"] + e["pins"] + e["trips"], e["minutes"], whole(result["call"])]
        rows.append(row)
    show(header, rows, "lrrrrrr")


def print_all_mixes(study: Study, pace: float) -> None:
    header = [
        "Mix",
        "Players",
        "D4 best",
        "D4 best+shortcuts",
        "Best play",
        "First-time",
        "Shortcuts",
        "Coins",
        "Budget",
        "Spare",
    ]
    rows = []
    for kits in all_mixes():
        best, quick_best = study.run(kits, 1.0, False), study.run(kits, 1.0, True)
        free, quick = study.run(kits, pace, False), study.run(kits, pace, True)
        rows.append(
            [
                mix_label(kits),
                len(kits),
                whole(best["state"].formed["D4"]),
                whole(quick_best["state"].formed["D4"]),
                whole(best["total"]),
                whole(free["total"]),
                whole(quick["total"]),
                quick["state"].coins,
                whole(free["budget"]),
                f"{spare_minutes(free):+d}",
            ]
        )
    show(header, rows, "lrrrrrrrrr")


def partner_codes(result: dict) -> str:
    return " ".join(KIT_CODES[seat.kit] for seat in result["seats"] if seat.partner)


def print_kit_orders(case: dict, settings: Settings, pace: float) -> None:
    """Compare the NPC kit order of NPC-PARTNERS.md (now) with the old one of CASE-FILE.md."""
    new, old = Study(case, settings, NPC_KIT_ORDER), Study(case, settings, OLD_NPC_KIT_ORDER)
    with_partners = [k for k in all_mixes() if len(k) < 4]
    rows, gains = [], []
    for kits in with_partners:
        if fill_partners(kits, NPC_KIT_ORDER) == fill_partners(kits, OLD_NPC_KIT_ORDER):
            continue
        a, b = new.run(kits, pace, False), old.run(kits, pace, False)
        gains.append(whole(b["total"]) - whole(a["total"]))
        rows.append(
            [
                mix_label(kits),
                partner_codes(a),
                whole(a["total"]),
                partner_codes(b),
                whole(b["total"]),
                f"{gains[-1]:+d}",
            ]
        )
    show(
        ["Players", "New partners", "New total", "Old partners", "Old total", "New saves"],
        rows,
        "llrlrr",
    )
    print(
        f"\nPace {pace:g}, free routes. The two orders give different partners in {len(rows)} "
        f"of the {len(with_partners)} mixes with partners.\nThe new order is faster in "
        f"{sum(g > 0 for g in gains)}, slower in {sum(g < 0 for g in gains)} and equal in "
        f"{sum(g == 0 for g in gains)}. Minutes saved in total: {sum(gains)}."
    )


def count_lines(lines: dict) -> int:
    groups = [group for event in lines["events"].values() for group in event["lines"].values()]
    return sum(len(group) for group in groups)


def missing_lines(lines: dict, needed: set) -> list:
    """Every (event, variant) a plan needs that the line bank does not have."""
    events = lines["events"]
    return sorted(p for p in needed if not events.get(p[0], {}).get("lines", {}).get(p[1]))


def run_checks(study: Study, lines: dict, pace: float) -> list:
    """The hard checks. Each is (passed, sentence). A failed check makes the exit code 1."""
    case, mixes = study.case, all_mixes()
    free = [study.run(k, pace, False) for k in mixes]
    unsolved = [mix_label(mixes[i]) for i, result in enumerate(free) if result is None]
    plans = [r for r in free + [study.run(k, pace, True) for k in mixes] if r is not None]
    pairs = (("C3", "C4"), ("C1", "C2"), ("C5", "C6"), ("C7", "C8"))
    split = [
        r for r in plans if any(r["state"].holder[a] == r["state"].holder[b] for a, b in pairs)
    ]
    left = min(min(r["wallets"].values()) for r in plans)
    limit = case["night"]["night_minutes"]
    long_night = sorted({mix_label(r["kits"]) for r in plans if r["night_rules"] > limit})
    hold = case["night"]["lock_seconds"]
    slowest_locks = max(r["lock_seconds_needed"] for r in plans)
    needed = set().union(*(r["errands"]["lines"] for r in plans))
    missing = missing_lines(lines, needed)
    problems = check_route_estimates(case)
    routes = sum(len(card["routes"]) for card in case["cards"])
    promised = case["planning"]["expected_totals_minutes"]
    crew = timetable_total(case, "crew_of_four")
    solo = timetable_total(case, "solo_with_three_partners")
    sums_match = (crew, solo) == (
        promised["crew_of_four_mixed_endings"],
        promised["solo_with_three_partners"],
    )
    return [
        (sums_match, f"the two timetables add up to {crew} and {solo} minutes, as promised"),
        (
            not problems,
            f"{routes} routes: estimate_minutes matches the planning formula"
            + (f" (wrong: {problems[0]})" if problems else ""),
        ),
        (
            not unsolved,
            f"{len(mixes) - len(unsolved)} of {len(mixes)} mixes find all 8 cards on "
            "free routes" + (f" (stuck: {', '.join(unsolved)})" if unsolved else ""),
        ),
        (not split, "every deduction in every plan uses cards from two different seats"),
        (left >= 0, f"no mix runs out of coins: the lowest wallet left in any plan is {left}"),
        (
            not long_night,
            f"the night fits in {limit} minutes for every mix"
            + (f" (too long: {', '.join(long_night)})" if long_night else ""),
        ),
        (
            slowest_locks < hold,
            f"one player can press all their Lock buttons inside the {hold} "
            f"second hold: {slowest_locks:g} seconds at pace {pace:g} in the worst mix",
        ),
        (
            not missing,
            f"the line bank ({count_lines(lines)} lines) covers all {len(needed)} kinds "
            "of errand line the plans use" + (f" (missing: {missing[0]})" if missing else ""),
        ),
    ]


def explain_lines(study: Study, kits: tuple, pace: float, shortcuts: bool) -> list[str]:
    """A paper playtest of one crew: who finds which card, when, and how the total adds up."""
    result = study.run(kits, pace, shortcuts, "tidy")
    world, state, case = result["world"], result["state"], study.case
    noun = "player" if len(kits) == 1 else "players"
    mode = "with shortcuts" if shortcuts else "free routes only"
    if study.settings.pre_position:
        mode += ", players walk to a place before its card opens"
    out = [
        f"Paper playtest: {mix_label(kits)} ({len(kits)} {noun}), pace {pace:g}, {mode}",
        "Seats:",
    ]
    for seat in result["seats"]:
        out.append(
            f"  seat {seat.index + 1}: {'partner' if seat.partner else 'player'}, "
            f"{KIT_CODES[seat.kit]}"
        )
    light = "a home signal station" if world.station_possible else "the ruin with a workshop lens"
    out += [f"Third light: {light} (one building, {world.building_price} coins)", "", "Timeline:"]
    steps = []
    for event in state.events:
        if event[0] == "fetch":
            _, seat, card, route, ready, pinned = event
            who = f"seat {seat + 1} ({KIT_CODES[world.seats[seat].kit]})"
            steps.append((pinned, f"{card} pinned by {who} via {route}, in hand at {ready:.1f}"))
        elif event[0] == "form":
            steps.append((event[3], f"{event[1]} forms, seat {event[2] + 1} pairs the cards"))
        else:
            action = "makes the lens at home" if event[0] == "craft" else "fits the lens"
            steps.append((event[2], f"seat {event[1] + 1} {action}"))
    out += [f"  {minute:6.1f}  {text}" for minute, text in sorted(steps)]
    out += [
        "",
        f"Nightfall can be called at minute {result['call']:.1f}. The rules need "
        f"{result['night_rules']:.1f} minutes for the night; the timetable gives "
        f"{result['night_allowance']:.1f}.",
    ]
    partners = 4 - len(kits)
    marks = (
        ("D2", ("first_leads",)),
        ("D3", ("first_leads", "follow_the_money")),
        ("D4", ("first_leads", "follow_the_money", "the_teeth")),
    )
    out += ["", "Against the timetable (case minutes, intro not counted):"]
    for name, phases in marks:
        out.append(
            f"  {name} forms at {state.formed[name]:.1f}; the timetable allows "
            f"{timetable_for(case, phases, partners):.1f}"
        )
    out.append("")
    out.append(
        f"Total {result['total']:.1f} = {result['fixed']:.1f} (Act 1, muster, accuse, "
        f"Relighting) + {result['call']:.1f} (cards) + "
        f"{max(result['night_rules'], result['night_allowance']):.1f} (night). "
        f"Budget {result['budget']:.1f}."
    )
    return out


# What the --tune table tries: (label, paths inside case.json that move together, values to try).
# The last lever changes an assumption of this program instead of a number in case.json. The
# two yard timers move together because linter rule L7 keeps the kit route the shortest.
LEVERS = (
    (
        "C5 yard timers: shift and gate (15)",
        [
            ("cards", "C5", "routes", "C5.yard_shift", "timer_minutes"),
            ("cards", "C5", "routes", "C5.yard_gate_timed", "timer_minutes"),
        ],
        [10, 20],
    ),
    (
        "shift_change open_minutes (8)",
        [("case_clock", "windows", "shift_change", "open_minutes")],
        [5, 10],
    ),
    ("C8.ruin timer_minutes (5)", [("cards", "C8", "routes", "C8.ruin", "timer_minutes")], [3, 8]),
    (
        "partner errand minutes (10)",
        [("planning", "partner_minutes_copied_from_npc_partners_md", "errand")],
        [8, 12],
    ),
    ("planning pair_minutes (2)", [("planning", "pair_minutes")], [1, 4]),
    ("planning find_spot_minutes (2)", [("planning", "find_spot_minutes")], [1, 3]),
    ("assumption: ORDER_MINUTES (1)", [("order",)], [2, 3]),
)


def set_by_path(data, path: tuple, value) -> None:
    """Change one number inside case data. A path step that names a list item uses its id."""
    for key in path[:-1]:
        if isinstance(data, list):
            data = next(item for item in data if item["id"] == key)
        else:
            data = data[key]
    data[path[-1]] = value


def trial_study(study: Study, paths: list, value) -> Study:
    """A copy of the study with one lever moved."""
    if paths == [("order",)]:
        return Study(study.case, study.settings._replace(order=value), study.npc_order)
    changed = copy.deepcopy(study.case)
    for path in paths:
        set_by_path(changed, path, value)
    return Study(changed, study.settings, study.npc_order)


def print_lever_table(study: Study, pace: float) -> None:
    """Move one lever at a time and show how the totals of three telling crews change."""
    crews = [KIT_ORDER]
    for size in (4, 1):
        mixes = [k for k in all_mixes() if len(k) == size]
        crews.append(max(mixes, key=lambda k: study.run(k, pace, False)["total"]))
    base = [whole(study.run(k, pace, False)["total"]) for k in crews]
    rows = []
    for label, paths, values in LEVERS:
        for value in values:
            other = trial_study(study, paths, value)
            totals = [whole(other.run(k, pace, False)["total"]) for k in crews]
            rows.append([label, value] + [f"{totals[i] - base[i]:+d}" for i in range(len(crews))])
    print(
        f"Change in total minutes (pace {pace:g}, free routes). Base totals: "
        + ", ".join(f"{mix_label(crews[i])} {base[i]}" for i in range(len(crews)))
    )
    show(["Lever (today)", "Try"] + [mix_label(k) for k in crews], rows, "lr" + "r" * len(crews))


def parse_kits(text: str) -> tuple:
    by_code = {code: kit for kit, code in KIT_CODES.items()}
    codes = [part.strip().upper() for part in text.split(",") if part.strip()]
    if not 1 <= len(codes) <= 4 or any(code not in by_code for code in codes):
        raise SystemExit("--explain wants 1 to 4 kit codes from TK, WI, IN, ST, e.g. TK,WI,IN,ST")
    return tuple(sorted((by_code[c] for c in codes), key=KIT_ORDER.index))


def parse_args(argv: list | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check the case against its promised minutes.")
    parser.add_argument("--all", action="store_true", help="also print all 69 mixes")
    parser.add_argument("--explain", metavar="KITS", help="paper playtest of one mix, e.g. TK,WI")
    parser.add_argument("--shortcuts", action="store_true", help="with --explain: buy shortcuts")
    parser.add_argument("--tune", action="store_true", help="show what each lever does")
    parser.add_argument("--kit-orders", action="store_true", help="compare the two NPC kit orders")
    parser.add_argument("--log-readers", action="store_true", help="every player read Elena's log")
    parser.add_argument(
        "--pre-position",
        action="store_true",
        help="players may walk to a place and search it before its card opens",
    )
    parser.add_argument("--pace", type=float, default=FIRST_TIME_PACE, help="first-time pace")
    parser.add_argument(
        "--order-minutes",
        type=float,
        default=ORDER_MINUTES,
        help="assumption: minutes a player needs to give a partner the next order",
    )
    parser.add_argument(
        "--aim-minutes",
        type=float,
        default=AIM_MINUTES,
        help="assumption: minutes a player needs to aim one beam",
    )
    parser.add_argument(
        "--lock-seconds",
        type=float,
        default=LOCK_PRESS_SECONDS,
        help="assumption: seconds one press of Lock takes",
    )
    parser.add_argument("--case", type=Path, default=CASE_FILE, help="path to case.json")
    parser.add_argument("--lines", type=Path, default=LINES_FILE, help="path to partners.json")
    return parser.parse_args(argv)


def main(argv: list | None = None) -> int:
    args = parse_args(argv)
    case, lines = load_json(args.case), load_json(args.lines)
    if case.get("format_version") != 1:
        raise SystemExit("This check reads case.json format_version 1 only.")
    settings = Settings(
        args.log_readers, args.order_minutes, args.aim_minutes, args.pre_position, args.lock_seconds
    )
    study = Study(case, settings)
    stuck = [mix_label(k) for k in all_mixes() if study.run(k, args.pace, False) is None]
    if stuck:
        print(f"FAIL  these mixes cannot find all 8 cards on free routes: {', '.join(stuck)}")
        return 1
    if args.explain:
        print("\n".join(explain_lines(study, parse_kits(args.explain), args.pace, args.shortcuts)))
        return 0
    if args.kit_orders:
        print_kit_orders(case, settings, args.pace)
        return 0
    print(f"Case timing check: {case['title']} ({case['case_id']}). Times are case minutes.")
    print(
        f"Pace {args.pace:g} = first-time crews. Pace 1 = best play. NPC kit order: "
        + ", ".join(KIT_CODES[k] for k in NPC_KIT_ORDER)
        + ".\n"
    )
    print_class_table(study, args.pace)
    for title, printer in (
        ("The finale", print_night_table),
        ("Coins", print_coin_table),
        ("What a solo run asks of partners", print_workload_table),
    ):
        print(f"\n{title}")
        printer(study, args.pace)
    if args.all:
        print("\nAll 69 mixes")
        print_all_mixes(study, args.pace)
    if args.tune:
        print("\nLevers")
        print_lever_table(study, args.pace)
    checks = run_checks(study, lines, args.pace)
    print("\nChecks")
    for passed, sentence in checks:
        print(f"  {'PASS' if passed else 'FAIL'}  {sentence}")
    return 0 if all(passed for passed, _ in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
