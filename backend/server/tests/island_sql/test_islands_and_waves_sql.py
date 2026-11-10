"""Real SQL checks for 20261110010000_islands_and_waves.sql and scripts/admin/fresh_start.sql.

Opt-in, on a disposable local PostgreSQL that the case_sql fixture builds (all migrations, applied
twice). Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test runs in one transaction that is rolled back, so now() is the same moment throughout a
test: a test moves a wave's starts_at instead of waiting. No test reads a database URL or uses the
network.
"""

import json
from pathlib import Path
from uuid import UUID, uuid4

import pytest

# Opt-in: without the test-only package the whole file is skipped, like the other SQL checks.
psycopg = pytest.importorskip("psycopg")

ROOT = Path(__file__).resolve().parents[4]
FRESH_START = ROOT / "scripts" / "admin" / "fresh_start.sql"

OWNER = UUID(int=921)
FRIEND = UUID(int=922)
VETERAN = UUID(int=923)  # a player whose wallet moved before (an entry kit)
LOOT = (10, 5, 5)  # islands.json: base, perWave, perHouse
TIMING = (10, 15, 900, 50)  # countdown, minimum, maximum, highest wave


def call(database, sql, *arguments):
    return database.execute(sql, arguments).fetchone()[0]


def as_server(database):
    database.execute("set local role service_role")


def as_owner(database):
    database.execute("reset role")


def add_players(database, *players):
    as_owner(database)
    for player in players:
        database.execute(
            "insert into auth.users (id) values (%s) on conflict do nothing", (player,)
        )


def open_island(database, player, code):
    as_server(database)
    return call(database, "select public.island_open(%s, %s, 100)", player, code)


def balance(database, player):
    return call(database, "select balance from public.wallets where player_id = %s", player)


def ledger(database, player, reason):
    return database.execute(
        "select delta, ref from public.wallet_transactions where player_id = %s and reason = %s",
        (player, reason),
    ).fetchall()


def start(database, player, uid, place="island", owner=None):
    as_server(database)
    return call(
        database,
        "select public.wave_start(%s, %s, %s, %s, 4242, %s, %s, %s, %s, 'storm', 1.5, 0)",
        player,
        uid,
        place,
        owner,
        *TIMING,
    )


def finish(database, player, wave_id, survived=True, sunk=7):
    as_server(database)
    return call(
        database,
        "select public.wave_finish(%s, %s, %s, %s, %s, %s, %s)",
        player,
        wave_id,
        survived,
        sunk,
        *LOOT,
    )


def move_start(database, wave_id, seconds_ago):
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at = now() - make_interval(secs => %s) where id = %s",
        (seconds_ago, wave_id),
    )
    as_server(database)


def build(database, player, plot, kind, ref, coins=10):
    as_server(database)
    return call(
        database,
        "select public.islet_build(%s, %s, %s, %s, 0, 0, %s)",
        player,
        plot,
        kind,
        coins,
        ref,
    )


# --- island_open ---


def test_a_new_player_gets_an_island_and_the_starting_coins_once(database):
    add_players(database, OWNER)

    first = open_island(database, OWNER, "K7Q2M")
    again = open_island(database, OWNER, "ZZZZZ")

    assert first == {
        "status": "open",
        "code": "K7Q2M",
        "waveBest": 0,
        "flags": 0,
        "created": True,
        "paid": 100,
    }
    assert again == {**first, "created": False, "paid": 0}
    assert balance(database, OWNER) == 100
    assert ledger(database, OWNER, "starting_coins") == [(100, "starting_coins")]


def test_a_player_whose_wallet_moved_gets_no_starting_coins(database):
    add_players(database, VETERAN)
    as_server(database)
    call(database, "select public.apply_wallet_transaction(%s, 1600, 'kit_grant', 'kit')", VETERAN)

    opened = open_island(database, VETERAN, "VETER")

    assert opened["paid"] == 0
    assert balance(database, VETERAN) == 1600


