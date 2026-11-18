"""Real PostgreSQL checks for 20261118040000_playtest.sql (fix/playtest-1117).

With the shared arsenal a captain shoots with the copy they carry from the defended island's arsenal
(else the musket); the journal now attaches that weapon, read at each input, so a fire bomb taken
mid-wave throws from the next command on. Without the flag (and through the old 3-argument call) the
equipped weapon is attached as before.
"""

import json

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    as_owner,
    as_server,
    call,
)
from server.tests.island_sql.test_recovery_wave_end_sql import two_player_wave  # noqa: E402

INPUTS4 = "select public.recovery_wave_inputs(%s,%s,%s::jsonb,%s)"
INPUTS3 = "select public.recovery_wave_inputs(%s,%s,%s::jsonb)"


def bomb(uid, counter):
    return json.dumps(
        [
            {
                "inputUid": uid,
                "actorCounter": counter,
                "tick": 0,
                "command": {
                    "type": "captain_shot",
                    "targetId": None,
                    "x": 1,
                    "z": 2,
                    "ax": 4,
                    "az": 5,
                },
            }
        ]
    )


def weapon_of(reply):
    assert reply["status"] == "accepted", reply
    return reply["accepted"][0]["payload"]["captain"]["weapon"]


def test_the_journal_attaches_the_carried_arsenal_copy_read_at_each_input(database):
    wave_id, _ = two_player_wave(database)
    as_owner(database)
    database.execute(
        "update public.islands set weapon_equipped='musket' where player_id=%s", (FRIEND,)
    )
    as_server(database)
    # Nothing carried: the standard musket, like the shooter's screen.
    assert (
        weapon_of(call(database, INPUTS4, FRIEND, wave_id, bomb("weaponcheck1", 1), True))
        == "musket"
    )
    # Taken from the arsenal mid-wave: the next command throws the bomb.
    as_owner(database)
    database.execute(
        "insert into public.arsenal_copies (island_owner,copy_no,weapon,holder,source) "
        "values (%s,1,'fire_bombs',%s,'bought')",
        (OWNER, FRIEND),
    )
    as_server(database)
    assert (
        weapon_of(call(database, INPUTS4, FRIEND, wave_id, bomb("weaponcheck2", 2), True))
        == "fire_bombs"
    )
    # Flag off, and an older backend's 3-argument call: the equipped weapon as before.
    assert (
        weapon_of(call(database, INPUTS4, FRIEND, wave_id, bomb("weaponcheck3", 3), False))
        == "musket"
    )
    assert weapon_of(call(database, INPUTS3, FRIEND, wave_id, bomb("weaponcheck4", 4))) == "musket"
