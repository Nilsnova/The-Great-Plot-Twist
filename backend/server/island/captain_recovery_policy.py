"""Captain skill interpretation by the island's persisted recovery policy.

Used by: T55 snapshots and recovery-aware Captain skill API paths; saved skills are
never removed by this filter.
"""

LEGACY_RECOVERY_VERSION = 0
STRUCTURE_RECOVERY_VERSION = 1
RETIRED_RECOVERY_SKILLS = frozenset(
    {
        "quick_fix",
        "long_reach",
        "sturdy_planks",
        "master_shipwright",
        "swift_hammer",
        "wide_arc",
        "grand_engineer",
    }
)

# These recovery-v1 progression choices no longer grant an effect. Existing saved
# IDs remain valid history; this list only blocks a new transition into one.
RETIRED_RECOVERY_OPTIONS = frozenset(
    {
        "carpenter",
        "workshop",
        "quick_mend",
        "mason_drill",
    }
)


def is_retired_recovery_skill(skill_id: str) -> bool:
    """Whether a skill is retired only for recovery-version-1 wave behavior."""
    return skill_id in RETIRED_RECOVERY_SKILLS


def active_captain_skills(skills: tuple[str, ...], recovery_version: int) -> tuple[str, ...]:
    """Return skills active for a frozen policy without changing persisted history."""
    if isinstance(recovery_version, bool) or not isinstance(recovery_version, int):
        raise ValueError("recovery version must be a whole number")
    if recovery_version == LEGACY_RECOVERY_VERSION:
        return skills
    if recovery_version == STRUCTURE_RECOVERY_VERSION:
        return tuple(skill for skill in skills if not is_retired_recovery_skill(skill))
    raise ValueError("unknown recovery version")
