"""The seat rules of a crew: which kit each NPC partner carries and which seat a friend takes.

A crew has four seats. A seat holds a player or an NPC partner (a crew mate the game runs), and
every seat carries one of four entry kits: true_keeper, witness, informant, stranger. A crew
solves the case best when all four kits are in it, so the partners carry the kits that the
players are missing.

The rules, in plain words:
  * The muster (partner_seats): when a crew sails, every empty seat gets a partner. Starting from
    the kits the players carry, each empty seat in turn (lowest number first) gets the first kit
    of NPC_KIT_ORDER that nobody carries yet.
  * A friend joining (seat_for_friend): the lowest empty seat first. If there is none, the
    friend takes over the partner who carries the friend's own kit. If no partner does, the
    friend takes over the partner whose kit comes last in NPC_KIT_ORDER, so the partners who stay
    keep the kits that are still missing. A crew of four players has no seat for a friend.
  * The kit afterwards (kit_after_takeover): the friend keeps their own kit.

These are pure functions: no database, no network, so a test can try every case. The database
functions in supabase/migrations/20261106040000_crew_codes.sql write the result.

Used by: service.py and the tests.
"""

from dataclasses import dataclass

# The four entry kits. The same list is in the database rule crew_seats_kit_allowed and in
# backend/content/entry_kits.json (package A3). A test compares them.
KITS = ("true_keeper", "witness", "informant", "stranger")

# Decided by Nils in the story round (D018, decision 12; a team call, confirmed at kickoff):
# the order in which partners fill the kits that the players are missing. NPC-PARTNERS.md 4.2
# and CASE-FILE.md list the same order.
NPC_KIT_ORDER = ("informant", "stranger", "true_keeper", "witness")

# Decided by Nils in the story round (D018, decision 10): which kit a seat carries after a
# friend takes over a partner's seat. The friend keeps their own kit. If this is False, the
# seat keeps the kit of the partner who stepped aside.
FRIEND_KEEPS_OWN_KIT = True

SEAT_NUMBERS = (1, 2, 3, 4)

# The NPC partner of each seat: its id (stored in crew_seats.npc_id) and the title players see.
# The partner follows the seat number, so a partner is never in two seats.
PARTNERS = {
    1: ("lookout", "the Lookout"),
    2: ("deckhand", "the Deckhand"),
    3: ("bosun", "the Bosun"),
    4: ("cook", "the Cook"),
}

# The title of each partner by its id. A seat shows the title, never the raw id.
PARTNER_TITLES = {npc_id: title for npc_id, title in PARTNERS.values()}


@dataclass(frozen=True)
class Seat:
    """One taken seat. Exactly one of player_id and npc_id is filled in, like the database rule.

    `name` is what other players see: the player's display name, or the partner's title.
    """

    seat_no: int
    player_id: str | None
    npc_id: str | None
    kit: str | None
    name: str | None


def partner_title(npc_id: str) -> str:
    """The title players see for an NPC partner. An id we do not know is shown as plain words."""
    return PARTNER_TITLES.get(npc_id, npc_id.replace("_", " "))


def open_seat_numbers(seats: list[Seat]) -> list[int]:
    """The seat numbers that nobody holds, lowest first. A seat that nobody holds has no row."""
    taken = {seat.seat_no for seat in seats}
    return [number for number in SEAT_NUMBERS if number not in taken]


def first_missing_kit(covered: set[str]) -> str:
    """The first kit of NPC_KIT_ORDER that is not in `covered`.

    Raises ValueError if every kit is covered. That cannot happen while a seat is open, because
    a crew has only four seats.
    """
    for kit in NPC_KIT_ORDER:
        if kit not in covered:
            return kit
    raise ValueError("Every kit is covered already.")


def partner_seats(seats: list[Seat]) -> list[Seat]:
    """The partners that fill the empty seats at the muster, lowest seat number first."""
    covered = {seat.kit for seat in seats if seat.player_id is not None and seat.kit is not None}
    partners = []
    for seat_no in open_seat_numbers(seats):
        kit = first_missing_kit(covered)
        covered.add(kit)
        npc_id, title = PARTNERS[seat_no]
        partners.append(Seat(seat_no, None, npc_id, kit, title))
    return partners


def kit_rank(kit: str | None) -> int:
    """Where a kit stands in NPC_KIT_ORDER (0 is first). A kit that is not on the list is -1."""
    if kit in NPC_KIT_ORDER:
        return NPC_KIT_ORDER.index(kit)
    return -1


def last_partner_seat(partners: list[Seat]) -> int | None:
    """The seat of the partner whose kit comes last in NPC_KIT_ORDER. None if there is none."""
    chosen_seat = None
    chosen_rank = -2
    for seat in partners:
        rank = kit_rank(seat.kit)
        if rank > chosen_rank:
            chosen_seat = seat.seat_no
            chosen_rank = rank
    return chosen_seat


def seat_for_friend(seats: list[Seat], friend_kit: str) -> int | None:
    """The seat number a friend with this kit takes. None if all four seats hold players."""
    open_numbers = open_seat_numbers(seats)
    if open_numbers:
        return open_numbers[0]
    partners = [seat for seat in seats if seat.npc_id is not None]
    for seat in partners:
        if seat.kit == friend_kit:
            return seat.seat_no
    return last_partner_seat(partners)


def kit_after_takeover(friend_kit: str, replaced_partner_kit: str | None) -> str:
    """The kit a seat carries after a friend sits down in it.

    `replaced_partner_kit` is the kit of the partner who stepped aside, or None if the seat was
    empty. See FRIEND_KEEPS_OWN_KIT (decided by Nils in the story round, D018).
    """
    if replaced_partner_kit is None or FRIEND_KEEPS_OWN_KIT:
        return friend_kit
    return replaced_partner_kit
