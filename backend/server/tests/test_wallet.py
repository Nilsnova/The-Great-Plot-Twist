"""Tests for wallet.py: the coin rules, and changing a balance through a fake database."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.supabase_admin import (
    AdminDep,
    AlreadyApplied,
    InsufficientFunds,
    SupabaseAdmin,
    SupabaseRejected,
    SupabaseUnavailable,
)
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error, make_admin
from server.wallet import (
    EARN_REASONS,
    MAX_DELTA,
    MAX_REF_LENGTH,
    REASONS,
    SPEND_REASONS,
    STARTING_BALANCE,
    InvalidTransaction,
    apply_transaction,
    validate_transaction,
)

# What the database sends when the same player + reason + ref is used a second time.
ALREADY_APPLIED_ERROR = {
    "code": "23505",
    "details": "Key (player_id, reason, ref)=(player-1, market_buy, order-7) already exists.",
    "hint": None,
    "message": (
        'duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"'
    ),
}


def apply(admin: SupabaseAdmin, player_id: str, delta: int, reason: str, ref: str | None = None):
    """Run apply_transaction from a normal (not async) test."""
    return asyncio.run(apply_transaction(player_id, delta, reason, ref, admin=admin))


# --- the agreed numbers and words ---


def test_every_player_starts_with_1000_coins():
    assert STARTING_BALANCE == 1000


def test_the_biggest_change_allowed_is_one_million_coins():
    assert MAX_DELTA == 1_000_000


def test_the_longest_reference_allowed_is_120_characters():
    assert MAX_REF_LENGTH == 120


def test_reasons_are_the_agreed_list_in_the_agreed_order():
    assert REASONS == (
        "starting_grant",
        "market_buy",
        "market_sell",
        "prediction_stake",
        "prediction_payout",
        "sports_stake",
        "sports_payout",
        "arena_stake",
        "arena_payout",
        "admin_adjust",
    )


def test_the_spend_reasons_are_the_agreed_four():
    assert SPEND_REASONS == ("market_buy", "prediction_stake", "sports_stake", "arena_stake")


def test_the_earn_reasons_are_the_agreed_five():
    assert EARN_REASONS == (
        "starting_grant",
        "market_sell",
        "prediction_payout",
        "sports_payout",
        "arena_payout",
    )


def test_every_reason_is_a_spend_reason_an_earn_reason_or_admin_adjust():
    sorted_out = set(SPEND_REASONS) | set(EARN_REASONS) | {"admin_adjust"}

    assert sorted_out == set(REASONS)


def test_no_reason_is_both_a_spend_reason_and_an_earn_reason():
    assert set(SPEND_REASONS).isdisjoint(EARN_REASONS)


# --- validate_transaction: amounts ---


@pytest.mark.parametrize(
    ("delta", "reason"),
    [
        (-1, "market_buy"),
        (1, "market_sell"),
        (1_000_000, "admin_adjust"),
        (-1_000_000, "arena_stake"),
    ],
)
def test_good_transactions_pass(delta, reason):
    validate_transaction(delta, reason)  # raises nothing


def test_zero_is_rejected():
    with pytest.raises(InvalidTransaction, match="zero"):
        validate_transaction(0, "market_buy")


@pytest.mark.parametrize("delta", [1.5, 5.0, "10", None, [5]])
def test_the_amount_must_be_a_whole_number(delta):
    with pytest.raises(InvalidTransaction, match="whole number"):
        validate_transaction(delta, "market_buy")


@pytest.mark.parametrize("delta", [True, False])
def test_true_and_false_are_not_amounts(delta):
    with pytest.raises(InvalidTransaction, match="whole number"):
        validate_transaction(delta, "market_buy")


@pytest.mark.parametrize("delta", [1_000_001, -1_000_001])
def test_an_amount_over_the_limit_is_rejected(delta):
    with pytest.raises(InvalidTransaction, match="cannot be more than"):
        validate_transaction(delta, "market_buy")


# --- validate_transaction: reasons and the direction of the amount ---


@pytest.mark.parametrize("reason", ["gift", "", "MARKET_BUY", None])
def test_an_unknown_reason_is_rejected_and_the_message_lists_the_allowed_ones(reason):
    with pytest.raises(InvalidTransaction, match="Allowed reasons") as problem:
        validate_transaction(10, reason)

    assert "market_buy" in str(problem.value)


@pytest.mark.parametrize(
    "reason", ["market_buy", "prediction_stake", "sports_stake", "arena_stake"]
)
def test_every_spend_reason_is_accepted_with_a_negative_amount(reason):
    validate_transaction(-10, reason)


@pytest.mark.parametrize(
    "reason", ["market_sell", "prediction_payout", "sports_payout", "arena_payout"]
)
def test_every_earn_reason_is_accepted_with_a_positive_amount(reason):
    validate_transaction(10, reason)


@pytest.mark.parametrize("delta", [10, -10])
def test_admin_adjust_is_accepted_in_both_directions(delta):
    validate_transaction(delta, "admin_adjust")


@pytest.mark.parametrize(
    "reason", ["market_buy", "prediction_stake", "sports_stake", "arena_stake"]
)
def test_a_spend_reason_with_a_positive_amount_is_refused(reason):
    with pytest.raises(InvalidTransaction, match="must take coins away"):
        validate_transaction(10, reason)


@pytest.mark.parametrize(
    "reason", ["market_sell", "prediction_payout", "sports_payout", "arena_payout"]
)
def test_an_earn_reason_with_a_negative_amount_is_refused(reason):
    with pytest.raises(InvalidTransaction, match="must add coins"):
        validate_transaction(-10, reason)


@pytest.mark.parametrize("delta", [10, -10])
def test_starting_grant_is_refused_because_only_the_sign_up_trigger_writes_it(delta):
    with pytest.raises(InvalidTransaction, match="sign-up trigger"):
        validate_transaction(delta, "starting_grant")


def test_buying_a_negative_number_of_shares_cannot_credit_coins():
    # The classic bug: price 10 times quantity -3 is -(-30) = +30 coins for a purchase.
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1030))
    price = 10
    quantity = -3

    with pytest.raises(InvalidTransaction, match="must take coins away"):
        apply(admin, "player-1", -price * quantity, "market_buy")

    assert seen == []


# --- validate_transaction: references ---


def test_a_reference_of_exactly_the_longest_allowed_length_is_accepted():
    validate_transaction(-10, "market_buy", "x" * MAX_REF_LENGTH)


def test_a_reference_one_character_too_long_is_rejected():
    with pytest.raises(InvalidTransaction, match="at most 120 characters"):
        validate_transaction(-10, "market_buy", "x" * (MAX_REF_LENGTH + 1))


@pytest.mark.parametrize("ref", [12345, 1.5, ["order-7"], True])
def test_a_reference_must_be_text(ref):
    with pytest.raises(InvalidTransaction, match="must be text"):
        validate_transaction(-10, "market_buy", ref)


# --- a bad transaction inside a route ---


def test_a_bad_amount_inside_a_route_answers_422_in_the_standard_error_shape():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))
    app = create_app(CONFIGURED_SETTINGS, admin=admin)

    @app.get("/api/test/spend-nothing")
    async def spend_nothing(database: AdminDep) -> None:
        await apply_transaction("player-1", 0, "market_buy", admin=database)

    response = TestClient(app).get("/api/test/spend-nothing")

    assert_error(response, 422, "invalid_transaction")
    assert response.json()["error"]["message"] == "The amount cannot be zero."
    assert seen == []


def test_invalid_transaction_is_a_422_with_its_own_code():
    error = InvalidTransaction("The amount cannot be zero.")

    assert error.status_code == 422
    assert error.code == "invalid_transaction"
    assert error.message == "The amount cannot be zero."


# --- apply_transaction ---


def test_apply_transaction_calls_the_database_function_and_returns_the_new_balance():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1050))

    balance = apply(admin, "player-1", 50, "market_sell", ref="order-7")

    assert balance == 1050
    assert str(seen[0].url).endswith("/rest/v1/rpc/apply_wallet_transaction")
    assert json.loads(seen[0].content) == {
        "p_player_id": "player-1",
        "p_delta": 50,
        "p_reason": "market_sell",
        "p_ref": "order-7",
    }


def test_a_missing_ref_is_sent_as_null():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=990))

    apply(admin, "player-1", -10, "market_buy")

    assert json.loads(seen[0].content)["p_ref"] is None


@pytest.mark.parametrize(
    ("delta", "reason", "ref"),
    [
        (0, "market_buy", None),  # zero
        (1.5, "market_buy", None),  # not a whole number
        (True, "market_buy", None),  # True is not an amount
        (1_000_001, "market_buy", None),  # over the limit
        (10, "gift", None),  # unknown reason
        (10, "market_buy", None),  # a purchase that adds coins
        (-10, "market_sell", None),  # a sale that takes coins away
        (10, "starting_grant", None),  # only the sign-up trigger writes this one
        (-10, "market_buy", "x" * 121),  # reference too long
        (-10, "market_buy", 12345),  # reference is not text
    ],
)
def test_bad_input_is_refused_before_any_database_call(delta, reason, ref):
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))

    with pytest.raises(InvalidTransaction):
        apply(admin, "player-1", delta, reason, ref)

    assert seen == []


def test_not_enough_coins_raises_insufficient_funds():
    error = {"code": "P0001", "details": None, "hint": None, "message": "insufficient_funds"}
    admin, _ = make_admin(lambda request: httpx.Response(400, json=error))

    with pytest.raises(InsufficientFunds):
        apply(admin, "player-1", -5000, "market_buy")


def test_the_same_ref_twice_raises_already_applied():
    admin, _ = make_admin(lambda request: httpx.Response(409, json=ALREADY_APPLIED_ERROR))

    with pytest.raises(AlreadyApplied):
        apply(admin, "player-1", -10, "market_buy", ref="order-7")


def test_a_timeout_after_sending_raises_database_unavailable():
    def time_out(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("pretend the answer never came", request=request)

    admin, seen = make_admin(time_out)

    with pytest.raises(SupabaseUnavailable):
        apply(admin, "player-1", -10, "market_buy", ref="order-7")

    assert len(seen) == 1  # the request WAS sent, so the coins may have moved: outcome unknown


@pytest.mark.parametrize("strange_balance", ["1050", True, 12.5, {"balance": 5}, [5], None])
def test_a_balance_that_is_not_a_whole_number_is_a_database_error(strange_balance):
    admin, _ = make_admin(lambda request: httpx.Response(200, json=strange_balance))

    with pytest.raises(SupabaseRejected):
        apply(admin, "player-1", 10, "market_sell")
