"""Heavier case checks: free routes, fair citations and every four-seat fill.

Used by: the content linter and pytest. Diagnostics name a rule and location, never story text.
"""

from dataclasses import dataclass
from itertools import combinations, combinations_with_replacement, permutations, product

from server.game.case_data import Card, CaseData, Route


@dataclass(frozen=True)
class LintSeat:
    """One player or partner seat in an exhaustive content check."""

    kit: str
    partner: bool


def seat_fills(data: CaseData) -> tuple[tuple[LintSeat, ...], ...]:
    """All player kit multisets, followed by every ordered choice of partner kits."""
    kits = tuple(kit.id for kit in data.kits)
    fills = []
    for player_count in range(1, 5):
        for players in combinations_with_replacement(kits, player_count):
            for partners in product(kits, repeat=4 - player_count):
                player_seats = tuple(LintSeat(kit, False) for kit in players)
                partner_seats = tuple(LintSeat(kit, True) for kit in partners)
                fills.append(player_seats + partner_seats)
    return tuple(fills)


def free_route(route: Route, kit: str) -> bool:
    """A route every profile of the kit can use without spending or a later unlock."""
    if route.kind not in ("kit", "open", "timed") or route.coins != 0:
        return False
    if route.needs_share or route.needs_profile or route.needs_world:
        return False
    return route.kind != "kit" or route.kit == kit


def reachable(card: Card, seat: LintSeat, data: CaseData) -> bool:
    """A partner additionally needs one of its supported, non-player-only route kinds."""
    for route in card.routes:
        if not free_route(route, seat.kit):
            continue
        if seat.partner and (
            route.players_only or route.kind not in data.partners.may_use_route_kinds
        ):
            continue
        return True
    return False


def check_free_routes(data: CaseData) -> list[str]:
    """L10: both log states of every kit can find every card for free."""
    problems = []
    expected = {(kit.id, read_log) for kit in data.kits for read_log in (False, True)}
    actual = {(profile.kit, profile.read_log) for profile in data.entry_profiles}
    if actual != expected or len(data.entry_profiles) != len(expected):
        problems.append("L10 at entry_profiles: every kit needs both log states exactly once.")
    for profile_no, profile in enumerate(data.entry_profiles):
        for card_no, card in enumerate(data.cards):
            if not any(free_route(route, profile.kit) for route in card.routes):
                problems.append(
                    f"L10 at entry_profiles[{profile_no}].cards[{card_no}]: no free route."
                )
    return problems


def check_reveal_citations(data: CaseData) -> list[str]:
    """L11: every reveal cites existing cards available to every entry profile."""
    problems = []
    if set(data.reveal.closing_lines) != {kit.id for kit in data.kits}:
        problems.append("L11 at reveal.closing_lines: every kit needs exactly one closing line.")
    lines = (
        *data.reveal.lines,
        *data.reveal.closing_lines.values(),
        data.reveal.log_reader_line,
        data.reveal.last_beat,
    )
    cards = {card.id: card for card in data.cards}
    for line_no, line in enumerate(lines):
        if not line.cites or any(card_id not in cards for card_id in line.cites):
            problems.append(f"L11 at reveal.lines[{line_no}]: citations must name existing cards.")
            continue
        for card_id in line.cites:
            if any(
                not any(free_route(route, profile.kit) for route in cards[card_id].routes)
                for profile in data.entry_profiles
            ):
                problems.append(f"L11 at reveal.lines[{line_no}]: a citation is not reachable.")
    return problems


def two_seats_can_find(
    data: CaseData, fill: tuple[LintSeat, ...], card_ids: tuple[str, ...]
) -> bool:
    """One distinct seat can supply each of a deduction's two cards."""
    if len(card_ids) != 2:
        return False
    cards = {card.id: card for card in data.cards}
    if any(card_id not in cards for card_id in card_ids):
        return False
    return any(
        reachable(cards[card_ids[0]], fill[first], data)
        and reachable(cards[card_ids[1]], fill[second], data)
        for first, second in permutations(range(len(fill)), 2)
    )


def lights_can_be_manned(data: CaseData, fill: tuple[LintSeat, ...]) -> bool:
    """Match distinct seats to the ready public lights and an affordable home light."""
    smallest_start = min(kit.start_coins for kit in data.kits)
    homes = {data.kit(seat.kit).home for seat in fill if not seat.partner}
    lights = [
        light
        for light in data.night.lights
        if light.tier == "must"
        and (
            light.ready.get("from_start")
            or (
                light.ready.get("building")
                and light.place in homes
                and light.planning_price_coins <= smallest_start
            )
        )
    ]
    needed = data.night.lights_needed
    for chosen in combinations(lights, needed):
        for seats in permutations(fill, needed):
            if all(
                not seat.partner or light.partners_may_man
                for light, seat in zip(chosen, seats, strict=True)
            ):
                return True
    return False


def check_seat_fills(data: CaseData) -> list[str]:
    """L12: every fill can form deductions with two seats and man the required lights."""
    problems = []
    for fill_no, fill in enumerate(seat_fills(data)):
        if any(
            not two_seats_can_find(data, fill, deduction.cards) for deduction in data.deductions
        ):
            problems.append(f"L12 at seat_fills[{fill_no}]: a deduction needs two capable seats.")
        if not lights_can_be_manned(data, fill):
            problems.append(f"L12 at seat_fills[{fill_no}]: too few capable seats for the lights.")
    return problems


LINT_RULES = {
    "L10": check_free_routes,
    "L11": check_reveal_citations,
    "L12": check_seat_fills,
}
