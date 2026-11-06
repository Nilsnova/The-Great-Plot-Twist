"""Tests for crews/seats.py: which kit each NPC partner carries and which seat a friend takes.

The rules are pure functions, so these tests need no database and no network.

The examples table below is worked out by hand from the rule (the partners fill the missing kits
in the order informant, stranger, true_keeper, witness), not by running the code. The two
decisions that Nils made in the story round (D018) are pinned by their own tests, so changing
either one is a deliberate act:
  * story decision 12: the order in which partners fill missing kits,
  * story decision 10: a friend who takes over a partner's seat keeps their own kit.
"""

import itertools

import pytest

from server.crews.seats import (
    FRIEND_KEEPS_OWN_KIT,
    KITS,
    NPC_KIT_ORDER,
    PARTNERS,
    SEAT_NUMBERS,
    Seat,
    first_missing_kit,
    kit_after_takeover,
    open_seat_numbers,
    partner_seats,
    partner_title,
    seat_for_friend,
)


def player(seat_no: int, kit: str) -> Seat:
    """A seat held by a player."""
    return Seat(seat_no, f"player-{seat_no}", None, kit, f"Player {seat_no}")


def partner(seat_no: int, kit: str) -> Seat:
    """A seat held by the NPC partner of that seat number."""
    npc_id, title = PARTNERS[seat_no]
    return Seat(seat_no, None, npc_id, kit, title)


def kits_of_partners(seats: list[Seat]) -> dict[int, str]:
    """Seat number to kit, for the partners in a list of seats."""
    return {seat.seat_no: seat.kit for seat in seats if seat.npc_id is not None}


# Every mix of 1 to 4 players' kits, order ignored: 4 + 10 + 20 + 35 = 69 mixes.
ALL_KIT_MIXES = [
    mix for size in range(1, 5) for mix in itertools.combinations_with_replacement(KITS, size)
]

# Every chain of a solo player and three friends who join one after the other: 4 x 4 x 4 x 4.
ALL_CHAINS = list(itertools.product(KITS, repeat=4))


# --- the lists the rules are built on ---


def test_there_are_four_kits_and_four_seats():
    assert KITS == ("true_keeper", "witness", "informant", "stranger")
    assert SEAT_NUMBERS == (1, 2, 3, 4)


def test_the_kit_order_is_informant_stranger_true_keeper_witness():
    # Story decision 12, decided by Nils (D018). Pinned here: change it on purpose or not at all.
    assert NPC_KIT_ORDER == ("informant", "stranger", "true_keeper", "witness")


def test_the_kit_order_holds_every_kit_once():
    assert sorted(NPC_KIT_ORDER) == sorted(KITS)


def test_partner_ids_follow_the_seat_number():
    seats = [player(4, "witness")]

    partners = partner_seats(seats)

    assert [(seat.seat_no, seat.npc_id, seat.name) for seat in partners] == [
        (1, "lookout", "the Lookout"),
        (2, "deckhand", "the Deckhand"),
        (3, "bosun", "the Bosun"),
    ]


def test_a_partner_is_shown_by_its_title():
    assert partner_title("bosun") == "the Bosun"
    assert partner_title("cook") == "the Cook"


def test_a_partner_we_do_not_know_is_shown_by_its_id_in_plain_words():
    assert partner_title("old_salt") == "old salt"


def test_every_partner_has_a_title_that_starts_with_the():
    assert all(title.startswith("the ") for _, title in PARTNERS.values())


# --- open seats ---


def test_open_seats_are_the_numbers_without_a_row_in_ascending_order():
    seats = [player(3, "witness"), partner(1, "informant")]

    assert open_seat_numbers(seats) == [2, 4]


def test_a_full_crew_has_no_open_seat():
    seats = [
        player(1, "witness"),
        player(2, "stranger"),
        player(3, "informant"),
        player(4, "witness"),
    ]

    assert open_seat_numbers(seats) == []


# --- the first missing kit ---


def test_the_first_missing_kit_follows_the_partner_order():
    assert first_missing_kit(set()) == "informant"
    assert first_missing_kit({"informant"}) == "stranger"
    assert first_missing_kit({"informant", "stranger"}) == "true_keeper"
    assert first_missing_kit({"informant", "stranger", "true_keeper"}) == "witness"


def test_a_covered_kit_is_skipped_wherever_it_stands_in_the_order():
    assert first_missing_kit({"stranger", "witness"}) == "informant"


def test_when_every_kit_is_covered_there_is_no_missing_kit():
    with pytest.raises(ValueError):
        first_missing_kit(set(KITS))


# --- the muster: partners fill the empty seats ---


@pytest.mark.parametrize(
    ("player_kits", "expected_partners"),
    [
        (["true_keeper"], {2: "informant", 3: "stranger", 4: "witness"}),
        (["witness"], {2: "informant", 3: "stranger", 4: "true_keeper"}),
        (["informant"], {2: "stranger", 3: "true_keeper", 4: "witness"}),
        (["stranger"], {2: "informant", 3: "true_keeper", 4: "witness"}),
        (["true_keeper", "witness"], {3: "informant", 4: "stranger"}),
        (["informant", "stranger"], {3: "true_keeper", 4: "witness"}),
        (["true_keeper", "witness", "informant"], {4: "stranger"}),
        (["witness", "witness"], {3: "informant", 4: "stranger"}),  # two identical kits
    ],
)
def test_partners_get_the_kits_in_the_examples_table(player_kits, expected_partners):
    seats = [player(number, kit) for number, kit in enumerate(player_kits, start=1)]

    partners = partner_seats(seats)

    assert kits_of_partners(partners) == expected_partners


def test_there_are_69_kit_mixes():
    assert len(ALL_KIT_MIXES) == 69


