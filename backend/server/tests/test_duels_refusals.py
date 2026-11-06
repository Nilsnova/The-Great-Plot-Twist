"""Tests for duels/refusals.py: every refusal of the spec (section 7.3) in the standard error."""

import pytest

from server.duels.refusals import REFUSALS, refusal_error
from server.errors import ApiError
from server.supabase_admin import SupabaseRejected

# The table of the spec: reason -> status.
EXPECTED_STATUS = {
    "no_such_duel": 404,
    "no_such_captain": 404,
    "name_not_unique": 409,
    "cannot_duel_yourself": 422,
    "too_many_waiting": 409,
    "duel_taken": 409,
    "duel_closed": 409,
    "duel_expired": 409,
    "daily_pair_limit": 409,
    "not_your_duel": 403,
    "already_sealed": 409,
}


@pytest.mark.parametrize(("reason", "status"), list(EXPECTED_STATUS.items()))
def test_every_refusal_has_the_status_of_the_spec(reason, status):
    error = refusal_error(reason)

    assert isinstance(error, ApiError)
    assert (error.status_code, error.code) == (status, reason)
    assert error.message


def test_the_table_holds_exactly_the_refusals_of_the_spec():
    assert {reason: status for reason, (status, _) in REFUSALS.items()} == EXPECTED_STATUS


@pytest.mark.parametrize("reason", ["not_expired", "bad_duel", "", "made_up"])
def test_a_reason_we_do_not_know_is_a_502_database_error(reason):
    error = refusal_error(reason)

    assert isinstance(error, SupabaseRejected)
    assert (error.status_code, error.code) == (502, "database_error")


EM_DASH = chr(0x2014)
EN_DASH = chr(0x2013)


@pytest.mark.parametrize("reason", list(EXPECTED_STATUS))
def test_no_message_has_an_em_or_en_dash(reason):
    message = refusal_error(reason).message

    assert EM_DASH not in message
    assert EN_DASH not in message
