"""Real SQL checks for 20261112060000_tech_hub.sql: the Tech hub's research (coins through the
ledger, once per island, members only, after wave 8), the tower skills (only a researched branch,
only a skill of the tower's kind) and the wreck (gifts cut to the goal, members only).

Opt-in, like test_captain_skills_sql.py, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_game_rooms_sql import join  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    build,
    call,
    ledger,
    open_island,
)

MEMBER = UUID(int=931)
STRANGER = UUID(int=932)


def game(database):
    """OWNER hosts K7Q2M (best wave 8); MEMBER joined it; STRANGER has an island of their own."""
    add_players(database, OWNER, MEMBER, STRANGER)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, MEMBER, "M3MBR")
    open_island(database, STRANGER, "STRNG")
    assert join(database, MEMBER, OWNER)["status"] == "joined"
    best(database, OWNER, 8)


def best(database, player, wave):
    as_owner(database)
    database.execute(
        "update public.islands set wave_best = %s where player_id = %s", (wave, player)
    )


def research(database, player, branch, uid, price=60, wave=8, owner=OWNER):
    # Tier 1 of 20261112100000_research_tiers.sql (the other tiers: test_research_tiers_sql.py).
    as_server(database)
    return call(
        database,
        "select public.island_research(%s, %s, %s, %s, %s, %s, 1, null, false)",
        player,
        owner,
        branch,
        uid,
        price,
        wave,
    )


def specialise(database, player, plot, branch, spec, owner=OWNER):
    as_server(database)
    return call(
        database,
        "select public.island_specialise(%s, %s, %s, %s, %s)",
        player,
        owner,
        plot,
        branch,
        spec,
    )


def mend(database, player, amount, uid, goal=120, wave=6, owner=OWNER):
    as_server(database)
    return call(
        database,
        "select public.island_wreck_repair(%s, %s, %s, %s, %s, %s)",
        player,
        owner,
        amount,
        uid,
        goal,
        wave,
    )


def spec_of(database, plot, owner=OWNER):
    as_owner(database)
    return call(
        database,
        "select spec from public.islet_buildings where player_id = %s and plot = %s",
        owner,
        plot,
    )


def test_a_member_researches_once_for_the_whole_island_with_coins(database):
    game(database)

    done = research(database, MEMBER, "cannon", "click-0001")
    assert (done["status"], done["branch"], done["balance"], done["repeat"]) == (
        "done",
        "cannon",
        40,
        False,
    )
    assert research(database, MEMBER, "cannon", "click-0001")["repeat"] is True
    assert balance(database, MEMBER) == 40
    assert ledger(database, MEMBER, "tech_research") == [(-60, "research:click-0001")]
    assert research(database, OWNER, "cannon", "click-0002")["reason"] == "known"
    assert research(database, OWNER, "wall", "click-0003", price=500)["reason"] == (
        "insufficient_funds"
    )
    as_owner(database)
    rows = database.execute(
        "select branch, researched_by, coins_paid from public.island_research"
        " where island_owner = %s",
        (OWNER,),
    ).fetchall()
    assert rows == [("cannon", MEMBER, 60)]


def test_research_needs_the_tech_hub_and_a_member(database):
    game(database)
    best(database, OWNER, 7)

    assert research(database, OWNER, "mortar", "click-0001")["reason"] == "locked"
    best(database, OWNER, 8)
    assert research(database, STRANGER, "mortar", "click-0002")["reason"] == "not_member"
    assert balance(database, STRANGER) == 100
    with pytest.raises(psycopg.errors.RaiseException, match="bad_research"):
        research(database, OWNER, "laser", "click-0003")


def test_a_member_who_left_cannot_research_there_any_more(database):
    game(database)
    as_server(database)
    assert call(database, "select public.game_leave(%s, %s)", MEMBER, OWNER)["status"] == "left"

    assert research(database, MEMBER, "wall", "click-0001")["reason"] == "not_member"


def test_a_tower_picks_only_a_skill_of_its_kind_and_only_after_research(database):
    game(database)
    assert build(database, OWNER, "cannon_1", "cannon", "island:b-0001", 30)["status"] == "done"
    assert build(database, OWNER, "wall_1", "wall", "island:b-0002", 10)["status"] == "done"

    assert specialise(database, MEMBER, "cannon_1", "cannon", "rapid")["reason"] == (
        "not_researched"
    )
    research(database, OWNER, "cannon", "click-0001")
    assert specialise(database, MEMBER, "cannon_2", "cannon", "rapid")["reason"] == "not_built"
    assert specialise(database, MEMBER, "wall_1", "cannon", "rapid")["reason"] == "wrong_kind"
    assert specialise(database, STRANGER, "cannon_1", "cannon", "rapid")["reason"] == ("not_member")
    done = specialise(database, MEMBER, "cannon_1", "cannon", "heavy")
    assert (done["status"], done["spec"]) == ("done", "heavy")
    assert spec_of(database, "cannon_1") == "heavy"
    assert specialise(database, OWNER, "cannon_1", "cannon", "chain")["spec"] == "chain"
    assert spec_of(database, "cannon_1") == "chain"
    with pytest.raises(psycopg.errors.RaiseException, match="bad_specialise"):
        specialise(database, OWNER, "cannon_1", "cannon", "stone")


def test_a_skill_of_another_kind_breaks_the_check_rule(database):
    game(database)
    build(database, OWNER, "wall_1", "wall", "island:b-0001", 10)
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute(
            "update public.islet_buildings set spec = 'rapid'"
            " where player_id = %s and plot = 'wall_1'",
            (OWNER,),
        )


def test_the_wreck_takes_gifts_from_members_up_to_its_goal(database):
    game(database)

    first = mend(database, MEMBER, 100, "click-0001")
    assert (first["status"], first["paid"], first["gift"], first["balance"]) == (
        "done",
        100,
        100,
        0,
    )
    assert mend(database, MEMBER, 100, "click-0001")["repeat"] is True
    last = mend(database, OWNER, 100, "click-0002")
    assert (last["paid"], last["gift"], last["balance"]) == (120, 20, 80)
    assert ledger(database, OWNER, "wreck_repair") == [(-20, "wreck:click-0002")]
    assert mend(database, OWNER, 25, "click-0003")["reason"] == "repaired"
    assert mend(database, STRANGER, 25, "click-0004")["reason"] == "not_member"
    as_owner(database)
    assert call(database, "select wreck_paid from public.islands where player_id = %s", OWNER) == (
        120
    )


def test_the_wreck_washes_ashore_after_wave_six(database):
    game(database)
    best(database, OWNER, 5)

    assert mend(database, OWNER, 25, "click-0001")["reason"] == "locked"
    assert mend(database, MEMBER, 500, "click-0002", goal=1000, wave=0)["reason"] == (
        "insufficient_funds"
    )
    assert balance(database, MEMBER) == 100


def test_no_browser_role_may_run_the_functions_or_read_the_research(database):
    rights = database.execute(
        """
        select has_table_privilege('authenticated', 'public.island_research', 'select'),
               has_table_privilege('anon', 'public.island_research', 'select'),
               has_function_privilege('authenticated',
                 'public.island_research(uuid, uuid, text, text, integer, integer, '
                 'integer, text, boolean)', 'execute'),
               has_function_privilege('anon',
                 'public.island_specialise(uuid, uuid, text, text, text)', 'execute'),
               has_function_privilege('authenticated',
                 'public.island_wreck_repair(uuid, uuid, integer, text, integer, integer)',
                 'execute'),
               has_function_privilege('service_role',
                 'public.island_research(uuid, uuid, text, text, integer, integer, '
                 'integer, text, boolean)', 'execute')
        """
    ).fetchone()
    assert rights == (False, False, False, False, False, True)
    assert call(database, "select relrowsecurity from pg_class where relname = 'island_research'")
    assert (
        call(database, "select count(*) from pg_policies where tablename = 'island_research'") == 0
    )
    reasons = database.execute(
        "select reason, direction from public.wallet_reasons"
        " where reason in ('tech_research', 'wreck_repair') order by reason"
    ).fetchall()
    assert reasons == [("tech_research", "spend"), ("wreck_repair", "spend")]
