"""Strict shared progression intents and immutable replies, used by the island service."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

from server.island.treasury_store import EnvelopeRow, Unsigned


class IntentModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ResearchState(IntentModel):
    tier: StrictInt = Field(ge=0, le=3)
    choice2: StrictStr | None
    choice3: StrictStr | None
    revision: Unsigned


class BuildingState(IntentModel):
    instanceId: UUID
    kind: StrictStr
    level: StrictInt = Field(ge=1, le=5)
    spec: StrictStr | None
    treeA: StrictInt = Field(ge=0, le=3)
    treeB: StrictInt = Field(ge=0, le=3)
    revision: Unsigned


class ResearchIntent(IntentModel):
    action: Literal["research"]
    branch: StrictStr
    tier: StrictInt = Field(ge=1, le=3)
    choice: StrictStr | None
    change: StrictBool
    expected: ResearchState
    quotedCoins: Unsigned


class SpecialiseIntent(IntentModel):
    action: Literal["specialise"]
    spot: StrictStr
    spec: StrictStr
    expected: BuildingState
    quotedCoins: Unsigned


class TreeIntent(IntentModel):
    action: Literal["tower_tree"]
    spot: StrictStr
    path: Literal["a", "b"]
    tier: StrictInt = Field(ge=1, le=3)
    expected: BuildingState
    quotedCoins: Unsigned


class WreckIntent(IntentModel):
    action: Literal["wreck"]
    amount: StrictInt = Field(ge=1)
    quotedCoins: Unsigned


ProgressionIntent = Annotated[
    ResearchIntent | SpecialiseIntent | TreeIntent | WreckIntent,
    Field(discriminator="action"),
]


class Origin(IntentModel):
    mode: Literal["island_shared"]
    version: StrictInt = Field(ge=1, le=1)
    islandOwner: UUID
    accountId: UUID
    runEpoch: UUID


class ResearchOutcome(ResearchState):
    branch: StrictStr
    coinsPaid: Unsigned


class BuildingOutcome(BuildingState):
    spot: StrictStr


class Effect(IntentModel):
    chargedCoins: Unsigned
    treasuryReceiptId: UUID | None
    research: ResearchOutcome | None
    building: BuildingOutcome | None
    wreckPaid: StrictInt | None = Field(ge=0)


class Receipt(IntentModel):
    receiptId: UUID
    actorId: UUID
    actionUid: StrictStr
    action: Literal["research", "specialise", "tower_tree", "wreck"]
    origin: Origin
    result: Effect


class ProgressionResult(IntentModel):
    status: Literal["done"]
    repeat: StrictBool
    currentEconomy: EnvelopeRow | None
    receipt: Receipt


class ProgressionSnapshot(IntentModel):
    status: Literal["ok"]
    economy: EnvelopeRow
    bestWave: StrictInt = Field(ge=0)
    wreckPaid: StrictInt = Field(ge=0)
    research: list[ResearchOutcome] = Field(max_length=10)
    buildings: list[BuildingOutcome] = Field(max_length=50)
