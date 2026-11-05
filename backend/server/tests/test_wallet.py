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
    DIRECTIONS,
    MAX_DELTA,
    MAX_REF_LENGTH,
    STARTING_BALANCE,
    WALLET_REASONS,
    InvalidTransaction,
    apply_transaction,
    find_direction,
    list_reason_names,
    validate_transaction,
)

# What the database sends when the same player + reason + ref is used a second time.
ALREADY_APPLIED_ERROR = {
    "code": "23505",
    "details": "Key (player_id, reason, ref)=(player-1, clue_purchase, order-7) already exists.",
    "hint": None,
    "message": (
        'duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"'
    ),
}

# A ref that passes every check. A test that is about something else than the ref uses this one.
GOOD_REF = "order-7"


def apply(admin: SupabaseAdmin, player_id: str, delta: int, reason: str, ref: str):
    """Run apply_transaction from a normal (not async) test. Every coin change needs a ref."""
    return asyncio.run(apply_transaction(player_id, delta, reason, ref, admin=admin))


# --- the agreed numbers and words ---


def test_every_player_starts_with_0_coins():
    assert STARTING_BALANCE == 0


def test_the_biggest_change_allowed_is_one_million_coins():
    assert MAX_DELTA == 1_000_000


def test_the_longest_reference_allowed_is_120_characters():
    assert MAX_REF_LENGTH == 120


def test_the_wallet_reasons_are_the_agreed_pairs_in_the_agreed_order():
    assert WALLET_REASONS == (
        ("kit_grant", "earn"),
        ("clue_reward", "earn"),
        ("mystery_reward", "earn"),
        ("event_reward", "earn"),
        ("cargo_sale", "earn"),
        ("clue_purchase", "spend"),
        ("building_purchase", "spend"),
        ("admin_adjust", "either"),
        ("market_buy", "spend"),
        ("market_sell", "earn"),
        ("market_fee", "spend"),
    )


def test_the_directions_are_earn_spend_and_either():
    assert DIRECTIONS == ("earn", "spend", "either")


@pytest.mark.parametrize(("reason", "direction"), WALLET_REASONS)
def test_every_reason_has_one_of_the_agreed_directions(reason, direction):
    assert direction in DIRECTIONS


def test_no_reason_name_appears_twice():
    names = list_reason_names()

    assert len(names) == len(set(names))


def test_list_reason_names_gives_the_names_in_the_agreed_order():
    assert list_reason_names() == [
        "kit_grant",
        "clue_reward",
        "mystery_reward",
        "event_reward",
        "cargo_sale",
        "clue_purchase",
        "building_purchase",
        "admin_adjust",
        "market_buy",
        "market_sell",
        "market_fee",
    ]


@pytest.mark.parametrize(
    ("reason", "direction"),
    [("kit_grant", "earn"), ("clue_purchase", "spend"), ("admin_adjust", "either")],
)
def test_find_direction_answers_with_the_direction_of_the_reason(reason, direction):
    assert find_direction(reason) == direction


@pytest.mark.parametrize("reason", ["gift", "", None, ["kit_grant"]])
def test_find_direction_answers_none_for_an_unknown_reason(reason):
    assert find_direction(reason) is None


@pytest.mark.parametrize("delta", [10, -10])
def test_starting_grant_is_gone_because_new_wallets_start_at_zero(delta):
    with pytest.raises(InvalidTransaction, match="Unknown reason 'starting_grant'"):
        validate_transaction(delta, "starting_grant", GOOD_REF)


# --- validate_transaction: amounts ---


@pytest.mark.parametrize(
    ("delta", "reason"),
    [
        (-1, "clue_purchase"),
        (1, "cargo_sale"),
        (1_000_000, "admin_adjust"),
        (-1_000_000, "building_purchase"),
    ],
)
def test_good_transactions_pass(delta, reason):
    validate_transaction(delta, reason, GOOD_REF)  # raises nothing


def test_zero_is_rejected():
    with pytest.raises(InvalidTransaction, match="zero"):
        validate_transaction(0, "clue_purchase", GOOD_REF)


