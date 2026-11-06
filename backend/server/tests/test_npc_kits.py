"""Case partner coverage uses A6's existing seat allocation and canonical kit order.

Used by: developers checking every starting crew and the partner starting-card handoff.
"""

from itertools import combinations_with_replacement

import pytest

from server.crews.seats import KITS, NPC_KIT_ORDER, Seat, partner_seats
from server.game.case_data import load_case
from server.game.case_store import open_arguments
from server.tests.case_rule_helpers import snapshot

MIXES = tuple(mix for size in range(1, 5) for mix in combinations_with_replacement(KITS, size))


@pytest.mark.parametrize("mix", MIXES, ids=[f"mix-{index:02}" for index in range(len(MIXES))])
def test_case_partners_use_the_first_missing_canonical_kits_for_all_69_mixes(mix):
    data = load_case()
    assert len(MIXES) == 69 and data.partners.kit_order == NPC_KIT_ORDER
    players = [Seat(index, f"player-{index}", None, kit, None) for index, kit in enumerate(mix, 1)]
    partners = partner_seats(players)
    missing = tuple(kit for kit in data.partners.kit_order if kit not in mix)
    assert tuple(partner.kit for partner in partners) == missing[: 4 - len(players)]
    assert all(partner.player_id is None and partner.npc_id is not None for partner in partners)


def test_empty_partner_seats_are_filled_from_the_lowest_number():
    players = [
        Seat(2, "player-2", None, "true_keeper", None),
        Seat(4, "player-4", None, "witness", None),
    ]
    assert [seat.seat_no for seat in partner_seats(players)] == [1, 3]


def test_a_witness_partners_starting_card_is_supplied_to_the_existing_case_open():
    data = load_case()
    players = [Seat(1, "player-1", None, "true_keeper", None)]
    partner = next(seat for seat in partner_seats(players) if seat.kit == "witness")
    starts = open_arguments(snapshot().crew_id, data)["p_start_cards"]
    starting = next(item for item in starts if item["kit"] == partner.kit)
    route = data.route(starting["route_id"])
    assert (
        route.starts_in_journal
        and route.kit == partner.kit
        and route.card_id == starting["card_id"]
    )
    assert route.timer_minutes == 0
