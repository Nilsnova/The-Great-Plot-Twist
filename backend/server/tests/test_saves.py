"""Tests for the cloud save: account/saves.py (the size rule) and routes/save.py (GET and PUT).

No test uses the network. A fake login check knows one token, and a fake database keeps the saves
of two players in memory and runs the same steps as the SQL function save_progress (see
account_helpers.py). The other player's save comes first in the fake, so a route that forgot to
filter on the verified player id would hand it out and fail the tests.
"""

import json
import re

import httpx
import pytest

from server.account.saves import (
    MAX_SAVE_BYTES,
    MAX_SAVE_VERSION,
    check_save_size,
    read_moment,
    save_size,
)
from server.errors import ApiError
from server.supabase_admin import SupabaseRejected
from server.tests.account_helpers import (
    FIRST_SAVE_AT,
    OTHER_PLAYER_ID,
    PLAYER_ID,
    RIGHT_HEADER,
    WRITTEN_AT_AS_UTC,
    AccountsDatabase,
    database_error,
    make_client,
    scripted_database,
    sent_arguments,
)
from server.tests.helpers import REPO_ROOT, assert_error, fail_with

URL = "/api/save"
MY_DATA = {"intro": {"scene": "shore"}, "settings": {"sound": True}}
OTHER_DATA = {"intro": {"scene": "secret-of-the-other-player"}}
FOUNDATION = REPO_ROOT / "supabase" / "migrations" / "20261106000000_foundation.sql"
ACCOUNTS = REPO_ROOT / "supabase" / "migrations" / "20261106020000_accounts.sql"


def two_players(version: int = 3) -> AccountsDatabase:
    """The other player's save comes first. The signed-in player has MY_DATA at this version."""
    accounts = AccountsDatabase()
    accounts.add_player(OTHER_PLAYER_ID, data=OTHER_DATA, version=7)
    accounts.add_player(PLAYER_ID, data=MY_DATA, version=version)
    return accounts


def data_of_size(size: int) -> dict:
    """A save whose compact JSON is exactly this many bytes."""
    overhead = len(json.dumps({"x": ""}, separators=(",", ":")))
    return {"x": "a" * (size - overhead)}


# --- the size rule ---


def test_100000_bytes_are_accepted_and_one_more_is_refused():
    check_save_size(data_of_size(100_000))  # no error

    with pytest.raises(ApiError) as refusal:
        check_save_size(data_of_size(100_001))

    assert refusal.value.status_code == 422
    assert refusal.value.code == "save_too_big"


def test_the_limit_is_100000_bytes():
    assert MAX_SAVE_BYTES == 100_000


def test_the_size_is_the_compact_json_with_no_spaces():
    assert save_size({"a": 1, "b": [1, 2]}) == len('{"a":1,"b":[1,2]}')


def test_the_size_counts_utf8_bytes_not_characters():
    assert save_size({"a": "é"}) == len('{"a":"é"}'.encode()) == 10
    assert len('{"a":"é"}') == 9


def test_an_emoji_counts_four_bytes():
    assert save_size({"a": "😀"}) == len('{"a":"😀"}') + 3


@pytest.mark.parametrize("number", [float("nan"), float("inf"), float("-inf")])
def test_nan_and_infinity_are_refused(number):
    with pytest.raises(ApiError) as refusal:
        check_save_size({"x": number})

    assert refusal.value.status_code == 422
    assert refusal.value.code == "save_not_json"


def test_a_save_nested_too_deeply_for_json_is_refused_and_does_not_crash():
    deep: list = []
    for _ in range(20_000):  # Python's JSON writer gives up (RecursionError) at about 10,000
        deep = [deep]

    with pytest.raises(ApiError) as refusal:
        check_save_size({"x": deep})

    assert refusal.value.code == "save_not_json"


def test_the_python_limit_leaves_room_under_the_database_limit():
    # The database counts jsonb text, which is longer than compact JSON (it adds spaces). Python's
    # limit must stay well below the database's, so an honest save never meets the second check.
    table_rule = re.search(r"octet_length\(data::text\) <= (\d+)", FOUNDATION.read_text())
    function_rule = re.search(r"octet_length\(p_data::text\) > (\d+)", ACCOUNTS.read_text())
    assert table_rule and function_rule

    database_limit = int(table_rule.group(1))

    assert int(function_rule.group(1)) == database_limit
    assert MAX_SAVE_BYTES * 1.5 < database_limit


# --- the time from the database ---


