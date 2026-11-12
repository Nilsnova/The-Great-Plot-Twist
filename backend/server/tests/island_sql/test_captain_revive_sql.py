"""Real SQL checks for 20261112050000_captain_revive.sql: a teammate who helps a fallen captain up
pays 20 + 5 x the wave number through the ledger, once per click, only in a running wave they are
in and, on somebody else's island, only as a member of that game.

Opt-in, like test_captain_skills_sql.py, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end, so now() is one moment: a test moves a
wave's starts_at instead of waiting.
"""

from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_game_rooms_sql import join  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    move_start,
    open_island,
)
from server.tests.island_sql.test_tower_defense_sql import finish, start  # noqa: E402
from server.tests.island_sql.test_wave_crews_sql import join as join_wave  # noqa: E402

STRANGER = UUID(int=931)
BASE, PER_WAVE = 20, 5  # backend/content/islands.json "revive"


def revive(database, player, wave_id, uid, fallen="p-k3x9q2", base=BASE, per_wave=PER_WAVE):
    as_server(database)
    return call(
        database,
        "select public.wave_revive(%s, %s, %s, %s, %s, %s)",
        player,
        wave_id,
        fallen,
        uid,
        base,
        per_wave,
    )


def running_wave(database, *friends):
    """OWNER's island with a running wave (wave 1, started a minute ago); friends join the game."""
    add_players(database, OWNER, *friends)
    open_island(database, OWNER, "K7Q2M")
    for index, friend in enumerate(friends):
        open_island(database, friend, f"FRND{index + 2}")
        join(database, friend, OWNER)
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 60)
    return wave["waveId"]


def revives(database, player):
    as_owner(database)
    return database.execute(
        "select ref, fallen, price from public.captain_revives where player_id = %s order by ref",
        (player,),
    ).fetchall()


def test_a_revive_pays_twenty_plus_five_per_wave_once_per_click(database):
    wave_id = running_wave(database)
    before = balance(database, OWNER)

    paid = revive(database, OWNER, wave_id, "help-0001")
    again = revive(database, OWNER, wave_id, "help-0001")

    assert paid == {"status": "done", "price": 25, "balance": before - 25, "repeat": False}
    assert again == {"status": "done", "price": 25, "balance": before - 25, "repeat": True}
    assert balance(database, OWNER) == before - 25
    assert ledger(database, OWNER, "captain_revive") == [(-25, "revive:help-0001")]
    assert revives(database, OWNER) == [("revive:help-0001", "p-k3x9q2", 25)]
    # A second fall is a second click: paid again.
    assert revive(database, OWNER, wave_id, "help-0002")["balance"] == before - 50


def test_the_price_follows_the_waves_own_number(database):
    wave_id = running_wave(database)
    as_owner(database)
    database.execute("update public.wave_runs set wave = 12 where id = %s", (wave_id,))

    assert revive(database, OWNER, wave_id, "help-0001")["price"] == 20 + 5 * 12


def test_a_revive_needs_the_coins_and_changes_nothing_without_them(database):
    wave_id = running_wave(database)
    as_owner(database)
    database.execute("update public.wallets set balance = 24 where player_id = %s", (OWNER,))

    assert revive(database, OWNER, wave_id, "help-0001") == {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": 25,
    }
    assert balance(database, OWNER) == 24
    assert ledger(database, OWNER, "captain_revive") == []
    assert revives(database, OWNER) == []


