"""Personal Captain configuration and strict shared-mode read projection.

Used by the isolated profile store and future shared-mode adapters; legacy routes do not
import this module. Catalogue rules are server inputs, never client-selected point prices.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    ValidationError,
    model_validator,
)

from server.island.captain_recovery_policy import RETIRED_RECOVERY_SKILLS
from server.island.catalogue import IslandCatalogue
from server.supabase_admin import SupabaseRejected

Role = Literal["medic", "engineer", "gunner"]


class StrictRow(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EngineerRow(StrictRow):
    id: UUID
    state: Literal["pending", "attached"]
    waveId: UUID | None


class CaptainRow(StrictRow):
    progressionVersion: StrictInt = Field(ge=1, le=1)
    level: StrictInt = Field(ge=1, le=5)
    personalBestWave: StrictInt = Field(ge=0)
    role: Role | None
    revision: Annotated[StrictStr, Field(pattern=r"^(0|[1-9][0-9]*)$")]
    assignmentWaveId: UUID | None
    engineerCommitment: EngineerRow | None
    canRespec: StrictBool
    respecBlockedReason: Literal["captain_assigned"] | None
    roleLockedReason: Literal["captain_assigned", "engineer_bound"] | None


class SkillsRow(StrictRow):
    points: StrictInt = Field(ge=0)
    earned: StrictInt = Field(ge=0)
    spent: StrictInt = Field(ge=0)
    known: list[StrictStr]
    role: Role | None


class ProfileRow(StrictRow):
    status: Literal["ok"]
    captain: CaptainRow
    skills: SkillsRow

    @model_validator(mode="after")
    def consistent(self):
        captain, skills = self.captain, self.skills
        assigned = captain.assignmentWaveId is not None
        bound = captain.engineerCommitment
        expected_role_guard = "captain_assigned" if assigned else (
            "engineer_bound" if bound else None
        )
        if (captain.canRespec != (not assigned)
                or captain.respecBlockedReason != ("captain_assigned" if assigned else None)
                or captain.roleLockedReason != expected_role_guard
                or skills.role != captain.role
                or skills.earned != skills.spent + skills.points
                or len(set(skills.known)) != len(skills.known)):
            raise ValueError("Inconsistent personal profile.")
        if bound and (captain.role != "engineer" or
                      (bound.state == "attached") != (bound.waveId is not None) or
                      (bound.waveId is not None and captain.assignmentWaveId is not None
                       and bound.waveId != captain.assignmentWaveId)):
            raise ValueError("Inconsistent Engineer commitment.")
        return self


def configuration(catalogue: IslandCatalogue) -> dict:
    """Pin existing personal rules without copying coin prices or island unlock progress."""
    return {
        "version": 1,
        "wavesPerPoint": catalogue.skills.waves_per_point,
        "roleLevel": catalogue.skills.role_level,
        "levelWaves": list(catalogue.captain.unlock_waves),
        "retired": sorted(RETIRED_RECOVERY_SKILLS),
        "tree": [
            {"skill": skill.skill, "cost": skill.cost, "needs": list(skill.needs),
             "excludes": skill.excludes, "role": skill.role}
            for skill in catalogue.skills.tree
        ],
    }


def read_profile(value: object) -> dict:
    """Reject malformed authority/progress data instead of deriving a permissive fallback."""
    try:
        ProfileRow.model_validate(value)
    except (ValidationError, TypeError, ValueError) as error:
        raise SupabaseRejected("The database sent an unreadable personal Captain.") from error
    return value