@pytest.mark.parametrize("delta", [1.5, 5.0, "10", None, [5]])
def test_the_amount_must_be_a_whole_number(delta):
    with pytest.raises(InvalidTransaction, match="whole number"):
        validate_transaction(delta, "clue_purchase", GOOD_REF)


@pytest.mark.parametrize("delta", [True, False])
def test_true_and_false_are_not_amounts(delta):
    with pytest.raises(InvalidTransaction, match="whole number"):
        validate_transaction(delta, "clue_purchase", GOOD_REF)


@pytest.mark.parametrize("delta", [1_000_001, -1_000_001])
def test_an_amount_over_the_limit_is_rejected(delta):
    with pytest.raises(InvalidTransaction, match="cannot be more than"):
        validate_transaction(delta, "admin_adjust", GOOD_REF)


# --- validate_transaction: reasons and the direction of the amount ---


@pytest.mark.parametrize("reason", ["gift", "", "KIT_GRANT", None])
def test_an_unknown_reason_is_rejected_and_the_message_lists_the_allowed_ones(reason):
    with pytest.raises(InvalidTransaction, match="Allowed reasons") as problem:
        validate_transaction(10, reason, GOOD_REF)

    assert "kit_grant" in str(problem.value)


@pytest.mark.parametrize("reason", ["clue_purchase", "building_purchase"])
def test_every_spend_reason_is_accepted_with_a_negative_amount(reason):
    validate_transaction(-10, reason, GOOD_REF)


@pytest.mark.parametrize(
    "reason", ["kit_grant", "clue_reward", "mystery_reward", "event_reward", "cargo_sale"]
)
def test_every_earn_reason_is_accepted_with_a_positive_amount(reason):
    validate_transaction(10, reason, GOOD_REF)


@pytest.mark.parametrize("delta", [10, -10])
def test_admin_adjust_is_accepted_in_both_directions(delta):
    validate_transaction(delta, "admin_adjust", GOOD_REF)


@pytest.mark.parametrize("reason", ["clue_purchase", "building_purchase"])
def test_a_spend_reason_with_a_positive_amount_is_refused(reason):
    with pytest.raises(InvalidTransaction, match="must take coins away"):
        validate_transaction(10, reason, GOOD_REF)


@pytest.mark.parametrize(
    "reason", ["kit_grant", "clue_reward", "mystery_reward", "event_reward", "cargo_sale"]
)
def test_an_earn_reason_with_a_negative_amount_is_refused(reason):
    with pytest.raises(InvalidTransaction, match="must add coins"):
        validate_transaction(-10, reason, GOOD_REF)


def test_buying_a_negative_number_of_buildings_cannot_credit_coins():
    # The classic bug: price 10 times quantity -3 is -(-30) = +30 coins for a purchase.
    admin, seen = make_admin(lambda request: httpx.Response(200, json=30))
    price = 10
    quantity = -3

    with pytest.raises(InvalidTransaction, match="must take coins away"):
        apply(admin, "player-1", -price * quantity, "building_purchase", GOOD_REF)

    assert seen == []


# --- validate_transaction: references ---


def test_a_reference_of_exactly_the_longest_allowed_length_is_accepted():
    validate_transaction(-10, "clue_purchase", "x" * MAX_REF_LENGTH)


def test_a_reference_one_character_too_long_is_rejected():
    with pytest.raises(InvalidTransaction, match="at most 120 characters"):
        validate_transaction(-10, "clue_purchase", "x" * (MAX_REF_LENGTH + 1))


@pytest.mark.parametrize("ref", [12345, 1.5, ["order-7"], True])
def test_a_reference_must_be_text(ref):
    with pytest.raises(InvalidTransaction, match="non-empty text"):
        validate_transaction(-10, "clue_purchase", ref)


def test_a_missing_reference_is_rejected():
    # Without a ref the ledger cannot tell a repeat from a new payment, so a ref is required.
    with pytest.raises(InvalidTransaction, match="needs a ref"):
        validate_transaction(-10, "clue_purchase", None)


@pytest.mark.parametrize("ref", ["", " ", "   ", "\t", "\n", " \t\n "])
def test_a_blank_reference_is_rejected(ref):
    with pytest.raises(InvalidTransaction, match="non-empty text"):
        validate_transaction(-10, "clue_purchase", ref)


# --- a bad transaction inside a route ---


