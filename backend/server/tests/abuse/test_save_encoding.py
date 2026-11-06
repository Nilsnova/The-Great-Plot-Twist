"""Reject malformed Unicode before a cloud save can reach the database."""

import pytest

from server.tests.account_helpers import RIGHT_HEADER, AccountsDatabase, make_client
from server.tests.helpers import assert_error


@pytest.mark.parametrize("data", [b'{"x":"\\ud800"}', b'{"\\udfff":"x"}'])
def test_unpaired_surrogate_is_a_client_error_without_database_write(data):
    database = AccountsDatabase()
    client, seen = make_client(database)
    body = b'{"version":1,"data":' + data + b'}'

    response = client.put(
        "/api/save", content=body, headers={**RIGHT_HEADER, "Content-Type": "application/json"}
    )

    assert_error(response, 422, "save_not_json")
    assert seen == []
