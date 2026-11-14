"""Real SQL checks for 20261114140000_culverin.sql: the culverin (T43, D048 proposed) stands on
the seven tower spots of an island and nowhere else, has no skill, and a wave may keep the rule
name defenses_v2.

Opt-in, like test_harpoon_tower_sql.py (whose helpers it reuses), on a disposable local
PostgreSQL with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_culverin_sql.py

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_harpoon_tower_sql import SPOTS, coins, row  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    as_owner,
    balance,
    build,
)
from server.tests.island_sql.test_tower_defense_sql import pp_build, ready  # noqa: E402
from server.tests.island_sql.test_wave_rules_sql import a_wave, keep  # noqa: E402


def test_a_culverin_stands_on_every_tower_spot(database):
    ready(database, OWNER)
    coins(database, OWNER, 500, "test-coins")  # 100 + 500

    for index, spot in enumerate(SPOTS):
        answer = build(database, OWNER, spot, "culverin", f"island:culverin-{index:04}", 80)
        assert answer["status"] == "done", spot
        assert row(database, spot) == ("culverin", 1, None)

    assert balance(database, OWNER) == 600 - 7 * 80


def test_the_old_tower_kinds_still_stand_on_a_tower_spot(database):
    ready(database, OWNER)
    coins(database, OWNER, 200, "test-coins")

    assert build(database, OWNER, "cannon_1", "cannon", "island:old-0001", 30)["status"] == "done"
    assert build(database, OWNER, "cannon_2", "mortar", "island:old-0002", 60)["status"] == "done"
    assert build(database, OWNER, "cannon_3", "harpoon", "island:old-0003", 40)["status"] == "done"


@pytest.mark.parametrize("spot", ["wall_1", "wall_12", "tower_1", "house_1", "house_2"])
def test_a_culverin_on_any_other_island_spot_breaks_the_check_rule(database, spot):
    ready(database, OWNER)

    with pytest.raises(psycopg.errors.CheckViolation):
        build(database, OWNER, spot, "culverin", "island:culverin-9999", 80)


def test_pirate_point_tower_spots_stay_cannon_or_mortar(database):
    ready(database, OWNER)

    with pytest.raises(psycopg.errors.CheckViolation):
        pp_build(database, OWNER, "pp_tower_2", "culverin", "point-0002", 80)


def test_a_culverin_has_no_skill(database):
    ready(database, OWNER)
    build(database, OWNER, "cannon_3", "culverin", "island:culverin-0003", 80)
    as_owner(database)

    for spec in ("rapid", "cluster", "spotter"):
        with pytest.raises(psycopg.errors.CheckViolation):
            with database.transaction():  # a savepoint: the next try starts clean
                database.execute(
                    "update public.islet_buildings set spec = %s"
                    " where player_id = %s and plot = 'cannon_3'",
                    (spec, OWNER),
                )


def test_a_wave_may_keep_the_rule_defenses_v2(database):
    wave_id = a_wave(database)

    assert keep(database, wave_id, ["tower_health", "defenses_v2"]) == {
        "rules": ["tower_health", "defenses_v2"]
    }


def test_a_name_the_server_does_not_know_is_still_refused(database):
    wave_id = a_wave(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        keep(database, wave_id, ["defenses_v3"])
