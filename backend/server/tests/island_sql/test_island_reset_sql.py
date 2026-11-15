"""Real SQL checks for 20261116010000_island_reset.sql: island_reset_own() resets a player's OWN
island to a fresh start (decision D054) and touches no other island.

Opt-in, like the other island SQL checks (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_island_reset_sql.py

Each test is one transaction, rolled back at the end.
"""

from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_harpoon_tower_sql import coins  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)
from server.tests.island_sql.test_tower_defense_sql import coop_build  # noqa: E402

NEIGHBOUR = UUID(int=931)  # another island, which a reset of OWNER's island never touches
START_COINS = 100

# The island row's progress columns and their fresh-start values.
FRESH = {
    "wave_best": 0,
    "flags": 0,
    "next_wave": None,
    "crew_gunner": 0,
    "crew_carpenter": 0,
    "crew_lookout": 0,
    "crew_guard": 0,
    "captain_level": 1,
    "won_wave_best": 0,
    "captain_skills": [],
    "weapons_owned": ["musket"],
    "weapon_equipped": "musket",
    "wreck_paid": 0,
    "captain_role": None,
}
PLAYED = {
    "wave_best": 9,
    "flags": 3,
    "next_wave": 8,
    "crew_gunner": 2,
    "crew_carpenter": 1,
    "crew_lookout": 1,
    "crew_guard": 2,
    "captain_level": 3,
    "won_wave_best": 9,
    "captain_skills": ["steady_aim"],
    "weapons_owned": ["musket", "pistols"],
    "weapon_equipped": "pistols",
    "wreck_paid": 50,
    "captain_role": "medic",
}

# (table, the column naming the island) of every row kind a reset clears.
CLEARED = (
    ("islet_buildings", "player_id"),
    ("building_payments", "island_owner"),
    ("island_layout", "island_owner"),
    ("island_research", "island_owner"),
    ("arsenal_copies", "island_owner"),
    ("arsenal_moves", "island_owner"),
    ("island_wall_records", "island_owner"),
    ("wave_runs", "island_owner"),
    ("captain_skill_learns", "player_id"),
)


def reset(database, player, uid, start_coins=START_COINS):
    as_server(database)
    return call(database, "select public.island_reset_own(%s, %s, %s)", player, uid, start_coins)


def progress(database, player):
    as_owner(database)
    columns = ", ".join(FRESH)
    row = database.execute(
        f"select {columns} from public.islands where player_id = %s", (player,)
    ).fetchone()
    return dict(zip(FRESH, row, strict=True))


def count(database, table, column, player):
    as_owner(database)
    return call(database, f"select count(*) from public.{table} where {column} = %s", player)


def counts(database, player):
    return {table: count(database, table, column, player) for table, column in CLEARED}


def members(database, owner):
    as_owner(database)
    return call(
        database,
        "select count(*) from public.island_members where island_owner = %s and player_id <> %s",
        owner,
        owner,
    )


def play(database, owner, code):
    """`owner`'s island after real play: two buildings (one paid by FRIEND, a member), a moved
    spot, research, an arsenal copy, a won wave with its rules and wall record, a learnt skill
    and a captain with crew, level, weapons, a role and the wreck paid into."""
    open_island(database, owner, code)
    coins(database, owner, 900, f"test-coins-{code}")
    as_server(database)
    call(database, "select public.game_join(%s, %s, 10)", FRIEND, owner)
    assert (
        coop_build(database, owner, owner, "wall_1", "wall", f"wall-{code}-01")["status"] == "done"
    )
    assert (
        coop_build(database, FRIEND, owner, "cannon_1", "cannon", f"cann-{code}-01", 30)["status"]
        == "done"
    )
    wave = start(database, owner, f"bell-{code}-01", owner=owner)
    move_start(database, wave["waveId"], 20)
    assert finish(database, owner, wave["waveId"])["survived"] is True
    as_server(database)
    bought = call(
        database,
        "select public.arsenal_buy(%s, %s, 'pistols', %s, 60, 0)",
        owner,
        owner,
        f"arsn-{code}-01",
    )
    assert bought["status"] == "done"
    as_owner(database)
    database.execute(
        "insert into public.wave_rules (wave_id, rules) values (%s, '{pathing}')",
        (wave["waveId"],),
    )
    database.execute(
        "insert into public.island_wall_records (wave_id, island_owner, recorded_by)"
        " values (%s, %s, %s)",
        (wave["waveId"], owner, owner),
    )
    database.execute(
        "insert into public.island_layout (island_owner, plot, x_half, z_half)"
        " values (%s, 'cannon_1', 4, 4)",
        (owner,),
    )
    database.execute(
        "insert into public.island_research (island_owner, branch, researched_by, coins_paid, ref)"
        " values (%s, 'cannon', %s, 180, %s)",
        (owner, owner, f"research:resr-{code}-01"),
    )
    database.execute(
        "insert into public.captain_skill_learns (player_id, ref, skill)"
        " values (%s, %s, 'steady_aim')",
        (owner, f"skill:skil-{code}-01"),
    )
    assignments = ", ".join(f"{column} = %s" for column in PLAYED)
    database.execute(
        f"update public.islands set {assignments} where player_id = %s",
        (*PLAYED.values(), owner),
    )


@pytest.fixture
def world(database):
    """OWNER's and NEIGHBOUR's islands, both played; FRIEND is a member of both games."""
    add_players(database, OWNER, FRIEND, NEIGHBOUR)
    open_island(database, FRIEND, "AB345")
    play(database, OWNER, "K7Q2M")
    play(database, NEIGHBOUR, "ZZ234")
    return database


