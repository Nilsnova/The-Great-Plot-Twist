"""Treasury response boundaries reject invented scope/effects and preserve retry history."""

from copy import deepcopy

import pytest

from server.island import treasury_store
from server.island.treasury import TreasuryAccount
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_treasury import ACCOUNT, ACTOR, EPOCH, OPERATION, OWNER, envelope


def result():
    return {
        "status": "done",
        "repeat": True,
        "currentEconomy": envelope(balance=150, committed=0, revision=3),
        "accountState": "active",
        "admissionState": "active",
        "receipt": {
            "id": OPERATION,
            "accountId": ACCOUNT,
            "runEpoch": EPOCH,
            "actorId": ACTOR,
            "actionUid": "spend001",
            "kind": "spend",
            "reason": "building_purchase",
            "reference": "build:1",
            "balanceDelta": "-20",
            "committedDelta": "0",
            "balanceAtCommit": "180",
            "committedAtCommit": "0",
            "revisionAtCommit": "2",
            "sourceReservationId": None,
        },
    }


def test_retry_separates_original_balance_from_fresh_account():
    parsed = treasury_store.read_result(result())
    assert parsed.repeat is True
    assert parsed.receipt.balance_at_commit == 180
    assert parsed.account.balance_coins == 150
    assert parsed.receipt.revision_at_commit == 2
    assert parsed.account.revision == 3


@pytest.mark.parametrize(
    "key,value",
    [
        ("balanceDelta", 20),
        ("committedDelta", "-0"),
        ("balanceAtCommit", "-1"),
        ("revisionAtCommit", "4"),
        ("revisionAtCommit", "0"),
        ("runEpoch", "00000000-0000-0000-0000-000000000099"),
        ("kind", "reserve"),
        ("sourceReservationId", OPERATION),
    ],
)
def test_inconsistent_receipt_is_unreadable(key, value):
    row = result()
    row["receipt"][key] = value
    with pytest.raises(SupabaseRejected):
        treasury_store.read_result(row)


def test_missing_or_non_boolean_repeat_is_unreadable():
    for value in (None, 1, "true"):
        row = result()
        row["repeat"] = value
        with pytest.raises(SupabaseRejected):
            treasury_store.read_result(row)


def test_extremely_large_integral_balance_has_no_hidden_python_digit_ceiling():
    huge = 10**5000
    account = TreasuryAccount(ACCOUNT, OWNER, EPOCH, huge, 0, 1, "active", "active")
    dto = account.envelope()
    assert dto["treasury"]["balanceCoins"] == "1" + "0" * 5000
    assert treasury_store.read_envelope(deepcopy(dto)).balance_coins == huge
