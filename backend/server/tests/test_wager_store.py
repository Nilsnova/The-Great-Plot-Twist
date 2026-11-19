"""Checked domain replies and exact request arguments; database behavior has separate SQL tests."""

from copy import deepcopy
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.economy_operations import effect_uid
from server.island.wager_rules import WagerIntent
from server.island.wager_store import opening_arguments, read_reply
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_treasury import ACCOUNT, ACTOR, EPOCH, OPERATION, OWNER, envelope

WAGER = str(UUID(int=811))
RESERVE = str(UUID(int=812))


def reply():
    wager = {"id": WAGER, "operationId": OPERATION, "actorId": ACTOR, "accountId": ACCOUNT,
             "runEpoch": EPOCH, "product": "market_call", "eventId": "harbor-trust",
             "selection": "up", "stake": "50", "openedAt": "2026-11-18T15:00:00Z",
             "settleAt": "2026-11-18T15:05:00Z", "sourceReservationId": RESERVE}
    financial = {"id": RESERVE, "accountId": ACCOUNT, "runEpoch": EPOCH, "actorId": ACTOR,
                 "actionUid": effect_uid(OPERATION, "stake"), "kind": "reserve",
                 "reason": "market_call_stake", "reference": "wager:" + WAGER,
                 "balanceDelta": "0", "committedDelta": "50", "balanceAtCommit": "100",
                 "committedAtCommit": "50", "revisionAtCommit": "2",
                 "sourceReservationId": None}
    return {"status": "done", "repeat": False,
            "currentEconomy": envelope(balance=100, committed=50, revision=2),
            "receipt": {"receiptId": WAGER, "actionUid": "wager001", "action": "island_bet",
                        "actorId": ACTOR, "origin": {"mode": "island_shared", "version": 1,
                          "islandOwner": OWNER, "accountId": ACCOUNT, "runEpoch": EPOCH},
                        "result": {"wager": wager, "settlement": None,
                                   "financialReceipt": financial}}}


def test_valid_common_receipt_preserves_its_original_product_and_financial_child():
    result = read_reply(reply())
    assert str(result.receipt.receiptId) == WAGER
    assert result.receipt.result.wager.stake == "50"


def test_historical_receipt_can_omit_all_fresh_financial_state():
    value = reply()
    value["currentEconomy"] = None
    assert read_reply(value).currentEconomy is None


@pytest.mark.parametrize("key,value", [
    ("stake", "050"), ("stake", "0"), ("stake", 50),
    ("accountId", str(UUID(int=999))), ("sourceReservationId", str(UUID(int=999))),
    ("operationId", str(UUID(int=999))), ("actorId", str(UUID(int=999))),
])
def test_invented_or_noncanonical_product_provenance_is_unreadable(key, value):
    data = reply()
    data["receipt"]["result"]["wager"][key] = value
    with pytest.raises(SupabaseRejected):
        read_reply(data)


@pytest.mark.parametrize("key,value", [
    ("committedDelta", "51"), ("balanceDelta", "-1"), ("kind", "spend"),
    ("actionUid", "unproven1"), ("revisionAtCommit", "3"),
])
def test_financial_receipt_must_match_the_exact_root_and_product(key, value):
    data = reply()
    data["receipt"]["result"]["financialReceipt"][key] = value
    with pytest.raises(SupabaseRejected):
        read_reply(data)


def test_open_arguments_derive_no_account_or_payout_from_the_request():
    args = opening_arguments(ACTOR, OWNER, EPOCH, "wager001",
                             WagerIntent("market_call", "harbor-trust", "up", 10**5000), {})
    assert args["p_stake"] == "1" + "0" * 5000
    assert "p_account_id" not in args and "p_payout" not in args


@pytest.mark.parametrize("uid", ["fx_12345678", "sys_12345678", "bad", None])
def test_reserved_or_invalid_root_identities_never_reach_a_database_call(uid):
    with pytest.raises(ApiError):
        opening_arguments(ACTOR, OWNER, EPOCH, uid,
                          WagerIntent("market_call", "harbor-trust", "up", 1), {})


def test_unknown_response_fields_do_not_silently_become_public_receipt_content():
    data = deepcopy(reply())
    data["receipt"]["extra"] = "untrusted"
    with pytest.raises(SupabaseRejected):
        read_reply(data)
