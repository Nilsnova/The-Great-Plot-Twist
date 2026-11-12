"""Real SQL checks for 20261112090000_house_roles.sql (docs/GAME-V3.md "Houses"): a house of
level 2 or more picks a role (barracks, tavern, workshop) with no research, a house below level 2
is refused house_level, the check rule allows the roles only on a house, and helping a captain up
costs 25% less (rounded down) on an island with a Tavern.

Opt-in, like test_tech_hub_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_captain_revive_sql import (  # noqa: E402
    revive,
    running_wave,
)
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    balance,
    build,
)
from server.tests.island_sql.test_tech_hub_sql import (  # noqa: E402
    MEMBER,
    STRANGER,
    game,
    spec_of,
    specialise,
)


def raise_level(database, plot, level=2, owner=OWNER):
    as_owner(database)
    database.execute(
        "update public.islet_buildings set level = %s where player_id = %s and plot = %s",
        (level, owner, plot),
    )


def test_a_house_of_level_two_picks_a_role_with_no_research(database):
    game(database)
    assert build(database, OWNER, "house_1", "house", "island:b-0001", 10)["status"] == "done"
    assert build(database, OWNER, "cannon_1", "cannon", "island:b-0002", 30)["status"] == "done"

    assert specialise(database, MEMBER, "house_1", "house", "barracks")["reason"] == "house_level"
    assert spec_of(database, "house_1") is None
    raise_level(database, "house_1")
    done = specialise(database, MEMBER, "house_1", "house", "barracks")
    assert (done["status"], done["spec"]) == ("done", "barracks")
    assert spec_of(database, "house_1") == "barracks"
    # Changed between waves by anyone in the game; the same pick again changes nothing.
    assert specialise(database, OWNER, "house_1", "house", "tavern")["spec"] == "tavern"
    assert specialise(database, OWNER, "house_1", "house", "tavern")["spec"] == "tavern"
    assert spec_of(database, "house_1") == "tavern"
    # Only a member, only on a house, only a built one.
    assert specialise(database, STRANGER, "house_1", "house", "workshop")["reason"] == "not_member"
    assert specialise(database, OWNER, "cannon_1", "house", "workshop")["reason"] == "wrong_kind"
    assert specialise(database, OWNER, "house_2", "house", "workshop")["reason"] == "not_built"
    assert spec_of(database, "house_1") == "tavern"


# A role is not a tower skill: a house cannot pick one, a cannon cannot pick a role (one raise per
# test: a raise aborts the transaction).
@pytest.mark.parametrize(
    ("plot", "branch", "spec"), [("house_1", "house", "rapid"), ("cannon_1", "cannon", "tavern")]
)
def test_a_role_and_a_tower_skill_never_mix(database, plot, branch, spec):
    game(database)
    build(database, OWNER, "house_1", "house", "island:b-0001", 10)
    build(database, OWNER, "cannon_1", "cannon", "island:b-0002", 30)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_specialise"):
        specialise(database, OWNER, plot, branch, spec)


def test_a_house_keeps_its_role_at_level_three(database):
    game(database)
    build(database, OWNER, "house_1", "house", "island:b-0001", 10)
    raise_level(database, "house_1", 3)
    assert specialise(database, MEMBER, "house_1", "house", "workshop")["spec"] == "workshop"
    assert spec_of(database, "house_1") == "workshop"


def test_the_tower_skills_still_need_their_research(database):
    game(database)
    build(database, OWNER, "cannon_1", "cannon", "island:b-0001", 30)

    assert specialise(database, OWNER, "cannon_1", "cannon", "rapid")["reason"] == "not_researched"


def test_the_check_rule_allows_a_role_only_on_a_house(database):
    game(database)
    build(database, OWNER, "house_1", "house", "island:b-0001", 10)
    build(database, OWNER, "wall_1", "wall", "island:b-0002", 10)
    as_owner(database)
    database.execute(
        "update public.islet_buildings set spec = 'workshop'"
        " where player_id = %s and plot = 'house_1'",
        (OWNER,),
    )
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute(
            "update public.islet_buildings set spec = 'barracks'"
            " where player_id = %s and plot = 'wall_1'",
            (OWNER,),
        )


def test_a_tavern_on_the_island_takes_a_quarter_off_the_revive(database):
    wave_id = running_wave(database)
    assert build(database, OWNER, "house_1", "house", "island:b-0001", 10)["status"] == "done"
    raise_level(database, "house_1")
    before = balance(database, OWNER)

    # A Barracks is no Tavern: full price (20 + 5 x wave 1).
    specialise(database, OWNER, "house_1", "house", "barracks")
    assert revive(database, OWNER, wave_id, "help-0001", down_at=100)["price"] == 25
    # A Tavern: 25 x 75 / 100 = 18 (rounded down), from the same wallet.
    specialise(database, OWNER, "house_1", "house", "tavern")
    paid = revive(database, OWNER, wave_id, "help-0002", down_at=200)
    assert paid == {"status": "done", "price": 18, "balance": before - 25 - 18, "repeat": False}
    # A repeat answers what it paid; two Taverns give the same 25% (the cap).
    assert revive(database, OWNER, wave_id, "help-0002", down_at=200)["price"] == 18
    assert build(database, OWNER, "house_2", "house", "island:b-0002", 10)["status"] == "done"
    raise_level(database, "house_2")
    specialise(database, OWNER, "house_2", "house", "tavern")
    assert revive(database, OWNER, wave_id, "help-0003", down_at=300)["price"] == 18
    as_owner(database)
    database.execute("update public.wave_runs set wave = 12 where id = %s", (wave_id,))
    assert (
        revive(database, OWNER, wave_id, "help-0004", down_at=400)["price"]
        == (20 + 5 * 12) * 3 // 4
    )


def test_a_tavern_needs_level_two(database):
    wave_id = running_wave(database)
    build(database, OWNER, "house_1", "house", "island:b-0001", 10)
    # A level-1 house can never pick a role; one that has the role written cannot discount either.
    as_owner(database)
    database.execute(
        "update public.islet_buildings set spec = 'tavern'"
        " where player_id = %s and plot = 'house_1'",
        (OWNER,),
    )

    assert revive(database, OWNER, wave_id, "help-0001")["price"] == 25


def test_a_tavern_never_takes_the_revive_price_down_to_nothing(database):
    wave_id = running_wave(database)
    build(database, OWNER, "house_1", "house", "island:b-0001", 10)
    raise_level(database, "house_1")
    specialise(database, OWNER, "house_1", "house", "tavern")
    before = balance(database, OWNER)

    # 1 x 75 / 100 rounds down to 0; the price stays at 1.
    paid = revive(database, OWNER, wave_id, "help-0001", base=1, per_wave=0)
    assert paid == {"status": "done", "price": 1, "balance": before - 1, "repeat": False}
