"""Reject U+0000 locally: PostgreSQL jsonb cannot store it, even escaped in JSON."""

import pytest

from server.tests.account_helpers import PLAYER_ID, RIGHT_HEADER, AccountsDatabase, make_client
from server.tests.helpers import assert_error


@pytest.mark.parametrize("data", [{"x": "\x00"}, {"nested": [{"\x00": "x"}]}])
def test_nul_in_save_is_a_client_error_before_database(data):
    database = AccountsDatabase()
    database.add_player(PLAYER_ID)
    client, seen = make_client(database)
    response = client.put("/api/save", json={"version": 1, "data": data}, headers=RIGHT_HEADER)
    assert_error(response, 422, "save_not_json")
    assert seen == []


def test_literal_backslash_u0000_and_valid_unicode_are_not_over_rejected():
    database = AccountsDatabase()
    database.add_player(PLAYER_ID)
    client, _ = make_client(database)
    response = client.put(
        "/api/save", json={"version": 1, "data": {"text": "\\u0000 café"}}, headers=RIGHT_HEADER
    )
    assert response.status_code == 200
    assert database.saves[PLAYER_ID]["data"] == {"text": "\\u0000 café"}
