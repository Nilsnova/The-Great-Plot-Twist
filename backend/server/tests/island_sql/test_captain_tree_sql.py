"""Real SQL checks for 20261112120000_captain_tree.sql: forks close their twin, the tier above opens
with either pick, a capstone needs the role, the role is picked once from captain level 3, and a
respec costs coins, clears skills and role, and is safe to repeat.

Opt-in on a disposable local PostgreSQL with every migration applied twice (see
test_captain_skills_sql.py). Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_captain_skills_sql import learn, row, won  # noqa: E402
from server.tests.island_sql.test_demolish_sql import coins  # noqa: E402
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


def set_island(database, **columns):
    as_owner(database)
    for name, value in columns.items():
        database.execute(
            f"update public.islands set {name} = %s where player_id = %s", (value, OWNER)
        )


def pick(database, role, level=3):
    as_server(database)
    return call(database, "select public.island_pick_role(%s, %s, %s)", OWNER, role, level)


def respec(database, uid, per_level=10):
    """A respec at p_per_level coins per captain level (20261113010000_..._guards.sql)."""
    as_server(database)
    return call(database, "select public.island_respec(%s, %s, %s)", OWNER, uid, per_level)


def start(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")


def test_a_fork_closes_its_twin_and_either_pick_opens_the_next_tier(database):
    start(database)
    won(database, OWNER, 40)
    assert learn(database, OWNER, "steady_aim", "click-0001")["status"] == "done"
    assert learn(database, OWNER, "hot_shot", "click-0002")["status"] == "done"
    closed = learn(database, OWNER, "long_barrel", "click-0003")
    assert closed["reason"] == "closed"
    assert learn(database, OWNER, "quick_hands", "click-0004")["status"] == "done"
    assert row(database, OWNER)[0] == ["steady_aim", "hot_shot", "quick_hands"]


def test_the_tier_above_needs_one_of_the_forks(database):
    start(database)
    won(database, OWNER, 40)
    learn(database, OWNER, "steady_aim", "click-0001")
    assert learn(database, OWNER, "quick_hands", "click-0002")["reason"] == "locked"


def test_a_capstone_needs_the_role_of_its_branch(database):
    start(database)
    won(database, OWNER, 80)
    set_island(database, captain_level=3)
    for index, skill in enumerate(
        ["steady_aim", "long_barrel", "quick_hands", "far_sight"], start=10
    ):
        assert learn(database, OWNER, skill, f"click-00{index}")["status"] == "done"
    assert learn(database, OWNER, "dead_eye", "click-0020")["reason"] == "wrong_role"
    assert pick(database, "medic")["status"] == "done"
    assert learn(database, OWNER, "dead_eye", "click-0021")["reason"] == "wrong_role"
    assert respec(database, "click-0030")["status"] == "done"
    assert pick(database, "gunner")["status"] == "done"


def test_the_role_is_picked_once_from_the_captain_level(database):
    start(database)
    assert pick(database, "medic")["reason"] == "locked"
    set_island(database, captain_level=3)
    done = pick(database, "medic")
    assert (done["status"], done["role"], done["repeat"]) == ("done", "medic", False)
    assert pick(database, "medic")["repeat"] is True
    assert pick(database, "engineer")["reason"] == "role_known"


def test_a_respec_costs_coins_clears_skills_and_role_and_repeats_safely(database):
    start(database)
    assert respec(database, "click-0001")["reason"] == "nothing_to_reset"
    won(database, OWNER, 10)
    set_island(database, captain_level=3)
    learn(database, OWNER, "steady_aim", "click-0002")
    pick(database, "gunner")
    # Captain level 3: 100 coins a level is 300 coins.
    poor = respec(database, "click-0003", 5000)
    assert (poor["reason"], poor["price"]) == ("insufficient_funds", 15000)
    coins(database, OWNER, 900)
    start_balance = balance(database, OWNER)
    done = respec(database, "click-0004", 100)
    assert (done["status"], done["repeat"], done["balance"]) == ("done", False, start_balance - 300)
    assert respec(database, "click-0004", 100)["repeat"] is True
    assert balance(database, OWNER) == start_balance - 300
    assert ledger(database, OWNER, "captain_respec") == [(-300, "respec:click-0004")]
    as_owner(database)
    cleared = database.execute(
        "select captain_skills, captain_role from public.islands where player_id = %s", (OWNER,)
    ).fetchone()
    assert cleared == ([], None)
    assert learn(database, OWNER, "steady_aim", "click-0005")["points"] == 4


def test_no_browser_role_may_run_the_new_functions(database):
    pick_sig = "public.island_pick_role(uuid, text, integer)"
    respec_sig = "public.island_respec(uuid, text, integer)"
    rights = database.execute(
        "select has_function_privilege('authenticated', %s, 'execute'),"
        " has_function_privilege('anon', %s, 'execute'),"
        " has_function_privilege('service_role', %s, 'execute')",
        (pick_sig, respec_sig, respec_sig),
    ).fetchone()
    assert rights == (False, False, True)
