"""Real SQL checks for 20261113020000_harpoon_tower.sql: the harpoon tower (GAME-V3.md section 5)
stands on the seven tower spots of an island, climbs to level five, and nowhere else.

Opt-in, like test_tower_defense_sql.py (whose helpers it reuses), on a disposable local PostgreSQL
with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    balance,
    build,
)
from server.tests.island_sql.test_tower_defense_sql import (  # noqa: E402
    pp_build,
    ready,
    upgrade,
)

HARPOON = [40, 80, 160, 320, 640]
SPOTS = [f"cannon_{n}" for n in range(1, 8)]


def coins(database, player, amount, ref):
    as_owner(database)
    database.execute(
        "select public.apply_wallet_transaction(%s, %s, 'admin_adjust', %s)", (player, amount, ref)
    )


def row(database, plot, player=OWNER):
    as_owner(database)
    return database.execute(
        "select building_type, level, spec from public.islet_buildings"
        " where player_id = %s and plot = %s",
        (player, plot),
    ).fetchone()


def test_a_harpoon_tower_stands_on_every_tower_spot(database):
    ready(database, OWNER)
    coins(database, OWNER, 400, "test-coins")  # 100 + 400

    for index, spot in enumerate(SPOTS):
        answer = build(database, OWNER, spot, "harpoon", f"island:harpoon-{index:04}", 40)
        assert answer["status"] == "done", spot
        assert row(database, spot) == ("harpoon", 1, None)

    assert balance(database, OWNER) == 500 - 7 * 40


def test_a_harpoon_climbs_to_level_five_paying_each_price_once(database):
    ready(database, OWNER)
    coins(database, OWNER, 1500, "test-coins")
    build(database, OWNER, "cannon_1", "harpoon", "island:harpoon-0001", 40)

    levels = [
        upgrade(database, OWNER, "cannon_1", f"harpoon-up-{n:03}", HARPOON, 5) for n in range(4)
    ]
    top = upgrade(database, OWNER, "cannon_1", "harpoon-up-099", HARPOON, 5)

    assert [answer["level"] for answer in levels] == [2, 3, 4, 5]
    assert top == {"status": "refused", "reason": "max_level"}
    assert balance(database, OWNER) == 1600 - 40 - (80 + 160 + 320 + 640)
    assert row(database, "cannon_1") == ("harpoon", 5, None)


def test_the_cannon_and_the_mortar_still_stand_on_a_tower_spot(database):
    ready(database, OWNER)

    assert build(database, OWNER, "cannon_1", "cannon", "island:old-0001", 30)["status"] == "done"
    assert build(database, OWNER, "cannon_2", "mortar", "island:old-0002", 60)["status"] == "done"


@pytest.mark.parametrize("spot", ["wall_1", "wall_12", "tower_1", "house_1", "house_2"])
def test_a_harpoon_on_any_other_island_spot_breaks_the_check_rule(database, spot):
    ready(database, OWNER)

    with pytest.raises(psycopg.errors.CheckViolation):
        build(database, OWNER, spot, "harpoon", "island:harpoon-9999", 40)


def test_pirate_point_tower_spots_stay_cannon_or_mortar(database):
    ready(database, OWNER)

    assert pp_build(database, OWNER, "pp_tower_1", "cannon", "point-0001")["status"] == "done"
    with pytest.raises(psycopg.errors.CheckViolation):
        pp_build(database, OWNER, "pp_tower_2", "harpoon", "point-0002", 40)


def test_a_harpoon_has_no_skill_yet(database):
    ready(database, OWNER)
    build(database, OWNER, "cannon_3", "harpoon", "island:harpoon-0003", 40)
    as_owner(database)

    for spec in ("rapid", "cluster", "spotter", "barracks"):
        with pytest.raises(psycopg.errors.CheckViolation):
            with database.transaction():  # a savepoint: the next try starts clean
                database.execute(
                    "update public.islet_buildings set spec = %s"
                    " where player_id = %s and plot = 'cannon_3'",
                    (spec, OWNER),
                )