def test_a_code_that_is_taken_changes_nothing(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")

    assert open_island(database, FRIEND, "K7Q2M") == {"status": "code_taken"}
    assert balance(database, FRIEND) == 0


def test_an_unknown_player_is_missing(database):
    assert open_island(database, uuid4(), "K7Q2M") == {"status": "missing"}


@pytest.mark.parametrize("code", ["k7q2m", "K7Q2", "K7Q20", "ISLE-K7Q2M"])
def test_a_malformed_code_is_refused(database, code):
    add_players(database, OWNER)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_island"):
        open_island(database, OWNER, code)


# --- the new build spots ---


def test_the_new_spots_are_built_with_coins_only_and_the_old_pairs_still_pass(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")

    wall = build(database, OWNER, "wall_1", "wall", "island:click-0001", coins=10)
    house = build(database, OWNER, "house_1", "house", "island:click-0002", coins=50)
    old = build(database, OWNER, "plot_2", "workshop", "island:click-0003", coins=30)

    assert wall == {"status": "done", "balance": 90, "timber": 0, "level": 1}
    assert house["balance"] == 40
    assert old["balance"] == 10


def test_a_kind_on_the_wrong_spot_breaks_the_check_rule(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")

    with pytest.raises(psycopg.errors.CheckViolation):
        build(database, OWNER, "wall_1", "cannon", "island:click-0001")


# --- wave_start ---


def test_the_first_wave_starts_after_the_countdown_and_a_repeat_is_the_same_wave(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")

    first = start(database, OWNER, "bell-0001", owner=OWNER)
    repeat = start(database, OWNER, "bell-0001", owner=OWNER)

    assert first["status"] == "started" and first["wave"] == 1 and first["seed"] == 4242
    assert first["weatherKind"] == "storm" and first["ships"] == 1.5 and first["fog"] == 0
    assert first["repeat"] is False
    assert repeat == {**first, "repeat": True}
    countdown = call(
        database,
        "select extract(epoch from starts_at - date_trunc('second', now())) "
        "from public.wave_runs where id = %s",
        first["waveId"],
    )
    assert countdown == 10


def test_one_running_wave_per_island_but_pirate_point_is_its_own(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    start(database, OWNER, "bell-0001", owner=OWNER)

    friend = start(database, FRIEND, "bell-0002", owner=OWNER)
    point = start(database, FRIEND, "bell-0003", place="pirate_point")
    point_again = start(database, OWNER, "bell-0004", place="pirate_point")

    assert friend == {"status": "refused", "reason": "wave_running"}
    assert point["status"] == "started" and point["wave"] == 1
    assert point_again == {"status": "refused", "reason": "wave_running"}


def test_a_wave_on_an_island_that_does_not_exist_is_refused(database):
    add_players(database, OWNER)

    assert start(database, OWNER, "bell-0001", owner=FRIEND) == {
        "status": "refused",
        "reason": "no_such_island",
    }


def test_an_abandoned_wave_is_closed_as_expired_by_the_next_bell(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    old = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, old["waveId"], 1000)

    new = start(database, OWNER, "bell-0002", owner=OWNER)

    assert new["status"] == "started" and new["wave"] == 1
    closed = database.execute(
        "select survived, loot, expired from public.wave_runs where id = %s", (old["waveId"],)
    ).fetchone()
    assert closed == (False, 0, True)


# --- wave_finish ---


def test_a_finish_before_the_minimum_length_is_refused_and_the_wave_keeps_running(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)

    refused = finish(database, OWNER, wave["waveId"])

    assert refused == {"status": "refused", "reason": "too_early", "waitSeconds": 25}
    assert call(
        database, "select finished_at is null from public.wave_runs where id = %s", wave["waveId"]
    )


def test_a_survived_wave_pays_the_capped_loot_once_and_counts_a_flag(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build(database, OWNER, "house_1", "house", "island:click-0001", coins=50)
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)

    done = finish(database, OWNER, wave["waveId"])
    repeat = finish(database, OWNER, wave["waveId"], survived=False, sunk=0)

    # 10 + 5 x wave 1 + 5 x one house = 20, on top of 100 - 50 for the house.
    assert done == {
        "status": "done",
        "loot": 20,
        "balance": 70,
        "survived": True,
        "wave": 1,
        "waveBest": 1,
        "flags": 1,
        "expired": False,
        "repeat": False,
    }
    assert repeat == {**done, "repeat": True}
    assert ledger(database, OWNER, "pirate_loot") == [(20, f"wave:{wave['waveId']}")]


def test_the_next_wave_is_one_stronger_after_a_win(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    first = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, first["waveId"], 20)
    finish(database, OWNER, first["waveId"])

    second = start(database, OWNER, "bell-0002", owner=OWNER)
    move_start(database, second["waveId"], 20)

    assert second["wave"] == 2
    assert finish(database, OWNER, second["waveId"])["loot"] == 20  # 10 + 5 x 2


def test_a_lost_wave_pays_nothing_and_keeps_the_best_wave(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)

    lost = finish(database, OWNER, wave["waveId"], survived=False, sunk=2)

    assert (lost["loot"], lost["balance"], lost["waveBest"], lost["flags"]) == (0, 100, 0, 0)
    assert ledger(database, OWNER, "pirate_loot") == []


def test_a_finish_after_the_maximum_length_pays_nothing(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 1000)

    late = finish(database, OWNER, wave["waveId"])

    assert (late["loot"], late["survived"], late["expired"]) == (0, False, True)


def test_only_the_player_who_rang_the_bell_may_finish(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)

    assert finish(database, FRIEND, wave["waveId"]) == {
        "status": "refused",
        "reason": "not_your_wave",
    }
    assert finish(database, OWNER, uuid4()) == {"status": "refused", "reason": "no_such_wave"}


def test_a_friend_who_defends_an_island_gets_the_loot_and_the_island_the_flag(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "FREND")
    wave = start(database, FRIEND, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)

    done = finish(database, FRIEND, wave["waveId"])

    assert (done["loot"], done["balance"], done["waveBest"], done["flags"]) == (15, 115, 1, 1)
    assert balance(database, OWNER) == 100


def test_pirate_point_counts_its_own_best_wave_and_pays_no_house_loot(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build(database, OWNER, "house_1", "house", "island:click-0001", coins=50)
    wave = start(database, OWNER, "bell-0001", place="pirate_point")
    move_start(database, wave["waveId"], 20)

    done = finish(database, OWNER, wave["waveId"])

    assert (done["loot"], done["waveBest"], done["flags"]) == (15, 1, 1)
    assert start(database, OWNER, "bell-0002", place="pirate_point")["wave"] == 2


# --- who may do what ---


def test_no_browser_role_may_read_the_tables_or_run_the_functions(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.islands', 'select'),
               has_table_privilege('authenticated', 'public.wave_runs', 'select'),
               has_table_privilege('anon', 'public.islands', 'select'),
               has_function_privilege('authenticated',
                 'public.island_open(uuid, text, bigint)', 'execute'),
               has_function_privilege('authenticated',
                 'public.wave_start(uuid, text, text, uuid, integer, integer, integer, integer,
                                    integer, text, numeric, numeric)', 'execute'),
               has_function_privilege('authenticated',
                 'public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer)',
                 'execute')
        """
    ).fetchone()
    assert rights == (False, False, False, False, False, False)
    secured = database.execute(
        "select relname, relrowsecurity from pg_class "
        "where relname in ('islands', 'wave_runs') order by relname"
    ).fetchall()
    assert secured == [("islands", True), ("wave_runs", True)]
    assert (
        call(
            database, "select count(*) from pg_policies where tablename in ('islands', 'wave_runs')"
        )
        == 0
    )


def test_the_server_cannot_delete_buildings_islands_or_waves(database):
    rights = database.execute(
        """
        select has_table_privilege('service_role', 'public.islands', 'delete'),
               has_table_privilege('service_role', 'public.wave_runs', 'delete'),
               has_table_privilege('service_role', 'public.islet_buildings', 'delete')
        """
    ).fetchone()
    assert rights == (False, False, False)


# --- scripts/admin/fresh_start.sql ---


def fresh_start_block(apply: bool) -> str:
    """The DO block of the script, without its own begin and commit (the test owns the
    transaction)."""
    text = FRESH_START.read_text()
    block = text[text.index("do $$") : text.index("$$;") + len("$$;")]
    if apply:
        block = block.replace(
            "c_apply          constant boolean := false;",
            "c_apply          constant boolean := true;",
        )
    return block


def seed_progress(database):
    add_players(database, OWNER, VETERAN)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, VETERAN, "VETER")
    call(database, "select public.apply_wallet_transaction(%s, 900, 'kit_grant', 'kit')", VETERAN)
    build(database, OWNER, "wall_1", "wall", "island:click-0001")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)
    finish(database, OWNER, wave["waveId"])
    as_owner(database)
    database.execute(
        "update public.saves set data = %s where player_id = %s",
        (json.dumps({"quest": 3}), OWNER),
    )


def test_the_fresh_start_dry_run_reports_the_counts_and_changes_nothing(database):
    seed_progress(database)
    database.execute("savepoint before_dry_run")

    with pytest.raises(psycopg.errors.RaiseException, match="DRY RUN") as stopped:
        database.execute(fresh_start_block(apply=False))
    database.execute("rollback to savepoint before_dry_run")

    assert "wallets set to 100: 2" in str(stopped.value)
    assert "buildings removed: 1" in str(stopped.value)
    assert balance(database, VETERAN) == 1000


def test_the_fresh_start_sets_every_wallet_to_100_and_clears_the_progress(database):
    seed_progress(database)

    database.execute(fresh_start_block(apply=True))
    database.execute(fresh_start_block(apply=True))  # a second run changes nothing

    assert balance(database, OWNER) == 100 and balance(database, VETERAN) == 100
    assert ledger(database, VETERAN, "fresh_start") == [(-900, "fresh_start:2026-11-19")]
    left = database.execute(
        "select (select count(*) from public.islet_buildings),"
        "       (select count(*) from public.wave_runs),"
        "       (select max(wave_best) + max(flags) from public.islands),"
        "       (select count(*) from public.saves where data <> '{}'::jsonb),"
        "       (select count(*) from public.islands)"
    ).fetchone()
    assert left == (0, 0, 0, 0, 2)