def test_a_bad_amount_inside_a_route_answers_422_in_the_standard_error_shape():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))
    app = create_app(CONFIGURED_SETTINGS, admin=admin)

    @app.get("/api/test/spend-nothing")
    async def spend_nothing(database: AdminDep) -> None:
        await apply_transaction("player-1", 0, "clue_purchase", GOOD_REF, admin=database)

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
    admin, seen = make_admin(lambda request: httpx.Response(200, json=150))

    balance = apply(admin, "player-1", 50, "cargo_sale", ref="order-7")

    assert balance == 150
    assert str(seen[0].url).endswith("/rest/v1/rpc/apply_wallet_transaction")
    assert json.loads(seen[0].content) == {
        "p_player_id": "player-1",
        "p_delta": 50,
        "p_reason": "cargo_sale",
        "p_ref": "order-7",
    }


def test_an_entry_kit_grant_reaches_the_database_with_its_fixed_ref():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=100))

    balance = apply(admin, "player-1", 100, "kit_grant", ref="kit")

    assert balance == 100
    sent = json.loads(seen[0].content)
    assert sent["p_reason"] == "kit_grant"
    assert sent["p_ref"] == "kit"


@pytest.mark.parametrize(
    ("ref", "message"),
    [
        (None, "needs a ref"),
        ("", "non-empty text"),
        ("   ", "non-empty text"),
        ("\t\n", "non-empty text"),
    ],
)
def test_a_missing_or_blank_ref_is_refused_before_any_database_call(ref, message):
    # A coin change without a ref could be applied twice by a retry, so it never gets that far.
    admin, seen = make_admin(lambda request: httpx.Response(200, json=90))

    with pytest.raises(InvalidTransaction, match=message):
        apply(admin, "player-1", -10, "clue_purchase", ref)

    assert seen == []


def test_apply_transaction_cannot_be_called_without_a_ref():
    # The ref is a required argument, so forgetting it is a Python error, not a free payment.
    admin, seen = make_admin(lambda request: httpx.Response(200, json=90))

    with pytest.raises(TypeError, match="ref"):
        asyncio.run(apply_transaction("player-1", -10, "clue_purchase", admin=admin))

    assert seen == []


@pytest.mark.parametrize(
    ("delta", "reason", "ref"),
    [
        (0, "clue_purchase", GOOD_REF),  # zero
        (1.5, "clue_purchase", GOOD_REF),  # not a whole number
        (True, "clue_purchase", GOOD_REF),  # True is not an amount
        (1_000_001, "admin_adjust", GOOD_REF),  # over the limit
        (10, "gift", GOOD_REF),  # unknown reason
        (10, "starting_grant", GOOD_REF),  # the old sign-up reason is gone
        (10, "clue_purchase", GOOD_REF),  # a purchase that adds coins
        (-10, "cargo_sale", GOOD_REF),  # a sale that takes coins away
        (-10, "clue_purchase", "x" * 121),  # reference too long
        (-10, "clue_purchase", 12345),  # reference is not text
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
        apply(admin, "player-1", -5000, "clue_purchase", GOOD_REF)


def test_the_same_ref_twice_raises_already_applied():
    admin, _ = make_admin(lambda request: httpx.Response(409, json=ALREADY_APPLIED_ERROR))

    with pytest.raises(AlreadyApplied):
        apply(admin, "player-1", -10, "clue_purchase", ref="order-7")


def test_a_timeout_after_sending_raises_database_unavailable():
    def time_out(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("pretend the answer never came", request=request)

    admin, seen = make_admin(time_out)

    with pytest.raises(SupabaseUnavailable):
        apply(admin, "player-1", -10, "clue_purchase", ref="order-7")

    assert len(seen) == 1  # the request WAS sent, so the coins may have moved: outcome unknown


@pytest.mark.parametrize("strange_balance", ["1050", True, 12.5, {"balance": 5}, [5], None])
def test_a_balance_that_is_not_a_whole_number_is_a_database_error(strange_balance):
    admin, _ = make_admin(lambda request: httpx.Response(200, json=strange_balance))

    with pytest.raises(SupabaseRejected):
        apply(admin, "player-1", 10, "cargo_sale", GOOD_REF)
