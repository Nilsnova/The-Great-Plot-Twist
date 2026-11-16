"""Real SQL checks for 20261117010000_more_tower_spots.sql (D060): the extra tower spots
cannon_8..cannon_11 take every tower kind, move on the build grid and can be torn down; every
spot of before still works and an unknown spot is still refused.

Opt-in, like the other island_sql checks, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_demolish_sql import demolish, quote  # noqa: E402
from server.tests.island_sql.test_harpoon_tower_sql import coins, row  # noqa: E402
from server.tests.island_sql.test_island_layout_sql import move, rows  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import OWNER, build  # noqa: E402
from server.tests.island_sql.test_tower_defense_sql import ready  # noqa: E402

EXTRA = [f"cannon_{n}" for n in range(8, 12)]
KINDS = {"cannon": 30, "mortar": 60, "harpoon": 40, "culverin": 80, "swivel": 50}


@pytest.mark.parametrize("kind", sorted(KINDS))
def test_every_tower_kind_stands_on_every_extra_tower_spot(database, kind):
    ready(database, OWNER)
    coins(database, OWNER, 1000, "test-coins")
    for index, spot in enumerate(EXTRA):
        answer = build(database, OWNER, spot, kind, f"island:more-{index:04}", KINDS[kind])
        assert answer["status"] == "done", spot
        assert row(database, spot)[:2] == (kind, 1)


def test_the_old_tower_spots_still_take_their_kinds(database):
    ready(database, OWNER)
    coins(database, OWNER, 500, "test-coins")
    assert build(database, OWNER, "cannon_1", "swivel", "island:old-0001", 50)["status"] == "done"
    assert build(database, OWNER, "cannon_7", "culverin", "island:old-0002", 80)["status"] == "done"
    assert build(database, OWNER, "wall_12", "wall", "island:old-0003", 10)["status"] == "done"


@pytest.mark.parametrize(
    ("spot", "kind"),
    [("cannon_12", "cannon"), ("cannon_8", "wall"), ("cannon_11", "watchtower")],
)
def test_other_pairs_still_break_the_check_rule(database, spot, kind):
    ready(database, OWNER)
    with pytest.raises(psycopg.errors.CheckViolation):
        build(database, OWNER, spot, kind, "island:more-9999", 30)


def test_an_extra_tower_spot_moves_on_the_build_grid(database):
    ready(database, OWNER)
    assert move(database, "cannon_11", -8, -6, []) == {"status": "done"}
    assert rows(database) == [("cannon_11", -8, -6)]


def test_the_layout_still_rejects_an_unknown_spot(database):
    ready(database, OWNER)
    with pytest.raises(psycopg.errors.CheckViolation):
        move(database, "cannon_12", 0, 0, [])


def test_a_tower_on_an_extra_spot_can_be_torn_down(database):
    ready(database, OWNER)
    coins(database, OWNER, 200, "test-coins")
    assert build(database, OWNER, "cannon_9", "cannon", "island:more-0001", 30)["status"] == "done"
    assert quote(database, OWNER, "cannon_9")["status"] == "quote"
    assert demolish(database, OWNER, "cannon_9", "more-0001")["status"] == "done"
    assert row(database, "cannon_9") is None
    assert quote(database, OWNER, "cannon_12") == {"status": "refused", "reason": "protected"}
