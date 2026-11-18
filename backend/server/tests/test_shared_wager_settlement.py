"""Exact settlement input contract; treasury atomicity is verified by its own SQL tests."""

from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.wager_settlement import settlement_arguments

RESERVATION = UUID("00000000-0000-0000-0000-000000000001")


def test_settlement_only_identifies_the_original_reservation() -> None:
    assert settlement_arguments(RESERVATION, 2, "market-call:result-1", "settle-0001") == {
        "p_reservation_id": str(RESERVATION),
        "p_returned_payout": "2",
        "p_reference": "market-call:result-1",
        "p_action_uid": "settle-0001",
    }


def test_a_loss_still_settles_and_releases_the_original_principal() -> None:
    assert settlement_arguments(RESERVATION, 0, "market-call:result-1", "settle-0001")[
        "p_returned_payout"
    ] == "0"


def test_payouts_above_legacy_ceilings_are_exact_decimal_strings() -> None:
    payout = 10**70 + 7
    assert settlement_arguments(RESERVATION, payout, "football:fd-123", "settle-0001")[
        "p_returned_payout"
    ] == str(payout)


def test_a_retry_preserves_the_source_and_operation_identity() -> None:
    first = settlement_arguments(RESERVATION, 50, "football:fd-123", "settle-0001")
    again = settlement_arguments(RESERVATION, 50, "football:fd-123", "settle-0001")
    assert first == again


@pytest.mark.parametrize("payout", [True, -1, 1.5, float("nan"), float("inf"), "2", None])
def test_invalid_returned_payouts_are_rejected(payout: object) -> None:
    with pytest.raises(ApiError) as error:
        settlement_arguments(RESERVATION, payout, "football:fd-123", "settle-0001")
    assert error.value.code == "invalid_transaction"


@pytest.mark.parametrize("reservation", [None, "", "not-a-uuid", str(RESERVATION)])
def test_source_reservation_must_be_a_validated_uuid(reservation: object) -> None:
    with pytest.raises(ApiError):
        settlement_arguments(reservation, 2, "football:fd-123", "settle-0001")


@pytest.mark.parametrize("reference", ["", " ", None, 2])
def test_settlements_require_a_nonempty_server_reference(reference: object) -> None:
    with pytest.raises(ApiError):
        settlement_arguments(RESERVATION, 2, reference, "settle-0001")


@pytest.mark.parametrize("uid", ["", "short", "x" * 65, "settle/0001", True, None])
def test_settlements_require_a_valid_retry_identity(uid: object) -> None:
    with pytest.raises(ApiError):
        settlement_arguments(RESERVATION, 2, "football:fd-123", uid)
