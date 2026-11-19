import asyncio
from types import SimpleNamespace
from uuid import UUID

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


def test_event_page_reader_forwards_both_fixed_frontier_values():
    calls = []

    class Admin:
        async def call_function(self, name, arguments):
            calls.append((name, arguments))
            return {
                "status": "ok",
                "headSeq": 4,
                "sealedThroughTick": 32,
                "through": 4,
                "events": [],
            }

    page = asyncio.run(
        wave_recovery.read_events(
            Admin(), "player", UUID("11111111-1111-4111-8111-111111111111"), 2, 4, 32
        )
    )

    assert page.head_seq == 4
    assert page.sealed_through_tick == 32
    assert page.through == 4
    assert calls == [
        (
            "recovery_wave_events_page",
            {
                "p_player_id": "player",
                "p_wave_id": "11111111-1111-4111-8111-111111111111",
                "p_after": 2,
                "p_through": 4,
                "p_sealed_through_tick": 32,
            },
        )
    ]


def test_input_reader_does_not_expose_the_internal_repeat_marker():
    token = UUID("22222222-2222-4222-8222-222222222222")

    class Admin:
        async def call_function(self, name, arguments):
            assert name == "recovery_wave_inputs"
            return {
                "status": "accepted",
                "accepted": [
                    {
                        "serverSeq": 1,
                        "effectiveTick": 5,
                        "type": "captain_input",
                        "participantToken": str(token),
                        "payload": {
                            "inputUid": "input_123",
                            "actorCounter": 1,
                            "participantToken": str(token),
                            "command": {"type": "captain_move", "x": 1, "z": 2},
                            "captain": {"level": 1, "skills": [], "weapon": "musket"},
                        },
                    }
                ],
                "headSeq": 1,
                "repeat": True,
            }

    result = asyncio.run(
        wave_recovery.append_inputs(
            Admin(),
            "player",
            UUID("11111111-1111-4111-8111-111111111111"),
            [
                RecoveryInput(
                    inputUid="input_123",
                    actorCounter=1,
                    tick=5,
                    command={"type": "captain_move", "x": 1, "z": 2},
                )
            ],
        )
    )

    assert result.head_seq == 1
    assert len(result.accepted) == 1


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
        campaign=SimpleNamespace(tiers={"wall": ResearchTier(3, "mason_drill", "bastion")}),
    )

    async def read_view(*_, **__):
        return view

    async def read_revision(*_):
        return 7

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", read_revision)
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
        "bonus": "mason_drill",  # fix/playtest-1117: the tier-2 pick, as the legacy client sends it
    }
    assert snapshot["createWave"]["defenses"][1]["spec"] == "workshop"
    assert snapshot["createWave"]["defenses"][2]["kind"] == "watchtower"
    assert snapshot["defaultPositions"]["tower_1"] == {"x": 0.0, "z": -14.0}
    assert snapshot["defaultPositions"]["house_1"] == {"x": 10.0, "z": 0.0}
    assert snapshot["createWave"]["pathing"] is True
    assert snapshot["createWave"]["towerHealth"] is False
    assert snapshot["structureConfigBySpot"]["wall_1"] == {
        "kind": "wall",
        "level": 2,
        "maxHP": 180.0,
        "rateNumerator": 1,
        "rateDenominator": 1,
        "wallSpec": "bastion",
        "wallResearch": "mason_drill",
        "nearbyWorkshops": 1,
    }
    assert "tower_1" not in snapshot["structureConfigBySpot"]
    assert snapshot["legacyWallRecoverSeconds"] == 600
    assert snapshot["expectedRevision"] == 7
    assert snapshot["configVersion"] == 1
    assert "recoveryConfigVersion" not in snapshot
    assert snapshot["weather"] == snapshot["createWave"]["weather"]
    assert snapshot["recoveryConfig"]["baseRateUnitsPerSecond"] == [5000, 3]
    assert snapshot["recoveryConfig"]["recoveryRateFactors"] == {
        "carpenterMultiplierPerWorker": 0,
        "carpenterMaximumWorkers": 2,
        "workshopPercentPerHouse": 0,
        "workshopPercentCap": 0,
        "workshopRadius": 10,
        "wallSpecRateFactors": {"quick_mend": [1, 1], "bastion": [1, 1]},
        "wallResearchRateFactors": {"mason_drill": [1, 1]},
    }
    wall = next(kind for kind in catalogue.kinds if kind.kind == "wall")
    assert snapshot["priceSchedule"]["wall"] == list(wall.prices)