def test_only_a_member_in_the_running_wave_pays(database):
    wave_id = running_wave(database, FRIEND)
    add_players(database, STRANGER)
    open_island(database, STRANGER, "STRNG")

    # Not a member of the game.
    assert revive(database, STRANGER, wave_id, "help-0001")["reason"] == "not_member"
    # A member who never joined this wave.
    assert revive(database, FRIEND, wave_id, "help-0002")["reason"] == "not_in_wave"
    join_wave(database, FRIEND, wave_id)
    assert revive(database, FRIEND, wave_id, "help-0003")["status"] == "done"
    # No such wave.
    unknown = UUID(int=999)
    assert revive(database, OWNER, unknown, "help-0004")["reason"] == "no_such_wave"
    # After your own finish, before the wave starts and after its maximum length: over.
    finish(database, FRIEND, wave_id)
    assert revive(database, FRIEND, wave_id, "help-0005")["reason"] == "wave_over"
    move_start(database, wave_id, -30)
    assert revive(database, OWNER, wave_id, "help-0006")["reason"] == "wave_over"
    move_start(database, wave_id, 901)
    assert revive(database, OWNER, wave_id, "help-0007")["reason"] == "wave_over"
    assert ledger(database, OWNER, "captain_revive") == []


def test_a_member_who_left_the_game_is_out_and_pirate_point_is_open(database):
    wave_id = running_wave(database, FRIEND)
    join_wave(database, FRIEND, wave_id)
    as_owner(database)
    database.execute(
        "update public.island_members set left_at = now() where player_id = %s", (FRIEND,)
    )
    assert revive(database, FRIEND, wave_id, "help-0001")["reason"] == "not_member"

    add_players(database, STRANGER)
    open_island(database, STRANGER, "STRNG")
    point = start(database, STRANGER, "bell-0002", place="pirate_point")
    move_start(database, point["waveId"], 60)
    assert revive(database, STRANGER, point["waveId"], "help-0002")["status"] == "done"


def test_a_player_without_a_wallet_and_bad_arguments(database):
    wave_id = running_wave(database)
    nobody = UUID(int=12345)  # never set up: no wallet
    assert revive(database, nobody, wave_id, "help-0001")["reason"] == "player_not_set_up"
    for bad in [
        {"uid": "short"},
        {"fallen": "p k3"},
        {"fallen": ""},
        {"base": 0},
        {"per_wave": -1},
    ]:
        arguments = {"uid": "help-0009", **bad}
        with pytest.raises(psycopg.errors.RaiseException):
            revive(
                database,
                OWNER,
                wave_id,
                arguments["uid"],
                fallen=arguments.get("fallen", "p-k3x9q2"),
                base=arguments.get("base", BASE),
                per_wave=arguments.get("per_wave", PER_WAVE),
            )
        database.rollback()
        wave_id = running_wave(database)


def test_the_table_keeps_its_rules(database):
    wave_id = running_wave(database)
    as_owner(database)
    for ref, fallen, price in [("help-0001", "p-k3", 25), ("revive:x", "p-k3", 25),
                               ("revive:help-0001", "p k3", 25), ("revive:help-0001", "p-k3", 0)]:
        with pytest.raises(psycopg.errors.CheckViolation):
            database.execute(
                "insert into public.captain_revives (player_id, ref, wave_id, fallen, price)"
                " values (%s, %s, %s, %s, %s)",
                (OWNER, ref, wave_id, fallen, price),
            )
        database.rollback()
        wave_id = running_wave(database)
        as_owner(database)


def test_no_browser_role_may_run_the_function_or_read_the_revives(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.captain_revives', 'select'),
               has_table_privilege('anon', 'public.captain_revives', 'select'),
               has_table_privilege('service_role', 'public.captain_revives', 'delete'),
               has_table_privilege('service_role', 'public.captain_revives', 'update'),
               has_function_privilege('authenticated',
                 'public.wave_revive(uuid, uuid, text, text, integer, integer)', 'execute'),
               has_function_privilege('anon',
                 'public.wave_revive(uuid, uuid, text, text, integer, integer)', 'execute'),
               has_function_privilege('service_role',
                 'public.wave_revive(uuid, uuid, text, text, integer, integer)', 'execute')
        """
    ).fetchone()
    assert rights == (False, False, False, False, False, False, True)
    secured = call(
        database, "select relrowsecurity from pg_class where relname = 'captain_revives'"
    )
    assert secured is True
    policies = "select count(*) from pg_policies where tablename = 'captain_revives'"
    assert call(database, policies) == 0
    reason = "select direction from public.wallet_reasons where reason = 'captain_revive'"
    assert call(database, reason) == "spend"
