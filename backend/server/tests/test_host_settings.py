"""Tests for the host setting in settings.py: HOST_PLAYER_IDS, the players who may present.

A host is a player (a Supabase User UID) who may use presenter routes. The setting is a comma
separated list of ids. A mistake stops the server at start-up, with a message that names the
setting, so a wrong value cannot hide until the day of the class.
"""

import pytest

from server.settings import Settings, SettingsError, load_settings
from server.tests.helpers import REPO_ROOT

HOST_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"
OTHER_HOST_ID = "11111111-2222-3333-4444-555555555555"


def test_no_hosts_by_default():
    assert Settings().host_player_ids == frozenset()
    assert load_settings({}).host_player_ids == frozenset()


def test_an_empty_value_means_nobody_is_a_host():
    assert load_settings({"HOST_PLAYER_IDS": "  "}).host_player_ids == frozenset()


def test_one_id_is_accepted():
    assert load_settings({"HOST_PLAYER_IDS": HOST_ID}).host_player_ids == frozenset({HOST_ID})


def test_host_ids_are_trimmed_and_lowercased():
    text = f"  {HOST_ID.upper()} , {OTHER_HOST_ID}  "

    hosts = load_settings({"HOST_PLAYER_IDS": text}).host_player_ids

    assert hosts == frozenset({HOST_ID, OTHER_HOST_ID})


def test_empty_pieces_are_ignored():
    text = f"{HOST_ID},,{OTHER_HOST_ID},"

    hosts = load_settings({"HOST_PLAYER_IDS": text}).host_player_ids

    assert len(hosts) == 2


def test_the_same_id_twice_counts_once():
    text = f"{HOST_ID},{HOST_ID.upper()}"

    assert load_settings({"HOST_PLAYER_IDS": text}).host_player_ids == frozenset({HOST_ID})


def test_a_github_login_instead_of_an_id_stops_the_server():
    # The common mistake: the GitHub login name is not the player id. An implementation that
    # accepts any text would let this through and then nobody would be a host.
    with pytest.raises(SettingsError, match="HOST_PLAYER_IDS") as problem:
        load_settings({"HOST_PLAYER_IDS": "octocat"})

    assert "octocat" not in str(problem.value)


def test_the_message_names_the_place_of_the_bad_item_and_tells_where_to_find_an_id():
    with pytest.raises(SettingsError) as problem:
        load_settings({"HOST_PLAYER_IDS": f"{HOST_ID},octocat"})

    assert str(problem.value) == (
        "HOST_PLAYER_IDS item 2 is not a player id. "
        "Copy the User UID from Supabase, Authentication > Users."
    )


@pytest.mark.parametrize(
    "text",
    [
        "3fa85f64-5717-4562-b3fc-2c963f66afa",  # one character short
        "3fa85f64-5717-4562-b3fc-2c963f66afa6a",  # one character too many
        "3fa85f64-5717-4562-b3fc-2c963f66afag",  # a letter that is not a hexadecimal digit
        "not-an-id",
        "42",
    ],
)
def test_text_that_is_not_a_player_id_stops_the_server(text):
    with pytest.raises(SettingsError, match="HOST_PLAYER_IDS item 1"):
        load_settings({"HOST_PLAYER_IDS": text})


def test_env_example_lists_host_player_ids_empty_and_server_only():
    lines = (REPO_ROOT / ".env.example").read_text().splitlines()

    assert "HOST_PLAYER_IDS=" in lines  # empty, like every other value in the template
    comment = lines[lines.index("HOST_PLAYER_IDS=") - 1]
    assert comment.startswith("# [SERVER ONLY]")
