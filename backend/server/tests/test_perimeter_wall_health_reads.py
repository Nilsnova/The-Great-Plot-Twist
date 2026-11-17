"""Legacy wall-health transport must remain complete before the first recovery-v1 wave."""

import asyncio
from datetime import UTC, datetime

import pytest

from server.errors import ApiError
from server.island import wall_repair
from server.island.catalogue import load_island
from server.supabase_admin import SupabaseRejected
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, World
from server.tests.test_wall_recovery import ON


def wall(number=128, **changes):
    return {
        "plot": f"wall_{number}",
        "level": 1,
        "wall_health": 100,
        "wall_damaged_at": None,
        **changes,
    }


class Rows:
    def __init__(self, rows):
        self.rows = rows
        self.query = None

    async def select_rows(self, table, query):
        assert table == "islet_buildings"
        self.query = query
        return self.rows[: int(query["limit"])]


def read(rows):
    return asyncio.run(wall_repair.read_walls(Rows(rows), "owner"))


def test_all_128_walls_survive_a_database_that_honors_the_query_limit():
    rows = sorted([wall(n) for n in range(1, 129)], key=lambda row: row["plot"])
    admin = Rows(rows)
    result = asyncio.run(wall_repair.read_walls(admin, "owner"))
    assert set(result) == {f"wall_{n}" for n in range(1, 129)}
    assert result["wall_128"].health == 100
    assert admin.query["limit"] == "129"
    assert admin.query["player_id"] == "eq.owner"
    assert admin.query["building_type"] == "eq.wall"
    assert admin.query["order"] == "plot.asc"


def test_overflow_and_duplicates_fail_instead_of_dropping_or_overwriting_paid_walls():
    with pytest.raises(SupabaseRejected):
        read([wall(n) for n in range(1, 130)])
    with pytest.raises(SupabaseRejected):
        read([wall(), wall(wall_health=0)])


@pytest.mark.parametrize(
    "spot", ["wall_0", "wall_013", "wall_129", "wall_١٣", "wall_13\n", "cannon_1", None]
)
def test_noncanonical_or_unsupported_wall_identity_refuses(spot):
    with pytest.raises(SupabaseRejected):
        read([wall(plot=spot)])


@pytest.mark.parametrize(
    "changes",
    [
        {"level": 0},
        {"level": 6},
        {"level": True},
        {"wall_health": -1},
        {"wall_health": 101},
        {"wall_health": 1.5},
        {"wall_health": True},
    ],
)
def test_invalid_state_never_becomes_an_invented_level_price_or_full_health(changes):
    with pytest.raises(SupabaseRejected):
        read([wall(**changes)])


def test_admitted_v0_health_endpoint_returns_the_entire_fresh_cohort():
    world = World(settings=ON)
    world.database.wall_policies[PLAYER_ID] = {"ruleVersion": 1, "capacity": 128}
    world.database.walls[PLAYER_ID] = [wall(n) for n in range(1, 129)]
    assert world.database.recovery_policy_version == 0
    answer = world.client.get("/api/island/walls", headers=PLAYER)
    assert answer.status_code == 200, answer.text
    assert {row["spot"] for row in answer.json()["walls"]} == {f"wall_{n}" for n in range(1, 129)}
    assert all(row["health"] == 100 and row["repairCost"] is None for row in answer.json()["walls"])


@pytest.mark.parametrize("spot", ["wall_13", "wall_128"])
def test_new_cohort_legacy_restore_refuses_before_any_paid_rpc(spot):
    world = World(settings=ON)
    world.database.wall_policies[PLAYER_ID] = {"ruleVersion": 1, "capacity": 128}
    world.database.walls[PLAYER_ID] = [wall(13), wall(128)]
    assert_error(
        world.post("/api/island/repair", spot=spot, actionUid="legacy-fix-001"),
        409,
        "client_update_required",
    )
    assert world.database.calls("island_wall_restore") == []
    assert world.database.balance == 100


def test_legacy_unknown_added_id_stays_unknown_and_actor_access_precedes_policy(monkeypatch):
    world = World(settings=ON)
    assert_error(world.post("/api/island/repair", spot="wall_99"), 404, "no_such_spot")
    assert world.database.calls("island_wall_restore") == []

    async def denied(*args, **kwargs):
        raise ApiError(403, "not_member", "Join this game before repairing its walls.")

    async def no_policy(*args, **kwargs):
        pytest.fail("A denied actor must not read the target policy.")

    monkeypatch.setattr(wall_repair.service, "target_island", denied)
    monkeypatch.setattr(wall_repair.layout_store, "read_snapshot", no_policy)
    with pytest.raises(ApiError) as refused:
        asyncio.run(
            wall_repair.restore(
                None, load_island(), "outsider", "wall_13", "legacy-fix-002", datetime.now(UTC)
            )
        )
    assert refused.value.code == "not_member"
