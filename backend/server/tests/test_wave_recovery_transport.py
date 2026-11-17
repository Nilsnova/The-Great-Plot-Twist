import asyncio
from types import SimpleNamespace

import pytest

from server.errors import ApiError
from server.island import wave_recovery
from server.island.catalogue import Weather
from server.island.rules import ResearchTier
from server.island.store import Island
from server.island.wave_recovery import RecoveryInput, validate_command
from server.lock.recovery_budget import TokenBucket
from server.tests.island_helpers import World


def test_v2_command_accepts_current_captain_move_shape():
    command = {"type": "captain_move", "x": -4.5, "z": 12, "colour": 9}
    assert validate_command(command) == command


def test_v2_captain_stats_are_removed_from_client_command():
    command = {
        "type": "captain_shot",
        "targetId": "ship_1",
        "level": 5,
        "skills": ["steady_aim"],
        "weapon": "musket",
        "x": 1,
        "z": 2,
    }
    assert validate_command(command) == {
        "type": "captain_shot",
        "targetId": "ship_1",
        "x": 1,
        "z": 2,
    }


def test_v2_rejects_malformed_required_fields_and_unbounded_untrusted_stats():
    with pytest.raises(ApiError):
        validate_command({"type": "fire", "targetId": "ship_1"})
    with pytest.raises(ApiError):
        validate_command({"type": "finisher_input", "from": 1, "marks": [1], "easy": 1})
    with pytest.raises(ApiError):
        validate_command(
            {
                "type": "captain_shot",
                "targetId": "ship_1",
                "x": 0,
                "z": 0,
                "skills": ["legacy"] * 5_000,
            }
        )


def test_captain_revive_accepts_uuid_gameplay_token():
    target = "5a3d1d79-0d5c-4cd6-bb55-b48294b47511"
    command = {"type": "captain_revive", "targetId": target, "x": 1, "z": 2}
    assert validate_command(command) == command


@pytest.mark.parametrize(
    "command",
    [
        {"type": "captain_move", "x": True, "z": 1},
        {"type": "captain_move", "x": 0, "z": 0, "by": "profile-id"},
        {"type": "finisher_input", "from": 0, "marks": [101]},
    ],
)
def test_v2_rejects_malformed_or_client_identity_commands(command):
    with pytest.raises(ApiError) as error:
        validate_command(command)
    assert error.value.status_code == 422


def test_input_uid_and_counter_are_bounded_and_strict():
    assert RecoveryInput(
        inputUid="input_123", actorCounter=1, tick=0, command={"type": "lamps_lit"}
    )
    with pytest.raises(ValueError):
        RecoveryInput(
            inputUid="input_123", actorCounter=True, tick=0, command={"type": "lamps_lit"}
        )
    with pytest.raises(ValueError):
        RecoveryInput(
            inputUid="input_123", actorCounter=1, tick=18_001, command={"type": "lamps_lit"}
        )


@pytest.mark.parametrize("kind", ["repair", "rebuild"])
def test_protocol2_does_not_accept_retired_structure_commands(kind):
    with pytest.raises(ApiError) as error:
        validate_command({"type": kind, "wallId": "wall_1"})
    assert error.value.status_code == 422


def test_recovery_write_bucket_allows_burst_then_refills():
    now = [0.0]
    bucket = TokenBucket(8, 12, clock=lambda: now[0])
    for _ in range(12):
        bucket.spend("player")
    with pytest.raises(ApiError) as error:
        bucket.spend("player")
    assert error.value.status_code == 429
    now[0] += 0.125
    bucket.spend("player")


def test_snapshot_template_captures_server_sim_inputs_and_exact_hp_rate(monkeypatch):
    world = World()
    built = [
        SimpleNamespace(
            id="wall_1",
            kind="wall",
            level=2,
            x=0.0,
            z=0.0,
            built=True,
            spec="bastion",
            tree=None,
        ),
        SimpleNamespace(
            id="house_1",
            kind="house",
            level=2,
            x=10.0,
            z=0.0,
            built=True,
            spec="workshop",
            tree=None,
        ),
        SimpleNamespace(
            id="tower_1",
            kind="watchtower",
            level=1,
            x=0.0,
            z=-14.0,
            built=True,
            spec=None,
            tree=None,
        ),
    ]
    view = SimpleNamespace(
        spots=built,
        crew={"gunner": 0, "carpenter": 2, "lookout": 0, "guard": 0},
        campaign=SimpleNamespace(tiers={"wall": ResearchTier(2, "mason_drill")}),
    )

    async def read_view(*_):
        return view

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    catalogue = world.app.state.island
    snapshot = asyncio.run(
        wave_recovery.build_snapshot_template(
            world.app.state.admin,
            catalogue,
            Island("owner", "K7Q2M", 0, 0),
            Weather("calm", "Calm sea", 1, 0),
            42,
            ["pathing", "structure_recovery"],
        )
    )

    defense = snapshot["createWave"]["defenses"][0]
    assert defense == {
        "id": "wall_1",
        "kind": "wall",
        "level": 2,
        "x": 0,
        "z": 0,
        "spec": "bastion",
    }
    assert snapshot["createWave"]["defenses"][1]["spec"] == "workshop"
    assert snapshot["createWave"]["defenses"][2]["kind"] == "watchtower"
    assert snapshot["createWave"]["pathing"] is True
    assert snapshot["createWave"]["towerHealth"] is False
    assert snapshot["structureConfigBySpot"]["wall_1"] == {
        "kind": "wall",
        "level": 2,
        "maxHP": 180.0,
        "rateNumerator": 351,
        "rateDenominator": 20,
        "wallSpec": "bastion",
        "wallResearch": "mason_drill",
        "nearbyWorkshops": 1,
    }
    assert "tower_1" not in snapshot["structureConfigBySpot"]
    assert snapshot["legacyWallRecoverSeconds"] == 600
    assert snapshot["recoveryConfig"]["baseRateUnitsPerSecond"] == [5000, 3]
    wall = next(kind for kind in catalogue.kinds if kind.kind == "wall")
    assert snapshot["priceSchedule"]["wall"] == list(wall.prices)