def test_a_time_from_the_database_becomes_utc_with_whole_seconds():
    moment = read_moment("2026-11-06T11:15:30.250000+01:00")

    assert moment.isoformat() == "2026-11-06T10:15:30+00:00"


@pytest.mark.parametrize("value", ["2026-11-06T11:15:30", "yesterday", 5, None])
def test_a_time_without_a_timezone_or_that_is_not_text_is_refused(value):
    with pytest.raises(SupabaseRejected):
        read_moment(value)


# --- GET /api/save ---


def test_get_save_gives_version_data_and_time():
    client, _ = make_client(two_players(version=3))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    assert response.json() == {"version": 3, "data": MY_DATA, "updatedAt": "2026-11-06T09:00:00Z"}


def test_get_save_reads_only_the_players_row():
    client, seen = make_client(two_players())

    response = client.get(URL, headers=RIGHT_HEADER)

    assert len(seen) == 1
    assert seen[0].method == "GET"
    assert seen[0].url.path == "/rest/v1/saves"
    assert dict(seen[0].url.params) == {
        "select": "version,data,updated_at",
        "player_id": f"eq.{PLAYER_ID}",
        "limit": "1",
    }
    assert "secret-of-the-other-player" not in response.text
    assert OTHER_PLAYER_ID not in response.text


def test_the_player_id_comes_from_the_login_and_never_from_the_request():
    client, seen = make_client(two_players())
    sneaky_address = f"{URL}?playerId={OTHER_PLAYER_ID}&player_id={OTHER_PLAYER_ID}"

    response = client.get(sneaky_address, headers={**RIGHT_HEADER, "X-Player-Id": OTHER_PLAYER_ID})

    assert response.json()["data"] == MY_DATA
    assert all(OTHER_PLAYER_ID not in str(request.url) for request in seen)


def test_a_player_without_a_save_row_is_404_on_get():
    client, _ = make_client(AccountsDatabase())

    assert_error(client.get(URL, headers=RIGHT_HEADER), 404, "player_not_set_up")


@pytest.mark.parametrize(
    "row",
    [
        {"version": "3", "data": {}, "updated_at": FIRST_SAVE_AT},
        {"version": True, "data": {}, "updated_at": FIRST_SAVE_AT},
        {"version": 3, "data": [], "updated_at": FIRST_SAVE_AT},
        {"version": 3, "data": None, "updated_at": FIRST_SAVE_AT},
        {"version": 3, "data": {}, "updated_at": "2026-11-06T09:00:00"},
        {"version": 3, "data": {}},
        "not a row",
    ],
)
def test_a_save_row_we_cannot_read_gives_502(row):
    client, _ = make_client(lambda request: httpx.Response(200, json=[row]))

    assert_error(client.get(URL, headers=RIGHT_HEADER), 502, "database_error")


# --- PUT /api/save ---


def test_put_save_with_the_current_version_returns_the_next():
    accounts = two_players(version=3)
    client, seen = make_client(accounts)
    new_data = {"intro": {"scene": "tower"}}

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": new_data})

    assert response.status_code == 200
    assert response.json() == {"version": 4, "updatedAt": WRITTEN_AT_AS_UTC}
    assert accounts.saves[PLAYER_ID]["data"] == new_data
    assert [request.url.path for request in seen] == ["/rest/v1/rpc/save_progress"]
    assert sent_arguments(seen[0]) == {
        "p_player_id": PLAYER_ID,
        "p_expected_version": 3,
        "p_data": new_data,
    }


def test_the_time_is_sent_as_utc_whole_seconds_even_when_the_database_uses_another_timezone():
    client, _ = make_client(two_players(version=3))

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {}})

    assert response.json()["updatedAt"] == "2026-11-06T10:15:30Z"  # the fake wrote +01:00


def test_a_stale_version_is_409_stale_save_and_changes_nothing():
    accounts = two_players(version=4)
    client, _ = make_client(accounts)

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"old": "copy"}})

    assert_error(response, 409, "stale_save")
    assert "another device" in response.json()["error"]["message"]
    assert accounts.saves[PLAYER_ID]["data"] == MY_DATA
    assert accounts.saves[PLAYER_ID]["version"] == 4


def test_two_devices_from_the_same_version_only_the_first_wins():
    accounts = two_players(version=3)
    client, _ = make_client(accounts)

    phone = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"device": "phone"}})
    laptop = client.put(
        URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"device": "laptop"}}
    )

    assert phone.status_code == 200
    assert_error(laptop, 409, "stale_save")
    assert accounts.saves[PLAYER_ID]["data"] == {"device": "phone"}


