"""Real SQL checks for 20261116070000_island_fresh_start.sql (T53): a player resets their own island
in Settings. The reset clears exactly the owner's island progress (and answers the counts), keeps
the members, sets the wallet to 100, refuses a stranger, a wrong code and a running wave, answers a
repeated click without a second reset and leaves every other island alone.

Opt-in, like the other island_sql checks, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end. The function runs as service_role, so the
grants of the migration are tested too.
"""

import json
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
    build,
    call,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)

NEIGHBOUR = UUID(int=931)  # another island owner, who must not be touched
STRANGER = UUID(int=932)  # a player with a wallet but no island
CODE = "K7Q2M"
OTHER = "NBRHD"

# Every table the reset clears for one island, as (name, the column naming the island).
TABLES = (
    ("islet_buildings", "player_id"),
    ("island_research", "island_owner"),
    ("island_layout", "island_owner"),
    ("arsenal_moves", "island_owner"),
    ("arsenal_copies", "island_owner"),
    ("island_wall_records", "island_owner"),
    ("wave_runs", "island_owner"),
)


def reset(database, player=OWNER, uid="reset-0001", code=CODE):
    as_server(database)
    return call(database, "select public.island_fresh_start(%s, %s, %s)", player, uid, code)


def seed(database, owner, code, *, uid_tail):
    """One island with a little of everything: coins, a save, two buildings, research, a moved
    spot, an arsenal copy and its click, a won wave with its wall record and its kept rules, and
    the captain, the crews and the wreck moved off their defaults."""
    open_island(database, owner, code)
    call(database, "select public.apply_wallet_transaction(%s, 900, 'kit_grant', 'kit')", owner)
    build(database, owner, "wall_1", "wall", f"island:wall-{uid_tail}")
    build(database, owner, "cannon_1", "cannon", f"island:cann-{uid_tail}")
    wave = start(database, owner, f"bell-{uid_tail}", owner=owner)
    move_start(database, wave["waveId"], 20)
    finish(database, owner, wave["waveId"])
    as_owner(database)
    database.execute(
        "update public.saves set data = %s where player_id = %s", (json.dumps({"q": 3}), owner)
    )
    database.execute(
        "insert into public.island_research (island_owner, branch, researched_by, coins_paid, ref)"
        " values (%s, 'cannon', %s, 50, %s)",
        (owner, owner, f"research:rsch-{uid_tail}"),
    )
    database.execute(
        "insert into public.island_layout (island_owner, plot, x_half, z_half)"
        " values (%s, 'wall_1', 4, 6)",
        (owner,),
    )
    database.execute(
        "insert into public.island_wall_records (wave_id, island_owner, recorded_by)"
        " values (%s, %s, %s)",
        (wave["waveId"], owner, owner),
    )
    database.execute(
        "insert into public.wave_rules (wave_id, rules) values (%s, '{pathing}')", (wave["waveId"],)
    )
    copy = call(
        database,
        "insert into public.arsenal_copies (island_owner, copy_no, weapon, holder, bought_by,"
        " source) values (%s, 1, 'pistols', %s, %s, 'bought') returning id",
        owner,
        owner,
        owner,
    )
    database.execute(
        "insert into public.arsenal_moves (player_id, action_uid, island_owner, kind, copy_id)"
        " values (%s, %s, %s, 'buy', %s)",
        (owner, f"arsenal-{uid_tail}", owner, copy),
    )
    database.execute(
        "update public.islands set crew_gunner = 2, crew_guard = 1, captain_level = 3,"
        " captain_skills = '{steady_aim}', wreck_paid = 125, next_wave = 4,"
        " weapons_owned = '{musket,pistols}', weapon_equipped = 'pistols'"
        " where player_id = %s",
        (owner,),
    )


