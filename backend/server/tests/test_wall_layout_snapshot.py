"""Strict atomic layout reads and policy-fenced moves, independent of the shared HTTP fake."""

import asyncio
from copy import deepcopy
from dataclasses import replace

import pytest

from server.errors import ApiError
from server.island import layout, layout_store, placement
from server.island.catalogue import load_island
from server.island.store import Island, Refusal
from server.supabase_admin import SupabaseRejected

ISLAND = Island("owner", "K7Q2M", 0, 0)
EPOCH = "11111111-2222-4333-8444-555555555555"


class Admin:
    def __init__(self, version=1, capacity=128, rows=()):
        self.snapshot = {
            "ruleVersion": version,
            "capacity": capacity,
            "rows": list(rows),
            "islandEpoch": EPOCH,
        }
        self.calls = []
        self.moves = [{"status": "done"}]

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        return deepcopy(self.snapshot) if name == "island_wall_layout_read" else self.moves.pop(0)


def row(spot, x=0, z=0):
    return {"plot": spot, "x_half": x, "z_half": z}


def test_snapshot_reads_complete_cohort_and_nonwalls_in_canonical_cas_order():
    geometry = layout.island_layout(more=True)
    ids = [s.spot for s in geometry.spots] + [f"wall_{i}" for i in range(13, 129)]
    admin = Admin(rows=[row(spot) for spot in reversed(ids)])
    snapshot = asyncio.run(layout_store.read_snapshot(admin, ISLAND.owner))
    assert len(snapshot.rows) == 142
    assert [r.plot for r in snapshot.rows] == sorted(ids)
    assert (snapshot.rule_version, snapshot.capacity) == (1, 128)
    assert snapshot.island_epoch == EPOCH
    assert admin.calls == [("island_wall_layout_read", {"p_island_owner": "owner"})]


@pytest.mark.parametrize(
    "snapshot",
    [
        {"ruleVersion": True, "capacity": 128, "rows": []},
        {"ruleVersion": 2, "capacity": 128, "rows": []},
        {"ruleVersion": 1, "capacity": 12, "rows": []},
        {"ruleVersion": 1, "capacity": 128, "rows": "not rows"},
        {"ruleVersion": 1, "capacity": 128, "rows": [], "unexpected": 1},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_13"), row("wall_13")]},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_129")]},
        {"ruleVersion": 0, "capacity": 12, "rows": [row("wall_13")]},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_13", True)]},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_13", 61)]},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_13") | {"extra": 1}]},
        {"ruleVersion": 1, "capacity": 128, "rows": [row("wall_13")] * 143},
        None,
    ],
)
def test_bad_or_incomplete_policy_state_never_downgrades_or_writes(snapshot):
    admin = Admin()
    admin.snapshot = {**snapshot, "islandEpoch": EPOCH} if isinstance(snapshot, dict) else snapshot
    with pytest.raises(SupabaseRejected):
        asyncio.run(layout_store.read_snapshot(admin, ISLAND.owner))
    assert len(admin.calls) == 1


@pytest.mark.parametrize("epoch", [None, True, "not-an-epoch", EPOCH.upper().replace("-", "")])
def test_perimeter_snapshot_requires_its_current_canonical_reset_epoch(epoch):
    admin = Admin()
    admin.snapshot["islandEpoch"] = epoch
    with pytest.raises(SupabaseRejected):
        asyncio.run(layout_store.read_snapshot(admin, ISLAND.owner))


def test_legacy_policy_may_have_no_recovery_epoch_yet():
    admin = Admin(0, 12)
    admin.snapshot["islandEpoch"] = None
    assert asyncio.run(layout_store.read_snapshot(admin, ISLAND.owner)).island_epoch is None


def test_unavailable_policy_rpc_is_not_replaced_with_legacy_coordinates():
    class Unavailable(Admin):
        async def call_function(self, *_):
            raise SupabaseRejected()

    with pytest.raises(SupabaseRejected):
        asyncio.run(layout_store.read_snapshot(Unavailable(), ISLAND.owner))


