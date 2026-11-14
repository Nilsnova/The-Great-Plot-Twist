"""Real SQL checks for 20261113010000_respec_and_wave_guards.sql: a respec is charged at the captain
level found under the island lock, and neither a respec nor a research step is allowed while a wave
runs on the island (both fine between waves).

Opt-in, like test_tech_hub_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_captain_skills_sql import learn, won  # noqa: E402
from server.tests.island_sql.test_captain_tree_sql import respec, set_island  # noqa: E402
from server.tests.island_sql.test_demolish_sql import coins  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    balance,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)
from server.tests.island_sql.test_research_tiers_sql import step  # noqa: E402
from server.tests.island_sql.test_tech_hub_sql import (  # noqa: E402
    MEMBER,
    best,
    game,
    research,
)

RUNNING = {"status": "refused", "reason": "wave_running"}


def trained(database):
    """OWNER has an island, 1000 coins, a won wave 10 and one skill to forget."""
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    coins(database, OWNER, 900)
    won(database, OWNER, 10)
    assert learn(database, OWNER, "steady_aim", "click-0001")["status"] == "done"


def test_a_respec_is_charged_at_the_captain_level_found_under_the_lock(database):
    trained(database)
    set_island(database, captain_level=2)
    before = balance(database, OWNER)
    # The caller sends only the price per level; the level comes from the locked island row.
    done = respec(database, "click-0002", 50)
    assert (done["status"], done["balance"]) == ("done", before - 100)
    assert ledger(database, OWNER, "captain_respec") == [(-100, "respec:click-0002")]

    assert learn(database, OWNER, "steady_aim", "click-0003")["status"] == "done"
    set_island(database, captain_level=5)  # upgraded since the last click
    before = balance(database, OWNER)
    assert respec(database, "click-0004", 50)["balance"] == before - 250
    assert ledger(database, OWNER, "captain_respec")[-1] == (-250, "respec:click-0004")


def test_a_respec_is_refused_while_a_wave_runs_and_fine_between_waves(database):
    trained(database)
    wave = start(database, OWNER, "bell-0001", owner=OWNER)  # the countdown
    before = balance(database, OWNER)

    assert respec(database, "click-0002") == RUNNING
    move_start(database, wave["waveId"], 30)  # under way
    assert respec(database, "click-0003") == RUNNING
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "captain_respec") == []
    as_owner(database)
    kept = database.execute(
        "select captain_skills from public.islands where player_id = %s", (OWNER,)
    ).fetchone()
    assert kept == (["steady_aim"],)

    finish(database, OWNER, wave["waveId"])
    assert respec(database, "click-0004")["status"] == "done"


def test_a_respec_already_paid_is_answered_even_during_a_wave(database):
    trained(database)
    assert respec(database, "click-0002")["status"] == "done"
    start(database, OWNER, "bell-0002", owner=OWNER)
    again = respec(database, "click-0002")
    assert (again["status"], again["repeat"]) == ("done", True)


def test_research_is_refused_while_a_wave_runs_and_fine_between_waves(database):
    game(database)
    wave = start(database, OWNER, "bell-0011", owner=OWNER)
    before = balance(database, OWNER)

    assert research(database, OWNER, "cannon", "click-0011") == RUNNING  # the countdown
    move_start(database, wave["waveId"], 30)
    assert research(database, MEMBER, "cannon", "click-0012") == RUNNING  # a member, under way
    assert balance(database, OWNER) == before
    assert ledger(database, OWNER, "tech_research") == []

    finish(database, OWNER, wave["waveId"])
    assert research(database, OWNER, "cannon", "click-0013")["status"] == "done"


def test_a_tier_three_change_cannot_strip_a_capstone_mid_wave(database):
    game(database)
    best(database, OWNER, 25)
    assert research(database, OWNER, "cannon", "click-0021", wave=8)["status"] == "done"
    assert step(database, OWNER, "cannon", "click-0022", 2, "rapid_2")["status"] == "done"
    assert (
        step(database, OWNER, "cannon", "click-0023", 3, "broadside", wave=25)["status"] == "done"
    )
    start(database, OWNER, "bell-0021", owner=OWNER)

    switch = step(database, OWNER, "cannon", "click-0024", 3, "grapeshot", True, wave=25)
    assert switch == RUNNING
    as_owner(database)
    chosen = database.execute(
        "select choice_3 from public.island_research where island_owner = %s and branch = 'cannon'",
        (OWNER,),
    ).fetchone()
    assert chosen == ("broadside",)


def test_a_wave_on_another_island_does_not_block_this_one(database):
    game(database)
    start(database, MEMBER, "bell-0031", owner=MEMBER)  # MEMBER's own island
    assert research(database, OWNER, "cannon", "click-0031")["status"] == "done"
