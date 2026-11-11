"""Real SQL checks for 20261111030000_tower_defense.sql: levels, crew, the captain, Pirate Point's
shared buildings, boss loot and the restart rule.

Opt-in, like test_islands_and_waves_sql.py (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    TIMING,
    add_players,
    as_server,
    balance,
    build,
    call,
    move_start,
    open_island,
)

THIRD = UUID(int=925)
WALL = [10, 20, 40]
CAPTAIN = [0, 20, 40, 80, 160]
LOOT_V2 = (10, 5, 5, 20, 5, 2, 2)  # base, perWave, perHouse, point base, bossEvery, x2, back 2


def upgrade(database, player, plot, uid, prices=WALL, unlocked=3, owner=None):
    as_server(database)
    return call(
        database,
        "select public.island_upgrade(%s, %s, %s, %s, %s, %s)",
        player,
        owner or player,
        plot,
        uid,
        prices,
        unlocked,
    )


def coop_build(database, payer, owner, plot, kind, uid, price=10):
    as_server(database)
    return call(
        database,
        "select public.island_build(%s, %s, %s, %s, %s, %s)",
        payer,
        owner,
        plot,
        kind,
        uid,
        price,
    )


def hire(database, player, crew, uid, price=40, most=2):
    as_server(database)
    return call(
        database, "select public.island_hire(%s, %s, %s, %s, %s)", player, crew, uid, price, most
    )


def captain(database, player, uid, unlocked=5):
    as_server(database)
    return call(
        database, "select public.island_captain(%s, %s, %s, %s)", player, uid, CAPTAIN, unlocked
    )


def pp_build(database, player, spot, kind, uid, price=30):
    as_server(database)
    return call(
        database, "select public.pp_build(%s, %s, %s, %s, %s)", player, spot, kind, uid, price
    )


def pp_upgrade(database, player, spot, kind, uid, prices=(30, 60, 120), unlocked=3):
    as_server(database)
    return call(
        database,
        "select public.pp_upgrade(%s, %s, %s, %s, %s, %s)",
        player,
        spot,
        kind,
        uid,
        list(prices),
        unlocked,
    )


def start(database, player, uid, place="island", owner=None, highest=100):
    as_server(database)
    return call(
        database,
        "select public.wave_start(%s, %s, %s, %s, 4242, %s, %s, %s, %s, 'calm', 1, 0)",
        player,
        uid,
        place,
        owner,
        *TIMING[:3],
        highest,
    )


def finish(database, player, wave_id, survived=True):
    as_server(database)
    return call(
        database,
        "select public.wave_finish(%s, %s, %s, 3, %s, %s, %s, %s, %s, %s, %s)",
        player,
        wave_id,
        survived,
        *LOOT_V2,
    )


def island_row(database, player, column):
    return call(database, f"select {column} from public.islands where player_id = %s", player)


def ready(database, *players):
    add_players(database, *players)
    for index, player in enumerate(players):
        open_island(database, player, ["K7Q2M", "ZZ234", "AB345"][index])


def set_best(database, player, best):
    database.execute("reset role")
    database.execute(
        "update public.islands set wave_best = %s where player_id = %s", (best, player)
    )


# --- building levels ---


def test_a_mortar_stands_on_a_cannon_spot_and_the_new_spots_exist(database):
    ready(database, OWNER)

    assert build(database, OWNER, "cannon_7", "mortar", "island:m1", 60)["status"] == "done"
    assert build(database, OWNER, "wall_6", "wall", "island:w6")["status"] == "done"


def test_an_upgrade_charges_the_next_price_once_and_stops_at_the_top(database):
    ready(database, OWNER)
    build(database, OWNER, "wall_1", "wall", "island:w1")  # 100 - 10

    first = upgrade(database, OWNER, "wall_1", "upgrade-0001")
    again = upgrade(database, OWNER, "wall_1", "upgrade-0001")
    third = upgrade(database, OWNER, "wall_1", "upgrade-0002")
    top = upgrade(database, OWNER, "wall_1", "upgrade-0003")

    assert (first["level"], first["balance"], first["repeat"]) == (2, 70, False)
    assert (again["level"], again["repeat"]) == (2, True)
    assert (third["level"], third["balance"]) == (3, 30)
    assert top == {"status": "refused", "reason": "max_level"}
    assert balance(database, OWNER) == 30


def test_an_upgrade_refuses_not_built_locked_and_too_few_coins(database):
    ready(database, OWNER)
    build(database, OWNER, "wall_1", "wall", "island:w1")

    assert upgrade(database, OWNER, "wall_2", "upgrade-0001")["reason"] == "not_built"
    assert upgrade(database, OWNER, "wall_1", "upgrade-0002", unlocked=1)["reason"] == "locked"
    refused = upgrade(database, OWNER, "wall_1", "upgrade-0003", prices=[10, 500, 900])
    assert refused == {"status": "refused", "reason": "insufficient_funds", "price": 500}
    assert balance(database, OWNER) == 90


# --- crew and captain ---


def test_crew_is_hired_up_to_the_maximum_and_a_repeat_pays_nothing(database):
    ready(database, OWNER)

    assert hire(database, OWNER, "gunner", "crew-0001")["count"] == 1
    assert hire(database, OWNER, "gunner", "crew-0001")["repeat"] is True
    assert hire(database, OWNER, "gunner", "crew-0002")["count"] == 2
    assert hire(database, OWNER, "gunner", "crew-0003") == {
        "status": "refused",
        "reason": "crew_full",
    }
    assert (island_row(database, OWNER, "crew_gunner"), balance(database, OWNER)) == (2, 20)


def test_the_captain_climbs_one_level_per_click_up_to_five(database):
    ready(database, OWNER)
    as_server(database)
    database.execute("reset role")
    database.execute(
        "select public.apply_wallet_transaction(%s, 300, 'admin_adjust', 'test-coins')", (OWNER,)
    )

    levels = [captain(database, OWNER, f"captain-{n:04}")["level"] for n in range(4)]
    assert levels == [2, 3, 4, 5]
    assert captain(database, OWNER, "captain-0009") == {"status": "refused", "reason": "max_level"}
    assert balance(database, OWNER) == 400 - 300
    assert captain(database, OWNER, "captain-0000")["repeat"] is True


def test_the_captain_is_locked_above_the_unlocked_level(database):
    ready(database, OWNER)

    assert captain(database, OWNER, "captain-0001", unlocked=1)["reason"] == "locked"


# --- Pirate Point ---


def test_two_players_build_and_upgrade_the_same_pirate_point_tower(database):
    ready(database, OWNER, FRIEND)

    built = pp_build(database, OWNER, "pp_tower_1", "mortar", "point-0001")
    taken = pp_build(database, FRIEND, "pp_tower_1", "cannon", "point-0002")
    wrong = pp_upgrade(database, FRIEND, "pp_tower_1", "cannon", "point-0003")
    raised = pp_upgrade(database, FRIEND, "pp_tower_1", "mortar", "point-0004")
    again = pp_upgrade(database, FRIEND, "pp_tower_1", "mortar", "point-0004")

    assert (built["level"], built["balance"]) == (1, 70)
    assert taken == {"status": "refused", "reason": "spot_taken"}
    assert wrong == {"status": "refused", "reason": "wrong_kind"}
    assert (raised["level"], raised["balance"], again["repeat"]) == (2, 40, True)
    row = database.execute(
        "select kind, level, built_by, coins_paid from public.pirate_point_buildings"
    ).fetchall()
    assert row == [("mortar", 2, OWNER, 90)]
    assert pp_upgrade(database, OWNER, "pp_wall_1", "wall", "point-0005")["reason"] == "not_built"


# --- waves: boss loot and the restart rule ---


def won_wave(database, player, uid, owner):
    wave = start(database, player, uid, owner=owner)
    move_start(database, wave["waveId"], 30)
    return wave, finish(database, player, wave["waveId"])


def test_a_boss_wave_pays_twice_and_house_levels_count(database):
    ready(database, OWNER)
    build(database, OWNER, "house_1", "house", "island:h1", 50)
    upgrade(database, OWNER, "house_1", "upgrade-h1", prices=[50, 1], unlocked=2)
    set_best(database, OWNER, 4)

    wave, done = won_wave(database, OWNER, "bell-0005", OWNER)

    # wave 5 is a boss wave: (10 + 5 x 5 + 5 x 2 house levels) x 2
    assert (wave["wave"], done["boss"], done["loot"]) == (5, True, 90)


def test_after_a_loss_the_next_bell_rings_the_best_wave_minus_two(database):
    ready(database, OWNER)
    set_best(database, OWNER, 10)

    lost = start(database, OWNER, "bell-0011", owner=OWNER)
    move_start(database, lost["waveId"], 30)
    finish(database, OWNER, lost["waveId"], survived=False)
    restart = start(database, OWNER, "bell-0008", owner=OWNER)

    assert (lost["wave"], restart["wave"]) == (11, 8)
    move_start(database, restart["waveId"], 30)
    finish(database, OWNER, restart["waveId"])
    assert start(database, OWNER, "bell-0009", owner=OWNER)["wave"] == 9
    assert island_row(database, OWNER, "wave_best") == 10


def test_a_first_loss_restarts_at_wave_one_and_waves_go_up_to_one_hundred(database):
    ready(database, OWNER)

    lost = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, lost["waveId"], 30)
    finish(database, OWNER, lost["waveId"], survived=False)
    assert start(database, OWNER, "bell-0002", owner=OWNER)["wave"] == 1

    database.execute("reset role")
    database.execute(
        "update public.wave_runs set finished_at = now(), survived = false, ships_sunk = 0,"
        " loot = 0 where finished_at is null"
    )
    set_best(database, OWNER, 120)
    database.execute("update public.islands set next_wave = null where player_id = %s", (OWNER,))
    assert start(database, OWNER, "bell-0003", owner=OWNER)["wave"] == 100


def test_four_players_fight_one_island_wave_and_each_gets_loot(database):
    fourth = UUID(int=926)
    ready(database, OWNER, FRIEND, THIRD)
    add_players(database, fourth)
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    for player in (FRIEND, THIRD, fourth):
        as_server(database)
        assert (
            call(database, "select public.wave_join(%s, %s)", player, wave["waveId"])["status"]
            == "joined"
        )
    move_start(database, wave["waveId"], 30)

    loots = [
        finish(database, player, wave["waveId"])["loot"]
        for player in (OWNER, FRIEND, THIRD, fourth)
    ]

    assert loots == [15, 15, 15, 15]


def test_a_won_pirate_point_wave_raises_the_players_own_point_best(database):
    ready(database, OWNER)

    wave = start(database, OWNER, "bell-0001", place="pirate_point")
    move_start(database, wave["waveId"], 30)
    finish(database, OWNER, wave["waveId"])

    assert island_row(database, OWNER, "won_wave_best") == 1


def test_a_visitor_builds_and_upgrades_on_a_friends_island_with_their_own_coins(database):
    ready(database, OWNER, FRIEND)

    built = coop_build(database, FRIEND, OWNER, "wall_2", "wall", "coop-0001")
    again = coop_build(database, FRIEND, OWNER, "wall_2", "wall", "coop-0001")
    taken = coop_build(database, OWNER, OWNER, "wall_2", "wall", "coop-0002")
    raised = upgrade(database, FRIEND, "wall_2", "upgrade-0001", owner=OWNER)

    assert (built["level"], built["balance"], again["repeat"]) == (1, 90, True)
    assert taken == {"status": "refused", "reason": "spot_taken"}
    assert (raised["level"], raised["balance"]) == (2, 70)
    rows = database.execute(
        "select player_id, level, coins_paid from public.islet_buildings where plot = 'wall_2'"
    ).fetchall()
    assert rows == [(OWNER, 2, 30)]
    assert (balance(database, OWNER), balance(database, FRIEND)) == (100, 70)
    poor = coop_build(database, FRIEND, OWNER, "wall_3", "wall", "coop-0003", price=500)
    assert poor == {"status": "refused", "reason": "insufficient_funds", "price": 500}


def test_a_win_on_a_friends_island_raises_the_visitors_own_unlock_wave(database):
    ready(database, OWNER, FRIEND)
    set_best(database, OWNER, 6)
    wave = start(database, OWNER, "bell-0007", owner=OWNER)
    as_server(database)
    call(database, "select public.wave_join(%s, %s)", FRIEND, wave["waveId"])
    move_start(database, wave["waveId"], 30)

    finish(database, FRIEND, wave["waveId"])

    assert island_row(database, FRIEND, "won_wave_best") == 7
    assert island_row(database, FRIEND, "wave_best") == 0


def test_the_browser_roles_get_nothing_new(database):
    for name in (
        "island_build",
        "island_upgrade",
        "island_hire",
        "island_captain",
        "pp_build",
        "pp_upgrade",
    ):
        rights = database.execute(
            "select bool_or(has_function_privilege('authenticated', p.oid, 'execute')),"
            " bool_or(has_function_privilege('anon', p.oid, 'execute'))"
            " from pg_proc p where p.proname = %s",
            (name,),
        ).fetchone()
        assert rights == (False, False), name
    assert (
        database.execute(
            "select has_table_privilege('authenticated', 'public.pirate_point_buildings', 'select')"
        ).fetchone()[0]
        is False
    )
