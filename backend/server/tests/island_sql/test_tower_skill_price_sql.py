"""Real SQL checks for 20261115130000_tower_skill_price.sql (D051): a tower's skill costs coins,
paid once by the player who clicks (reason tower_skill, ref towerskill:<uid>), in the same step as
the pick; a repeat pays nothing, the skill the tower has already is free, a house role stays free.

Opt-in, like test_tech_hub_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_house_roles_sql import raise_level  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    balance,
    build,
    ledger,
)
from server.tests.island_sql.test_research_tiers_sql import step  # noqa: E402
from server.tests.island_sql.test_tech_hub_sql import (  # noqa: E402
    MEMBER,
    STRANGER,
    best,
    game,
    research,
    spec_of,
    specialise,
)


def island_with_a_cannon(database):
    """OWNER hosts the game with a cannon on cannon_1 and cannon skills researched (80 coins)."""
    game(database)
    assert build(database, OWNER, "cannon_1", "cannon", "island:b-0001", 10)["status"] == "done"
    research(database, OWNER, "cannon", "click-0001", price=10)
    assert balance(database, OWNER) == 80


def refused_bad(database, *arguments, **options):
    """A malformed pick raises bad_specialise; a savepoint keeps the test's transaction usable."""
    database.execute("savepoint bad")
    try:
        with pytest.raises(psycopg.errors.RaiseException, match="bad_specialise"):
            specialise(database, *arguments, **options)
    finally:
        database.execute("rollback to savepoint bad")


def test_a_pick_takes_the_price_once_and_sets_the_skill(database):
    island_with_a_cannon(database)

    done = specialise(database, OWNER, "cannon_1", "cannon", "heavy", uid="pick-0001", price=30)
    assert (done["status"], done["spec"], done["price"], done["balance"], done["repeat"]) == (
        "done",
        "heavy",
        30,
        50,
        False,
    )
    assert spec_of(database, "cannon_1") == "heavy"
    assert ledger(database, OWNER, "tower_skill") == [(-30, "towerskill:pick-0001")]


def test_a_repeated_click_id_pays_nothing_again(database):
    island_with_a_cannon(database)
    specialise(database, OWNER, "cannon_1", "cannon", "heavy", uid="pick-0001", price=30)

    again = specialise(database, OWNER, "cannon_1", "cannon", "heavy", uid="pick-0001", price=30)
    assert (again["status"], again["repeat"], again["balance"]) == ("done", True, 50)
    # The same id with another skill is still the click that was paid: nothing changes.
    other = specialise(database, OWNER, "cannon_1", "cannon", "chain", uid="pick-0001", price=30)
    assert other["repeat"] is True
    assert spec_of(database, "cannon_1") == "heavy"
    assert balance(database, OWNER) == 50
    assert len(ledger(database, OWNER, "tower_skill")) == 1


def test_the_skill_the_tower_has_is_free_and_a_switch_pays_again(database):
    island_with_a_cannon(database)
    specialise(database, OWNER, "cannon_1", "cannon", "rapid", uid="pick-0001", price=30)

    same = specialise(database, OWNER, "cannon_1", "cannon", "rapid", uid="pick-0002", price=30)
    assert (same["status"], same["price"], same["balance"]) == ("done", 0, 50)
    switch = specialise(database, OWNER, "cannon_1", "cannon", "chain", uid="pick-0003", price=30)
    assert (switch["spec"], switch["price"], switch["balance"]) == ("chain", 30, 20)
    assert ledger(database, OWNER, "tower_skill") == [
        (-30, "towerskill:pick-0001"),
        (-30, "towerskill:pick-0003"),
    ]


def test_too_few_coins_is_refused_with_the_price_and_changes_nothing(database):
    island_with_a_cannon(database)
    specialise(database, OWNER, "cannon_1", "cannon", "rapid", uid="pick-0001", price=30)

    refused = specialise(database, OWNER, "cannon_1", "cannon", "heavy", uid="pick-0002", price=51)
    assert (refused["status"], refused["reason"], refused["price"]) == (
        "refused",
        "insufficient_funds",
        51,
    )
    assert spec_of(database, "cannon_1") == "rapid"
    assert balance(database, OWNER) == 50


def test_a_member_pays_with_their_own_coins_and_a_stranger_cannot_pick(database):
    island_with_a_cannon(database)

    done = specialise(database, MEMBER, "cannon_1", "cannon", "chain", uid="pick-0001", price=40)
    assert (done["spec"], done["balance"]) == ("chain", 60)
    assert balance(database, OWNER) == 80  # the host's wallet never moves (D043)
    assert ledger(database, MEMBER, "tower_skill") == [(-40, "towerskill:pick-0001")]
    stranger = specialise(database, STRANGER, "cannon_1", "cannon", "heavy", price=40)
    assert stranger["reason"] == "not_member"
    assert balance(database, STRANGER) == 100


def test_a_capstone_is_paid_at_its_own_price(database):
    island_with_a_cannon(database)
    best(database, OWNER, 25)
    step(database, OWNER, "cannon", "click-0002", 2, "rapid_2", price=10)
    step(database, OWNER, "cannon", "click-0003", 3, "broadside", price=10, wave=25)

    done = specialise(database, MEMBER, "cannon_1", "cannon", "broadside", price=90)
    assert (done["spec"], done["price"], done["balance"]) == ("broadside", 90, 10)


def test_a_house_role_stays_free(database):
    game(database)
    assert build(database, OWNER, "house_1", "house", "island:b-0001", 10)["status"] == "done"
    raise_level(database, "house_1")

    done = specialise(database, MEMBER, "house_1", "house", "tavern")
    assert (done["spec"], done["price"], done["balance"]) == ("tavern", 0, 100)
    assert specialise(database, MEMBER, "house_1", "house", "barracks")["price"] == 0
    assert ledger(database, MEMBER, "tower_skill") == []


def test_a_tower_needs_a_price_and_a_click_id_and_a_house_role_no_price(database):
    island_with_a_cannon(database)
    refused_bad(database, OWNER, "cannon_1", "cannon", "heavy", price=0)
    refused_bad(database, OWNER, "cannon_1", "cannon", "heavy", uid="short", price=30)
    refused_bad(database, OWNER, "house_1", "house", "tavern", price=5)
    assert balance(database, OWNER) == 80


def test_the_reason_is_a_spend_and_only_the_server_runs_the_one_function(database):
    reason = database.execute(
        "select direction from public.wallet_reasons where reason = 'tower_skill'"
    ).fetchone()
    assert reason == ("spend",)
    signature = "public.island_specialise(uuid, uuid, text, text, text, text, integer)"
    rights = database.execute(
        """
        select has_function_privilege('authenticated', %s, 'execute'),
               has_function_privilege('anon', %s, 'execute'),
               has_function_privilege('service_role', %s, 'execute'),
               (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'island_specialise')
        """,
        (signature, signature, signature),
    ).fetchone()
    assert rights == (False, False, True, 1)