@pytest.mark.parametrize("version,capacity", [(0, 12), (1, 128)])
def test_every_move_compares_expected_policy_and_raw_rows(version, capacity):
    admin = Admin(version, capacity, [row("wall_2", 8, -38), row("wall_10", -18, -2)])
    snapshot = asyncio.run(layout_store.read_snapshot(admin, ISLAND.owner))
    assert (
        asyncio.run(
            layout_store.save_wall_move(
                admin, "owner", "member", "cannon_1", (-10, -10.5), snapshot
            )
        )
        is None
    )
    assert admin.calls[-1] == (
        "island_wall_move",
        {
            "p_island_owner": "owner",
            "p_mover": "member",
            "p_plot": "cannon_1",
            "p_x_half": -20,
            "p_z_half": -21,
            "p_seen": [row("wall_10", -18, -2), row("wall_2", 8, -38)],
            "p_expected_rule_version": version,
            "p_expected_capacity": capacity,
        },
    )


def test_positioned_free_grid_move_keeps_the_atomic_policy_in_its_write():
    admin = Admin(rows=[row("wall_13", -8, -18)])
    assert asyncio.run(placement.try_move(admin, ISLAND, "member", "wall_13", (4, -19.5))) is None
    assert admin.calls[-1][0] == "island_wall_move"
    assert admin.calls[-1][1]["p_expected_rule_version"] == 1
    assert admin.calls[-1][1]["p_plot"] == "wall_13"


def test_move_cannot_create_an_unbuilt_inventory_reservation():
    admin = Admin()
    with pytest.raises(ApiError) as error:
        asyncio.run(placement.try_move(admin, ISLAND, "member", "wall_13", (4, -19.5)))
    assert (error.value.status_code, error.value.code) == (409, "not_built")
    assert len(admin.calls) == 1


def test_legacy_off_lane_refusal_and_no_op_remain_unchanged():
    admin = Admin(0, 12)
    with pytest.raises(ApiError) as error:
        asyncio.run(placement.try_move(admin, ISLAND, "member", "wall_1", (4, -19.5)))
    assert error.value.code == "off_path"
    assert (
        asyncio.run(placement.try_move(admin, ISLAND, "member", "cannon_1", (-12.5, -14.5))) is None
    )
    assert all(name == "island_wall_layout_read" for name, _ in admin.calls)


def test_busy_policy_cas_reloads_policy_and_revalidates_before_retry(monkeypatch):
    admin = Admin(0, 12)
    admin.moves = [{"status": "refused", "reason": "busy"}, {"status": "done"}]
    original = admin.call_function

    async def changing_policy(name, arguments):
        if name == "island_wall_layout_read" and admin.calls:
            admin.snapshot.update(ruleVersion=1, capacity=128)
        return await original(name, arguments)

    async def target(*_):
        return ISLAND, None

    async def looked(*_):
        return "fresh view"

    monkeypatch.setattr(admin, "call_function", changing_policy)
    monkeypatch.setattr(placement.service, "target_island", target)
    monkeypatch.setattr(placement.service, "look_open", looked)
    catalogue = replace(load_island(), placement=True)
    assert (
        asyncio.run(placement.move(admin, catalogue, "owner", "cannon_1", -10, -10.5))
        == "fresh view"
    )
    writes = [args for name, args in admin.calls if name == "island_wall_move"]
    assert [args["p_expected_rule_version"] for args in writes] == [0, 1]


def test_database_membership_and_inventory_refusals_keep_their_meaning():
    assert placement.move_refusal(Refusal("not_member")).status_code == 403
    assert placement.move_refusal(Refusal("not_member")).code == "not_member"
    assert placement.move_refusal(Refusal("not_built")).code == "not_built"
