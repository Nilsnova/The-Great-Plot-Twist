"""G9 account metadata is read-only and derived only from the verified player's records."""

from dataclasses import replace

import pytest

from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.tests.test_me import (
    OTHER_PLAYER_ID,
    PLAYER_ID,
    RIGHT_HEADER,
    URL,
    database_where,
    database_with,
    make_client,
    make_tables,
)


def test_a_missing_own_reroll_row_means_one_reroll_left():
    client, _ = make_client()
    body = client.get(URL, headers=RIGHT_HEADER).json()
    assert body["rerollsLeft"] == 1 and body["isHost"] is False


def test_a_used_reroll_is_reported_without_naming_or_writing():
    tables = make_tables()
    tables["captain_name_rerolls"].append({"player_id": PLAYER_ID})
    client, seen = make_client(database_with(tables))
    body = client.get(URL, headers=RIGHT_HEADER).json()
    assert body["rerollsLeft"] == 0
    assert all(request.method == "GET" for request in seen)
    assert all("/rpc/" not in request.url.path for request in seen)


def test_host_status_comes_from_the_verified_id_and_server_settings():
    settings = replace(CONFIGURED_SETTINGS, host_player_ids=frozenset({PLAYER_ID}))
    client, _ = make_client(settings=settings)
    assert client.get(URL, headers=RIGHT_HEADER).json()["isHost"] is True
    settings = replace(CONFIGURED_SETTINGS, host_player_ids=frozenset({OTHER_PLAYER_ID}))
    client, _ = make_client(settings=settings)
    response = client.get(URL + f"?id={OTHER_PLAYER_ID}&isHost=true", headers=RIGHT_HEADER)
    assert response.json()["isHost"] is False


@pytest.mark.parametrize("rows", [[None], [{"player_id": 7}], [{"player_id": OTHER_PLAYER_ID}]])
def test_unreadable_or_wrong_player_reroll_rows_are_generic_database_errors(rows):
    client, _ = make_client(database_where("captain_name_rerolls", rows))
    assert_error(client.get(URL, headers=RIGHT_HEADER), 502, "database_error")