def left_of(database, owner):
    """How many rows of each cleared table still name this island."""
    as_owner(database)
    return {
        table: database.execute(
            f"select count(*) from public.{table} where {column} = %s",
            (owner,),
        ).fetchone()[0]
        for table, column in TABLES
    }


def island_row(database, owner):
    as_owner(database)
    return database.execute(
        "select wave_best, won_wave_best, flags, next_wave, crew_gunner, crew_carpenter,"
        " crew_lookout, crew_guard, captain_level, captain_skills, captain_role, wreck_paid,"
        " weapons_owned, weapon_equipped, code from public.islands where player_id = %s",
        (owner,),
    ).fetchone()


FRESH_ROW = (0, 0, 0, None, 0, 0, 0, 0, 1, [], None, 0, ["musket"], "musket")


@pytest.fixture
def islands(database):
    add_players(database, OWNER, FRIEND, NEIGHBOUR, STRANGER)
    seed(database, OWNER, CODE, uid_tail="0001")
    seed(database, NEIGHBOUR, OTHER, uid_tail="0002")
    join(database, FRIEND, OWNER)
    return database


def test_the_owner_resets_their_island_and_the_members_stay(islands):
    before = left_of(islands, OWNER)
    assert all(count > 0 for count in before.values())
    coins_before = balance(islands, OWNER)
    assert coins_before > 100  # the kit made it more than 100

    answer = reset(islands, code="isle-k7q2m")

    assert answer == {
        "status": "done",
        "repeat": False,
        "balance": 100,
        "counts": {
            "coins": 100 - coins_before,
            "saves": 1,
            "buildings": 2,
            "research": 1,
            "layout": 1,
            "arsenalMoves": 1,
            "arsenalCopies": 1,
            "wallRecords": 1,
            "waveRules": 1,
            "waves": 1,
            "membersKept": 1,
        },
    }
    assert balance(islands, OWNER) == 100
    assert ledger(islands, OWNER, "fresh_start") == [
        (answer["counts"]["coins"], "reset:reset-0001")
    ]
    assert left_of(islands, OWNER) == dict.fromkeys(before, 0)
    assert island_row(islands, OWNER) == (*FRESH_ROW, CODE)  # the code stays
    as_owner(islands)
    assert islands.execute(
        "select data from public.saves where player_id = %s", (OWNER,)
    ).fetchone() == ({},)
    # Friends stay in the game; the ledger keeps every row it had.
    assert islands.execute(
        "select player_id, role from public.island_members where island_owner = %s"
        " and left_at is null and role = 'member'",
        (OWNER,),
    ).fetchall() == [(FRIEND, "member")]
    assert islands.execute(
        "select count(*) from public.wallet_transactions"
        " where player_id = %s and reason = 'kit_grant'",
        (OWNER,),
    ).fetchone() == (1,)


def test_a_wallet_at_100_gets_no_ledger_row(islands):
    as_server(islands)
    call(islands, "select public.apply_wallet_transaction(%s, %s, 'admin_adjust', 'to-100')",
         OWNER, 100 - balance(islands, OWNER))  # fmt: skip

    answer = reset(islands)

    assert answer["status"] == "done" and answer["counts"]["coins"] == 0
    assert ledger(islands, OWNER, "fresh_start") == []
    assert balance(islands, OWNER) == 100


def test_a_player_without_an_island_or_with_a_friends_code_is_refused_not_owner(islands):
    refused = {"status": "refused", "reason": "not_owner"}
    as_server(islands)
    call(islands, "select public.apply_wallet_transaction(%s, 50, 'kit_grant', 'kit')", STRANGER)
    assert reset(islands, player=STRANGER, code=CODE) == refused
    # FRIEND is a member of OWNER's game and types its code: that island is not FRIEND's.
    open_island(islands, FRIEND, "FRND2")
    assert reset(islands, player=FRIEND, code=CODE) == refused
    assert all(count > 0 for count in left_of(islands, OWNER).values())