@pytest.mark.parametrize("mix", ALL_KIT_MIXES)
def test_partners_hold_the_first_missing_kits_for_all_69_kit_mixes(mix):
    seats = [player(number, kit) for number, kit in enumerate(mix, start=1)]
    missing_kits = [kit for kit in NPC_KIT_ORDER if kit not in mix]
    empty_seats = 4 - len(mix)

    partners = partner_seats(seats)

    assert [seat.kit for seat in partners] == missing_kits[:empty_seats]


def test_empty_seats_are_filled_from_the_lowest_number():
    seats = [player(2, "true_keeper"), player(3, "witness")]

    partners = partner_seats(seats)

    assert [(seat.seat_no, seat.kit) for seat in partners] == [(1, "informant"), (4, "stranger")]


def test_a_full_crew_gets_no_partner():
    seats = [player(number, "witness") for number in SEAT_NUMBERS]

    assert partner_seats(seats) == []


def test_a_partner_carries_no_player_id():
    partners = partner_seats([player(1, "witness")])

    assert all(seat.player_id is None and seat.npc_id is not None for seat in partners)


# --- which seat a friend takes ---


def test_a_friend_takes_the_lowest_open_seat_first():
    # Seat 3 is open, and a partner in seat 2 carries the friend's kit. The open seat still wins.
    seats = [player(1, "witness"), partner(2, "informant"), partner(4, "stranger")]

    assert seat_for_friend(seats, "informant") == 3


def test_a_friend_takes_the_lowest_of_several_open_seats():
    seats = [player(2, "witness"), player(4, "stranger")]

    assert seat_for_friend(seats, "informant") == 1


def test_a_friend_replaces_the_partner_with_the_same_kit():
    seats = [
        player(1, "witness"),
        partner(2, "informant"),
        partner(3, "stranger"),
        partner(4, "true_keeper"),
    ]

    assert seat_for_friend(seats, "stranger") == 3


def test_a_friend_replaces_the_last_partner_in_the_order_when_no_kit_matches():
    # The solo player has the witness kit, so no partner has it. The partner whose kit comes
    # last in the order (true_keeper, in seat 4) steps aside, and the others keep the kits that
    # are still missing.
    seats = [
        player(1, "witness"),
        partner(2, "informant"),
        partner(3, "stranger"),
        partner(4, "true_keeper"),
    ]

    assert seat_for_friend(seats, "witness") == 4


def test_a_friend_with_the_kit_of_a_player_replaces_the_last_partner_too():
    seats = [
        player(1, "true_keeper"),
        partner(2, "informant"),
        partner(3, "stranger"),
        partner(4, "witness"),
    ]

    assert seat_for_friend(seats, "true_keeper") == 4


def test_four_players_leave_no_seat():
    seats = [
        player(1, "witness"),
        player(2, "stranger"),
        player(3, "informant"),
        player(4, "witness"),
    ]

    assert seat_for_friend(seats, "true_keeper") is None


# --- the kit the seat carries afterwards ---


def test_the_seat_takes_the_friends_own_kit():
    # Story decision 10, decided by Nils (D018). Pinned here: the friend keeps their own kit.
    assert FRIEND_KEEPS_OWN_KIT is True
    assert kit_after_takeover("witness", "informant") == "witness"


def test_a_friend_in_an_open_seat_carries_their_own_kit_too():
    assert kit_after_takeover("stranger", None) == "stranger"


# --- chains of takeovers ---


def take_over(seats: list[Seat], friend_kit: str, number: int) -> list[Seat]:
    """The seats after one more friend joins, the way the join flow does it."""
    seat_no = seat_for_friend(seats, friend_kit)
    replaced = [seat for seat in seats if seat.seat_no == seat_no]
    replaced_kit = replaced[0].kit if replaced else None
    kit = kit_after_takeover(friend_kit, replaced_kit)
    others = [seat for seat in seats if seat.seat_no != seat_no]
    friend = Seat(seat_no, f"friend-{number}", None, kit, f"Friend {number}")
    return sorted([*others, friend], key=lambda seat: seat.seat_no)


def states_of_a_chain(kits: tuple[str, ...]) -> list[list[Seat]]:
    """A solo player, the muster, and then one state for each friend who joins."""
    seats = [player(1, kits[0])]
    seats = sorted([*seats, *partner_seats(seats)], key=lambda seat: seat.seat_no)
    states = [seats]
    for number, kit in enumerate(kits[1:], start=2):
        seats = take_over(seats, kit, number)
        states.append(seats)
    return states


def partners_hold_the_first_missing_kits(seats: list[Seat]) -> bool:
    """True if the partners carry exactly the first missing kits, each kit once."""
    player_kits = {seat.kit for seat in seats if seat.player_id is not None}
    partner_kits = [seat.kit for seat in seats if seat.npc_id is not None]
    missing_kits = [kit for kit in NPC_KIT_ORDER if kit not in player_kits]
    return sorted(partner_kits) == sorted(missing_kits[: len(partner_kits)])


def test_there_are_256_chains():
    assert len(ALL_CHAINS) == 256


@pytest.mark.parametrize("kits", ALL_CHAINS)
def test_partners_hold_the_first_missing_kits_after_every_chain_of_takeovers(kits):
    states = states_of_a_chain(kits)

    broken = [state for state in states if not partners_hold_the_first_missing_kits(state)]

    assert broken == []


@pytest.mark.parametrize("kits", ALL_CHAINS)
def test_a_chain_of_takeovers_never_leaves_two_seats_with_one_number(kits):
    states = states_of_a_chain(kits)

    assert all([seat.seat_no for seat in state] == [1, 2, 3, 4] for state in states)
