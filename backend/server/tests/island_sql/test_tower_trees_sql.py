"""Real SQL checks for 20261116020000_tower_trees.sql (D055): the swivel-gun nest stands on the
seven tower spots only, and one tier of a level-5 tower's upgrade tree is paid once by the player
who clicks (reason tower_tree, ref towertree:<uid>), in the same step as the tier; the Bloons
rule (one path past tier 1, never both) holds in the function and in the check rules.

Opt-in, like test_tower_skill_price_sql.py, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_tower_trees_sql.py

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_harpoon_tower_sql import SPOTS, coins, row  # noqa: E402
from server.tests.island_sql.test_house_roles_sql import raise_level  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    as_server,
    balance,
    build,
    call,
    ledger,
)
from server.tests.island_sql.test_tech_hub_sql import MEMBER, STRANGER, best, game  # noqa: E402
from server.tests.island_sql.test_tower_defense_sql import pp_build, ready  # noqa: E402

PRICE = 40


def tree(database, player, plot, path, tier, uid="tree-0001", price=PRICE, wave=20, kind="cannon"):
    as_server(database)
    return call(
        database,
        "select public.island_tower_tree(%s, %s, %s, %s, %s, %s, %s, %s, %s, 5)",
        player,
        OWNER,
        plot,
        kind,
        path,
        tier,
        uid,
        price,
        wave,
    )


def tiers(database, plot="cannon_1"):
    as_owner(database)
    return database.execute(
        "select tree_a, tree_b from public.islet_buildings where player_id = %s and plot = %s",
        (OWNER, plot),
    ).fetchone()


def a_level_five_cannon(database, wave=45):
    """OWNER hosts the game (MEMBER joined) with a level-5 cannon on cannon_1 and 1,000 coins."""
    game(database)
    assert build(database, OWNER, "cannon_1", "cannon", "island:b-0001", 10)["status"] == "done"
    raise_level(database, "cannon_1", 5)
    best(database, OWNER, wave)
    coins(database, OWNER, 910, "test-coins")  # 100 - 10 + 910
    assert balance(database, OWNER) == 1000


def test_every_existing_row_has_an_empty_tree(database):
    ready(database, OWNER)
    build(database, OWNER, "cannon_2", "mortar", "island:old-0002", 60)
    assert tiers(database, "cannon_2") == (0, 0)


def test_a_swivel_nest_stands_on_every_tower_spot(database):
    ready(database, OWNER)
    coins(database, OWNER, 300, "test-coins")  # 100 + 300

    for index, spot in enumerate(SPOTS):
        answer = build(database, OWNER, spot, "swivel", f"island:swivel-{index:04}", 50)
        assert answer["status"] == "done", spot
        assert row(database, spot) == ("swivel", 1, None)
    assert balance(database, OWNER) == 400 - 7 * 50


@pytest.mark.parametrize("spot", ["wall_1", "wall_12", "tower_1", "house_1"])
def test_a_swivel_on_any_other_island_spot_breaks_the_check_rule(database, spot):
    ready(database, OWNER)
    with pytest.raises(psycopg.errors.CheckViolation):
        build(database, OWNER, spot, "swivel", "island:swivel-9999", 50)


def test_pirate_point_takes_no_swivel(database):
    ready(database, OWNER)
    with pytest.raises(psycopg.errors.CheckViolation):
        pp_build(database, OWNER, "pp_tower_2", "swivel", "point-0002", 50)


def test_the_old_kinds_still_stand_on_a_tower_spot(database):
    ready(database, OWNER)
    coins(database, OWNER, 300, "test-coins")
    for index, kind in enumerate(("cannon", "mortar", "harpoon", "culverin")):
        assert (
            build(database, OWNER, SPOTS[index], kind, f"island:old-{index:04}", 30)["status"]
            == "done"
        )


def test_a_tier_takes_the_price_once_and_sets_the_path(database):
    a_level_five_cannon(database)

    done = tree(database, OWNER, "cannon_1", "a", 1)
    assert (done["status"], done["path"], done["tier"], done["price"], done["balance"]) == (
        "done",
        "a",
        1,
        PRICE,
        1000 - PRICE,
    )
    assert done["repeat"] is False
    assert tiers(database) == (1, 0)
    assert ledger(database, OWNER, "tower_tree") == [(-PRICE, "towertree:tree-0001")]


def test_a_repeated_click_id_pays_nothing_again(database):
    a_level_five_cannon(database)
    tree(database, OWNER, "cannon_1", "a", 1)

    again = tree(database, OWNER, "cannon_1", "a", 2)  # the same id: the click that was paid
    assert (again["status"], again["repeat"], again["balance"]) == ("done", True, 1000 - PRICE)
    assert tiers(database) == (1, 0)
    assert len(ledger(database, OWNER, "tower_tree")) == 1


def test_a_path_goes_up_one_tier_at_a_time(database):
    a_level_five_cannon(database)

    assert tree(database, OWNER, "cannon_1", "a", 2)["reason"] == "needs_tier"
    tree(database, OWNER, "cannon_1", "a", 1, uid="tree-0001")
    assert tree(database, OWNER, "cannon_1", "a", 1, uid="tree-0002")["reason"] == "known"
    tree(database, OWNER, "cannon_1", "a", 2, uid="tree-0003")
    tree(database, OWNER, "cannon_1", "a", 3, uid="tree-0004")
    assert tiers(database) == (3, 0)
    assert balance(database, OWNER) == 1000 - 3 * PRICE


def test_one_path_past_tier_one_closes_the_other_above_tier_one(database):
    a_level_five_cannon(database)
    for n, (path, tier_) in enumerate([("a", 1), ("b", 1), ("a", 2)]):
        assert (
            tree(database, OWNER, "cannon_1", path, tier_, uid=f"tree-000{n}")["status"] == "done"
        )

    closed = tree(database, OWNER, "cannon_1", "b", 2, uid="tree-0009")
    assert (closed["status"], closed["reason"]) == ("refused", "closed")
    assert tiers(database) == (2, 1)
    assert balance(database, OWNER) == 1000 - 3 * PRICE


def test_the_check_rules_keep_the_tree_whole(database):
    a_level_five_cannon(database)
    as_owner(database)
    for tree_a, tree_b in ((2, 2), (4, 0), (0, -1)):
        with pytest.raises(psycopg.errors.CheckViolation):
            with database.transaction():
                database.execute(
                    "update public.islet_buildings set tree_a = %s, tree_b = %s"
                    " where player_id = %s and plot = 'cannon_1'",
                    (tree_a, tree_b, OWNER),
                )


def test_only_a_level_five_tower_has_a_tree(database):
    a_level_five_cannon(database)
    raise_level(database, "cannon_1", 4)

    assert tree(database, OWNER, "cannon_1", "a", 1)["reason"] == "needs_level"
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        with database.transaction():
            database.execute(
                "update public.islet_buildings set tree_a = 1 where player_id = %s"
                " and plot = 'cannon_1'",
                (OWNER,),
            )


def test_a_wall_or_another_kind_is_refused(database):
    a_level_five_cannon(database)
    assert build(database, OWNER, "wall_1", "wall", "island:b-0002", 10)["status"] == "done"
    raise_level(database, "wall_1", 5)

    assert tree(database, OWNER, "cannon_1", "a", 1, kind="mortar")["reason"] == "wrong_kind"
    assert tree(database, OWNER, "cannon_2", "a", 1)["reason"] == "not_built"
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        with database.transaction():
            database.execute(
                "update public.islet_buildings set tree_a = 1 where player_id = %s"
                " and plot = 'wall_1'",
                (OWNER,),
            )


def test_a_tier_waits_for_its_wave(database):
    a_level_five_cannon(database, wave=30)

    locked = tree(database, OWNER, "cannon_1", "a", 1, wave=35)
    assert (locked["status"], locked["reason"]) == ("refused", "locked")
    assert balance(database, OWNER) == 1000


def test_a_member_pays_with_their_own_coins_and_a_stranger_cannot_buy(database):
    a_level_five_cannon(database)

    done = tree(database, MEMBER, "cannon_1", "b", 1, price=30)
    assert (done["status"], done["balance"]) == ("done", 70)
    assert balance(database, OWNER) == 1000  # the host's wallet never moves (D043)
    assert tree(database, STRANGER, "cannon_1", "a", 1, uid="tree-0002")["reason"] == "not_member"
    assert balance(database, STRANGER) == 100


def test_too_few_coins_is_refused_with_the_price_and_changes_nothing(database):
    a_level_five_cannon(database)

    refused = tree(database, MEMBER, "cannon_1", "a", 1, price=101)
    assert (refused["status"], refused["reason"], refused["price"]) == (
        "refused",
        "insufficient_funds",
        101,
    )
    assert tiers(database) == (0, 0)
    assert balance(database, MEMBER) == 100


@pytest.mark.parametrize(
    "change",
    [{"path": "c"}, {"tier": 4}, {"tier": 0}, {"price": 0}, {"uid": "short"}, {"kind": "wall"}],
)
def test_a_malformed_call_raises_bad_tower_tree(database, change):
    a_level_five_cannon(database)
    arguments = {"path": "a", "tier": 1, "uid": "tree-0001", "price": PRICE, "kind": "cannon"}
    arguments.update(change)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_tower_tree"):
        tree(
            database,
            OWNER,
            "cannon_1",
            arguments["path"],
            arguments["tier"],
            uid=arguments["uid"],
            price=arguments["price"],
            kind=arguments["kind"],
        )


def test_no_browser_role_may_run_the_function(database):
    as_owner(database)
    rights = database.execute(
        "select has_function_privilege('authenticated', p.oid, 'execute'),"
        " has_function_privilege('anon', p.oid, 'execute'),"
        " has_function_privilege('service_role', p.oid, 'execute')"
        " from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
        " where n.nspname = 'public' and p.proname = 'island_tower_tree'"
    ).fetchall()
    assert rights == [(False, False, True)]