def test_sending_the_same_save_twice_is_409_and_changes_nothing_more():
    accounts = two_players(version=3)
    client, _ = make_client(accounts)
    body = {"version": 3, "data": {"intro": {"scene": "tower"}}}

    first = client.put(URL, headers=RIGHT_HEADER, json=body)
    repeat = client.put(URL, headers=RIGHT_HEADER, json=body)

    assert first.json()["version"] == 4
    assert_error(repeat, 409, "stale_save")
    assert accounts.saves[PLAYER_ID]["version"] == 4


def test_a_save_written_on_one_device_is_read_on_another():
    accounts = two_players(version=3)
    phone, _ = make_client(accounts)
    laptop, _ = make_client(accounts)  # a second client: the other device
    written = {"intro": {"scene": "tower"}, "settings": {"sound": False}}
    answer = phone.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": written})

    read = laptop.get(URL, headers=RIGHT_HEADER)

    assert read.json() == {
        "version": answer.json()["version"],
        "data": written,
        "updatedAt": WRITTEN_AT_AS_UTC,
    }
    # The laptop continues from the version it just read, and its next save works.
    next_save = laptop.put(
        URL, headers=RIGHT_HEADER, json={"version": read.json()["version"], "data": {"more": 1}}
    )
    assert next_save.json()["version"] == 5


def test_the_other_players_save_is_never_changed():
    accounts = two_players(version=3)
    client, _ = make_client(accounts)

    client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"mine": True}})

    assert accounts.saves[OTHER_PLAYER_ID]["data"] == OTHER_DATA
    assert accounts.saves[OTHER_PLAYER_ID]["version"] == 7


def test_a_player_id_in_the_body_or_the_address_is_ignored():
    accounts = two_players(version=3)
    client, seen = make_client(accounts)

    client.put(
        f"{URL}?playerId={OTHER_PLAYER_ID}",
        headers=RIGHT_HEADER,
        json={"version": 3, "data": {"mine": True}},
    )

    assert sent_arguments(seen[0])["p_player_id"] == PLAYER_ID


def test_a_save_that_is_too_big_is_422_and_calls_nothing():
    client, seen = make_client(two_players())

    response = client.put(
        URL, headers=RIGHT_HEADER, json={"version": 3, "data": data_of_size(100_001)}
    )

    assert_error(response, 422, "save_too_big")
    assert "100 KB" in response.json()["error"]["message"]
    assert seen == []


def test_a_save_of_exactly_100000_bytes_is_written():
    client, seen = make_client(two_players())

    response = client.put(
        URL, headers=RIGHT_HEADER, json={"version": 3, "data": data_of_size(100_000)}
    )

    assert response.status_code == 200
    assert len(seen) == 1


def test_a_database_too_big_answer_is_422_save_too_big():
    database = scripted_database(
        functions={"save_progress": lambda arguments: {"status": "too_big"}}
    )
    client, _ = make_client(database)

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"x": 1}})

    assert_error(response, 422, "save_too_big")


def test_nan_in_the_data_is_422_save_not_json_and_calls_nothing():
    # Python's JSON reader accepts the word NaN. The database does not, so the server must say no.
    client, seen = make_client(two_players())

    response = client.put(
        URL,
        headers={**RIGHT_HEADER, "Content-Type": "application/json"},
        content='{"version": 3, "data": {"x": NaN}}',
    )

    assert_error(response, 422, "save_not_json")
    assert seen == []