def test_a_player_not_set_up_is_refused(islands):
    nobody = UUID(int=939)  # no account, so no wallet
    assert reset(islands, player=nobody) == {"status": "refused", "reason": "player_not_set_up"}


@pytest.mark.parametrize("typed", ["K7Q2X", "ISLE-NOPE2", "", "K7Q2M-EXTRA"])
def test_a_wrong_code_is_refused_and_changes_nothing(islands, typed):
    before = balance(islands, OWNER)
    assert reset(islands, code=typed) == {"status": "refused", "reason": "wrong_code"}
    assert balance(islands, OWNER) == before
    assert all(count > 0 for count in left_of(islands, OWNER).values())
    as_owner(islands)
    assert islands.execute("select count(*) from public.island_resets").fetchone() == (0,)


@pytest.mark.parametrize("typed", ["K7Q2M", "k7q2m", "ISLE-K7Q2M", "isle k7q-2m"])
def test_the_code_is_read_like_the_server_reads_it(islands, typed):
    assert reset(islands, code=typed)["status"] == "done"


def test_no_reset_while_a_wave_runs_on_the_island(islands):
    wave = start(islands, OWNER, "bell-0009", owner=OWNER)
    assert wave["status"] == "started"
    before = left_of(islands, OWNER)

    assert reset(islands) == {"status": "refused", "reason": "wave_running"}
    assert left_of(islands, OWNER) == before

    # Past its maximum length the wave no longer counts as running.
    move_start(islands, wave["waveId"], 2000)
    assert reset(islands)["status"] == "done"


def test_a_repeated_click_answers_the_first_counts_and_resets_nothing_again(islands):
    first = reset(islands)
    build(islands, OWNER, "wall_2", "wall", "island:wall-after")  # play goes on after the reset

    again = reset(islands)

    assert again == {**first, "repeat": True, "balance": balance(islands, OWNER)}
    assert left_of(islands, OWNER)["islet_buildings"] == 1  # the new wall stands
    assert ledger(islands, OWNER, "fresh_start") == [(first["counts"]["coins"], "reset:reset-0001")]
    # A repeat is answered even while a wave runs.
    start(islands, OWNER, "bell-0010", owner=OWNER)
    assert reset(islands)["repeat"] is True


def test_another_island_is_untouched(islands):
    before = (
        left_of(islands, NEIGHBOUR),
        island_row(islands, NEIGHBOUR),
        balance(islands, NEIGHBOUR),
    )

    assert reset(islands)["status"] == "done"

    assert (
        left_of(islands, NEIGHBOUR),
        island_row(islands, NEIGHBOUR),
        balance(islands, NEIGHBOUR),
    ) == before
    as_owner(islands)
    assert islands.execute(
        "select data from public.saves where player_id = %s", (NEIGHBOUR,)
    ).fetchone() == ({"q": 3},)
    assert islands.execute(
        "select count(*) from public.wave_rules r join public.wave_runs w on w.id = r.wave_id"
        " where w.island_owner = %s",
        (NEIGHBOUR,),
    ).fetchone() == (1,)


def test_a_bad_click_id_raises_and_the_browser_gets_nothing(islands):
    with pytest.raises(psycopg.errors.RaiseException, match="bad_fresh_start"):
        reset(islands, uid="short")
    islands.rollback()
    as_owner(islands)
    assert islands.execute(
        "select has_table_privilege('authenticated', 'public.island_resets', 'select'),"
        " has_function_privilege('authenticated',"
        " 'public.island_fresh_start(uuid, text, text)', 'execute'),"
        " has_function_privilege('anon', 'public.island_fresh_start(uuid, text, text)', 'execute'),"
        " has_function_privilege('service_role',"
        " 'public.island_fresh_start(uuid, text, text)', 'execute'),"
        " (select relrowsecurity from pg_class where oid = 'public.island_resets'::regclass)"
    ).fetchone() == (False, False, False, True, True)
