import pytest

from server.island.captain_recovery_policy import (
    RETIRED_RECOVERY_SKILLS,
    active_captain_skills,
    is_retired_recovery_skill,
)


def test_legacy_policy_preserves_all_saved_skill_ids() -> None:
    saved = ("steady_aim", "quick_fix", "long_reach")
    assert active_captain_skills(saved, 0) == saved


def test_recovery_policy_filters_retired_ids_without_reordering_other_skills() -> None:
    saved = ("steady_aim", "quick_fix", "field_surgeon", "long_reach", "gunner")
    assert active_captain_skills(saved, 1) == ("steady_aim", "field_surgeon", "gunner")


def test_every_retired_skill_is_named_and_other_skills_are_kept() -> None:
    assert len(RETIRED_RECOVERY_SKILLS) == 7
    assert all(is_retired_recovery_skill(skill) for skill in RETIRED_RECOVERY_SKILLS)
    assert not is_retired_recovery_skill("steady_aim")


def test_unknown_recovery_version_is_rejected() -> None:
    with pytest.raises(ValueError):
        active_captain_skills(("steady_aim",), 2)
    with pytest.raises(ValueError):
        active_captain_skills(("steady_aim",), True)
