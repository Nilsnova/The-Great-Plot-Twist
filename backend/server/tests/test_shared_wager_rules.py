"""Shared wager amount and retry rules; no treasury or network is simulated here."""

import pytest

from server.errors import ApiError
from server.island.wager_rules import (
    WagerIntent,
    all_in_stake,
    opening_cost,
    require_matching_replay,
    require_supported_product,
    validate_stake,
)


@pytest.mark.parametrize("stake", [1, 10_001, 25_001, 1_000_001, 2**53 + 1, 10**70 + 7])
def test_shared_stakes_have_no_legacy_minimum_or_ceiling(stake: int) -> None:
    assert validate_stake(stake) == stake


@pytest.mark.parametrize("stake", [True, False, 0, -1, 1.0, 1.5, "1", None])
def test_only_positive_whole_coin_integers_are_accepted(stake: object) -> None:
    with pytest.raises(ApiError, match="whole") as error:
        validate_stake(stake)
    assert (error.value.status_code, error.value.code) == (422, "invalid_transaction")


def test_all_in_can_use_the_entire_available_balance_without_a_fee() -> None:
    balance = 10**70 + 7
    assert all_in_stake(balance) == balance
    assert opening_cost(balance, balance) == (balance, 0)


def test_opening_fees_are_rounded_up_using_exact_integers() -> None:
    stake = 10**70 + 7
    fee = (stake * 200 + 9_999) // 10_000
    assert opening_cost(stake, stake + fee, fee_basis_points=200) == (stake, fee)


@pytest.mark.parametrize("available,rate,stake", [(102, 200, 100), (101, 200, 99), (1, 200, 0)])
def test_all_in_includes_the_whole_opening_fee(available: int, rate: int, stake: int) -> None:
    assert all_in_stake(available, fee_basis_points=rate) == stake


def test_a_one_coin_fee_shortfall_refuses_the_whole_opening() -> None:
    with pytest.raises(ApiError) as error:
        opening_cost(100, 101, fee_basis_points=200)
    assert (error.value.status_code, error.value.code) == (409, "insufficient_funds")


def test_all_in_quote_is_maximal_even_for_extremely_large_balances() -> None:
    available = 10**70 + 7
    stake = all_in_stake(available, fee_basis_points=200)
    assert opening_cost(stake, available, fee_basis_points=200)[1] + stake <= available
    with pytest.raises(ApiError):
        opening_cost(stake + 1, available, fee_basis_points=200)


@pytest.mark.parametrize("value", [True, -1, 1.0, "1", None])
def test_invalid_available_funds_are_rejected(value: object) -> None:
    with pytest.raises(ApiError):
        all_in_stake(value)


@pytest.mark.parametrize("rate", [True, -1, 1.0, "200", None])
def test_invalid_fee_rates_are_rejected(rate: object) -> None:
    with pytest.raises(ApiError):
        all_in_stake(100, fee_basis_points=rate)


def test_a_replayed_client_intent_matches_its_immutable_terms() -> None:
    original = WagerIntent("market_call", "harbor-trust", "up", 1)
    assert require_matching_replay(original, original) is None


@pytest.mark.parametrize(
    "changed",
    [
        WagerIntent("market_call", "harbor-trust", "down", 1),
        WagerIntent("market_call", "apple", "up", 1),
        WagerIntent("market_call", "harbor-trust", "up", 2),
        WagerIntent("football", "fd-123", "home", 1),
    ],
)
def test_altered_replays_fail_with_idempotency_conflict(changed: WagerIntent) -> None:
    with pytest.raises(ApiError) as error:
        require_matching_replay(WagerIntent("market_call", "harbor-trust", "up", 1), changed)
    assert (error.value.status_code, error.value.code) == (409, "idempotency_conflict")


def test_separate_valid_intents_may_share_an_event() -> None:
    first = WagerIntent("football", "fd-123", "home", 10**50)
    second = WagerIntent("football", "fd-123", "away", 1)
    assert first.event_id == second.event_id


@pytest.mark.parametrize("product", ["exchange_position", "prediction_pool", "duel", "unknown"])
def test_unsupported_products_cannot_choose_private_funding(product: str) -> None:
    with pytest.raises(ApiError) as error:
        require_supported_product(product)
    assert (error.value.status_code, error.value.code) == (409, "economy_path_unavailable")