@pytest.mark.parametrize("data", [[], [1, 2], "text", None, 5, True])
def test_data_that_is_not_an_object_is_422(data):
    client, seen = make_client(two_players())

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": data})

    assert_error(response, 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize(
    "version", [0, -1, "3", 2.5, True, False, None, [3], 2_147_483_648, 2**63, 10**30]
)
def test_a_version_that_is_not_a_whole_number_from_1_to_2147483647_is_422(version):
    # 2147483648 is one more than the database can hold in saves.version (a 4-byte integer). It
    # would reach the database and come back as a data error (a 502), so it is refused here.
    client, seen = make_client(two_players())

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": version, "data": {}})

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_the_largest_whole_number_of_the_database_column_is_a_valid_version():
    # The save is at version 3, so the database answers "stale". What matters here is that the
    # request got past the check and reached the database: 2147483647 is the last good version.
    client, seen = make_client(two_players(version=3))

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": MAX_SAVE_VERSION, "data": {}})

    assert_error(response, 409, "stale_save")
    assert len(seen) == 1


def test_the_largest_version_is_the_largest_integer_of_the_database_column():
    # saves.version (foundation) and the version parameter of save_progress() (accounts) are
    # integers of 4 bytes. If either column grew to bigint, this number could grow too.
    saves_table = re.search(
        r"create table if not exists public\.saves \((.*?)\n\);", FOUNDATION.read_text(), re.DOTALL
    )
    assert saves_table
    assert re.search(r"\bversion\s+integer not null", saves_table.group(1))
    assert "p_expected_version integer" in ACCOUNTS.read_text()
    assert MAX_SAVE_VERSION == 2**31 - 1


@pytest.mark.parametrize("body", [{}, {"version": 3}, {"data": {}}])
def test_a_missing_field_is_422(body):
    client, seen = make_client(two_players())

    assert_error(client.put(URL, headers=RIGHT_HEADER, json=body), 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize(
    "extra",
    [{"playerId": OTHER_PLAYER_ID}, {"updatedAt": "2026-11-06T00:00:00Z"}, {"coins": 99999}],
)
def test_extra_fields_are_refused(extra):
    client, seen = make_client(two_players())

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {}, **extra})

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_a_player_without_a_save_row_is_404_on_put():
    # save_progress answers "missing" when there is no save row for the player.
    client, _ = make_client(AccountsDatabase())

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 1, "data": {}})

    assert_error(response, 404, "player_not_set_up")


def test_the_save_is_stored_as_it_was_sent_with_nothing_added():
    # The server never adds coins, a kit or a name to a save: it keeps the browser's own object.
    accounts = two_players(version=3)
    client, _ = make_client(accounts)
    sent = {"intro": {"scene": "shore", "coins": 999999, "kit": "true_keeper"}}

    client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": sent})

    assert accounts.saves[PLAYER_ID]["data"] == sent


# --- who may call it ---


@pytest.mark.parametrize(
    ("method", "body"), [("GET", None), ("PUT", {"version": 3, "data": {"x": 1}})]
)
def test_without_a_token_it_is_401_and_calls_nothing(method, body):
    client, seen = make_client(two_players())

    response = client.request(method, URL, json=body)

    assert_error(response, 401, "unauthorized")
    assert seen == []


@pytest.mark.parametrize(
    ("method", "body"), [("GET", None), ("PUT", {"version": 3, "data": {"x": 1}})]
)
def test_the_answer_may_not_be_kept_by_any_cache(method, body):
    client, _ = make_client(two_players())

    response = client.request(method, URL, headers=RIGHT_HEADER, json=body)

    assert response.headers["cache-control"] == "private, no-store"


def test_post_is_not_allowed():
    client, seen = make_client(two_players())

    response = client.post(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {}})

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


# --- the database in trouble ---


@pytest.mark.parametrize(
    ("method", "body"), [("GET", None), ("PUT", {"version": 3, "data": {"x": 1}})]
)
@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_that_cannot_be_reached_gives_503(method, body, error_class):
    client, _ = make_client(fail_with(error_class))

    response = client.request(method, URL, headers=RIGHT_HEADER, json=body)

    assert_error(response, 503, "database_unavailable")


def test_a_unique_violation_is_a_bug_on_our_side_and_not_already_applied():
    database = scripted_database(
        functions={"save_progress": lambda arguments: database_error(409, "23505", "duplicate")}
    )
    client, _ = make_client(database)

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"x": 1}})

    assert_error(response, 502, "database_error")


@pytest.mark.parametrize(
    "reply",
    [
        "saved",
        {"status": "saved"},  # no version
        {"status": "saved", "version": 4},  # no time
        {"status": "saved", "version": "4", "updatedAt": WRITTEN_AT_AS_UTC},
        {"status": "saved", "version": 4, "updatedAt": "2026-11-06T10:15:30"},  # no timezone
        {"status": "stale"},  # no version
        {"status": "stale", "version": True},
        {"status": "something_new"},
    ],
)
def test_an_answer_of_save_progress_that_we_cannot_read_gives_502(reply):
    database = scripted_database(functions={"save_progress": lambda arguments: reply})
    client, _ = make_client(database)

    response = client.put(URL, headers=RIGHT_HEADER, json={"version": 3, "data": {"x": 1}})

    assert_error(response, 502, "database_error")