def test_a_reset_clears_the_whole_island_and_sets_the_wallet_through_the_ledger(world):
    before = balance(world, OWNER)
    friend_coins = balance(world, FRIEND)
    assert all(value > 0 for value in counts(world, OWNER).values())
    assert members(world, OWNER) == 1

    answer = reset(world, OWNER, "reset-0001")

    assert answer["status"] == "done" and answer["repeat"] is False
    assert answer["balance"] == START_COINS == balance(world, OWNER)
    assert answer["removed"]["buildings"] == 2 and answer["removed"]["waves"] == 1
    assert progress(world, OWNER) == FRESH
    assert counts(world, OWNER) == dict.fromkeys(counts(world, OWNER), 0)
    assert members(world, OWNER) == 0
    # The wave's participants went with it; the code, the account and the ledger stay.
    participants = "select count(*) from public.wave_participants where player_id = %s"
    assert call(world, participants, OWNER) == 0
    assert call(world, "select code from public.islands where player_id = %s", OWNER) == "K7Q2M"
    assert ledger(world, OWNER, "island_reset") == [(START_COINS - before, "reset:reset-0001")]
    # FRIEND paid for the cannon and gets nothing back; their own wallet is untouched.
    assert balance(world, FRIEND) == friend_coins


def test_only_the_own_island_is_touched(world):
    neighbour = (counts(world, NEIGHBOUR), progress(world, NEIGHBOUR), members(world, NEIGHBOUR))
    neighbour_coins = balance(world, NEIGHBOUR)

    reset(world, OWNER, "reset-0001")

    assert (counts(world, NEIGHBOUR), progress(world, NEIGHBOUR), members(world, NEIGHBOUR)) == (
        neighbour
    )
    assert balance(world, NEIGHBOUR) == neighbour_coins
    assert neighbour[1] == PLAYED and all(value > 0 for value in neighbour[0].values())


def test_the_home_islet_buildings_of_the_case_game_stay(world):
    as_server(world)
    call(
        world,
        "select public.islet_build(%s, 'plot_2', 'workshop', 10, 0, 0, 'islet:wkshop-01')",
        OWNER,
    )

    reset(world, OWNER, "reset-0001")

    as_owner(world)
    rows = world.execute(
        "select plot from public.islet_buildings where player_id = %s", (OWNER,)
    ).fetchall()
    assert rows == [("plot_2",)]


def test_a_repeated_click_changes_nothing(world):
    first = reset(world, OWNER, "reset-0001")
    coins(world, OWNER, 50, "after-the-reset")
    as_server(world)
    assert coop_build(world, OWNER, OWNER, "wall_2", "wall", "wall-after-01")["status"] == "done"

    again = reset(world, OWNER, "reset-0001")

    assert again == {"status": "done", "balance": START_COINS + 50 - 10, "repeat": True}
    assert first["repeat"] is False
    assert count(world, "islet_buildings", "player_id", OWNER) == 1
    assert len(ledger(world, OWNER, "island_reset")) == 1


def test_a_wallet_at_the_starting_coins_writes_no_ledger_row_and_still_repeats_safely(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")  # 100 coins

    assert reset(database, OWNER, "reset-0001")["balance"] == START_COINS
    assert reset(database, OWNER, "reset-0001")["repeat"] is True
    assert ledger(database, OWNER, "island_reset") == []
    assert count(database, "island_resets", "player_id", OWNER) == 1


def test_a_running_wave_refuses_the_reset_and_changes_nothing(world):
    before = (counts(world, OWNER), progress(world, OWNER), balance(world, OWNER))
    start(world, OWNER, "bell-running", owner=OWNER)

    assert reset(world, OWNER, "reset-0001") == {"status": "refused", "reason": "wave_running"}
    assert counts(world, OWNER)["islet_buildings"] == before[0]["islet_buildings"]
    assert (progress(world, OWNER), balance(world, OWNER)) == before[1:]
    assert count(world, "island_resets", "player_id", OWNER) == 0


def test_a_wave_past_its_maximum_length_does_not_block(world):
    wave = start(world, OWNER, "bell-stale01", owner=OWNER)
    move_start(world, wave["waveId"], 2000)  # the maximum is 900 s

    assert reset(world, OWNER, "reset-0001")["status"] == "done"
    assert count(world, "wave_runs", "island_owner", OWNER) == 0


def test_no_island_and_no_wallet_are_refused(database):
    add_players(database, OWNER)

    assert reset(database, OWNER, "reset-0001") == {"status": "refused", "reason": "no_island"}
    assert reset(database, UUID(int=999), "reset-0001") == {
        "status": "refused",
        "reason": "player_not_set_up",
    }


@pytest.mark.parametrize(
    ("uid", "start_coins"), [("short", 100), ("bad uid!", 100), ("reset-0001", 0), (None, 100)]
)
def test_bad_arguments_raise(database, uid, start_coins):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")

    with pytest.raises(psycopg.errors.RaiseException, match="bad_reset"):
        reset(database, OWNER, uid, start_coins)


def test_only_the_server_may_reset_and_it_still_cannot_delete_waves_itself(database):
    as_owner(database)
    rights = database.execute(
        """
        select has_function_privilege('authenticated',
                 'public.island_reset_own(uuid, text, integer)', 'execute'),
               has_function_privilege('anon',
                 'public.island_reset_own(uuid, text, integer)', 'execute'),
               has_function_privilege('service_role',
                 'public.island_reset_own(uuid, text, integer)', 'execute'),
               has_table_privilege('service_role', 'public.wave_runs', 'delete'),
               has_table_privilege('authenticated', 'public.island_resets', 'select'),
               (select direction from public.wallet_reasons where reason = 'island_reset')
        """
    ).fetchone()
    assert rights == (False, False, True, False, False, "either")