def test_snapshot_preserves_existing_extra_culverin_when_availability_flags_are_off(monkeypatch):
    world = World()
    catalogue = world.app.state.island
    built = SimpleNamespace(
        id="cannon_8",
        kind="culverin",
        level=2,
        x=-8.5,
        z=12.0,
        built=True,
        spec=None,
        tree=(1, 0),
    )
    view = SimpleNamespace(
        spots=[built],
        crew={"gunner": 0, "carpenter": 0, "lookout": 0, "guard": 0},
        campaign=SimpleNamespace(tiers={}),
    )

    async def read_view(*_, **__):
        return view

    async def read_revision(*_):
        return 7

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", read_revision)
    snapshot = asyncio.run(
        wave_recovery.build_snapshot_template(
            world.app.state.admin,
            catalogue,
            Island("owner", "K7Q2M", 40, 0),
            Weather("calm", "Calm sea", 1, 0),
            42,
            ["tower_health", "structure_recovery"],
        )
    )

    defense = snapshot["createWave"]["defenses"][0]
    assert defense["id"] == "cannon_8"
    assert defense["kind"] == "culverin"
    # Current main preserves bought upgrade paths as the production {a, b} shape.
    assert defense["tree"] == {"a": 1, "b": 0}
    assert snapshot["createWave"]["defensesV2"] is True
    assert snapshot["structureConfigBySpot"]["cannon_8"]["kind"] == "culverin"
    assert "cannon_8" in snapshot["defaultPositions"]


def test_snapshot_template_retries_once_after_island_revision_changes(monkeypatch):
    world = World()
    view = SimpleNamespace(
        spots=[],
        crew={"gunner": 0, "carpenter": 0, "lookout": 0, "guard": 0},
        campaign=SimpleNamespace(tiers={}),
    )
    revisions = iter([4, 5, 5, 5])
    reads = []

    async def read_view(*_, **__):
        reads.append(len(reads) + 1)
        return view

    async def read_revision(*_):
        return next(revisions)

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", read_revision)
    snapshot = asyncio.run(
        wave_recovery.build_snapshot_template(
            world.app.state.admin,
            world.app.state.island,
            Island("owner", "K7Q2M", 0, 0),
            Weather("calm", "Calm sea", 1, 0),
            42,
            [],
        )
    )

    assert len(reads) == 2
    assert snapshot["expectedRevision"] == 5


def test_snapshot_template_refuses_two_unstable_revision_reads(monkeypatch):
    world = World()
    view = SimpleNamespace(
        spots=[],
        crew={"gunner": 0, "carpenter": 0, "lookout": 0, "guard": 0},
        campaign=SimpleNamespace(tiers={}),
    )
    revisions = iter([4, 5, 5, 6])

    async def read_view(*_, **__):
        return view

    async def read_revision(*_):
        return next(revisions)

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", read_revision)
    with pytest.raises(ApiError) as error:
        asyncio.run(
            wave_recovery.build_snapshot_template(
                world.app.state.admin,
                world.app.state.island,
                Island("owner", "K7Q2M", 0, 0),
                Weather("calm", "Calm sea", 1, 0),
                42,
                [],
            )
        )

    assert error.value.status_code == 409
    assert error.value.code == "island_changed"


def test_stale_admission_rpc_revision_uses_retryable_conflict():
    with pytest.raises(ApiError) as error:
        wave_recovery._refusal({"status": "refused", "reason": "island_changed"})

    assert error.value.status_code == 409
    assert error.value.code == "island_changed"


def test_snapshot_defenses_have_the_legacy_shape_tree_bonus_and_capstone_rule(monkeypatch):
    # fix/playtest-1117: a bought upgrade tree is {a, b} (it was [a, b], read as no tree), the
    # tier-2 pick rides as bonus, and a capstone counts only while it is the island's tier-3
    # pick, exactly like frontend island/spots.js defenses() builds the legacy wave's list.
    world = World()
    built = [
        SimpleNamespace(
            id="cannon_1",
            kind="cannon",
            level=5,
            x=1.0,
            z=2.0,
            built=True,
            spec="broadside",
            tree=(2, 0),
        ),
        SimpleNamespace(
            id="cannon_2",
            kind="cannon",
            level=5,
            x=3.0,
            z=2.0,
            built=True,
            spec="grapeshot",
            tree=None,
        ),
    ]
    view = SimpleNamespace(
        spots=built,
        crew={"gunner": 0, "carpenter": 0, "lookout": 0, "guard": 0},
        campaign=SimpleNamespace(tiers={"cannon": ResearchTier(3, "long_guns", "broadside")}),
    )

    async def read_view(*_, **__):
        return view

    async def read_revision(*_):
        return 1

    monkeypatch.setattr(wave_recovery.service, "look_open", read_view)
    monkeypatch.setattr(wave_recovery, "read_recovery_revision", read_revision)
    snapshot = asyncio.run(
        wave_recovery.build_snapshot_template(
            world.app.state.admin,
            world.app.state.island,
            Island("owner", "K7Q2M", 0, 0),
            Weather("calm", "Calm sea", 1, 0),
            42,
            ["structure_recovery"],
        )
    )
    first, second = snapshot["createWave"]["defenses"]
    assert first["tree"] == {"a": 2, "b": 0}
    assert first["spec"] == "broadside" and first["bonus"] == "long_guns"
    assert "spec" not in second  # grapeshot is not the island's tier-3 pick
