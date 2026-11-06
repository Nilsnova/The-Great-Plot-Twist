"""Parity: the case data says the same as the code and the files it has to agree with.

The case file (backend/content/secret/case.json) names kits, kit order, wallet reasons and refs
that other parts of the server define too. A copy that drifts is a bug that only shows when a real
player reaches that step, so each copy is compared here:

  * the four kits equal the entry kits file (ids, names, coins, start places, cheap cards),
  * the kit ids equal the seat kits of a crew (crews/seats.py),
  * the order in which partners fill the kits equals the crew's own order,
  * every reward and paid route reason is a wallet reason, with the right direction,
  * every wallet ref fits the database limit, filled with the longest ids.

Used by: pytest, with the other tests in backend/server/tests/.
"""

import pytest

from server.crews.seats import KITS, NPC_KIT_ORDER
from server.game.case_checks import filled_refs
from server.game.case_data import CASE_ID, CaseData, load_case
from server.game.entry_kits import load_entry_kits
from server.wallet import EARN, MAX_REF_LENGTH, SPEND, WALLET_REASONS, find_direction

# What the case file says about the longest ref: false_light:{crew_id}:npc:{order_uid}
# is 12 + 36 + 5 + 64 characters.
LONGEST_REF_LENGTH = 117


@pytest.fixture(scope="module")
def data() -> CaseData:
    return load_case()


def test_the_case_kits_equal_the_entry_kits_file(data):
    entry_kits = {kit.id: kit for kit in load_entry_kits().kits}

    assert {kit.id for kit in data.kits} == set(entry_kits)
    for kit in data.kits:
        entry = entry_kits[kit.id]
        assert kit.name == entry.name
        assert kit.start_coins == entry.coins
        assert kit.starts_at == entry.start_place
        assert kit.cheap_card == entry.cheap_card


def test_the_case_kit_ids_equal_the_seat_kits_of_a_crew(data):
    assert {kit.id for kit in data.kits} == set(KITS)
    assert len(data.kits) == len(KITS)


def test_the_partner_kit_order_equals_the_order_a_crew_fills_its_seats_in(data):
    assert data.partners.kit_order == NPC_KIT_ORDER


def test_every_reward_reason_is_on_the_wallet_reason_list(data):
    reasons = {coin.reason for coin in data.rewards.coins} | {data.rewards.paid_routes.reason}
    known = {name for name, _direction in WALLET_REASONS}

    assert reasons
    assert reasons <= known


def test_reward_reasons_add_coins_and_paid_route_reasons_take_them_away(data):
    for coin in data.rewards.coins:
        assert find_direction(coin.reason) == EARN
    assert find_direction(data.rewards.paid_routes.reason) == SPEND


def test_every_ref_fits_120_characters_with_the_longest_ids(data):
    refs = filled_refs(data)

    assert refs
    assert all(len(ref) <= MAX_REF_LENGTH for ref in refs.values())
    assert max(len(ref) for ref in refs.values()) == LONGEST_REF_LENGTH


def test_the_longest_ref_is_the_partner_shortcut(data):
    refs = filled_refs(data)
    longest = max(refs, key=lambda name: len(refs[name]))

    assert longest == "paid_routes.partner_ref"
    assert len(refs[longest]) == LONGEST_REF_LENGTH


def test_every_ref_starts_with_the_case_id(data):
    assert all(ref.startswith(f"{CASE_ID}:") for ref in filled_refs(data).values())
