from decimal import Decimal

import pytest

from server.island.structure_recovery_manifest import (
    MANIFEST_FILE,
    RECOVERY_MANIFEST,
    load_recovery_manifest,
    max_structure_hp,
)


def test_manifest_has_the_recovery_and_wave_protocol_versions() -> None:
    assert RECOVERY_MANIFEST.recovery_version == 1
    assert RECOVERY_MANIFEST.wave_protocol == 2
    assert RECOVERY_MANIFEST.full_hp_units == 1_000_000
    assert RECOVERY_MANIFEST.base_recovery_milliseconds == 600_000
    assert MANIFEST_FILE.is_file()


def test_manifest_matches_all_current_tower_health_levels() -> None:
    assert RECOVERY_MANIFEST.max_hp["cannon"] == (80, 130, 200, 290, 400)
    assert RECOVERY_MANIFEST.max_hp["mortar"] == (70, 115, 180, 260, 360)
    assert RECOVERY_MANIFEST.max_hp["harpoon"] == (60, 100, 155, 230, 320)
    assert RECOVERY_MANIFEST.max_hp["culverin"] == (56, 91, 140, 203, 280)
    assert RECOVERY_MANIFEST.max_hp["swivel"] == (72, 117, 180, 261, 360)


def test_wall_max_hp_uses_equipped_spec_and_research_modifiers() -> None:
    assert max_structure_hp("wall", 1) == Decimal("60.00")
    assert max_structure_hp("wall", 1, wall_spec="stone") == Decimal("120.00")
    assert max_structure_hp("wall", 1, wall_spec="bastion") == Decimal("90.00")
    assert max_structure_hp("wall", 1, wall_research="thick_walls") == Decimal("69.00")
    assert max_structure_hp("wall", 1, wall_spec="bastion", wall_research="thick_walls") == Decimal(
        "103.50"
    )


def test_wall_rate_specs_do_not_change_max_hp() -> None:
    assert max_structure_hp("wall", 3, wall_spec="quick_mend") == Decimal("200.00")
    assert max_structure_hp("wall", 3, wall_spec="spiked") == Decimal("200.00")
    assert max_structure_hp("wall", 3, wall_spec="thorns") == Decimal("200.00")


def test_wall_modifiers_are_not_applied_to_towers() -> None:
    assert max_structure_hp("cannon", 1) == Decimal("80.00")
    with pytest.raises(ValueError):
        max_structure_hp("cannon", 1, wall_spec="bastion")
    with pytest.raises(ValueError):
        max_structure_hp("cannon", 1, wall_research="thick_walls")


def test_max_hp_rejects_unknown_kind_and_out_of_range_level() -> None:
    with pytest.raises(ValueError):
        max_structure_hp("house", 1)
    with pytest.raises(ValueError):
        max_structure_hp("wall", 6)


def test_manifest_loader_rejects_malformed_root(tmp_path) -> None:
    malformed = tmp_path / "manifest.json"
    malformed.write_text("[]", encoding="utf-8")
    with pytest.raises(ValueError):
        load_recovery_manifest(malformed)
