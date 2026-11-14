"""Wall recovery (tasks T29-T32 and T47, decision D039, proposed): the pure rules of
wall_health.py and the routes behind the flag wall_recovery (GET /api/island/walls, POST
/api/island/repair, the upgrade guard and the "walls" of the wave routes).

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py); the
SQL side of the same rules is in island_sql/test_wall_recovery_sql.py.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from server.flags import parse_flags
from server.island import wall_health
from server.island.wall_health import WallState
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER, PLAYER_ID, WAVE_ID, World

ON = replace(ISLAND_SETTINGS, flags=parse_flags("islands,wall_recovery"))
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)  # the FakeClock of the test app


@pytest.fixture
def catalogue():
    return World(settings=ON).app.state.island


def damaged(health: int, minutes_ago: float, level: int = 1) -> WallState:
    return WallState("wall_1", level, health, NOW - timedelta(minutes=minutes_ago))


def wall_row(health: int, minutes_ago: float | None, level: int = 1, plot="wall_1") -> dict:
    at = None if minutes_ago is None else (NOW - timedelta(minutes=minutes_ago)).isoformat()
    return {"plot": plot, "level": level, "wall_health": health, "wall_damaged_at": at}


# --- the pure rules ---


def test_a_wall_keeps_its_damage_until_the_timer_runs_out():
    assert wall_health.effective_health(damaged(40, 9), NOW) == 40
    assert wall_health.effective_health(damaged(0, 9.9), NOW) == 0
    assert wall_health.effective_health(damaged(40, 10), NOW) == 100


def test_an_old_save_with_no_record_is_whole():
    assert wall_health.effective_health(WallState("wall_1", 3, 100, None), NOW) == 100


def test_the_timer_says_when_the_wall_mends_and_nothing_once_it_is_whole():
    assert wall_health.recovers_at(damaged(40, 4), NOW) == NOW + timedelta(minutes=6)
    assert wall_health.recovers_at(damaged(40, 11), NOW) is None


def test_the_rebuild_price_is_30_percent_of_the_levels_rounded_up(catalogue):
    prices = [wall_health.rebuild_price(catalogue, level) for level in (1, 2, 3, 4, 5)]
    assert prices == [3, 9, 21, 45, 93]


def test_a_repair_pays_the_missing_share_rounded_up_and_at_least_one_coin():
    assert wall_health.restore_price(9, 0) == 9
    assert wall_health.restore_price(9, 40) == 6
    assert wall_health.restore_price(9, 99) == 1


def test_an_engineer_pays_less_for_a_rebuild(catalogue):
    assert wall_health.full_price(catalogue, 5, "engineer") < wall_health.full_price(
        catalogue, 5, None
    )


def test_an_upgrade_of_a_damaged_wall_is_refused():
    with pytest.raises(Exception) as refused:
        wall_health.check_upgradable(damaged(99, 1), NOW)
    assert refused.value.code == "needs_repair"
    wall_health.check_upgradable(damaged(40, 11), NOW)  # the timer ran out: whole again
    wall_health.check_upgradable(None, NOW)  # no wall there


def test_the_wave_walls_are_the_health_at_the_start_of_the_wave():
    walls = {"wall_1": damaged(40, 5), "wall_2": WallState("wall_2", 1, 0, NOW)}
    assert wall_health.wave_walls(walls, NOW) == {"wall_1": 40, "wall_2": 0}
    assert wall_health.wave_walls(walls, NOW + timedelta(minutes=6)) == {"wall_1": 100, "wall_2": 0}


# --- the flag ---


def test_with_the_flag_off_the_routes_are_hidden_and_the_waves_unchanged():
    world = World()
    world.database.walls[PLAYER_ID] = [wall_row(0, 1)]

    assert_error(world.client.get("/api/island/walls", headers=PLAYER), 404, "feature_off")
    assert_error(world.post("/api/island/repair", spot="wall_1"), 404, "feature_off")
    started = world.start()
    assert started.status_code == 200 and "walls" not in started.json()
    assert world.finish(walls={"wall_1": 0}).status_code == 200
    assert world.database.calls("island_walls_record") == []
    # The new columns are never read, so the app works before the migration is applied.
    assert all("wall_health" not in str(request.url) for request in world.database.requests)


# --- the routes with the flag on ---


def test_the_walls_show_health_timer_and_price():
    world = World(settings=ON)
    world.database.walls[PLAYER_ID] = [
        wall_row(40, 4, level=2),
        wall_row(100, None, plot="wall_2"),
        wall_row(0, 11, plot="wall_3"),  # the timer ran out
    ]

    answer = world.client.get("/api/island/walls", headers=PLAYER)

    assert answer.status_code == 200
    assert answer.json() == {
        "coins": 100,
        "walls": [
            {"spot": "wall_1", "level": 2, "health": 40, "recoversAt": "2026-11-05T12:06:00Z",
             "repairCost": 6},
            {"spot": "wall_2", "level": 1, "health": 100, "recoversAt": None, "repairCost": None},
            {"spot": "wall_3", "level": 1, "health": 100, "recoversAt": None, "repairCost": None},
        ],
    }  # fmt: skip


def test_a_repair_sends_the_full_price_and_the_timer_to_the_database():
    world = World(settings=ON)
    world.database.walls[PLAYER_ID] = [wall_row(0, 1, level=2)]

    answer = world.post("/api/island/repair", spot="wall_1", actionUid="fix-00001")

    assert answer.status_code == 200
    [call] = world.database.calls("island_wall_restore")
    assert call == {
        "p_player_id": PLAYER_ID, "p_island_owner": PLAYER_ID, "p_plot": "wall_1",
        "p_action_uid": "fix-00001", "p_full_price": 9, "p_recover_seconds": 600,
    }  # fmt: skip


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [
        ("intact", 409, "intact"),
        ("wave_running", 409, "wave_running"),
        ("not_built", 409, "not_built"),
        ("wrong_kind", 422, "wrong_kind"),
        ("insufficient_funds", 409, "insufficient_funds"),
    ],
)
def test_a_refused_repair_says_why(reason, status, code):
    world = World(settings=ON)
    world.database.paid_replies["island_wall_restore"] = {
        "status": "refused",
        "reason": reason,
        "price": 6,
    }
    assert_error(world.post("/api/island/repair", spot="wall_1"), status, code)


def test_a_repair_of_an_unknown_spot_never_reaches_the_database():
    world = World(settings=ON)
    assert_error(world.post("/api/island/repair", spot="wall_99"), 404, "no_such_spot")
    assert world.database.calls("island_wall_restore") == []


def test_an_upgrade_of_a_damaged_wall_is_refused_and_charges_nothing():
    world = World(settings=ON)
    world.database.walls[PLAYER_ID] = [wall_row(40, 1)]

    refused = world.post("/api/island/upgrade", spot="wall_1")

    assert_error(refused, 409, "needs_repair")
    assert world.database.calls("island_upgrade") == []


def test_an_upgrade_of_a_whole_wall_goes_through():
    world = World(settings=ON)
    world.database.walls[PLAYER_ID] = [wall_row(100, None)]
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]
    world.database.progress["wave_best"] = 10  # level 2 is open

    assert world.post("/api/island/upgrade", spot="wall_1").status_code == 200

    assert len(world.database.calls("island_upgrade")) == 1


def test_a_wave_starts_with_the_walls_of_its_island_at_startsat():
    world = World(settings=ON)
    world.database.walls[PLAYER_ID] = [wall_row(40, 5), wall_row(0, 1, plot="wall_2")]

    started = world.start().json()

    # startsAt of the fake wave is 2026-11-10: both timers ran out long before it.
    assert started["walls"] == {"wall_1": 100, "wall_2": 100}


def test_a_finish_hands_its_walls_to_the_database():
    world = World(settings=ON)

    assert world.finish(walls={"wall_1": 40, "wall_2": 0}).status_code == 200
    assert world.database.calls("island_walls_record") == [
        {"p_player_id": PLAYER_ID, "p_wave_id": WAVE_ID, "p_walls": {"wall_1": 40, "wall_2": 0}}
    ]


@pytest.mark.parametrize("walls", [{"wall_1": 101}, {"wall_1": -1}, {"cannon_1": 0}])
def test_a_finish_with_impossible_walls_is_refused(walls):
    world = World(settings=ON)
    assert_error(world.finish(walls=walls), 422, "validation_error")
