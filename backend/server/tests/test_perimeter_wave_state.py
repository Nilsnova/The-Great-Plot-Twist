"""Complete bounded recovery geometry and fail-closed perimeter wave admission."""

import asyncio
from types import SimpleNamespace
from uuid import UUID

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island import layout, wave_recovery, waves
from server.island.catalogue import Weather, catalogue_for_flags, load_island
from server.island.layout_store import LayoutSnapshot
from server.island.store import Island
from server.routes import waves as wave_routes
from server.supabase_admin import SupabaseRejected
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, World

CATALOGUE = catalogue_for_flags(load_island(), {"more_tower_spots": True})


def built(spot, kind="wall", x=0, z=0):
    return SimpleNamespace(id=spot, kind=kind, x=x, z=z, level=1, built=True, spec=None, tree=None)


def snapshot(monkeypatch, spots, *, rules=None, expected=(1, 128)):
    view = SimpleNamespace(
        spots=spots,
        crew={},
        campaign=SimpleNamespace(tiers={}),
        layout=layout.LayoutInfo(2, 0.5, True, 1, 128),
    )

    async def read_view(*_):
        return view

    async def revision(*_):
        return 7

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", revision)
    return asyncio.run(
        wave_recovery.build_snapshot_template(
            None,
            CATALOGUE,
            Island("owner", "K7Q2M", 0, 0),
            Weather("calm", "Calm", 1, 0),
            42,
            ["pathing", "structure_recovery"] if rules is None else rules,
            expected_wall_policy=expected,
        )
    )


def test_full_cohort_freezes_every_real_position_without_inventing_new_defaults(monkeypatch):
    geometry = layout.island_layout(more=True)
    positions = {s.spot: (s.x, s.z) for s in geometry.spots if s.slot != "wall"}
    candidates = [(x / 2, z / 2) for z in range(-42, 43, 4) for x in range(-42, 43, 4)]
    rows = []
    for number in range(1, 129):
        for x, z in candidates:
            try:
                layout.check_move(
                    geometry,
                    positions,
                    f"wall_{number}",
                    x,
                    z,
                    wall_rule_version=1,
                    wall_capacity=128,
                )
            except layout.MoveRefused:
                continue
            positions[f"wall_{number}"] = (x, z)
            rows.append(built(f"wall_{number}", x=x, z=z))
            break
        else:
            pytest.fail("The real layout could not fit the complete bounded fixture.")
    rows += [built(s.spot, "cannon", s.x, s.z) for s in geometry.spots if s.slot == "tower"]
    result = snapshot(monkeypatch, rows)
    assert len(result["structureConfigBySpot"]) == 139
    assert len(result["createWave"]["defenses"]) == 139
    assert result["createWave"]["perimeterWalls"] is True
    assert result["createWave"]["pathing"] is True
    assert (result["wallRuleVersion"], result["wallCapacity"], result["configVersion"]) == (
        1,
        128,
        1,
    )
    last = next(row for row in result["createWave"]["defenses"] if row["id"] == "wall_128")
    assert (last["x"], last["z"]) == positions["wall_128"]
    assert "wall_13" not in result["defaultPositions"]
    assert "wall_128" not in result["defaultPositions"]


@pytest.mark.parametrize(
    "row",
    [built("wall_129"), built("wall_013"), built("wall_13", "cannon"), built("wall_13", x=None)],
)
def test_unknown_wrong_kind_and_unpositioned_added_defenses_refuse(monkeypatch, row):
    with pytest.raises(SupabaseRejected):
        snapshot(monkeypatch, [row])


def test_snapshot_requires_frozen_pathing_and_consistent_owner_policy(monkeypatch):
    with pytest.raises(ApiError) as error:
        snapshot(monkeypatch, [built("wall_13")], rules=[])
    assert error.value.code == "perimeter_rules_required"
    with pytest.raises(ApiError) as error:
        snapshot(monkeypatch, [built("wall_13")], expected=(0, 12))
    assert error.value.code == "island_changed"
    with pytest.raises(SupabaseRejected):
        snapshot(monkeypatch, [built("wall_13"), built("wall_13")])


def report_data(count=139):
    vector = {str(UUID(int=n + 1)): 0 for n in range(count)}
    return dict(
        islandEpoch=str(UUID(int=1000)),
        checkpointUid="checkpoint-001",
        throughTick=1,
        inputHeadSeq=0,
        lastRepairSeq=0,
        basisRepairSeq=vector,
        hpUnits=vector,
    )


@pytest.mark.parametrize(
    "model", [wave_recovery.RecoveryCheckpoint, wave_recovery.RecoveryHealthRequest]
)
def test_complete_vectors_fit_but_overflow_never_reaches_the_database(model):
    kwargs = {"waveProtocol": 2} if model is wave_recovery.RecoveryHealthRequest else {}
    assert len(model(**report_data(), **kwargs).hpUnits) == 139
    with pytest.raises(ValidationError):
        model(**report_data(140), **kwargs)


def test_full_health_vector_is_sent_to_sql_without_dropping_last_instances():
    class Admin:
        async def call_function(self, name, params):
            assert name == "recovery_wave_report_health"
            assert len(params["p_hp_units"]) == len(params["p_basis_repair_seq"]) == 139
            assert str(UUID(int=139)) in params["p_hp_units"]
            return dict(
                status="accepted",
                accepted=True,
                throughTick=1,
                inputHeadSeq=0,
                lastRepairSeq=0,
                hpUnits=params["p_hp_units"],
            )

    report = wave_recovery.RecoveryHealthRequest(**report_data(), waveProtocol=2)
    answer = asyncio.run(wave_recovery.report_health(Admin(), "player", UUID(int=999), report))
    assert len(answer.hp_units) == 139


@pytest.mark.parametrize(
    ("protocol", "code"), [(1, "client_update_required"), (2, "structure_recovery_required")]
)
def test_incapable_perimeter_start_refuses_before_start_rpc(monkeypatch, protocol, code):
    world = World()

    async def policy(*_):
        return LayoutSnapshot(1, 128, ())

    monkeypatch.setattr(wave_routes.layout_store, "read_snapshot", policy)
    response = world.client.post(
        "/api/waves/start",
        headers=PLAYER,
        json={
            "where": "own",
            "actionUid": "perimeter-001",
            "waveProtocol": protocol,
            "wallClientVersion": 1,
        },
    )
    assert_error(response, 409, code)
    assert world.database.calls("recovery_wave_start") == []


def test_public_geometry_version_projects_without_editing_internal_snapshot():
    world = World()
    stored = dict(
        configVersion=1,
        wallRuleVersion=1,
        wallCapacity=128,
        rules=["pathing", "structure_recovery"],
        createWave={"pathing": True, "perimeterWalls": True},
        recoveryConfig={"recoveryVersion": 1},
    )
    reply = {
        **world.database.start_reply,
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "initialSnapshot": stored,
    }
    projected = waves.recovery_wave_of(CATALOGUE, reply).initial_snapshot
    assert projected["configVersion"] == 2
    assert stored["configVersion"] == 1
    assert projected["recoveryConfig"]["recoveryVersion"] == 1
    with pytest.raises(SupabaseRejected):
        waves.recovery_wave_of(
            CATALOGUE, {**reply, "initialSnapshot": {**stored, "wallCapacity": 12}}
        )
