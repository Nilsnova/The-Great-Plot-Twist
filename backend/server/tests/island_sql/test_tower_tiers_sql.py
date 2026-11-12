"""Real SQL checks for 20261112070000_tower_tiers.sql: building levels 4 and 5 (docs/GAME-V3.md
section 4.1) on an island and at Pirate Point.

Opt-in, like test_tower_defense_sql.py (whose helpers it reuses), on a disposable local PostgreSQL
with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    as_owner,
    balance,
    build,
)
from server.tests.island_sql.test_tower_defense_sql import (  # noqa: E402
    pp_build,
    pp_upgrade,
    ready,
    upgrade,
)

WALL = [10, 20, 40, 80, 160]
MORTAR = [60, 120, 240, 480, 960]


def coins(database, player, amount, ref):
    as_owner(database)
    database.execute(
        "select public.apply_wallet_transaction(%s, %s, 'admin_adjust', %s)", (player, amount, ref)
    )


def level_of(database, plot, player=OWNER):
    as_owner(database)
    return database.execute(
        "select level from public.islet_buildings where player_id = %s and plot = %s",
        (player, plot),
    ).fetchone()[0]


def test_a_wall_climbs_to_level_five_paying_each_price_once(database):
    ready(database, OWNER)
    coins(database, OWNER, 300, "test-coins")  # 100 + 300
    build(database, OWNER, "wall_1", "wall", "island:w1")  # - 10

    levels = [upgrade(database, OWNER, "wall_1", f"tier-{n:04}", WALL, 5) for n in range(4)]
    top = upgrade(database, OWNER, "wall_1", "tier-0009", WALL, 5)

    assert [answer["level"] for answer in levels] == [2, 3, 4, 5]
    assert top == {"status": "refused", "reason": "max_level"}
    assert balance(database, OWNER) == 400 - 10 - (20 + 40 + 80 + 160)
    assert level_of(database, "wall_1") == 5
    assert upgrade(database, OWNER, "wall_1", "tier-0002", WALL, 5)["repeat"] is True


def test_level_four_is_locked_while_the_server_unlocks_only_three(database):
    ready(database, OWNER)
    coins(database, OWNER, 300, "test-coins")
    build(database, OWNER, "wall_1", "wall", "island:w1")
    upgrade(database, OWNER, "wall_1", "tier-0001", WALL, 3)
    upgrade(database, OWNER, "wall_1", "tier-0002", WALL, 3)

    locked = upgrade(database, OWNER, "wall_1", "tier-0003", WALL, 3)

    assert locked == {"status": "refused", "reason": "locked"}
    assert level_of(database, "wall_1") == 3
    assert balance(database, OWNER) == 400 - 10 - 20 - 40


def test_a_level_five_mortar_is_paid_in_full(database):
    ready(database, OWNER)
    coins(database, OWNER, 1900, "test-coins")  # 2000
    build(database, OWNER, "cannon_1", "mortar", "island:m1", 60)

    answers = [upgrade(database, OWNER, "cannon_1", f"tier-{n:04}", MORTAR, 5) for n in range(4)]

    assert answers[-1]["level"] == 5
    assert balance(database, OWNER) == 2000 - sum(MORTAR)


def test_a_price_list_longer_than_five_is_refused(database):
    ready(database, OWNER)
    build(database, OWNER, "wall_1", "wall", "island:w1")

    with pytest.raises(psycopg.errors.RaiseException, match="bad_upgrade"):
        upgrade(database, OWNER, "wall_1", "tier-0001", WALL + [320], 6)


def test_the_check_rules_allow_one_to_five(database):
    ready(database, OWNER)
    build(database, OWNER, "wall_1", "wall", "island:w1")
    as_owner(database)
    database.execute(
        "update public.islet_buildings set level = 5 where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    )
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute(
            "update public.islet_buildings set level = 6 where player_id = %s and plot = 'wall_1'",
            (OWNER,),
        )


def test_pirate_point_climbs_to_five_too(database):
    ready(database, OWNER, FRIEND)
    coins(database, FRIEND, 1900, "test-coins")
    pp_build(database, OWNER, "pp_tower_1", "mortar", "point-0001", 60)

    levels = [
        pp_upgrade(database, FRIEND, "pp_tower_1", "mortar", f"point-{n:04}", MORTAR, 5)["level"]
        for n in range(2, 6)
    ]

    assert levels == [2, 3, 4, 5]
    top = pp_upgrade(database, FRIEND, "pp_tower_1", "mortar", "point-0009", MORTAR, 5)
    assert top == {"status": "refused", "reason": "max_level"}
    coins(database, OWNER, 300, "test-coins")
    assert pp_build(database, OWNER, "pp_wall_1", "wall", "point-0010", 10)["status"] == "done"
    raised = [
        pp_upgrade(database, OWNER, "pp_wall_1", "wall", f"point-{n:04}", WALL, 3) for n in (11, 12)
    ]
    assert [answer["level"] for answer in raised] == [2, 3]
    locked = pp_upgrade(database, OWNER, "pp_wall_1", "wall", "point-0013", WALL, 3)
    assert locked == {"status": "refused", "reason": "locked"}
    as_owner(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute("update public.pirate_point_buildings set level = 6")
