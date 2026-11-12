"""Real SQL checks for 20261112100000_research_tiers.sql: three research tiers per tower kind, one
tier per call at the server's price, tiers 2 and 3 a choice of two (the other option closed, a
change paid again), the unlock waves, and a capstone on a tower only once the island chose it.

Opt-in, like test_tech_hub_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    as_server,
    balance,
    build,
    call,
    ledger,
)
from server.tests.island_sql.test_tech_hub_sql import (  # noqa: E402
    MEMBER,
    STRANGER,
    best,
    game,
    research,
    spec_of,
    specialise,
)


def step(database, player, branch, uid, tier, choice, change=False, price=20, wave=15):
    """One research step of tier 2 or 3 (the unlock wave defaults to tier 2's)."""
    as_server(database)
    return call(
        database,
        "select public.island_research(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        player,
        OWNER,
        branch,
        uid,
        price,
        wave,
        tier,
        choice,
        change,
    )


def refused(database, tier, choice):
    """A malformed step raises bad_research; a savepoint keeps the test's transaction usable."""
    database.execute("savepoint bad")
    try:
        with pytest.raises(psycopg.errors.RaiseException, match="bad_research"):
            step(database, OWNER, "cannon", "click-0002", tier, choice)
    finally:
        database.execute("rollback to savepoint bad")


def row(database, branch):
    as_owner(database)
    return database.execute(
        "select tier, choice_2, choice_3, coins_paid, ref from public.island_research"
        " where island_owner = %s and branch = %s",
        (OWNER, branch),
    ).fetchone()


def test_an_existing_research_row_is_tier_one_with_no_choices(database):
    game(database)
    research(database, MEMBER, "cannon", "click-0001", price=10)

    assert row(database, "cannon") == (1, None, None, 10, "research:click-0001")


def test_tier_two_after_wave_fifteen_one_of_two_and_the_other_closes(database):
    game(database)
    research(database, MEMBER, "cannon", "click-0001", price=10)

    assert step(database, MEMBER, "cannon", "click-0002", 2, "long_guns")["reason"] == "locked"
    best(database, OWNER, 15)
    done = step(database, MEMBER, "cannon", "click-0003", 2, "long_guns")
    assert (done["status"], done["tier"], done["choice"], done["balance"], done["repeat"]) == (
        "done",
        2,
        "long_guns",
        70,
        False,
    )
    assert step(database, MEMBER, "cannon", "click-0003", 2, "long_guns")["repeat"] is True
    assert balance(database, MEMBER) == 70
    assert row(database, "cannon") == (2, "long_guns", None, 30, "research:click-0003")
    assert step(database, OWNER, "cannon", "click-0004", 2, "long_guns")["reason"] == "known"
    closed = step(database, OWNER, "cannon", "click-0005", 2, "rapid_2")
    assert (closed["reason"], closed["chosen"]) == ("closed", "long_guns")
    assert balance(database, OWNER) == 100


def test_a_change_costs_the_tier_price_again(database):
    game(database)
    best(database, OWNER, 15)
    research(database, OWNER, "mortar", "click-0001", price=10)
    step(database, OWNER, "mortar", "click-0002", 2, "quick_fuse", price=20)

    changed = step(database, MEMBER, "mortar", "click-0003", 2, "heavy_shells", True, price=20)
    assert (changed["status"], changed["tier"], changed["choice"]) == ("done", 2, "heavy_shells")
    assert ledger(database, MEMBER, "tech_research") == [(-20, "research:click-0003")]
    assert row(database, "mortar") == (2, "heavy_shells", None, 50, "research:click-0003")
    assert step(database, MEMBER, "mortar", "click-0004", 2, "quick_fuse", True, price=500)[
        "reason"
    ] == ("insufficient_funds")
    assert row(database, "mortar")[1] == "heavy_shells"


def test_the_tiers_go_one_at_a_time_and_never_above_three(database):
    game(database)
    best(database, OWNER, 25)

    assert step(database, OWNER, "wall", "click-0001", 2, "thick_walls")["reason"] == "needs_tier"
    research(database, OWNER, "wall", "click-0002", price=10)
    assert step(database, OWNER, "wall", "click-0003", 3, "bastion", wave=25)["reason"] == (
        "needs_tier"
    )
    step(database, OWNER, "wall", "click-0004", 2, "thick_walls")
    best(database, OWNER, 24)
    assert step(database, OWNER, "wall", "click-0005", 3, "bastion", wave=25)["reason"] == "locked"
    best(database, OWNER, 25)
    assert step(database, OWNER, "wall", "click-0006", 3, "bastion", wave=25)["tier"] == 3
    assert row(database, "wall")[:3] == (3, "thick_walls", "bastion")
    # A tier-2 change after tier 3 keeps the tier at 3.
    assert step(database, OWNER, "wall", "click-0007", 2, "mason_drill", True)["tier"] == 3
    assert row(database, "wall")[:3] == (3, "mason_drill", "bastion")
    assert step(database, OWNER, "wall", "click-0008", 4, None, wave=25)["reason"] == "top_tier"


def test_a_bad_option_or_a_member_who_is_not_one_is_refused(database):
    game(database)
    best(database, OWNER, 15)
    research(database, OWNER, "cannon", "click-0001", price=10)

    for tier, choice in ((2, "heavy_shells"), (2, "broadside"), (3, "long_guns"), (2, None)):
        refused(database, tier, choice)
    refused(database, 1, "rapid_2")
    assert step(database, STRANGER, "cannon", "click-0004", 2, "rapid_2")["reason"] == (
        "not_member"
    )
    assert balance(database, STRANGER) == 100


def test_a_tower_carries_a_capstone_only_once_its_island_chose_it(database):
    game(database)
    best(database, OWNER, 25)
    assert build(database, OWNER, "cannon_1", "cannon", "island:b-0001", 30)["status"] == "done"
    research(database, OWNER, "cannon", "click-0001", price=10)

    assert specialise(database, MEMBER, "cannon_1", "cannon", "broadside")["reason"] == (
        "not_researched"
    )
    step(database, OWNER, "cannon", "click-0002", 2, "rapid_2", price=10)
    step(database, OWNER, "cannon", "click-0003", 3, "broadside", price=10, wave=25)
    assert specialise(database, MEMBER, "cannon_1", "cannon", "grapeshot")["reason"] == (
        "not_researched"
    )
    assert specialise(database, MEMBER, "cannon_1", "cannon", "broadside")["spec"] == "broadside"
    assert spec_of(database, "cannon_1") == "broadside"
    # A tier-3 change takes the old capstone off the towers; the tier-1 skills stay.
    assert build(database, OWNER, "cannon_2", "cannon", "island:b-0002", 30)["status"] == "done"
    specialise(database, OWNER, "cannon_2", "cannon", "rapid")
    step(database, MEMBER, "cannon", "click-0004", 3, "grapeshot", True, price=10, wave=25)
    assert spec_of(database, "cannon_1") is None
    assert spec_of(database, "cannon_2") == "rapid"
    assert specialise(database, MEMBER, "cannon_1", "cannon", "grapeshot")["spec"] == "grapeshot"


def test_the_check_rules_keep_the_tier_and_its_choices_together(database):
    game(database)
    research(database, OWNER, "watchtower", "click-0001", price=10)
    as_owner(database)
    for change in (
        "tier = 2",
        "choice_2 = 'high_tower'",
        "tier = 2, choice_2 = 'rapid_2'",
        "tier = 4, choice_2 = 'high_tower', choice_3 = 'eagle_eye'",
    ):
        database.execute("savepoint bad")
        try:
            with pytest.raises(psycopg.errors.CheckViolation):
                database.execute(
                    f"update public.island_research set {change}"  # noqa: S608 (fixed test text)
                    " where island_owner = %s and branch = 'watchtower'",
                    (OWNER,),
                )
        finally:
            database.execute("rollback to savepoint bad")
    build(database, OWNER, "wall_1", "wall", "island:b-0001", 10)
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute(
            "update public.islet_buildings set spec = 'broadside'"
            " where player_id = %s and plot = 'wall_1'",
            (OWNER,),
        )


def test_only_the_server_may_run_the_new_function_and_the_old_one_is_gone(database):
    rights = database.execute(
        """
        select has_function_privilege('authenticated',
                 'public.island_research(uuid, uuid, text, text, integer, integer, '
                 'integer, text, boolean)', 'execute'),
               has_function_privilege('anon',
                 'public.island_research(uuid, uuid, text, text, integer, integer, '
                 'integer, text, boolean)', 'execute'),
               has_function_privilege('service_role',
                 'public.island_specialise(uuid, uuid, text, text, text)', 'execute'),
               (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'island_research')
        """
    ).fetchone()
    assert rights == (False, False, True, 1)
