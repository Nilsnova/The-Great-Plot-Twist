"""Player intents and financial effect IDs cannot share an accidental namespace."""

from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.economy_operations import (
    effect_uid,
    read_operation_claim,
    root_action_uid,
    system_uid,
)
from server.supabase_admin import SupabaseRejected

OPERATION = str(UUID(int=91))


def test_child_effect_identity_is_stable_but_distinct_from_the_player_intent():
    charge = effect_uid(OPERATION, "charge")
    assert charge == "fx_0000000000000000000000000000005b_charge"
    assert effect_uid(OPERATION, "charge") == charge
    assert effect_uid(OPERATION, "refund") != charge
    assert len(charge) <= 64
    with pytest.raises(ApiError) as caught:
        root_action_uid(charge)
    assert caught.value.code == "invalid_transaction"


def test_system_identity_can_settle_an_origin_without_becoming_a_player_intent():
    source = system_uid(OPERATION, "settle")
    assert source == "sys_0000000000000000000000000000005b_settle"
    with pytest.raises(ApiError):
        root_action_uid(source)


@pytest.mark.parametrize("value", [None, True, 42, "short", "a" * 65, "invalid:action"])
def test_invalid_root_ids_are_rejected(value):
    with pytest.raises(ApiError) as caught:
        root_action_uid(value)
    assert caught.value.status_code == 422


@pytest.mark.parametrize("value", ["free0001", "paid0001", "A" * 64, OPERATION])
def test_existing_nonreserved_client_ids_remain_valid(value):
    assert root_action_uid(value) == value


@pytest.mark.parametrize("key", ["", "UPPER", "a" * 17, "not-an-effect", "child:charge"])
def test_effect_labels_are_bounded_server_keys(key):
    with pytest.raises(ApiError):
        effect_uid(OPERATION, key)


def test_matching_claim_and_replay_have_the_same_immutable_identity():
    first = read_operation_claim({"status": "claimed", "operationId": OPERATION, "repeat": False})
    again = read_operation_claim({"status": "replay", "operationId": OPERATION, "repeat": True})
    assert first.operation_id == again.operation_id == OPERATION
    assert first.repeat is False and again.repeat is True


@pytest.mark.parametrize(
    "reply",
    [
        None,
        {"status": "claimed", "operationId": OPERATION, "repeat": True},
        {"status": "replay", "operationId": OPERATION, "repeat": 1},
        {"status": "claimed", "operationId": "broken", "repeat": False},
        {"status": "claimed", "operationId": OPERATION, "repeat": False, "payer": "other"},
        {"status": "refused", "reason": "unknown"},
        {"status": "refused", "reason": []},
    ],
)
def test_unreadable_or_contradictory_claims_fail_closed(reply):
    with pytest.raises(SupabaseRejected):
        read_operation_claim(reply)


def test_changed_intent_is_the_shared_idempotency_conflict():
    with pytest.raises(ApiError) as caught:
        read_operation_claim({"status": "refused", "reason": "action_conflict"})
    assert (caught.value.status_code, caught.value.code) == (409, "idempotency_conflict")
