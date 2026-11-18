"""Personal Captain catalogue and strict read contracts without island or wallet effects."""

from copy import deepcopy
from uuid import UUID

import pytest

from server.island.catalogue import load_island
from server.island.personal_captain import configuration, read_profile
from server.supabase_admin import SupabaseRejected

PLAYER_WAVE = str(UUID(int=41))
GENERATION = str(UUID(int=42))


def reply(*, assigned=False, bound=False):
    wave = PLAYER_WAVE if assigned else None
    return {
        "status": "ok",
        "captain": {
            "progressionVersion": 1, "level": 3, "personalBestWave": 8,
            "role": "engineer" if bound else "medic", "revision": "4",
            "assignmentWaveId": wave,
            "engineerCommitment": {
                "id": GENERATION, "state": "attached" if assigned else "pending",
                "waveId": wave,
            } if bound else None,
            "canRespec": not assigned,
            "respecBlockedReason": "captain_assigned" if assigned else None,
            "roleLockedReason": "captain_assigned" if assigned else (
                "engineer_bound" if bound else None
            ),
        },
        "skills": {"points": 3, "earned": 4, "spent": 1,
                   "known": ["steady_aim"], "role": "engineer" if bound else "medic"},
    }


def test_configuration_uses_existing_personal_thresholds_and_costs_without_prices():
    catalogue = load_island()
    config = configuration(catalogue)
    assert config["levelWaves"] == list(catalogue.captain.unlock_waves)
    assert config["wavesPerPoint"] == catalogue.skills.waves_per_point
    assert config["roleLevel"] == catalogue.skills.role_level
    assert config["tree"][0]["cost"] == catalogue.skills.tree[0].cost
    assert "prices" not in config and "coins" not in config


@pytest.mark.parametrize("assigned,bound", [(False, False), (False, True), (True, True)])
def test_personal_projection_separates_skill_respec_from_engineer_role_binding(assigned, bound):
    value = reply(assigned=assigned, bound=bound)
    assert read_profile(value) == value
    if bound and not assigned:
        assert value["captain"]["canRespec"] is True
        assert value["captain"]["roleLockedReason"] == "engineer_bound"


@pytest.mark.parametrize("change", [
    lambda value: value["captain"].update(revision=4),
    lambda value: value["captain"].update(level=True),
    lambda value: value["captain"].update(canRespec=False),
    lambda value: value["skills"].update(points=99),
    lambda value: value["skills"].update(role="gunner"),
    lambda value: value["captain"].update(role="gunner"),
])
def test_unreadable_or_inconsistent_personal_state_fails_closed(change):
    value = deepcopy(reply(bound=True))
    change(value)
    with pytest.raises(SupabaseRejected):
        read_profile(value)
