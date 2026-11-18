"""Strict reset receipts distinguish retired cash from the replacement run's funds."""

from copy import deepcopy

import pytest

from server.island.island_lifecycle import read_result
from server.island.treasury import EconomyContext
from server.supabase_admin import SupabaseRejected

OWNER = "11111111-1111-4111-8111-111111111111"
OLD_ACCOUNT = "22222222-2222-4222-8222-222222222222"
OLD_EPOCH = "33333333-3333-4333-8333-333333333333"
NEW_ACCOUNT = "44444444-4444-4444-8444-444444444444"
NEW_EPOCH = "55555555-5555-4555-8555-555555555555"
RECEIPT = "66666666-6666-4666-8666-666666666666"
GRANT = "77777777-7777-4777-8777-777777777777"
UID = "reset001"


def context():
    return EconomyContext("island_shared", 1, OWNER, OWNER, OLD_ACCOUNT, OLD_EPOCH, 2)


def result():
    return {
        "status": "done",
        "repeat": False,
        "currentEconomy": {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": OWNER,
            "accountId": NEW_ACCOUNT,
            "runEpoch": NEW_EPOCH,
            "revision": "1",
            "treasury": {"balanceCoins": "200", "committedCoins": "0", "availableCoins": "200"},
        },
        "receipt": {
            "receiptId": RECEIPT,
            "actorId": OWNER,
            "actionUid": UID,
            "action": "reset",
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": OLD_ACCOUNT,
                "runEpoch": OLD_EPOCH,
            },
            "result": {
                "newAccountId": NEW_ACCOUNT,
                "newRunEpoch": NEW_EPOCH,
                "retiredTreasury": {
                    "balanceCoins": "100",
                    "committedCoins": "70",
                    "availableCoins": "30",
                    "revision": "2",
                },
                "startingCoins": "200",
                "grantReceiptId": GRANT,
                "grantPolicyVersion": "test-policy-v1",
                "effects": {"buildings": 3},
            },
        },
    }


def test_reset_receipt_keeps_old_holds_separate_from_starting_capital():
    parsed = read_result(result(), context(), UID)
    assert parsed["receipt"]["result"]["retiredTreasury"]["availableCoins"] == "30"
    assert parsed["currentEconomy"]["treasury"]["availableCoins"] == "200"


def test_reset_money_remains_exact_above_javascript_and_bigint_ranges():
    value = result()
    huge = str(10**40)
    value["receipt"]["result"]["startingCoins"] = huge
    value["currentEconomy"]["treasury"] = {
        "balanceCoins": huge,
        "committedCoins": "0",
        "availableCoins": huge,
    }
    assert read_result(value, context(), UID)["receipt"]["result"]["startingCoins"] == huge


@pytest.mark.parametrize("digits", [4301, 5001])
def test_retired_cash_and_holds_have_no_python_decimal_digit_ceiling(digits):
    value = result()
    retired = value["receipt"]["result"]["retiredTreasury"]
    retired.update(
        balanceCoins="9" + "0" * (digits - 1),
        committedCoins="4" + "0" * (digits - 1),
        availableCoins="5" + "0" * (digits - 1),
    )
    assert read_result(value, context(), UID)["receipt"]["result"]["retiredTreasury"] == retired
    retired["availableCoins"] = "6" + "0" * (digits - 1)
    with pytest.raises(SupabaseRejected):
        read_result(value, context(), UID)


@pytest.mark.parametrize("digits", [4301, 5001])
def test_configured_capital_has_no_python_decimal_digit_ceiling(digits):
    value = result()
    huge = "1" + "0" * (digits - 1)
    value["receipt"]["result"]["startingCoins"] = huge
    value["currentEconomy"]["treasury"].update(balanceCoins=huge, availableCoins=huge)
    assert read_result(value, context(), UID)["receipt"]["result"]["startingCoins"] == huge
    value["receipt"]["result"]["startingCoins"] = "2" + "0" * (digits - 1)
    with pytest.raises(SupabaseRejected):
        read_result(value, context(), UID)


def test_later_reset_replay_keeps_its_original_effect_without_current_projection():
    value = result()
    value.update(repeat=True, currentEconomy=None)
    assert read_result(value, context(), UID)["receipt"] == result()["receipt"]


def test_replay_current_balance_can_reflect_a_later_purchase_in_the_same_new_run():
    value = result()
    value["repeat"] = True
    value["currentEconomy"]["revision"] = "2"
    value["currentEconomy"]["treasury"] = {
        "balanceCoins": "20",
        "committedCoins": "10",
        "availableCoins": "10",
    }
    assert read_result(value, context(), UID)["receipt"]["result"]["startingCoins"] == "200"


@pytest.mark.parametrize(
    "change",
    [
        "actor",
        "uid",
        "origin",
        "same_account",
        "same_epoch",
        "retired_math",
        "current_scope",
        "current_math",
        "fresh_missing",
        "float_money",
        "boolean_count",
        "extra_effect",
        "wrong_version",
    ],
)
def test_malformed_or_retargeted_reset_result_is_never_accepted(change):
    value = deepcopy(result())
    effect = value["receipt"]["result"]
    if change == "actor":
        value["receipt"]["actorId"] = NEW_ACCOUNT
    elif change == "uid":
        value["receipt"]["actionUid"] = "another1"
    elif change == "origin":
        value["receipt"]["origin"]["accountId"] = NEW_ACCOUNT
    elif change == "same_account":
        effect["newAccountId"] = OLD_ACCOUNT
    elif change == "same_epoch":
        effect["newRunEpoch"] = OLD_EPOCH
    elif change == "retired_math":
        effect["retiredTreasury"]["availableCoins"] = "100"
    elif change == "current_scope":
        value["currentEconomy"]["accountId"] = OLD_ACCOUNT
    elif change == "current_math":
        value["currentEconomy"]["treasury"]["availableCoins"] = "1"
    elif change == "fresh_missing":
        value["currentEconomy"] = None
    elif change == "float_money":
        effect["startingCoins"] = 200.0
    elif change == "boolean_count":
        effect["effects"]["buildings"] = True
    elif change == "extra_effect":
        effect["payer"] = OWNER
    else:
        value["receipt"]["origin"]["version"] = 2
    with pytest.raises(SupabaseRejected):
        read_result(value, context(), UID)
