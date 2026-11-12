"""Real SQL checks for 20261112030000_captain_skills.sql: the skill tree (points, tier order, a
repeated click) and the weapon shop (coins through the ledger, unlocks, equip).

Opt-in, like test_tower_defense_sql.py, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import json

import pytest

psycopg = pytest.importorskip("psycopg")

from server.island.catalogue import load_island  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    open_island,
)

CATALOGUE = load_island()
TREE = json.dumps(
    [
        {
            "skill": s.skill,
            "needs": list(s.needs),
            "excludes": s.excludes,
            "role": s.role,
            "cost": s.cost,
        }
        for s in CATALOGUE.skills.tree
    ]
)


def learn(database, player, skill, uid):
    as_server(database)
    return call(
        database,
        "select public.island_learn_skill(%s, %s, %s, %s::jsonb, %s)",
        player,
        skill,
        uid,
        TREE,
        2,
    )


def buy(database, player, weapon, uid, price=60, wave=2):
    as_server(database)
    return call(
        database,
        "select public.island_weapon_buy(%s, %s, %s, %s, %s)",
        player,
        weapon,
        uid,
        price,
        wave,
    )


def equip(database, player, weapon):
    as_server(database)
    return call(database, "select public.island_weapon_equip(%s, %s)", player, weapon)


def won(database, player, wave):
    as_owner(database)
    database.execute(
        "update public.islands set won_wave_best = %s where player_id = %s", (wave, player)
    )


def row(database, player):
    as_owner(database)
    return database.execute(
        "select captain_skills, weapons_owned, weapon_equipped from public.islands"
        " where player_id = %s",
        (player,),
    ).fetchone()


def test_a_new_island_has_no_skills_and_carries_the_musket(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    assert row(database, OWNER) == ([], ["musket"], "musket")


def test_skill_points_come_from_won_waves_and_the_tier_order_holds(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    assert learn(database, OWNER, "steady_aim", "click-0001")["reason"] == "no_points"
    won(database, OWNER, 5)  # 2 points
    assert learn(database, OWNER, "long_barrel", "click-0002")["reason"] == "locked"
    done = learn(database, OWNER, "steady_aim", "click-0003")
    assert (done["status"], done["points"], done["repeat"]) == ("done", 1, False)
    again = learn(database, OWNER, "steady_aim", "click-0003")
    assert (again["status"], again["repeat"]) == ("done", True)
    assert learn(database, OWNER, "steady_aim", "click-0004")["reason"] == "known"
    assert learn(database, OWNER, "long_barrel", "click-0005")["reason"] == "no_points"
    assert learn(database, OWNER, "cutlass", "click-0006")["status"] == "done"
    assert learn(database, OWNER, "quick_fix", "click-0007")["reason"] == "no_points"
    assert learn(database, OWNER, "laser_eyes", "click-0008")["reason"] == "bad_skill"
    assert row(database, OWNER)[0] == ["steady_aim", "cutlass"]


def test_an_unknown_skill_breaks_the_check_rule(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute(
            "update public.islands set captain_skills = '{laser_eyes}' where player_id = %s",
            (OWNER,),
        )


def test_a_weapon_is_bought_once_with_coins_unlocks_and_is_equipped(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    assert buy(database, OWNER, "pistols", "click-0001")["reason"] == "locked"
    won(database, OWNER, 2)
    done = buy(database, OWNER, "pistols", "click-0002")
    assert (done["status"], done["weapon"], done["balance"]) == ("done", "pistols", 40)
    assert buy(database, OWNER, "pistols", "click-0002")["repeat"] is True
    assert balance(database, OWNER) == 40
    assert ledger(database, OWNER, "weapon_purchase") == [(-60, "weapon:click-0002")]
    assert buy(database, OWNER, "pistols", "click-0003")["reason"] == "owned"
    assert buy(database, OWNER, "fire_bombs", "click-0004", 300, 0)["reason"] == (
        "insufficient_funds"
    )
    assert row(database, OWNER) == ([], ["musket", "pistols"], "pistols")
    assert equip(database, OWNER, "fire_bombs")["reason"] == "not_owned"
    assert equip(database, OWNER, "musket")["status"] == "done"
    assert row(database, OWNER)[2] == "musket"


def test_no_browser_role_may_run_the_functions_or_read_the_learns(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.captain_skill_learns', 'select'),
               has_table_privilege('anon', 'public.captain_skill_learns', 'select'),
               has_table_privilege('service_role', 'public.captain_skill_learns', 'delete'),
               has_function_privilege('authenticated',
                 'public.island_learn_skill(uuid, text, text, jsonb, integer)', 'execute'),
               has_function_privilege('anon',
                 'public.island_weapon_buy(uuid, text, text, integer, integer)', 'execute'),
               has_function_privilege('authenticated',
                 'public.island_weapon_equip(uuid, text)', 'execute'),
               has_function_privilege('service_role',
                 'public.island_weapon_equip(uuid, text)', 'execute')
        """
    ).fetchone()
    assert rights == (False, False, False, False, False, False, True)
    secured = call(
        database, "select relrowsecurity from pg_class where relname = 'captain_skill_learns'"
    )
    assert secured is True
    policies = "select count(*) from pg_policies where tablename = 'captain_skill_learns'"
    assert call(database, policies) == 0
