"""Exact shared-island money and context tests; no personal-wallet caps or network."""

import asyncio
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.treasury import (
    EconomyContext,
    TreasuryAccount,
    admit,
    reserve,
    resolve_economy_context,
    settle,
    spend,
)
from server.supabase_admin import SupabaseRejected, SupabaseUnavailable

OWNER = str(UUID(int=801))
ACTOR = str(UUID(int=802))
ACCOUNT = str(UUID(int=803))
EPOCH = str(UUID(int=804))
OPERATION = str(UUID(int=805))


def envelope(balance=10**30, committed=7, revision=1):
    return {
        "mode": "island_shared",
        "version": 1,
        "islandOwner": OWNER,
        "accountId": ACCOUNT,
        "runEpoch": EPOCH,
        "revision": str(revision),
        "treasury": {
            "balanceCoins": str(balance),
            "committedCoins": str(committed),
            "availableCoins": str(balance - committed),
        },
    }


class FakeAdmin:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def context():
    return EconomyContext("island_shared", 1, ACTOR, OWNER, ACCOUNT, EPOCH, 1)


def test_exact_account_envelope_does_not_round_large_available_balance():
    account = TreasuryAccount(ACCOUNT, OWNER, EPOCH, 10**30, 7, 1, "active", "active")
    assert account.available_coins == 10**30 - 7
    assert account.envelope() == envelope()


def test_known_island_without_admission_is_the_only_legacy_result():
    admin = FakeAdmin({"status": "legacy", "islandOwner": OWNER})
    resolved = asyncio.run(resolve_economy_context(admin, ACTOR, OWNER))
    assert resolved == EconomyContext("personal_legacy", 0, ACTOR, OWNER, None, None, None)
    assert admin.calls == [("island_economy_context", {"p_island_owner": OWNER})]


def test_database_failure_never_becomes_personal_wallet_fallback():
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(resolve_economy_context(FakeAdmin(SupabaseUnavailable()), ACTOR, OWNER))


@pytest.mark.parametrize("reply", [None, [], {}, {"status": "ok"}, {"status": "other"}])
def test_unknown_or_unreadable_admission_fails_closed(reply):
    with pytest.raises(SupabaseRejected):
        asyncio.run(resolve_economy_context(FakeAdmin(reply), ACTOR, OWNER))


def test_missing_island_is_not_legacy():
    with pytest.raises(ApiError) as caught:
        asyncio.run(resolve_economy_context(FakeAdmin({"status": "missing_island"}), ACTOR, OWNER))
    assert (caught.value.status_code, caught.value.code) == (404, "no_such_island")


def test_shared_context_and_expected_epoch_are_exact():
    admin = FakeAdmin({"status": "ok", "economy": envelope()})
    assert (
        asyncio.run(resolve_economy_context(admin, ACTOR, OWNER, expected_epoch=EPOCH)) == context()
    )
    with pytest.raises(ApiError) as caught:
        asyncio.run(resolve_economy_context(admin, ACTOR, OWNER, expected_epoch=str(UUID(int=999))))
    assert caught.value.code == "economy_epoch_mismatch"


@pytest.mark.parametrize(
    "key,value",
    [
        ("balanceCoins", 100),
        ("balanceCoins", "01"),
        ("committedCoins", "-1"),
        ("availableCoins", "2.5"),
    ],
)
def test_money_dto_requires_canonical_decimal_strings(key, value):
    data = envelope()
    data["treasury"][key] = value
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            resolve_economy_context(FakeAdmin({"status": "ok", "economy": data}), ACTOR, OWNER)
        )


def test_inconsistent_available_amount_is_a_database_error():
    data = envelope()
    data["treasury"]["availableCoins"] = "1"
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            resolve_economy_context(FakeAdmin({"status": "ok", "economy": data}), ACTOR, OWNER)
        )


@pytest.mark.parametrize("amount", [True, False, 0, -1, 1.5, "100", float("inf")])
def test_invalid_spend_is_rejected_before_any_database_call(amount):
    admin = FakeAdmin(None)
    with pytest.raises(ApiError) as caught:
        asyncio.run(spend(admin, context(), amount, "building_purchase", "build:1", "build0001"))
    assert caught.value.code == "invalid_transaction"
    assert admin.calls == []


def test_large_reserve_uses_exact_strings_and_no_legacy_stake_ceiling():
    admin = FakeAdmin({"status": "refused", "reason": "insufficient_funds"})
    with pytest.raises(ApiError) as caught:
        asyncio.run(reserve(admin, context(), 10**30, 0, "market_call_stake", "call:1", "stake001"))
    assert caught.value.code == "insufficient_funds"
    name, params = admin.calls[0]
    assert name == "island_treasury_reserve"
    assert params["p_principal"] == str(10**30)
    assert params["p_fee"] == "0"
    assert params["p_account_id"] == ACCOUNT


def test_settlement_selects_origin_from_reservation_not_current_actor_or_account():
    admin = FakeAdmin({"status": "refused", "reason": "reservation_missing"})
    with pytest.raises(ApiError) as caught:
        asyncio.run(settle(admin, OPERATION, 300, "settle:1", "settle01"))
    assert caught.value.code == "economy_reservation_missing"
    assert admin.calls == [
        (
            "island_treasury_settle",
            {
                "p_reservation_id": OPERATION,
                "p_returned_payout": "300",
                "p_reference": "settle:1",
                "p_action_uid": "settle01",
            },
        )
    ]


def test_admission_is_explicit_and_uses_no_personal_wallet_rpc():
    admin = FakeAdmin({"status": "refused", "reason": "not_owner"})
    with pytest.raises(ApiError) as caught:
        asyncio.run(admit(admin, ACTOR, OWNER, "admit001", 200))
    assert caught.value.code == "not_owner"
    assert admin.calls == [
        (
            "island_treasury_admit",
            {
                "p_actor_id": ACTOR,
                "p_island_owner": OWNER,
                "p_action_uid": "admit001",
                "p_starting_coins": "200",
            },
        )
    ]
