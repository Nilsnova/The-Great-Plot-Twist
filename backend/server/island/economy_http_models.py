"""Strict shared endpoint bodies, kept separate from legacy island serializers.

Used by economy_http and route tests. Endpoints choose actions; requests assert exact quotes.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator

from server.island.construction_rules import ConstructionIntent, SpotId, Unsigned
from server.island.economy_progression_models import BuildingState, ResearchState

Identifier = Annotated[StrictStr, Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
ActionUid = Annotated[StrictStr, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")]


class SharedEconomy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    runEpoch: UUID


class SharedBody(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    economy: SharedEconomy
    actionUid: ActionUid
    code: Annotated[StrictStr, Field(max_length=32)] | None = None


class ConstructionBody(SharedBody):
    spot: SpotId
    kind: Identifier
    instanceId: UUID | None
    expectedLevel: StrictInt = Field(ge=0, le=5)
    quotedCoins: Unsigned


class BuildBody(ConstructionBody):
    @model_validator(mode="after")
    def valid_build(self) -> Self:
        ConstructionIntent.model_validate({"action": "build", **intent_fields(self)})
        return self


class UpgradeBody(ConstructionBody):
    @model_validator(mode="after")
    def valid_upgrade(self) -> Self:
        ConstructionIntent.model_validate({"action": "upgrade", **intent_fields(self)})
        return self


class DemolishBody(ConstructionBody):
    @model_validator(mode="after")
    def valid_demolition(self) -> Self:
        ConstructionIntent.model_validate({"action": "demolish", **intent_fields(self)})
        return self


class ResearchBody(SharedBody):
    branch: Identifier
    tier: StrictInt = Field(ge=1, le=3)
    choice: Identifier | None
    change: StrictBool
    expected: ResearchState
    quotedCoins: Unsigned


class SpecialiseBody(SharedBody):
    spot: SpotId
    spec: Identifier
    expected: BuildingState
    quotedCoins: Unsigned


class TreeBody(SharedBody):
    spot: SpotId
    path: Literal["a", "b"]
    tier: StrictInt = Field(ge=1, le=3)
    expected: BuildingState
    quotedCoins: Unsigned


class WreckBody(SharedBody):
    amount: StrictInt = Field(ge=1)
    quotedCoins: Unsigned


class HireBody(SharedBody):
    crew: Literal["gunner", "carpenter", "lookout", "guard"]


BODIES = {
    "build": BuildBody,
    "upgrade": UpgradeBody,
    "demolish": DemolishBody,
    "research": ResearchBody,
    "towerSkill": SpecialiseBody,
    "towerTree": TreeBody,
    "wreck": WreckBody,
    "hire": HireBody,
}


def intent_fields(body: SharedBody) -> dict:
    return body.model_dump(mode="json", exclude={"economy", "actionUid", "code"})


def parse_shared_body(action: str, value: object) -> SharedBody:
    if action not in BODIES:
        raise ValueError("Unknown shared endpoint action.")
    return BODIES[action].model_validate(value)
