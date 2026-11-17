"""Versioned maximum HP values and modifiers for persistent island structures.

Used by: T55 state initialization, wave snapshots and recovery parity tests.
"""

import json
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path

MANIFEST_FILE = Path(__file__).resolve().parents[2] / "content" / "structure_recovery_v1.json"
SUPPORTED_KINDS = ("wall", "cannon", "mortar", "harpoon", "culverin", "swivel")
WALL_SPECS = frozenset({"quick_mend", "bastion", "stone", "spiked", "thorns"})
WALL_RESEARCH = frozenset({"mason_drill", "thick_walls"})
HP_CENTI = Decimal("0.01")


@dataclass(frozen=True)
class RecoveryManifest:
    """Immutable, validated health configuration for one recovery protocol."""

    recovery_version: int
    wave_protocol: int
    full_hp_units: int
    base_recovery_milliseconds: int
    max_hp: dict[str, tuple[int, ...]]
    wall_skill_max_hp_factors: dict[str, Fraction]
    wall_research_max_hp_factors: dict[str, Fraction]


def load_recovery_manifest(path: Path = MANIFEST_FILE) -> RecoveryManifest:
    """Read and validate the shared T55 JSON manifest."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ValueError("structure recovery manifest cannot be read") from error
    if not isinstance(data, dict):
        raise ValueError("structure recovery manifest must be an object")

    max_hp_data = data.get("structureMaxHp")
    if not isinstance(max_hp_data, dict) or set(max_hp_data) != set(SUPPORTED_KINDS):
        raise ValueError("structureMaxHp must list every supported structure kind")
    max_hp = {kind: _read_levels(max_hp_data[kind]) for kind in SUPPORTED_KINDS}

    return RecoveryManifest(
        recovery_version=_read_positive_integer(data.get("recoveryVersion")),
        wave_protocol=_read_positive_integer(data.get("waveProtocol")),
        full_hp_units=_read_positive_integer(data.get("fullHpUnits")),
        base_recovery_milliseconds=_read_positive_integer(
            data.get("baseRecoveryMilliseconds")
        ),
        max_hp=max_hp,
        wall_skill_max_hp_factors=_read_factors(data.get("wallSkillMaxHpFactors")),
        wall_research_max_hp_factors=_read_factors(data.get("wallResearchMaxHpFactors")),
    )


def max_structure_hp(
    kind: str,
    level: int,
    wall_spec: str | None = None,
    wall_research: str | None = None,
) -> Decimal:
    """Return current configured max HP, preserving JavaScript's centi-HP rounding."""
    if kind not in RECOVERY_MANIFEST.max_hp:
        raise ValueError("unsupported structure kind")
    levels = RECOVERY_MANIFEST.max_hp[kind]
    if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= len(levels):
        raise ValueError("structure level is outside the manifest")
    if kind != "wall" and (wall_spec is not None or wall_research in {"thick_walls"}):
        raise ValueError("wall max-HP modifiers apply only to walls")
    if wall_spec is not None and wall_spec not in WALL_SPECS:
        raise ValueError("unknown wall skill")
    if wall_research is not None and wall_research not in WALL_RESEARCH:
        raise ValueError("unknown wall research")

    multiplier = RECOVERY_MANIFEST.wall_skill_max_hp_factors.get(
        wall_spec, Fraction(1, 1)
    )
    multiplier *= RECOVERY_MANIFEST.wall_research_max_hp_factors.get(
        wall_research, Fraction(1, 1)
    )
    exact_hp = Fraction(levels[level - 1], 1) * multiplier
    decimal_hp = Decimal(exact_hp.numerator) / Decimal(exact_hp.denominator)
    return decimal_hp.quantize(HP_CENTI, rounding=ROUND_HALF_UP)


def _read_levels(value: object) -> tuple[int, ...]:
    if not isinstance(value, list) or len(value) != 5:
        raise ValueError("each structure kind must have five HP levels")
    if any(
        isinstance(item, bool) or not isinstance(item, int) or item < 1 for item in value
    ):
        raise ValueError("max HP levels must be positive whole numbers")
    return tuple(value)


def _read_factors(value: object) -> dict[str, Fraction]:
    if not isinstance(value, dict):
        raise ValueError("HP modifier factors must be an object")
    factors = {}
    for name, pair in value.items():
        if (
            not isinstance(name, str)
            or not isinstance(pair, list)
            or len(pair) != 2
            or any(isinstance(item, bool) or not isinstance(item, int) or item < 1 for item in pair)
        ):
            raise ValueError("HP modifier must be a positive numerator and denominator")
        factors[name] = Fraction(pair[0], pair[1])
    return factors


def _read_positive_integer(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("manifest version and rates must be positive whole numbers")
    return value


RECOVERY_MANIFEST = load_recovery_manifest()
